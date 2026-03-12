import { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.middleware';
import { getPlatformSifenConfig, updatePlatformSifenConfig, uploadPlatformCert } from '../../services/platformSifen.service';
import { ApiError } from '../../utils/errors';
import { logAudit } from '../../services/audit.service';

export async function platformSifenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireSuperAdmin);

  // Get platform SIFEN config
  app.get('/system/sifen-config', async (_req, reply) => {
    const config = await getPlatformSifenConfig();
    if (config) {
      const safe = { ...config };
      // Don't expose sensitive values — just indicate if set
      safe.cert_password_encrypted = config.cert_r2_key ? '[CONFIGURADO]' : undefined;
      safe.csc_encrypted = config.csc_encrypted ? '[CONFIGURADO]' : undefined;
      return reply.send({ success: true, data: safe });
    }
    return reply.send({ success: true, data: null });
  });

  // Update platform SIFEN config (non-cert fields)
  app.put('/system/sifen-config', async (req, reply) => {
    const body = req.body as any;
    if (!body) throw new ApiError(400, 'BAD_REQUEST', 'Body requerido');

    const updated = await updatePlatformSifenConfig(body);

    logAudit({
      tenant_id: null,
      usuario_id: req.currentUser?.id,
      accion: 'PLATFORM_SIFEN_CONFIG_ACTUALIZADA',
      entidad_tipo: 'system_settings',
      entidad_id: 'platform_sifen_config',
      ip_address: req.ip,
      detalles: { fields: Object.keys(body) },
    });

    const safe = { ...updated };
    safe.cert_password_encrypted = updated.cert_r2_key ? '[CONFIGURADO]' : undefined;
    safe.csc_encrypted = updated.csc_encrypted ? '[CONFIGURADO]' : undefined;

    return reply.send({ success: true, data: safe });
  });

  // Upload platform SIFEN certificate (PFX) to R2
  app.post('/system/sifen-config/certificate', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 50_000 } });
    if (!file) throw new ApiError(400, 'BAD_REQUEST', 'Se requiere archivo .pfx/.p12');

    const ext = (file.filename || '').toLowerCase();
    if (!ext.endsWith('.pfx') && !ext.endsWith('.p12')) {
      throw new ApiError(400, 'BAD_REQUEST', 'Solo archivos .pfx o .p12');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.from(chunk));
    }
    const pfxBuffer = Buffer.concat(chunks);

    if (pfxBuffer.length < 100) {
      throw new ApiError(400, 'BAD_REQUEST', 'Archivo demasiado pequeño para ser un certificado válido');
    }

    // Password comes as a field in the multipart form
    const fields = file.fields as Record<string, any>;
    const passwordField = fields?.password;
    const password = typeof passwordField === 'object' && passwordField?.value
      ? String(passwordField.value)
      : typeof passwordField === 'string' ? passwordField : '';

    if (!password) {
      throw new ApiError(400, 'BAD_REQUEST', 'La contraseña del certificado es obligatoria');
    }

    // Validate PFX with node-forge
    let certMeta = { subject: null as string | null, serial: null as string | null, notBefore: null as Date | null, notAfter: null as Date | null };
    try {
      const forge = require('node-forge');
      const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBags[forge.pki.oids.certBag] || [];
      if (certs.length > 0 && certs[0].cert) {
        const cert = certs[0].cert;
        certMeta.subject = cert.subject.getField('CN')?.value || null;
        certMeta.serial = cert.serialNumber || null;
        certMeta.notBefore = cert.validity.notBefore;
        certMeta.notAfter = cert.validity.notAfter;

        // Reject expired
        if (certMeta.notAfter && certMeta.notAfter < new Date()) {
          throw new ApiError(400, 'CERT_EXPIRED', `Certificado expirado el ${certMeta.notAfter.toISOString().slice(0, 10)}`);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, 'INVALID_CERT', 'No se pudo leer el certificado. Verificá la contraseña y que sea un .pfx/.p12 válido.');
    }

    await uploadPlatformCert(pfxBuffer, password, file.filename || 'certificate.pfx');

    logAudit({
      tenant_id: null,
      usuario_id: req.currentUser?.id,
      accion: 'PLATFORM_SIFEN_CERT_UPLOADED',
      entidad_tipo: 'system_settings',
      entidad_id: 'platform_sifen_config',
      ip_address: req.ip,
      detalles: { filename: file.filename, ...certMeta },
    });

    return reply.send({
      success: true,
      data: {
        filename: file.filename,
        subject: certMeta.subject,
        serial: certMeta.serial,
        notBefore: certMeta.notBefore?.toISOString(),
        notAfter: certMeta.notAfter?.toISOString(),
      },
    });
  });
}
