import { FastifyInstance } from 'fastify';
import { query } from '../../db/connection';
import { Comprobante } from '../../types';
import { logger } from '../../config/logger';
import { systemService } from '../../services/system.service';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
    // Branding + SEO del sistema (sin auth — usado por frontend al cargar)
    app.get('/branding/system', async (_req, reply) => {
        const [
            name, primary, secondary, logo, favicon,
            seoTitle, seoDesc, seoKeywords, seoOgImage, seoOgType,
            seoOgUrl, seoTwitterCard, seoRobots, seoLang, seoThemeColor,
        ] = await Promise.all([
            systemService.getSetting<string>('brand_name'),
            systemService.getSetting<string>('brand_color_primary'),
            systemService.getSetting<string>('brand_color_secondary'),
            systemService.getSetting<string>('brand_logo_url'),
            systemService.getSetting<string>('brand_favicon_url'),
            systemService.getSetting<string>('seo_title'),
            systemService.getSetting<string>('seo_description'),
            systemService.getSetting<string>('seo_keywords'),
            systemService.getSetting<string>('seo_og_image'),
            systemService.getSetting<string>('seo_og_type'),
            systemService.getSetting<string>('seo_og_url'),
            systemService.getSetting<string>('seo_twitter_card'),
            systemService.getSetting<string>('seo_robots'),
            systemService.getSetting<string>('seo_language'),
            systemService.getSetting<string>('seo_theme_color'),
        ]);
        return reply.send({
            success: true,
            data: {
                nombre_app: name ?? 'SEDIA',
                color_primario: primary ?? '#2a85ff',
                color_secundario: secondary ?? '#f5f5f5',
                logo_url: logo ?? '',
                favicon_url: favicon ?? '',
                seo: {
                    title: seoTitle ?? '',
                    description: seoDesc ?? 'Plataforma SaaS para gestión de comprobantes fiscales del SET Paraguay.',
                    keywords: seoKeywords ?? '',
                    og_image: seoOgImage ?? '',
                    og_type: seoOgType ?? 'website',
                    og_url: seoOgUrl ?? '',
                    twitter_card: seoTwitterCard ?? 'summary_large_image',
                    robots: seoRobots ?? 'index, follow',
                    language: seoLang ?? 'es',
                    theme_color: seoThemeColor ?? '',
                },
            },
        });
    });

    // Portal público: Descarga/Vista de Factura por Hash
    // No requiere autenticación, accesible vía link enviado al cliente
    app.get<{ Params: { hash: string } }>('/public/invoice/:hash', async (req, reply) => {
        try {
            const { hash } = req.params;

            if (!hash || hash.length < 10) {
                return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Hash inválido' } });
            }

            const rows = await query<Comprobante & { tenant_nombre: string, tenant_ruc: string }>(
                `SELECT c.*, t.nombre_fantasia as tenant_nombre, t.ruc as tenant_ruc
         FROM comprobantes c
         JOIN tenants t ON t.id = c.tenant_id
         WHERE c.hash_unico = $1`,
                [hash]
            );
            const data = rows[0];

            if (!data) {
                return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Comprobante no encontrado' } });
            }

            // En un escenario real, si data.xml_url apunta a un bucket privado, 
            // aquí se generaría una URL firmada de corta duración temporal para redirigir al cliente
            // o se convertiría el XML/JSON a un PDF "al vuelo" usando Puppeteer

            return reply.send({
                success: true,
                data: {
                    emisor: {
                        nombre: data.tenant_nombre,
                        ruc: data.tenant_ruc
                    },
                    comprobante: {
                        tipo: data.tipo_comprobante,
                        numero: data.numero_comprobante,
                        fecha: data.fecha_emision,
                        total: data.total_operacion,
                        cdc: data.cdc,
                        xml_url: data.xml_url // (TODO: Signed URL if private bucket)
                    }
                }
            });
        } catch (error: any) {
            logger.error('Error en public invoice route', { error: error.message || 'Unknown error' });
            return reply.code(500).send({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor' } });
        }
    });
}
