import { logger } from '../config/logger';
import { getProcessorConnection, upsertProcessorTransactions } from '../db/repositories/bank.repository';
import { BancardConnector } from './processors/bancard.connector';
import { PagoparConnector } from './processors/pagopar.connector';
import { DinelcoConnector } from './processors/dinelco.connector';
import { ImportarProcesadorJobPayload } from '../types';
import { queryOne } from '../db/connection';

export async function procesarImportacion(tenantId: string, payload: ImportarProcesadorJobPayload): Promise<void> {
    const connection = await getProcessorConnection(tenantId, payload.processor_id);
    if (!connection) {
        throw new Error(`Conexión de procesadora no encontrada (tenant_id=${tenantId}, processor_id=${payload.processor_id})`);
    }

    // Get processor info to know the type
    const processor = await queryOne<{ nombre: string; tipo: string | null }>(
        'SELECT nombre, tipo FROM payment_processors WHERE id = $1',
        [payload.processor_id]
    );

    if (!processor) {
        throw new Error(`Procesadora no encontrada (id=${payload.processor_id})`);
    }

    let txs: any[] = [];
    const pName = processor.nombre.toLowerCase();

    if (pName.includes('bancard')) {
        const connector = new BancardConnector();
        txs = await connector.downloadCSVBancard(tenantId, connection, { mes: payload.mes, anio: payload.anio });
    } else if (pName.includes('pagopar')) {
        const connector = new PagoparConnector();
        txs = await connector.downloadTransactions();
    } else if (pName.includes('dinelco')) {
        const connector = new DinelcoConnector();
        txs = await connector.downloadTransactions();
    } else {
        throw new Error(`Conector no implementado para la procesadora ${processor.nombre}`);
    }

    if (txs.length > 0) {
        const insertadas = await upsertProcessorTransactions(tenantId, payload.processor_id, txs);
        logger.info(`Se importaron ${insertadas} transacciones de procesadora`, { tenant_id: tenantId, processor_id: payload.processor_id });
    } else {
        logger.info(`No se encontraron transacciones para importar`, { tenant_id: tenantId, processor_id: payload.processor_id });
    }
}
