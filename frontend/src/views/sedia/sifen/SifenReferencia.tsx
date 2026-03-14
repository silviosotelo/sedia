import { Card } from '@/components/ui'

// ─── Códigos de respuesta SIFEN ─────────────────────────────────────────────

const CODIGOS_RECIBE_LOTE = [
    { codigo: '0300', desc: 'Lote recibido con éxito', accion: 'Consultar estado del lote con el número de protocolo retornado (dProtConsLote). Esperar mínimo 10 minutos antes de consultar.' },
    { codigo: '0301', desc: 'Lote no encolado para procesamiento', accion: 'El lote fue rechazado. Verificar motivos: distintos RUC emisores, distintos tipos de DE, más de 50 DE, bloqueo por duplicados, archivo >1000KB.' },
]

const CODIGOS_CONSULTA_LOTE = [
    { codigo: '0360', desc: 'Número de lote inexistente', accion: 'El número de lote no existe en SIFEN. Verificar que el lote fue enviado correctamente.' },
    { codigo: '0361', desc: 'Lote en procesamiento', accion: 'Reintentar la consulta después de 10 minutos. En horarios pico puede tardar 1-24 horas.' },
    { codigo: '0362', desc: 'Procesamiento de lote concluido', accion: 'El lote fue procesado. Revisar los detalles individuales por cada DE (gResProcLote).' },
    { codigo: '0364', desc: 'Consulta extemporánea', accion: 'Pasaron más de 48 horas desde el envío. Consultar cada CDC individual usando WS Consulta DE.' },
]

const CODIGOS_CONSULTA_DE = [
    { codigo: '0420', desc: 'Documento no existe en SIFEN o fue rechazado', accion: 'El DE no fue aprobado o no fue recibido. Verificar estado del lote o reenviar.' },
    { codigo: '0422', desc: 'CDC encontrado — DTE aprobado', accion: 'El documento existe y está aprobado. Se retorna el XML completo del DE en xContenDE.' },
]

const CODIGOS_CONSULTA_RUC = [
    { codigo: '0500', desc: 'Error en la consulta', accion: 'Verificar formato del RUC y reintentar.' },
    { codigo: '0502', desc: 'RUC encontrado', accion: 'Se retornan los datos del contribuyente (razón social, estado, tipo, etc.).' },
]

const CODIGOS_RECIBE_SINCRONO = [
    { codigo: '0300', desc: 'DE aprobado', accion: 'El documento fue aprobado por SIFEN y se convirtió en DTE con valor fiscal.' },
    { codigo: '0160', desc: 'XML mal formado', accion: 'El XML tiene campos inválidos o estructura incorrecta. Ver mensaje detallado.' },
]

const CODIGOS_DETALLE_DE = [
    { codigo: '0160', desc: 'XML mal formado', tipo: 'Técnico' },
    { codigo: '0161', desc: 'Firma digital no válida', tipo: 'Firma' },
    { codigo: '0162', desc: 'Certificado no autorizado o revocado', tipo: 'Certificado' },
    { codigo: '0163', desc: 'CDC duplicado — ya fue aprobado previamente', tipo: 'Negocio' },
    { codigo: '0164', desc: 'RUC del emisor no habilitado como facturador electrónico', tipo: 'Negocio' },
    { codigo: '0165', desc: 'Timbrado no válido o vencido', tipo: 'Negocio' },
    { codigo: '0166', desc: 'Número de documento fuera de rango autorizado', tipo: 'Negocio' },
    { codigo: '0167', desc: 'Fecha de emisión fuera de rango de vigencia', tipo: 'Negocio' },
    { codigo: '0168', desc: 'RUC del receptor no válido', tipo: 'Negocio' },
    { codigo: '0170', desc: 'Datos de cálculos incorrectos (totales, IVA)', tipo: 'Negocio' },
]

// ─── Estados del DE ─────────────────────────────────────────────────────────

const ESTADOS_DE = [
    { estado: 'DRAFT', desc: 'Borrador', color: 'bg-gray-100 text-gray-600', detalle: 'DE creado con datos básicos. Aún no se ha generado el XML.' },
    { estado: 'GENERATED', desc: 'XML Generado', color: 'bg-blue-100 text-blue-700', detalle: 'XML generado con CDC válido de 44 dígitos. Falta firmar.' },
    { estado: 'SIGNED', desc: 'Firmado', color: 'bg-indigo-100 text-indigo-700', detalle: 'XML firmado digitalmente con certificado del contribuyente. Listo para enviar.' },
    { estado: 'ENQUEUED', desc: 'En cola', color: 'bg-yellow-100 text-yellow-700', detalle: 'Esperando ser incluido en un lote o enviado sincrónicamente.' },
    { estado: 'IN_LOTE', desc: 'En lote', color: 'bg-orange-100 text-orange-700', detalle: 'Incluido en un lote armado, pendiente de envío a SIFEN.' },
    { estado: 'SENT', desc: 'Enviado', color: 'bg-cyan-100 text-cyan-700', detalle: 'Enviado a SIFEN. Pendiente de resultado (para lotes, consultar estado).' },
    { estado: 'APPROVED', desc: 'Aprobado (DTE)', color: 'bg-green-100 text-green-700', detalle: 'Aprobado por SIFEN. Tiene valor fiscal. Se convirtió en Documento Tributario Electrónico (DTE).' },
    { estado: 'REJECTED', desc: 'Rechazado', color: 'bg-red-100 text-red-600', detalle: 'Rechazado por SIFEN. Ver sifen_codigo y sifen_mensaje para el motivo. Se puede corregir y reenviar.' },
    { estado: 'CANCELLED', desc: 'Cancelado', color: 'bg-gray-200 text-gray-600', detalle: 'Anulado mediante evento de cancelación enviado al SIFEN.' },
    { estado: 'ERROR', desc: 'Error interno', color: 'bg-red-200 text-red-800', detalle: 'Error en el proceso de emisión (generación XML, firma, conexión). Ver error_categoria.' },
]

// ─── Tipos de documento ─────────────────────────────────────────────────────

const TIPOS_DOCUMENTO = [
    { tipo: 1, sigla: 'FE', nombre: 'Factura Electrónica', desc: 'Respalda compra/venta de bienes y servicios.' },
    { tipo: 4, sigla: 'AFE', nombre: 'Autofactura Electrónica', desc: 'Emitida por el comprador cuando el vendedor no puede facturar.' },
    { tipo: 5, sigla: 'NCE', nombre: 'Nota de Crédito Electrónica', desc: 'Documento asociado que reduce el monto de una FE. Requiere CDC referenciado.' },
    { tipo: 6, sigla: 'NDE', nombre: 'Nota de Débito Electrónica', desc: 'Documento asociado que aumenta el monto de una FE. Requiere CDC referenciado.' },
    { tipo: 7, sigla: 'NRE', nombre: 'Nota de Remisión Electrónica', desc: 'Acompaña el traslado de mercaderías. Sin totales ni condición de pago.' },
]

// ─── Eventos SIFEN ──────────────────────────────────────────────────────────

const EVENTOS = [
    { evento: 'Cancelación', rol: 'Emisor', desc: 'Anula un DTE aprobado. El emisor solicita dejar sin efecto el documento.' },
    { evento: 'Inutilización', rol: 'Emisor', desc: 'Invalida un rango de numeración no utilizado (ej: salto de números).' },
    { evento: 'Conformidad', rol: 'Receptor', desc: 'El receptor confirma que acepta el DTE recibido.' },
    { evento: 'Disconformidad', rol: 'Receptor', desc: 'El receptor manifiesta su rechazo al DTE recibido.' },
    { evento: 'Desconocimiento', rol: 'Receptor', desc: 'El receptor declara no conocer/reconocer el DTE.' },
    { evento: 'Notificación de Recepción', rol: 'Receptor', desc: 'El receptor notifica que recibió el DTE.' },
]

// ─── CDC (Código de Control) ────────────────────────────────────────────────

const CDC_ESTRUCTURA = [
    { pos: '01-02', campo: 'Tipo de Documento', ejemplo: '01', desc: '01=FE, 04=AFE, 05=NCE, 06=NDE, 07=NRE' },
    { pos: '03-10', campo: 'RUC del Emisor', ejemplo: '80012345', desc: '8 dígitos, con ceros a la izquierda' },
    { pos: '11', campo: 'Dígito Verificador', ejemplo: '6', desc: 'DV del RUC del emisor' },
    { pos: '12-14', campo: 'Establecimiento', ejemplo: '001', desc: '3 dígitos del código de establecimiento' },
    { pos: '15-17', campo: 'Punto de Expedición', ejemplo: '001', desc: '3 dígitos del punto de expedición' },
    { pos: '18-24', campo: 'Número de Documento', ejemplo: '0000001', desc: '7 dígitos del número correlativo' },
    { pos: '25', campo: 'Tipo de Contribuyente', ejemplo: '1', desc: '1=Persona Física, 2=Persona Jurídica' },
    { pos: '26-33', campo: 'Fecha de Emisión', ejemplo: '20240315', desc: 'Formato AAAAMMDD' },
    { pos: '34', campo: 'Tipo de Emisión', ejemplo: '1', desc: '1=Normal, 2=Contingencia' },
    { pos: '35-43', campo: 'Código de Seguridad', ejemplo: '123456789', desc: '9 dígitos aleatorios generados por el sistema' },
    { pos: '44', campo: 'Dígito Verificador del CDC', ejemplo: '1', desc: 'Calculado con algoritmo módulo 11' },
]

// ─── Motivos de rechazo de lote ─────────────────────────────────────────────

const MOTIVOS_RECHAZO_LOTE = [
    'Haber enviado DE con distintos RUC emisores (un solo RUC por lote)',
    'Haber enviado DE de distintos tipos (un solo tipo por lote: solo FE, solo NCE, etc.)',
    'Haber enviado más de 50 DE en un mismo lote',
    'Estar bloqueado por envío duplicado de CDC',
    'El archivo comprimido supera 1000 KB',
]

const MOTIVOS_BLOQUEO = [
    'Enviar lotes vacíos o con contenido no válido (bloqueo 10-60 min)',
    'Enviar el mismo CDC varias veces en un mismo lote (bloqueo 10-60 min)',
    'Enviar el mismo CDC en lotes distintos mientras aún está en procesamiento (bloqueo 10-60 min)',
    'Enviar varias veces un mismo lote (bloqueo 10-60 min, escalable)',
]

// ─── URLs de servicios ──────────────────────────────────────────────────────

const SERVICIOS_WS = [
    { servicio: 'Recepción Sincrónica', test: 'https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl', prod: 'https://sifen.set.gov.py/de/ws/sync/recibe.wsdl', desc: 'Envía 1 DE y retorna resultado inmediato' },
    { servicio: 'Recepción Lote (Async)', test: 'https://sifen-test.set.gov.py/de/ws/async/recibe-lote.wsdl', prod: 'https://sifen.set.gov.py/de/ws/async/recibe-lote.wsdl', desc: 'Envía hasta 50 DE en lote comprimido' },
    { servicio: 'Consulta Lote', test: 'https://sifen-test.set.gov.py/de/ws/consultas/consulta-lote.wsdl', prod: 'https://sifen.set.gov.py/de/ws/consultas/consulta-lote.wsdl', desc: 'Consulta resultado de lote por número de protocolo' },
    { servicio: 'Consulta DE (CDC)', test: 'https://sifen-test.set.gov.py/de/ws/consultas/consulta.wsdl', prod: 'https://sifen.set.gov.py/de/ws/consultas/consulta.wsdl', desc: 'Consulta estado de un DE por su CDC' },
    { servicio: 'Consulta RUC', test: 'https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl', prod: 'https://sifen.set.gov.py/de/ws/consultas/consulta-ruc.wsdl', desc: 'Consulta datos de contribuyente por RUC' },
    { servicio: 'Eventos', test: 'https://sifen-test.set.gov.py/de/ws/eventos/evento.wsdl', prod: 'https://sifen.set.gov.py/de/ws/eventos/evento.wsdl', desc: 'Envía eventos (cancelación, inutilización, conformidad, etc.)' },
]

// ─── Componente ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card className="overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h3>
            </div>
            <div className="p-5">{children}</div>
        </Card>
    )
}

function CodeTable({ data, columns }: { data: any[]; columns: { key: string; label: string; className?: string }[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                        {columns.map(c => <th key={c.key} className={`text-left pb-2 font-semibold text-gray-600 dark:text-gray-400 ${c.className || ''}`}>{c.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                            {columns.map(c => <td key={c.key} className={`py-2 pr-3 text-gray-700 dark:text-gray-300 ${c.className || ''}`}>{row[c.key]}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function SifenReferencia() {
    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Referencia SIFEN</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Guía de estados, códigos de respuesta, estructura CDC y mejores prácticas — basado en el Manual Técnico v150 y la Guía de Pruebas DNIT.
                </p>
            </div>

            <Section title="Estados del Documento Electrónico (DE)">
                <div className="space-y-2">
                    {ESTADOS_DE.map(e => (
                        <div key={e.estado} className="flex items-start gap-3 py-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${e.color}`}>{e.estado}</span>
                            <div className="flex-1 min-w-0">
                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{e.desc}</span>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{e.detalle}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                        Flujo normal: DRAFT → GENERATED → SIGNED → ENQUEUED → (envío sync) → APPROVED/REJECTED
                    </p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-1">
                        Flujo por lote: DRAFT → GENERATED → SIGNED → ENQUEUED → IN_LOTE → SENT → APPROVED/REJECTED
                    </p>
                </div>
            </Section>

            <Section title="Tipos de Documento Electrónico">
                <CodeTable data={TIPOS_DOCUMENTO} columns={[
                    { key: 'tipo', label: 'Tipo', className: 'font-mono w-12' },
                    { key: 'sigla', label: 'Sigla', className: 'font-bold w-12' },
                    { key: 'nombre', label: 'Nombre', className: 'font-semibold' },
                    { key: 'desc', label: 'Descripción' },
                ]} />
            </Section>

            <Section title="Estructura del CDC (44 dígitos)">
                <CodeTable data={CDC_ESTRUCTURA} columns={[
                    { key: 'pos', label: 'Posición', className: 'font-mono w-16' },
                    { key: 'campo', label: 'Campo', className: 'font-semibold' },
                    { key: 'ejemplo', label: 'Ejemplo', className: 'font-mono w-20' },
                    { key: 'desc', label: 'Descripción' },
                ]} />
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-[10px] text-gray-500 font-mono break-all">
                        Ejemplo: <span className="text-gray-800 dark:text-gray-200 font-bold">01</span>
                        <span className="text-blue-600">80012345</span>
                        <span className="text-green-600">6</span>
                        <span className="text-orange-600">001</span>
                        <span className="text-purple-600">001</span>
                        <span className="text-red-600">0000001</span>
                        <span className="text-cyan-600">1</span>
                        <span className="text-pink-600">20240315</span>
                        <span className="text-amber-600">1</span>
                        <span className="text-teal-600">123456789</span>
                        <span className="text-gray-800 dark:text-gray-200">1</span>
                    </p>
                </div>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Section title="Códigos — Recepción Lote (recibe-lote)">
                    <CodeTable data={CODIGOS_RECIBE_LOTE} columns={[
                        { key: 'codigo', label: 'Código', className: 'font-mono font-bold w-16' },
                        { key: 'desc', label: 'Descripción', className: 'font-semibold' },
                        { key: 'accion', label: 'Acción' },
                    ]} />
                </Section>

                <Section title="Códigos — Consulta Lote (consulta-lote)">
                    <CodeTable data={CODIGOS_CONSULTA_LOTE} columns={[
                        { key: 'codigo', label: 'Código', className: 'font-mono font-bold w-16' },
                        { key: 'desc', label: 'Descripción', className: 'font-semibold' },
                        { key: 'accion', label: 'Acción' },
                    ]} />
                </Section>

                <Section title="Códigos — Consulta DE (por CDC)">
                    <CodeTable data={CODIGOS_CONSULTA_DE} columns={[
                        { key: 'codigo', label: 'Código', className: 'font-mono font-bold w-16' },
                        { key: 'desc', label: 'Descripción', className: 'font-semibold' },
                        { key: 'accion', label: 'Acción' },
                    ]} />
                </Section>

                <Section title="Códigos — Consulta RUC">
                    <CodeTable data={CODIGOS_CONSULTA_RUC} columns={[
                        { key: 'codigo', label: 'Código', className: 'font-mono font-bold w-16' },
                        { key: 'desc', label: 'Descripción', className: 'font-semibold' },
                        { key: 'accion', label: 'Acción' },
                    ]} />
                </Section>
            </div>

            <Section title="Códigos de Rechazo Comunes por DE (detalle individual)">
                <CodeTable data={CODIGOS_DETALLE_DE} columns={[
                    { key: 'codigo', label: 'Código', className: 'font-mono font-bold w-16' },
                    { key: 'tipo', label: 'Tipo', className: 'w-20' },
                    { key: 'desc', label: 'Descripción' },
                ]} />
                <p className="text-[11px] text-gray-400 mt-3">
                    El mensaje de rechazo (dMsgRes) contiene el detalle específico del error. Estos son los códigos más frecuentes — la lista completa está en el Manual Técnico v150.
                </p>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Section title="Motivos de Rechazo de Lote (0301)">
                    <ul className="space-y-1.5">
                        {MOTIVOS_RECHAZO_LOTE.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                                <span className="text-red-400 mt-0.5 flex-shrink-0">&#10005;</span>
                                {m}
                            </li>
                        ))}
                    </ul>
                </Section>

                <Section title="Motivos de Bloqueo Temporal de RUC">
                    <ul className="space-y-1.5">
                        {MOTIVOS_BLOQUEO.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                                <span className="text-amber-500 mt-0.5 flex-shrink-0">&#9888;</span>
                                {m}
                            </li>
                        ))}
                    </ul>
                </Section>
            </div>

            <Section title="Eventos SIFEN">
                <CodeTable data={EVENTOS} columns={[
                    { key: 'evento', label: 'Evento', className: 'font-semibold w-40' },
                    { key: 'rol', label: 'Rol', className: 'w-20' },
                    { key: 'desc', label: 'Descripción' },
                ]} />
            </Section>

            <Section title="Endpoints de Servicios Web SIFEN">
                <div className="space-y-3">
                    {SERVICIOS_WS.map((s, i) => (
                        <div key={i} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{s.servicio}</span>
                                <span className="text-[10px] text-gray-400">{s.desc}</span>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400">TEST: {s.test}</p>
                                <p className="text-[10px] font-mono text-green-600 dark:text-green-400">PROD: {s.prod}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Mejores Prácticas (Guía DNIT)">
                <div className="space-y-3 text-xs text-gray-700 dark:text-gray-300">
                    <div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-1">Generación de XML</h4>
                        <ul className="space-y-1 ml-4 list-disc text-gray-600 dark:text-gray-400">
                            <li>NO incluir espacios en blanco al inicio o final de campos</li>
                            <li>NO incluir comentarios, anotaciones ni documentaciones en el XML</li>
                            <li>NO incluir caracteres de formato (line-feed, carriage return, tab)</li>
                            <li>NO usar prefijos en el namespace de las etiquetas</li>
                            <li>NO incluir etiquetas de campos vacíos (excepto campos obligatorios)</li>
                            <li>NO usar valores negativos en campos numéricos</li>
                            <li>Los nombres de campos son case-sensitive (gOpeDE ≠ GopeDE)</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-1">Envío por Lote</h4>
                        <ul className="space-y-1 ml-4 list-disc text-gray-600 dark:text-gray-400">
                            <li>Máximo 50 DE por lote, todos del mismo tipo y mismo RUC emisor</li>
                            <li>Archivo comprimido no debe superar 1000 KB</li>
                            <li>Esperar mínimo 10 minutos antes de consultar estado del lote</li>
                            <li>Consultar a intervalos de 10 minutos (no menos)</li>
                            <li>NUNCA reenviar un CDC sin tener respuesta definitiva de SIFEN</li>
                            <li>Si no se recibe número de lote, consultar por un CDC del lote enviado</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-1">Ambiente de Pruebas</h4>
                        <ul className="space-y-1 ml-4 list-disc text-gray-600 dark:text-gray-400">
                            <li>CSC genérico: IdCSC: 0001 CSC: ABCD0000000000000000000000000000</li>
                            <li>Observación obligatoria: "DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA"</li>
                            <li>Usar datos reales del RUC del emisor (registrado en MARANGATU)</li>
                            <li>Prevalidador: https://ekuatia.set.gov.py/prevalidador/</li>
                        </ul>
                    </div>
                </div>
            </Section>

            <div className="text-center py-3">
                <p className="text-[10px] text-gray-400">
                    Fuentes: Manual Técnico SIFEN v150 · Guía de Pruebas e-kuatia (DNIT Feb/2026) · Guía de Mejores Prácticas (DNIT Oct/2024)
                </p>
                <p className="text-[10px] text-gray-400">
                    Documentación completa: https://www.dnit.gov.py/web/e-kuatia/documentacion-tecnica
                </p>
            </div>
        </div>
    )
}
