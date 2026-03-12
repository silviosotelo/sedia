import { query, queryOne, withTransaction } from '../db/connection';
import { logger } from '../config/logger';
import { sifenXmlService } from './sifenXml.service';
import { sifenSignService } from './sifenSign.service';
import { sifenQrService } from './sifenQr.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MotivoContingencia =
    | 'FALLA_SISTEMA_SET'
    | 'FALLA_INTERNET'
    | 'FALLA_SISTEMA_PROPIO';

export interface SifenContingencia {
    id: string;
    tenant_id: string;
    motivo: MotivoContingencia;
    fecha_inicio: string;
    fecha_fin: string | null;
    activo: boolean;
    des_emitidos: number;
    des_regularizados: number;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface RegularizacionResult {
    contingencia_id: string;
    des_regularizados: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Gestiona el modo de contingencia SIFEN (operación offline cuando el SET no
 * está disponible). Permite emitir DEs con tipoEmision=2 y regularizarlos
 * cuando la conectividad se restablece.
 */
export const sifenContingenciaService = {
    /**
     * Activa el modo de contingencia para un tenant.
     *
     * Solo puede existir una contingencia activa por tenant al mismo tiempo. Si
     * ya hay una activa se lanza un error para evitar registros duplicados.
     *
     * @param tenantId - UUID del tenant
     * @param motivo   - Causa de la contingencia
     * @returns        El registro de contingencia recién creado
     */
    async activarContingencia(
        tenantId: string,
        motivo: MotivoContingencia
    ): Promise<SifenContingencia> {
        const MOTIVOS_VALIDOS: MotivoContingencia[] = [
            'FALLA_SISTEMA_SET',
            'FALLA_INTERNET',
            'FALLA_SISTEMA_PROPIO',
        ];

        if (!MOTIVOS_VALIDOS.includes(motivo)) {
            throw new Error(
                `Motivo de contingencia inválido: ${motivo}. Valores permitidos: ${MOTIVOS_VALIDOS.join(', ')}`
            );
        }

        const existente = await this.getContingenciaActiva(tenantId);
        if (existente) {
            throw new Error(
                `Ya existe una contingencia activa (id=${existente.id}) para este tenant. Desactívela antes de crear una nueva.`
            );
        }

        const rows = await query<SifenContingencia>(
            `INSERT INTO sifen_contingencia (
                tenant_id, motivo, fecha_inicio, activo,
                des_emitidos, des_regularizados, metadata
             ) VALUES ($1, $2, NOW(), true, 0, 0, '{}')
             RETURNING *`,
            [tenantId, motivo]
        );

        const contingencia = rows[0];
        logger.info('Contingencia SIFEN activada', {
            tenant_id: tenantId,
            contingenciaId: contingencia.id,
            motivo,
        });

        return contingencia;
    },

    /**
     * Desactiva una contingencia activa estableciendo fecha_fin y activo=false.
     *
     * @param tenantId       - UUID del tenant
     * @param contingenciaId - UUID de la contingencia a cerrar
     * @returns              El registro actualizado
     */
    async desactivarContingencia(
        tenantId: string,
        contingenciaId: string
    ): Promise<SifenContingencia> {
        const rows = await query<SifenContingencia>(
            `UPDATE sifen_contingencia
             SET activo = false, fecha_fin = NOW(), updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND activo = true
             RETURNING *`,
            [contingenciaId, tenantId]
        );

        if (!rows.length) {
            throw new Error(
                `Contingencia id=${contingenciaId} no encontrada o ya está inactiva para el tenant`
            );
        }

        const contingencia = rows[0];
        logger.info('Contingencia SIFEN desactivada', {
            tenant_id: tenantId,
            contingenciaId,
            des_emitidos: contingencia.des_emitidos,
        });

        return contingencia;
    },

    /**
     * Retorna la contingencia activa del tenant, o null si no hay ninguna.
     *
     * @param tenantId - UUID del tenant
     */
    async getContingenciaActiva(
        tenantId: string
    ): Promise<SifenContingencia | null> {
        return queryOne<SifenContingencia>(
            `SELECT * FROM sifen_contingencia
             WHERE tenant_id = $1 AND activo = true
             ORDER BY fecha_inicio DESC
             LIMIT 1`,
            [tenantId]
        );
    },

    /**
     * Lista todos los períodos de contingencia del tenant, en orden descendente
     * por fecha de inicio. Soporta paginación mediante limit/offset.
     *
     * @param tenantId - UUID del tenant
     * @param opts     - Opciones de paginación (limit por defecto 50, offset 0)
     * @returns        Página de registros y total global
     */
    async listarContingencias(
        tenantId: string,
        opts: { limit?: number; offset?: number } = {}
    ): Promise<{ data: SifenContingencia[]; total: number }> {
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;

        const [data, countRow] = await Promise.all([
            query<SifenContingencia>(
                `SELECT * FROM sifen_contingencia
                 WHERE tenant_id = $1
                 ORDER BY fecha_inicio DESC
                 LIMIT $2 OFFSET $3`,
                [tenantId, limit, offset]
            ),
            queryOne<{ cnt: string }>(
                `SELECT COUNT(*) as cnt FROM sifen_contingencia WHERE tenant_id = $1`,
                [tenantId]
            ),
        ]);

        return {
            data,
            total: parseInt(countRow?.cnt ?? '0', 10),
        };
    },

    /**
     * Emite un DE en modo contingencia (tipoEmision=2).
     *
     * Requisitos:
     * - El DE debe estar en estado DRAFT o ERROR
     * - Debe existir una contingencia activa para el tenant
     *
     * Proceso:
     * 1. Genera XML con tipoEmision=2 (sobrescribe el valor por defecto)
     * 2. Firma el XML
     * 3. Genera código QR
     * 4. Marca el DE con estado=CONTINGENCIA, tipo_emision=2 y referencia a la
     *    contingencia activa
     * 5. Incrementa el contador des_emitidos en la contingencia
     *
     * El DE NO se encola para envío; la regularización posterior lo hará.
     *
     * @param tenantId - UUID del tenant
     * @param deId     - UUID del Documento Electrónico en DRAFT/ERROR
     * @returns        El ID del DE y el ID de la contingencia
     */
    async emitirEnContingencia(
        tenantId: string,
        deId: string
    ): Promise<{ deId: string; contingenciaId: string }> {
        const contingencia = await this.getContingenciaActiva(tenantId);
        if (!contingencia) {
            throw new Error(
                'No hay contingencia activa para este tenant. Active el modo de contingencia primero.'
            );
        }

        // Verify the DE exists, belongs to the tenant, and is in an emittable state
        const de = await queryOne<{ id: string; estado: string }>(
            `SELECT id, estado FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) {
            throw new Error(`DE id=${deId} no encontrado para el tenant`);
        }
        if (!['DRAFT', 'ERROR'].includes(de.estado)) {
            throw new Error(
                `No se puede emitir en contingencia un DE en estado ${de.estado}. Solo se permiten estados DRAFT o ERROR.`
            );
        }

        logger.info('Iniciando emisión en contingencia', {
            tenant_id: tenantId,
            deId,
            contingenciaId: contingencia.id,
        });

        // Step 1: Generate XML. sifenXmlService writes xml_unsigned, cdc and sets
        // estado='GENERATED'. We then patch tipo_emision to 2 before signing.
        await sifenXmlService.generarXmlDE(tenantId, deId);

        // Patch tipo_emision on both the DE record and the stored XML. The xmlgen
        // library embeds tipoEmision inside the XML; we need to replace the value
        // '1' (normal) with '2' (contingencia) before signing so that the
        // signature covers the correct payload.
        const deAfterXml = await queryOne<{ xml_unsigned: string }>(
            `SELECT xml_unsigned FROM sifen_de WHERE id = $1`,
            [deId]
        );
        if (!deAfterXml?.xml_unsigned) {
            throw new Error('El XML sin firmar no fue generado correctamente');
        }

        // Replace tipoEmision element value: <dTipoEm>1</dTipoEm> → <dTipoEm>2</dTipoEm>
        // This tag name follows the SET DE schema (NT_DE_002).
        const xmlContingencia = deAfterXml.xml_unsigned.replace(
            /<dTipoEm>1<\/dTipoEm>/,
            '<dTipoEm>2</dTipoEm>'
        );

        await query(
            `UPDATE sifen_de
             SET xml_unsigned = $1, tipo_emision = 2, updated_at = NOW()
             WHERE id = $2`,
            [xmlContingencia, deId]
        );

        // Step 2: Sign the patched XML
        await sifenSignService.firmarXmlDE(tenantId, deId);

        // Step 3: Generate QR from the signed XML
        await sifenQrService.generarQrDE(tenantId, deId);

        // Step 4: Mark the DE as CONTINGENCIA and link it to the active contingency.
        // Wrapping the counter increment and DE update in a transaction guarantees
        // the two writes are atomic — a crash between them cannot leave an
        // orphaned DE without the contingency counter reflecting it.
        await withTransaction(async (client) => {
            await client.query(
                `UPDATE sifen_de
                 SET estado = 'CONTINGENCIA',
                     contingencia_id = $1,
                     tipo_emision = 2,
                     updated_at = NOW()
                 WHERE id = $2 AND tenant_id = $3`,
                [contingencia.id, deId, tenantId]
            );

            // Step 5: Increment des_emitidos counter
            await client.query(
                `UPDATE sifen_contingencia
                 SET des_emitidos = des_emitidos + 1, updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2`,
                [contingencia.id, tenantId]
            );
        });

        logger.info('DE emitido en contingencia', {
            tenant_id: tenantId,
            deId,
            contingenciaId: contingencia.id,
        });

        return { deId, contingenciaId: contingencia.id };
    },

    /**
     * Regulariza todos los DEs acumulados durante una contingencia.
     *
     * Busca los DEs con estado='CONTINGENCIA' asociados a la contingenciaId
     * dada y los mueve a estado='ENQUEUED' para que el sistema de lotes
     * habitual los recoja y los envíe al SET.
     *
     * También actualiza el contador des_regularizados en el registro de
     * contingencia.
     *
     * @param tenantId       - UUID del tenant
     * @param contingenciaId - UUID de la contingencia a regularizar
     * @returns              Cantidad de DEs que pasaron a ENQUEUED
     */
    async regularizarContingencia(
        tenantId: string,
        contingenciaId: string
    ): Promise<RegularizacionResult> {
        // Confirm the contingency record belongs to this tenant (may be inactive
        // already — regularisation can happen after deactivation)
        const contingencia = await queryOne<SifenContingencia>(
            `SELECT id, activo, des_emitidos, des_regularizados
             FROM sifen_contingencia
             WHERE id = $1 AND tenant_id = $2`,
            [contingenciaId, tenantId]
        );
        if (!contingencia) {
            throw new Error(
                `Contingencia id=${contingenciaId} no encontrada para el tenant`
            );
        }

        // Gather DEs pending regularisation
        const des = await query<{ id: string }>(
            `SELECT id FROM sifen_de
             WHERE tenant_id = $1
               AND contingencia_id = $2
               AND estado = 'CONTINGENCIA'
               AND xml_signed IS NOT NULL
             ORDER BY created_at ASC`,
            [tenantId, contingenciaId]
        );

        if (!des.length) {
            logger.info('regularizarContingencia: no hay DEs pendientes', {
                tenant_id: tenantId,
                contingenciaId,
            });
            return { contingencia_id: contingenciaId, des_regularizados: 0 };
        }

        const deIds = des.map((d) => d.id);
        const cantidad = deIds.length;

        await withTransaction(async (client) => {
            // Move DEs to ENQUEUED so the normal batch picks them up
            await client.query(
                `UPDATE sifen_de
                 SET estado = 'ENQUEUED', updated_at = NOW()
                 WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
                [deIds, tenantId]
            );

            // Update regularisation counter
            await client.query(
                `UPDATE sifen_contingencia
                 SET des_regularizados = des_regularizados + $1, updated_at = NOW()
                 WHERE id = $2 AND tenant_id = $3`,
                [cantidad, contingenciaId, tenantId]
            );
        });

        logger.info('Contingencia regularizada', {
            tenant_id: tenantId,
            contingenciaId,
            des_regularizados: cantidad,
        });

        return { contingencia_id: contingenciaId, des_regularizados: cantidad };
    },
};
