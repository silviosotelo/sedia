import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { sifenEstablecimientoService } from './sifenEstablecimiento.service';
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
        // Not used directly in params — xmlgen derives it from data.tipoEmision

        // Parámetros del emisor — format required by facturacionelectronicapy-xmlgen:
        //   ruc: "RUC-DV" format (with hyphen)
        //   establecimientos: array of {codigo, denominacion, direccion, numeroCasa, departamento, distrito, ciudad, ...}
        //   actividadesEconomicas: array of {codigo, descripcion}
        const establecimientoCodigo = String(config.establecimiento).padStart(3, '0');
        const codigoSeguridadAleatorio = String(Math.floor(Math.random() * 900000000) + 100000000);

        const cfg = config as any;

        // Buscar establecimiento de la tabla sifen_establecimientos
        let est: any = null;
        try {
            est = await sifenEstablecimientoService.getByCodigo(tenantId, establecimientoCodigo);
        } catch (e) {
            logger.warn('sifen_establecimientos lookup failed', { error: (e as Error).message });
        }

        const estObj = est ? buildEstablecimientoFromDb(est) : buildEstablecimiento(establecimientoCodigo, cfg);
        logger.info('Datos establecimiento para XML', {
            source: est ? 'sifen_establecimientos' : 'sifen_config_fallback',
            codigo: estObj.codigo,
            denominacion: estObj.denominacion,
            direccion: estObj.direccion,
            telefono: estObj.telefono || 'NO TIENE',
            email: estObj.email || 'NO TIENE',
            departamento: estObj.departamento,
            distrito: estObj.distrito,
            ciudad: estObj.ciudad,
        });

        const deParams = {
            version: 150,
            ruc: `${config.ruc}-${config.dv}`,
            razonSocial: config.razon_social,
            nombreFantasia: adicionales.nombre_fantasia || undefined,
            actividadesEconomicas: adicionales.actividades_economicas || [
                { codigo: cfg.actividad_economica || '00000', descripcion: cfg.actividad_economica_desc || 'Actividades no especificadas' }
            ],
            establecimientos: [estObj],
            timbradoNumero: config.timbrado,
            timbradoFecha: config.inicio_vigencia
                ? new Date(config.inicio_vigencia).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10),
            tipoContribuyente: cfg.tipo_contribuyente || 1,
            tipoRegimen: cfg.tipo_regimen || 8,
        };

        // xmlgen expects `fecha` (not `fechaEmision`) in format yyyy-MM-ddTHH:mm:ss
        const fechaDE = de.fecha_emision
            ? new Date(de.fecha_emision).toISOString().replace('Z', '').split('.')[0]
            : new Date().toISOString().replace('Z', '').split('.')[0];

        const deData: any = {
            tipoDocumento: tipoDoc,
            establecimiento: Number(config.establecimiento) || 1,
            punto: Number(config.punto_expedicion) || 1,
            numero: Number(de.numero_documento) || 1,
            fecha: fechaDE,
            tipoEmision: de.tipo_emision || 1,
            codigoSeguridadAleatorio: codigoSeguridadAleatorio,
            tipoImpuesto: adicionales.tipo_impuesto || 1,
            tipoTransaccion: adicionales.tipo_transaccion || 1,
            moneda: de.moneda || 'PYG',
            condicionTipoCambio: de.moneda && de.moneda !== 'PYG' ? 1 : undefined,
            cambio: de.moneda && de.moneda !== 'PYG' ? (adicionales.tipo_cambio || 1) : undefined,
            descripcion: adicionales.descripcion || 'Operación comercial',
            observacion: adicionales.observacion || undefined,
            cliente: tipoDoc === 4
                ? buildClienteAutofactura(receptor)
                : buildCliente(receptor),
            items: items.map((it: any) => buildItem(it, tipoDoc)),
            condicion: buildCondicion(adicionales),
        };

        // Factura (tipo 1) requiere data.factura con presencia obligatorio
        if (tipoDoc === 1) {
            deData.factura = {
                presencia: adicionales.presencia || 1,
                ...(adicionales.factura || {}),
            };
        }

        // Autofactura (tipo 4) requiere data.autoFactura
        if (tipoDoc === 4) {
            deData.autoFactura = {
                tipoVendedor: adicionales.tipo_vendedor || 1,
                documentoTipo: adicionales.documento_tipo_vendedor || 1,
                documentoNumero: adicionales.documento_numero_vendedor || '',
                nombre: adicionales.nombre_vendedor || '',
                direccion: adicionales.direccion_vendedor || '',
                numeroCasa: adicionales.numero_casa_vendedor || '0',
                departamento: adicionales.departamento_vendedor || 11,
                distrito: adicionales.distrito_vendedor || 143,
                ciudad: adicionales.ciudad_vendedor || 3344,
                ...(adicionales.autoFactura || {}),
            };
        }

        // Nota de Crédito (tipo 5) requiere data.notaCreditoDebito
        if (tipoDoc === 5 || tipoDoc === 6) {
            deData.notaCreditoDebito = {
                motivo: adicionales.motivo_nc_nd || 1,
                ...(adicionales.notaCreditoDebito || {}),
            };
        }

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
                formato: 1, // 1=CDC (campo requerido por xmlgen como 'formato', no 'tipo')
                cdc: de.de_referenciado_cdc,
            };
        }

        logger.debug('Generando XML DE', { deId, tipoDoc, numero: deData.numero });

        let result: any;
        try {
            result = await xmlgen.generateXMLDE(deParams, deData);
        } catch (err: any) {
            logger.error('Error en xmlgen.generateXMLDE', { error: err.message, deId });
            throw new Error(`Error generando XML: ${err.message}`);
        }

        let xmlUnsigned: string = typeof result === 'string' ? result : (result.xmlDE || result.xml || '');

        if (!xmlUnsigned) throw new Error('xmlgen no retornó XML válido');

        // Regla DNIT Guía Mejores Prácticas punto 5:
        // "NO incluir etiquetas de campos que no contengan valor"
        // xmlgen genera tags con undefined/null/vacío para campos opcionales
        // que no tienen valor (ej: <dTelEmi>undefined</dTelEmi>, <dTelEmi/>)
        xmlUnsigned = xmlUnsigned
            .replace(/<(\w+)>undefined<\/\1>/g, '')
            .replace(/<(\w+)>null<\/\1>/g, '')
            .replace(/<(\w+)\s*\/>/g, '');

        // Log XML para diagnóstico
        logger.info('XML generado (limpiado)', { deId, xmlLen: xmlUnsigned.length, xml: xmlUnsigned.slice(0, 3000) });

        // Extraer CDC del XML generado (atributo Id del elemento DE: <DE Id="44chars...">)
        let cdc: string = '';
        if (typeof result === 'object' && (result.cdc || result.CDC)) {
            cdc = result.cdc || result.CDC;
        } else {
            const cdcMatch = xmlUnsigned.match(/<DE\s+Id="([A-Za-z0-9]{44})"/);
            if (cdcMatch) {
                cdc = cdcMatch[1];
            }
        }

        if (!cdc || cdc.startsWith('TEMP-')) {
            throw new Error('No se pudo generar un CDC válido para el DE. Verifique los datos del documento.');
        }

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

/**
 * Build establecimiento object from sifen_establecimientos table row.
 * xmlgen assigns dTelEmi/dEmailE unconditionally, so we must NOT include
 * keys with falsy values to avoid empty XML tags (SIFEN 0160).
 */
function buildEstablecimientoFromDb(row: any): any {
    const est: any = {
        codigo: String(row.codigo).padStart(3, '0'),
        denominacion: row.denominacion,
        direccion: row.direccion || 'Sin dirección',
        numeroCasa: row.numero_casa || '0',
        departamento: row.departamento || 11,
        distrito: row.distrito || 143,
        ciudad: row.ciudad || 3344,
    };
    if (row.complemento_dir1) est.complementoDireccion1 = row.complemento_dir1;
    if (row.complemento_dir2) est.complementoDireccion2 = row.complemento_dir2;
    if (row.telefono) est.telefono = row.telefono;
    if (row.email) est.email = row.email;
    return est;
}

/** Fallback: build from sifen_config flat fields (legacy) */
function buildEstablecimiento(codigo: string, cfg: any): any {
    const est: any = {
        codigo,
        denominacion: cfg.denominacion_sucursal || cfg.razon_social,
        direccion: cfg.direccion_emisor || 'Sin dirección',
        numeroCasa: cfg.numero_casa || '0',
        departamento: cfg.departamento || 11,
        distrito: cfg.distrito || 143,
        ciudad: cfg.ciudad || 3344,
    };
    if (cfg.complemento_dir1) est.complementoDireccion1 = cfg.complemento_dir1;
    if (cfg.complemento_dir2) est.complementoDireccion2 = cfg.complemento_dir2;
    if (cfg.telefono_emisor) est.telefono = cfg.telefono_emisor;
    if (cfg.email_emisor) est.email = cfg.email_emisor;
    return est;
}

/**
 * Builds the `data.cliente` object for xmlgen.
 * xmlgen expects: contribuyente (bool), tipoOperacion, ruc ("RUC-DV"), pais, razonSocial, etc.
 */
function buildCliente(receptor: any): any {
    const hasRuc = !!(receptor.ruc && receptor.dv);
    return {
        contribuyente: hasRuc,
        tipoOperacion: receptor.tipo_operacion || 1,
        ruc: hasRuc ? `${receptor.ruc}-${receptor.dv}` : undefined,
        tipoContribuyente: receptor.tipo_contribuyente || (hasRuc ? 1 : undefined),
        razonSocial: receptor.razon_social,
        nombreFantasia: receptor.nombre_fantasia || undefined,
        pais: receptor.pais || 'PRY',
        documentoTipo: !hasRuc ? (receptor.documento_tipo || 1) : undefined,
        documentoNumero: !hasRuc ? (receptor.documento_numero || '') : undefined,
        telefono: receptor.telefono || undefined,
        celular: receptor.celular || undefined,
        email: receptor.email || undefined,
        direccion: receptor.direccion || undefined,
        numeroCasa: receptor.numero_casa || '0',
        departamento: receptor.departamento || undefined,
        distrito: receptor.distrito || undefined,
        ciudad: receptor.ciudad || undefined,
    };
}

function buildClienteAutofactura(receptor: any): any {
    return {
        contribuyente: false,
        tipoOperacion: 4,
        razonSocial: receptor.razon_social,
        pais: 'PRY',
        documentoTipo: receptor.documento_tipo || 1,
        documentoNumero: receptor.documento_numero || '',
        telefono: receptor.telefono || undefined,
        email: receptor.email || undefined,
        direccion: receptor.direccion || undefined,
        numeroCasa: receptor.numero_casa || '0',
        departamento: receptor.departamento || undefined,
        ciudad: receptor.ciudad || undefined,
    };
}

function buildItem(item: any, tipoDoc?: number): any {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);
    const tasa = Number(item.tasa_iva) || 0;
    const subtotal = cantidad * precioUnitario;
    const ivaMonto = tasa > 0 ? Math.round((subtotal * tasa) / (100 + tasa)) : 0;

    const result: any = {
        codigo: item.codigo || undefined,
        descripcion: item.descripcion,
        cantidad,
        precioUnitario,
        unidadMedida: item.unidad_medida || 77,
        ivaTipo: item.iva_tipo || 1,
        ivaBase: item.iva_base || 100,
        iva: tasa,
        tasaIvaMonto: ivaMonto,
        lote: item.lote || undefined,
        vencimiento: item.vencimiento || undefined,
        numeroSerie: item.numero_serie || undefined,
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
    const condicion: any = {
        tipo: adicionales.condicion_pago || 1,
        entregas: adicionales.entregas || [
            { tipo: 1, monto: 0, moneda: 'PYG' }
        ],
    };
    if (adicionales.credito) {
        condicion.credito = adicionales.credito;
    }
    return condicion;
}
