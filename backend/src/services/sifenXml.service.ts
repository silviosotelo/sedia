import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
const xmlgen = require('facturacionelectronicapy-xmlgen');

export const sifenXmlService = {
    /**
     * Generates the unsigned XML for a given Documento Electronico (DE)
     */
    async generarXmlDE(tenantId: string, deId: string): Promise<string> {
        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configuracion SIFEN no encontrada');

        const deInfo = await queryOne<any>(`SELECT * FROM sifen_de WHERE id = $1 AND tenant_id = $2`, [deId, tenantId]);
        if (!deInfo) throw new Error('Documento DE no encontrado');

        // Aqui habría una invocacion al DB para buscar detalles, emisor, receptor, etc.
        // Usaremos valores mock según la especificación SIFEN por simplicidad para la demo
        const dataMock: any = {
            fechaEmision: deInfo.fecha_emision,
            tipoDocumento: deInfo.tipo_documento || 1, // Factura electrónica
            moneda: deInfo.moneda || 'PYG',
            receptor: {
                naturaleza: 1, // Contribuyente
                tipoOperacion: 1, // B2B
                ruc: "44444401", // Default receptor para pruebas
                dv: "7",
                razonSocial: "EMPRESA PRUEBA SA",
                direccion: "CALLE TEST",
                numeroCasa: "123",
                ciudad: 1,
                departamento: 1,
                tipoContribuyente: 1,
            },
            items: [
                {
                    codigo: "ITEM001",
                    descripcion: "Servicio de prueba",
                    cantidad: 1,
                    precioUnitario: 100000,
                    unidadMedida: 77, // UNI
                    afectacionIva: 1, // Gravado IVA
                    tasaIva: 10,
                    subtotal: 100000
                }
            ]
        };

        const deParams = {
            ruc: config.ruc,
            dv: config.dv,
            razonSocial: config.razon_social,
            ambiente: config.ambiente === 'PRODUCCION' ? '1' : '2',
            establecimiento: config.establecimiento,
            puntoEstablecimiento: config.punto_expedicion, // Punto expedición
            numeroDocumento: "0000001", // Extraído del correlativo local idealmente
            timbradoNumero: config.timbrado || "12345678",
            timbradoFecha: config.inicio_vigencia || "2023-01-01",
            idSeg: "1" // Código de seguridad aleatorio, facturacionelectronicapy lo gestiona o lo forzamos
        };

        const result = await xmlgen.generateXMLDE(deParams, dataMock);

        // Save generated XML unsigned
        await query(`UPDATE sifen_de SET xml_unsigned = $1, estado = 'GENERATED' WHERE id = $2`, [result.xmlDE || result, deId]);

        // En XML gen, they generally return a JSON containing the CDC and XML string, so handling the exact output shape could vary. 
        // Usually it resolves to a raw XML string or { xmlDE, cdc }.
        return typeof result === 'string' ? result : result.xmlDE;
    }
};
