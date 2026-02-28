import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { sifenConfigService } from './sifenConfig.service';
import { sifenNumeracionService } from './sifenNumeracion.service';

/**
 * Orquestador principal de SIFEN.
 * Gestiona el ciclo de vida de los Documentos Electrónicos (DE).
 */
export const sifenService = {
    /**
     * Crea un DE con datos completos (receptor, items, impuestos) y asigna número correlativo.
     * Encola job SIFEN_EMITIR_DE para generación de XML + firma + QR.
     */
    async createDE(tenantId: string, _userId: string, data: SifenDECreateInput): Promise<{ id: string; numero_documento: string }> {
        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configure SIFEN antes de emitir documentos');
        if (!config.timbrado) throw new Error('Configure el timbrado antes de emitir');

        // Obtener número correlativo (transaccional, con FOR UPDATE)
        const numero = await sifenNumeracionService.getNextNumero(
            tenantId,
            data.tipo_documento,
            config.establecimiento,
            config.punto_expedicion,
            config.timbrado
        );

        // Calcular totales de IVA
        const impuestos = calcularImpuestos(data.datos_items || []);

        // CDC temporal (será generado por xmlgen al crear el XML)
        const cdcTemp = `TEMP-${tenantId.slice(0, 8)}-${numero}-${Date.now()}`;

        const result = await query<any>(
            `INSERT INTO sifen_de (
                tenant_id, cdc, tipo_documento, fecha_emision, moneda, estado,
                numero_documento, datos_receptor, datos_items, datos_impuestos,
                datos_adicionales, total_pago, total_iva10, total_iva5, total_exento,
                de_referenciado_cdc
             ) VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             RETURNING id, numero_documento`,
            [
                tenantId,
                cdcTemp,
                data.tipo_documento,
                data.fecha_emision || new Date(),
                data.moneda || 'PYG',
                numero,
                JSON.stringify(data.datos_receptor),
                JSON.stringify(data.datos_items),
                JSON.stringify(impuestos),
                JSON.stringify(data.datos_adicionales || {}),
                impuestos.total,
                impuestos.total_iva10,
                impuestos.total_iva5,
                impuestos.total_exento,
                data.de_referenciado_cdc || null,
            ]
        );

        const deId = result[0].id;

        logger.info('DE creado', { tenantId, deId, tipo: data.tipo_documento, numero });
        return { id: deId, numero_documento: numero };
    },

    /**
     * Encola la generación XML + firma + QR para un DE en estado DRAFT.
     */
    async enqueueEmitir(tenantId: string, deId: string): Promise<void> {
        const de = await queryOne<any>(
            `SELECT estado FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) throw new Error('DE no encontrado');
        if (!['DRAFT', 'ERROR'].includes(de.estado)) {
            throw new Error(`No se puede emitir un DE en estado ${de.estado}`);
        }

        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_EMITIR_DE', $2)`,
            [tenantId, JSON.stringify({ de_id: deId })]
        );
    },

    /**
     * Encola la anulación de un DE aprobado.
     */
    async anularDE(tenantId: string, deId: string, motivo: string): Promise<void> {
        const de = await queryOne<any>(
            `SELECT estado, cdc FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) throw new Error('DE no encontrado');
        if (de.estado !== 'APPROVED') {
            throw new Error('Solo se pueden anular DEs en estado APPROVED');
        }

        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ANULAR', $2)`,
            [tenantId, JSON.stringify({ de_id: deId, cdc: de.cdc, motivo })]
        );
    },

    /**
     * Encola generación de KUDE PDF para un DE.
     */
    async enqueueGenerarKude(tenantId: string, deId: string): Promise<void> {
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_GENERAR_KUDE', $2)`,
            [tenantId, JSON.stringify({ de_id: deId })]
        );
    },

    /**
     * Arma un lote con DEs encoladas y encola su envío.
     */
    async emitirLoteAuto(tenantId: string): Promise<string | null> {
        const { sifenLoteService } = require('./sifenLote.service');
        const loteId = await sifenLoteService.armarLote(tenantId);
        if (!loteId) return null;

        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_LOTE', $2)`,
            [tenantId, JSON.stringify({ lote_id: loteId })]
        );

        return loteId;
    },

    /**
     * Métricas SIFEN para un tenant en un período.
     */
    async getSifenMetrics(tenantId: string, desde?: string, hasta?: string): Promise<any> {
        const fechaDesde = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const fechaHasta = hasta || new Date().toISOString();

        const [totales, porEstado, porTipo, ultimosDE] = await Promise.all([
            queryOne<any>(
                `SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN estado = 'APPROVED' THEN 1 ELSE 0 END) as aprobados,
                    SUM(CASE WHEN estado = 'REJECTED' THEN 1 ELSE 0 END) as rechazados,
                    SUM(CASE WHEN estado IN ('DRAFT','GENERATED','SIGNED','ENQUEUED','IN_LOTE','SENT') THEN 1 ELSE 0 END) as pendientes,
                    SUM(CASE WHEN estado = 'CANCELLED' THEN 1 ELSE 0 END) as anulados,
                    COALESCE(SUM(total_pago), 0) as monto_total
                 FROM sifen_de
                 WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3`,
                [tenantId, fechaDesde, fechaHasta]
            ),
            query<any>(
                `SELECT estado, COUNT(*) as cantidad
                 FROM sifen_de
                 WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3
                 GROUP BY estado`,
                [tenantId, fechaDesde, fechaHasta]
            ),
            query<any>(
                `SELECT tipo_documento, COUNT(*) as cantidad, COALESCE(SUM(total_pago), 0) as monto
                 FROM sifen_de
                 WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3
                 GROUP BY tipo_documento`,
                [tenantId, fechaDesde, fechaHasta]
            ),
            query<any>(
                `SELECT id, cdc, tipo_documento, numero_documento, estado, total_pago,
                        fecha_emision, created_at,
                        datos_receptor->>'razon_social' as receptor_nombre
                 FROM sifen_de
                 WHERE tenant_id = $1
                 ORDER BY created_at DESC LIMIT 10`,
                [tenantId]
            ),
        ]);

        return {
            periodo: { desde: fechaDesde, hasta: fechaHasta },
            totales,
            por_estado: porEstado,
            por_tipo: porTipo,
            ultimos_de: ultimosDE,
        };
    },

    /**
     * Lista DEs con filtros.
     */
    async listDE(tenantId: string, opts: {
        estado?: string;
        tipo?: string;
        desde?: string;
        hasta?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: any[]; total: number }> {
        const params: any[] = [tenantId];
        const conditions: string[] = ['sd.tenant_id = $1'];

        if (opts.estado) {
            params.push(opts.estado);
            conditions.push(`sd.estado = $${params.length}`);
        }
        if (opts.tipo) {
            params.push(opts.tipo);
            conditions.push(`sd.tipo_documento = $${params.length}`);
        }
        if (opts.desde) {
            params.push(opts.desde);
            conditions.push(`sd.fecha_emision >= $${params.length}`);
        }
        if (opts.hasta) {
            params.push(opts.hasta);
            conditions.push(`sd.fecha_emision <= $${params.length}`);
        }
        if (opts.search) {
            params.push(`%${opts.search}%`);
            conditions.push(`(sd.cdc ILIKE $${params.length} OR sd.numero_documento ILIKE $${params.length} OR sd.datos_receptor->>'razon_social' ILIKE $${params.length})`);
        }

        const where = conditions.join(' AND ');
        const limit = opts.limit || 50;
        const offset = opts.offset || 0;

        const [data, countResult] = await Promise.all([
            query<any>(
                `SELECT sd.id, sd.cdc, sd.tipo_documento, sd.numero_documento, sd.estado,
                        sd.moneda, sd.total_pago, sd.fecha_emision, sd.created_at,
                        sd.datos_receptor->>'razon_social' as receptor_nombre,
                        sd.kude_pdf_key IS NOT NULL as tiene_kude
                 FROM sifen_de sd
                 WHERE ${where}
                 ORDER BY sd.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            ),
            queryOne<{ cnt: string }>(
                `SELECT COUNT(*) as cnt FROM sifen_de sd WHERE ${where}`,
                params
            ),
        ]);

        return { data, total: parseInt(countResult?.cnt || '0', 10) };
    },
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface SifenDECreateInput {
    tipo_documento: string;    // '1','4','5','6'
    moneda?: string;
    fecha_emision?: Date | string;
    datos_receptor: any;
    datos_items: any[];
    datos_adicionales?: any;
    de_referenciado_cdc?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcularImpuestos(items: any[]): {
    total: number;
    total_iva10: number;
    total_iva5: number;
    total_exento: number;
} {
    let total = 0;
    let total_iva10 = 0;
    let total_iva5 = 0;
    let total_exento = 0;

    for (const item of items) {
        const subtotal = Number(item.precio_unitario) * Number(item.cantidad);
        const tasa = Number(item.tasa_iva) || 0;
        total += subtotal;
        if (tasa === 10) {
            total_iva10 += Math.round((subtotal * 10) / 110);
        } else if (tasa === 5) {
            total_iva5 += Math.round((subtotal * 5) / 105);
        } else {
            total_exento += subtotal;
        }
    }

    return { total, total_iva10, total_iva5, total_exento };
}
