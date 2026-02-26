import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { query, queryOne } from '../../db/connection';
import { storageService } from '../../services/storage.service';
import { systemService } from '../../services/system.service';
import { logAudit } from '../../services/audit.service';
import { ApiError } from '../../utils/errors';

// Simple in-memory cache for domain lookups
const domainCache = new Map<string, { data: unknown; cachedAt: number }>();
const DOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;

export async function whitelabelRoutes(app: FastifyInstance): Promise<void> {
  // Register multipart for logo upload
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 5 * 1024 * 1024 } });

  // Public endpoint: get branding by domain
  app.get<{ Params: { domain: string } }>('/tenants/by-domain/:domain', async (req, reply) => {
    const { domain } = req.params;

    const cached = domainCache.get(domain);
    if (cached && Date.now() - cached.cachedAt < DOMAIN_CACHE_TTL_MS) {
      return reply.send({ success: true, data: cached.data });
    }

    const row = await queryOne<{
      tenant_id: string;
      wl_activo: boolean;
      wl_nombre_app: string | null;
      wl_color_primario: string | null;
      wl_color_secundario: string | null;
      wl_logo_url: string | null;
      wl_favicon_url: string | null;
    }>(
      `SELECT tc.tenant_id, tc.wl_activo, tc.wl_nombre_app,
              tc.wl_color_primario, tc.wl_color_secundario,
              tc.wl_logo_url, tc.wl_favicon_url
       FROM tenant_config tc
       WHERE tc.wl_dominio_propio = $1 AND tc.wl_activo = true`,
      [domain]
    );

    if (!row?.wl_activo) {
      throw new ApiError(404, 'API_ERROR', 'No hay white-label configurado para este dominio');
    }

    const data = {
      tenant_id: row.tenant_id,
      nombre_app: row.wl_nombre_app ?? 'SEDIA',
      color_primario: row.wl_color_primario ?? '#3B82F6',
      color_secundario: row.wl_color_secundario ?? '#1E40AF',
      logo_url: row.wl_logo_url,
      favicon_url: row.wl_favicon_url,
    };

    domainCache.set(domain, { data, cachedAt: Date.now() });
    return reply.send({ success: true, data });
  });

  // Protected routes
  app.register(async (authGroup) => {
    authGroup.addHook('preHandler', requireAuth);

    // Upload logo
    authGroup.post<{ Params: { id: string } }>(
      '/tenants/:id/branding/logo',
      { preHandler: [checkFeature('whitelabel')] },
      async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const fileData = await req.file();
        if (!fileData) throw new ApiError(400, 'API_ERROR', 'No se encontró archivo');

        const buffer = await fileData.toBuffer();
        const ext = fileData.filename.split('.').pop()?.toLowerCase() ?? 'png';
        const key = `tenants/${req.params.id}/branding/logo.${ext}`;

        let logoUrl = '';
        if (storageService.isEnabled()) {
          const result = await storageService.upload({ key, buffer, contentType: fileData.mimetype });
          logoUrl = result.url || await storageService.getSignedDownloadUrl(key, 86400 * 365);
        } else {
          logoUrl = `data:${fileData.mimetype};base64,${buffer.toString('base64')}`;
        }

        await query(
          `UPDATE tenant_config SET wl_logo_r2_key = $2, wl_logo_url = $3 WHERE tenant_id = $1`,
          [req.params.id, key, logoUrl]
        );

        logAudit({
          tenant_id: req.params.id,
          usuario_id: req.currentUser?.id,
          accion: 'WL_CONFIG_ACTUALIZADA',
          detalles: { campo: 'logo' },
        });

        // Invalidate cache
        domainCache.clear();

        return reply.send({ success: true, data: { logo_url: logoUrl } });
      }
    );

    // Update branding config
    authGroup.put<{
      Params: { id: string };
      Body: {
        wl_activo?: boolean;
        wl_nombre_app?: string;
        wl_color_primario?: string;
        wl_color_secundario?: string;
        wl_dominio_propio?: string;
      };
    }>(
      '/tenants/:id/branding',
      { preHandler: [checkFeature('whitelabel')] },
      async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const sets: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [req.params.id];
        let i = 2;

        const { wl_activo, wl_nombre_app, wl_color_primario, wl_color_secundario, wl_dominio_propio } = req.body;

        if (wl_activo !== undefined) { sets.push(`wl_activo = $${i++}`); params.push(wl_activo); }
        if (wl_nombre_app !== undefined) { sets.push(`wl_nombre_app = $${i++}`); params.push(wl_nombre_app); }
        if (wl_color_primario !== undefined) { sets.push(`wl_color_primario = $${i++}`); params.push(wl_color_primario); }
        if (wl_color_secundario !== undefined) { sets.push(`wl_color_secundario = $${i++}`); params.push(wl_color_secundario); }
        if (wl_dominio_propio !== undefined) { sets.push(`wl_dominio_propio = $${i++}`); params.push(wl_dominio_propio); }

        if (sets.length > 1) {
          await query(`UPDATE tenant_config SET ${sets.join(', ')} WHERE tenant_id = $1`, params);
        }

        domainCache.clear();

        logAudit({
          tenant_id: req.params.id,
          usuario_id: req.currentUser?.id,
          accion: 'WL_CONFIG_ACTUALIZADA',
          detalles: req.body as Record<string, unknown>,
        });

        return reply.send({ success: true });
      }
    );

    // Get branding config for tenant (With Global Fallback)
    authGroup.get<{ Params: { id: string } }>('/tenants/:id/branding', async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;

      const row = await queryOne<any>(
        `SELECT wl_activo, wl_nombre_app, wl_color_primario, wl_color_secundario,
                wl_logo_url, wl_favicon_url, wl_dominio_propio
         FROM tenant_config WHERE tenant_id = $1`,
        [req.params.id]
      );

      const globalSettings = {
        wl_nombre_app: await systemService.getSetting('brand_name') || 'SEDIA',
        wl_color_primario: await systemService.getSetting('brand_color_primary') || '#18181b',
        wl_color_secundario: await systemService.getSetting('brand_color_secondary') || '#f4f4f5',
        wl_logo_url: await systemService.getSetting('brand_logo_url') || '',
        wl_favicon_url: await systemService.getSetting('brand_favicon_url') || '',
        wl_whitelabel_enabled_all: await systemService.getSetting('whitelabel_enabled_all') ?? true
      };

      return reply.send({
        success: true,
        data: row,
        global: globalSettings
      });
    });
  });
}
