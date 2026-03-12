import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';

const xmlgenModule = require('facturacionelectronicapy-xmlgen');
const xmlgen = xmlgenModule.default || xmlgenModule;

/**
 * Genera el XML no firmado de un DE usando datos reales almacenados en sifen_de.
 * Soporta tipos: 1 (Factura), 4 (Autofactura), 5 (Nota Crédito), 6 (Nota Débito)
 */
export const sifenXmlService = {
    async generarXmlDE(tenantId: string, deId: string): Promise<{ xmlUnsigned: string; cdc: string }> {
        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configuración SIFEN no encontrada');
        if (!config.timbrado) throw new Error('Timbrado no configurado en SIFEN');

        const de = await queryOne<any>(
            `SELECT id, tenant_id, cdc, tipo_documento, numero_documento, estado, moneda,
                    total_pago, total_iva10, total_iva5, total_exento, fecha_emision,
                    datos_receptor, datos_items, datos_adicionales, de_referenciado_cdc,
                    tipo_emision
             FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) throw new Error('Documento DE no encontrado');

        const receptor = de.datos_receptor;
        const items = de.datos_items || [];
        const adicionales = de.datos_adicionales || {};

        if (!receptor) throw new Error('El DE no tiene datos_receptor. Guárdelos antes de generar el XML.');
        if (!items.length) throw new Error('El DE no tiene ítems. Agréguelos antes de generar el XML.');

        const tipoDoc = parseInt(de.tipo_documento, 10);
        const ambienteCode = config.ambiente === 'PRODUCCION' ? '1' : '2';

        // Parámetros del emisor
        const deParams = {
            ruc: config.ruc,
            dv: config.dv,
            razonSocial: config.razon_social,
            ambiente: ambienteCode,
            establecimiento: config.establecimiento,
            punto: config.punto_expedicion,
            numero: de.numero_documento || '0000001',
            timbradoNumero: config.timbrado,
            timbradoFecha: config.inicio_vigencia
                ? new Date(config.inicio_vigencia).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10),
            tipoContribuyente: adicionales.tipo_contribuyente || 1,
            tipoRegimen: adicionales.tipo_regimen || 8,
            actividadEconomica: adicionales.actividad_economica || '00000',
            cSeg: String(Math.floor(Math.random() * 900000000) + 100000000),
            moneda: de.moneda || 'PYG',
            tipoEmision: de.tipo_emision || 1,
        };

        const deData: any = {
            tipoDocumento: tipoDoc,
            fechaEmision: new Date(de.fecha_emision).toISOString(),
            tipoEmision: de.tipo_emision || 1,
            descripcion: adicionales.descripcion || 'Operación comercial',
            observacion: adicionales.observacion || null,
            receptor: tipoDoc === 4
                ? buildReceptorAutofactura(receptor)
                : buildReceptor(receptor),
            items: items.map((it: any) => buildItem(it, tipoDoc)),
            condicion: buildCondicion(adicionales),
        };

        // Nota de Remisión (tipo 7) no tiene totales ni condición de pago
        if (tipoDoc === 7) {
            deData.remision = {
                motivo: adicionales.motivo_remision || 1,
                tipoResponsable: adicionales.tipo_responsable || 1,
                kms: adicionales.kms_estimados || null,
                fechaInicioTraslado: adicionales.fecha_inicio_traslado || null,
                fechaFinTraslado: adicionales.fecha_fin_traslado || null,
            };
            delete deData.condicion;
        } else {
            deData.totales = buildTotales(de);
        }

        // NC/ND requieren documento asociado
        if (tipoDoc === 5 || tipoDoc === 6) {
            if (!de.de_referenciado_cdc) {
                throw new Error('NC/ND requieren el CDC del documento referenciado (de_referenciado_cdc)');
            }
            deData.documentoAsociado = {
                tipo: 1, // CDC
                cdc: de.de_referenciado_cdc,
            };
        }

        logger.debug('Generando XML DE', { deId, tipoDoc, numero: deParams.numero });

        let result: any;
        try {
            result = await xmlgen.generateXMLDE(deParams, deData);
        } catch (err: any) {
            logger.error('Error en xmlgen.generateXMLDE', { error: err.message, deId });
            throw new Error(`Error generando XML: ${err.message}`);
        }

        const xmlUnsigned: string = typeof result === 'string' ? result : (result.xmlDE || result.xml || '');
        const cdc: string = typeof result === 'object' ? (result.cdc || result.CDC || de.cdc || '') : de.cdc || '';

        if (!xmlUnsigned) throw new Error('xmlgen no retornó XML válido');

        await query(
            `UPDATE sifen_de SET xml_unsigned = $1, cdc = $2, estado = 'GENERATED', updated_at = NOW()
             WHERE id = $3`,
            [xmlUnsigned, cdc, deId]
        );

        logger.info('XML DE generado exitosamente', { deId, cdc });
        return { xmlUnsigned, cdc };
    }
};

// ─── Helpers de mapeo ────────────────────────────────────────────────────────

function buildReceptor(receptor: any): any {
    return {
        naturaleza: receptor.naturaleza || 1,
        tipoOperacion: receptor.tipo_operacion || 1,
        ruc: receptor.ruc || null,
        dv: receptor.dv || null,
        razonSocial: receptor.razon_social,
        nombreFantasia: receptor.nombre_fantasia || null,
        tipoContribuyente: receptor.tipo_contribuyente || null,
        pais: receptor.pais || 'PRY',
        paisDescripcion: receptor.pais_descripcion || 'Paraguay',
        documentoTipo: receptor.documento_tipo || null,
        documentoNumero: receptor.documento_numero || null,
        telefono: receptor.telefono || null,
        celular: receptor.celular || null,
        email: receptor.email || null,
        direccion: receptor.direccion || null,
        numeroCasa: receptor.numero_casa || '0',
        departamento: receptor.departamento || null,
        departamentoDescripcion: receptor.departamento_descripcion || null,
        distrito: receptor.distrito || null,
        distritoDescripcion: receptor.distrito_descripcion || null,
        ciudad: receptor.ciudad || null,
        ciudadDescripcion: receptor.ciudad_descripcion || null,
    };
}

function buildReceptorAutofactura(receptor: any): any {
    return {
        naturaleza: 2,
        tipoOperacion: 4,
        razonSocial: receptor.razon_social,
        pais: 'PRY',
        paisDescripcion: 'Paraguay',
        documentoTipo: receptor.documento_tipo || 1,
        documentoNumero: receptor.documento_numero || '',
        telefono: receptor.telefono || null,
        email: receptor.email || null,
        direccion: receptor.direccion || null,
        numeroCasa: receptor.numero_casa || '0',
        departamento: receptor.departamento || null,
        ciudad: receptor.ciudad || null,
    };
}

function buildItem(item: any, tipoDoc?: number): any {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);
    const tasa = Number(item.tasa_iva) || 0;
    const subtotal = cantidad * precioUnitario;
    const ivaMonto = tasa > 0 ? Math.round((subtotal * tasa) / (100 + tasa)) : 0;

    const result: any = {
        codigo: item.codigo || null,
        descripcion: item.descripcion,
        cantidad,
        precioUnitario,
        unidadMedida: item.unidad_medida || 77,
        ivaTipo: item.iva_tipo || 1,
        ivaBase: item.iva_base || 100,
        iva: tasa,
        tasaIvaMonto: ivaMonto,
        lote: item.lote || null,
        vencimiento: item.vencimiento || null,
        numeroSerie: item.numero_serie || null,
    };

    // ISC (Impuesto Selectivo al Consumo)
    if (item.isc_tasa && Number(item.isc_tasa) > 0) {
        result.isc = {
            tipo: item.isc_tipo || 1,
            base: item.isc_base || subtotal,
            tasa: Number(item.isc_tasa),
            valor: Math.round(subtotal * Number(item.isc_tasa) / 100),
        };
    }

    // Nota de Remisión: peso y volumen opcionales
    if (tipoDoc === 7) {
        if (item.peso) result.peso = Number(item.peso);
        if (item.volumen) result.volumen = Number(item.volumen);
    }

    return result;
}

function buildTotales(de: any): any {
    return {
        totalIva10: Number(de.total_iva10) || 0,
        totalIva5: Number(de.total_iva5) || 0,
        totalExento: Number(de.total_exento) || 0,
        totalIva: (Number(de.total_iva10) || 0) + (Number(de.total_iva5) || 0),
        total: Number(de.total_pago) || 0,
    };
}

function buildCondicion(adicionales: any): any {
    return {
        tipo: adicionales.condicion_pago || 1,
        entregas: adicionales.entregas || [
            { tipo: 1, monto: null, moneda: 'PYG', cambio: null }
        ],
        credito: adicionales.credito || null,
    };
}
