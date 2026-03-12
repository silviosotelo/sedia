const PoliticaPrivacidad = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 sm:p-12">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        Politica de Privacidad
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                        Ultima actualizacion: 11 de marzo de 2026
                    </p>

                    <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
                        {/* 1. Responsable del Tratamiento */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                1. Responsable del Tratamiento de Datos
                            </h2>
                            <p>
                                El responsable del tratamiento de los datos personales recabados a
                                traves de la plataforma SEDIA es [RAZON SOCIAL], con RUC [NUMERO
                                DE RUC], domiciliada en [DIRECCION COMPLETA], Asuncion, Republica
                                del Paraguay.
                            </p>
                            <p>
                                Para consultas sobre proteccion de datos, contactar a: [EMAIL DE
                                CONTACTO PRIVACIDAD]
                            </p>
                        </section>

                        {/* 2. Marco Legal */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                2. Marco Legal Aplicable
                            </h2>
                            <p>
                                La presente Politica de Privacidad se rige por la legislacion de la
                                Republica del Paraguay, en particular:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Constitucion Nacional (1992):</strong> Art. 33 (derecho
                                    a la intimidad), Art. 36 (inviolabilidad de documentos
                                    privados), Art. 135 (Habeas Data).
                                </li>
                                <li>
                                    <strong>Ley 6534/2020:</strong> De Proteccion de Datos
                                    Personales Crediticios y su Decreto Reglamentario 1218/2021.
                                </li>
                                <li>
                                    <strong>Ley 1682/2001</strong> (modificada por Ley 4439/2011):
                                    Reglamentacion de la informacion de caracter privado.
                                </li>
                                <li>
                                    <strong>Ley 4868/2013:</strong> De Comercio Electronico.
                                </li>
                                <li>
                                    <strong>Ley 4017/2010</strong> (modificada por Ley 6822/2021):
                                    De Firma Electronica y Digital.
                                </li>
                                <li>
                                    <strong>Ley 125/1991:</strong> Art. 189, Secreto Fiscal.
                                </li>
                            </ul>
                        </section>

                        {/* 3. Datos que Recopilamos */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                3. Datos Personales que Recopilamos
                            </h2>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.1. Datos de registro y cuenta
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Nombre completo</li>
                                <li>Direccion de correo electronico</li>
                                <li>Contrasena (almacenada con hash PBKDF2-SHA512, nunca en texto plano)</li>
                                <li>Rol asignado dentro de la organizacion</li>
                            </ul>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.2. Datos de la empresa (tenant)
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Razon social y nombre fantasia</li>
                                <li>RUC y Digito Verificador</li>
                                <li>Direccion fiscal</li>
                                <li>Datos de contacto empresarial (telefono, email)</li>
                                <li>Datos fiscales para facturacion (timbrado, establecimiento)</li>
                            </ul>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.3. Credenciales de sistemas externos
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    Credenciales de Marangatu (usuario y contrasena) — almacenadas
                                    cifradas con AES-256-GCM
                                </li>
                                <li>
                                    Credenciales de eKuatia (usuario y contrasena) — almacenadas
                                    cifradas con AES-256-GCM
                                </li>
                                <li>
                                    Certificados digitales SIFEN (clave privada y certificado
                                    publico) — clave privada cifrada con AES-256-GCM
                                </li>
                                <li>
                                    Codigo de Seguridad del Contribuyente (CSC) — almacenado
                                    cifrado
                                </li>
                                <li>
                                    Credenciales de Oracle ORDS (si aplica) — almacenadas cifradas
                                </li>
                            </ul>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.4. Datos fiscales y transaccionales
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Comprobantes fiscales (facturas, notas de credito/debito, autofacturas)</li>
                                <li>Documentos electronicos SIFEN (XML, CDC, estados)</li>
                                <li>Extractos bancarios importados</li>
                                <li>Datos de conciliacion</li>
                            </ul>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.5. Datos de uso y tecnicos
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Direccion IP de acceso</li>
                                <li>Fecha y hora de ultimo inicio de sesion</li>
                                <li>Registros de auditoria (acciones realizadas en la Plataforma)</li>
                                <li>Datos de navegacion (paginas visitadas, duracion de sesion)</li>
                            </ul>

                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                                3.6. Datos de facturacion
                            </h3>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Historial de suscripciones y pagos</li>
                                <li>
                                    Datos de medios de pago (procesados por Bancard; SEDIA no
                                    almacena datos de tarjetas de credito/debito)
                                </li>
                            </ul>
                        </section>

                        {/* 4. Finalidad del Tratamiento */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                4. Finalidad del Tratamiento
                            </h2>
                            <p>Los datos personales se recopilan y tratan para las siguientes finalidades:</p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Prestacion del servicio:</strong> Gestion de comprobantes,
                                    facturacion electronica, conciliacion bancaria y demas
                                    funcionalidades contratadas.
                                </li>
                                <li>
                                    <strong>Autenticacion y seguridad:</strong> Verificacion de
                                    identidad, control de acceso basado en roles (RBAC) y prevencion
                                    de accesos no autorizados.
                                </li>
                                <li>
                                    <strong>Cumplimiento fiscal:</strong> Emision y conservacion de
                                    documentos electronicos conforme a las exigencias del SET y la
                                    Ley 125/1991.
                                </li>
                                <li>
                                    <strong>Facturacion:</strong> Procesamiento de pagos de
                                    suscripcion y emision de comprobantes por el servicio.
                                </li>
                                <li>
                                    <strong>Soporte tecnico:</strong> Resolucion de incidencias y
                                    atencion de consultas del Usuario.
                                </li>
                                <li>
                                    <strong>Mejora del servicio:</strong> Analisis de uso agregado y
                                    anonimizado para mejorar la Plataforma.
                                </li>
                                <li>
                                    <strong>Comunicaciones:</strong> Envio de notificaciones
                                    operativas, alertas de seguridad y actualizaciones del servicio.
                                </li>
                                <li>
                                    <strong>Auditoria:</strong> Registro de acciones para
                                    trazabilidad y cumplimiento normativo.
                                </li>
                            </ul>
                        </section>

                        {/* 5. Base Legal */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                5. Base Legal del Tratamiento
                            </h2>
                            <p>
                                El tratamiento de datos se fundamenta en las siguientes bases
                                legales, conforme al Art. 9 de la Ley 6534/2020:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Consentimiento:</strong> Otorgado libre, expresa e
                                    informadamente al registrarse y aceptar estos terminos.
                                </li>
                                <li>
                                    <strong>Ejecucion contractual:</strong> Necesario para la
                                    prestacion del servicio contratado.
                                </li>
                                <li>
                                    <strong>Obligacion legal:</strong> Conservacion de documentos
                                    fiscales conforme a la Ley 125/1991 y normativa SIFEN.
                                </li>
                                <li>
                                    <strong>Interes legitimo:</strong> Prevencion de fraude,
                                    seguridad del sistema y mejora del servicio.
                                </li>
                            </ul>
                        </section>

                        {/* 6. Consentimiento */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                6. Consentimiento y Revocacion
                            </h2>
                            <p>
                                6.1. El consentimiento para el tratamiento de datos se obtiene de
                                forma expresa al momento del registro en la Plataforma,
                                manifestado mediante la aceptacion explicita de esta Politica de
                                Privacidad.
                            </p>
                            <p>
                                6.2. El Usuario puede revocar su consentimiento en cualquier
                                momento comunicandolo a [EMAIL DE CONTACTO PRIVACIDAD]. La
                                revocacion del consentimiento no afecta la licitud del tratamiento
                                realizado antes de la revocacion.
                            </p>
                            <p>
                                6.3. La revocacion del consentimiento para el tratamiento de datos
                                esenciales para la prestacion del servicio podra implicar la
                                imposibilidad de continuar utilizando la Plataforma.
                            </p>
                        </section>

                        {/* 7. Derechos ARCO */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                7. Derechos del Titular de los Datos (Derechos ARCO)
                            </h2>
                            <p>
                                De conformidad con la Ley 6534/2020, el Decreto 1218/2021 y el
                                Art. 135 de la Constitucion Nacional (Habeas Data), el Usuario
                                tiene los siguientes derechos:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li>
                                    <strong>Acceso:</strong> Solicitar informacion sobre los datos
                                    personales que SEDIA mantiene y los fines de su tratamiento.
                                </li>
                                <li>
                                    <strong>Rectificacion:</strong> Solicitar la correccion de datos
                                    inexactos o incompletos.
                                </li>
                                <li>
                                    <strong>Cancelacion:</strong> Solicitar la eliminacion de datos
                                    cuando ya no sean necesarios para la finalidad para la cual
                                    fueron recabados, salvo obligacion legal de conservacion.
                                </li>
                                <li>
                                    <strong>Oposicion:</strong> Oponerse al tratamiento de sus datos
                                    en determinadas circunstancias.
                                </li>
                            </ul>
                            <p className="mt-3">
                                <strong>Procedimiento:</strong> Para ejercer estos derechos, el
                                Usuario debera enviar una solicitud a [EMAIL DE CONTACTO
                                PRIVACIDAD] identificandose con nombre completo, email asociado a
                                la cuenta, y detalle del derecho que desea ejercer. SEDIA
                                respondera en un plazo maximo de 15 dias habiles.
                            </p>
                            <p>
                                <strong>Habeas Data:</strong> Sin perjuicio de lo anterior, el
                                Usuario puede ejercer la accion constitucional de Habeas Data
                                prevista en el Art. 135 de la Constitucion Nacional ante los
                                tribunales competentes.
                            </p>
                        </section>

                        {/* 8. Seguridad de los Datos */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                8. Medidas de Seguridad
                            </h2>
                            <p>
                                SEDIA implementa medidas tecnicas y organizativas para garantizar
                                la seguridad de los datos personales, conforme al Art. 16 de la
                                Ley 6534/2020:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Cifrado de credenciales:</strong> Todas las credenciales
                                    y claves privadas se almacenan cifradas con AES-256-GCM.
                                </li>
                                <li>
                                    <strong>Hash de contrasenas:</strong> Las contrasenas de usuario
                                    se almacenan con hash PBKDF2-SHA512 (100,000 iteraciones) con
                                    sal aleatoria. Nunca se almacenan en texto plano.
                                </li>
                                <li>
                                    <strong>Comunicaciones cifradas:</strong> Todas las
                                    comunicaciones entre el navegador y los servidores se realizan
                                    mediante HTTPS/TLS.
                                </li>
                                <li>
                                    <strong>Control de acceso:</strong> Sistema de roles y permisos
                                    (RBAC) con principio de minimo privilegio.
                                </li>
                                <li>
                                    <strong>Aislamiento multitenant:</strong> Separacion logica de
                                    datos entre empresas a nivel de base de datos.
                                </li>
                                <li>
                                    <strong>Auditoria:</strong> Registro completo de acciones para
                                    trazabilidad.
                                </li>
                                <li>
                                    <strong>Almacenamiento seguro:</strong> Archivos almacenados en
                                    Cloudflare R2 con acceso controlado.
                                </li>
                                <li>
                                    <strong>Monitoreo:</strong> Supervision continua de la
                                    infraestructura y deteccion de anomalias.
                                </li>
                            </ul>
                        </section>

                        {/* 9. Confidencialidad */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                9. Deber de Confidencialidad
                            </h2>
                            <p>
                                9.1. Todo el personal de SEDIA que acceda a datos personales esta
                                sujeto al deber de confidencialidad establecido en el Art. 17 de
                                la Ley 6534/2020, el cual se mantiene incluso despues de
                                finalizada la relacion laboral.
                            </p>
                            <p>
                                9.2. Los datos fiscales del Usuario gozan de la proteccion del
                                secreto fiscal conforme al Art. 189 de la Ley 125/1991.
                            </p>
                        </section>

                        {/* 10. Comparticion con Terceros */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                10. Comparticion de Datos con Terceros
                            </h2>
                            <p>
                                SEDIA puede compartir datos personales con los siguientes
                                terceros, exclusivamente para las finalidades indicadas:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li>
                                    <strong>Subsecretaria de Estado de Tributacion (SET):</strong>{' '}
                                    Transmision de documentos electronicos a traves de SIFEN y
                                    consultas de comprobantes en Marangatu/eKuatia, conforme a las
                                    obligaciones fiscales del contribuyente.
                                </li>
                                <li>
                                    <strong>Bancard S.A.:</strong> Procesamiento de pagos de
                                    suscripcion. Bancard recibe unicamente los datos necesarios para
                                    la transaccion; SEDIA no almacena datos de tarjetas.
                                </li>
                                <li>
                                    <strong>Oracle ORDS:</strong> Cuando el Usuario configure la
                                    integracion con ORDS, los datos de comprobantes se transmiten
                                    al endpoint configurado por el Usuario.
                                </li>
                                <li>
                                    <strong>Endpoints de webhook:</strong> Cuando el Usuario
                                    configure webhooks, los datos se transmiten a los URLs
                                    configurados por el Usuario. SEDIA no controla ni es
                                    responsable del tratamiento que los destinatarios den a estos datos.
                                </li>
                                <li>
                                    <strong>SolveCaptcha:</strong> Servicio externo de resolucion de
                                    CAPTCHA utilizado para la descarga de XML de eKuatia. No se
                                    comparten datos personales, unicamente imagenes de CAPTCHA.
                                </li>
                            </ul>
                            <p className="mt-3">
                                SEDIA no vende, alquila ni comercializa datos personales de los
                                Usuarios con terceros. Solo se revelaran datos a autoridades
                                competentes cuando exista un requerimiento legal valido.
                            </p>
                        </section>

                        {/* 11. Transferencias Internacionales */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                11. Transferencias Internacionales de Datos
                            </h2>
                            <p>
                                11.1. Los datos de la Plataforma pueden ser almacenados y
                                procesados en servidores ubicados fuera de la Republica del
                                Paraguay, a traves de proveedores de infraestructura en la nube.
                            </p>
                            <p>
                                11.2. Los archivos adjuntos (XML, KUDE, documentos) se almacenan
                                en Cloudflare R2, cuyos servidores pueden estar ubicados en
                                diferentes regiones geograficas.
                            </p>
                            <p>
                                11.3. SEDIA garantiza que dichos proveedores cuentan con medidas
                                de seguridad adecuadas y que las transferencias se realizan con
                                las salvaguardas apropiadas para la proteccion de datos.
                            </p>
                        </section>

                        {/* 12. Conservacion de Datos */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                12. Periodos de Conservacion
                            </h2>
                            <ul className="list-disc pl-6 space-y-2">
                                <li>
                                    <strong>Datos de cuenta:</strong> Mientras la cuenta este activa
                                    y hasta 1 ano despues de la cancelacion.
                                </li>
                                <li>
                                    <strong>Comprobantes y documentos fiscales:</strong> Minimo 5
                                    anos desde su emision o recepcion, conforme a la Ley 125/1991.
                                </li>
                                <li>
                                    <strong>Documentos electronicos SIFEN:</strong> Minimo 5 anos,
                                    conforme al Decreto 7795/2017 y normativa SET.
                                </li>
                                <li>
                                    <strong>Registros de auditoria:</strong> 3 anos desde su
                                    generacion.
                                </li>
                                <li>
                                    <strong>Credenciales de sistemas externos:</strong> Eliminadas
                                    de forma segura dentro de los 30 dias posteriores a la
                                    cancelacion de la cuenta o a solicitud del Usuario.
                                </li>
                                <li>
                                    <strong>Datos de facturacion:</strong> Conforme a los plazos
                                    exigidos por la legislacion tributaria vigente.
                                </li>
                            </ul>
                        </section>

                        {/* 13. Cookies */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                13. Cookies y Tecnologias de Seguimiento
                            </h2>
                            <p>
                                13.1. SEDIA utiliza cookies estrictamente necesarias para el
                                funcionamiento de la Plataforma:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Token de sesion:</strong> Almacenado en localStorage
                                    para mantener la sesion del Usuario autenticado.
                                </li>
                                <li>
                                    <strong>Preferencias de tema:</strong> Preferencia de modo
                                    oscuro/claro, almacenado en localStorage.
                                </li>
                            </ul>
                            <p>
                                13.2. SEDIA no utiliza cookies de terceros, cookies publicitarias
                                ni tecnologias de rastreo con fines de perfilamiento o publicidad.
                            </p>
                        </section>

                        {/* 14. Menores */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                14. Datos de Menores de Edad
                            </h2>
                            <p>
                                La Plataforma no esta dirigida a menores de 18 anos. SEDIA no
                                recopila intencionalmente datos personales de menores. Si se
                                detecta que un menor ha proporcionado datos personales, estos
                                seran eliminados de inmediato.
                            </p>
                        </section>

                        {/* 15. Notificacion de Brechas */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                15. Notificacion de Incidentes de Seguridad
                            </h2>
                            <p>
                                15.1. En caso de una brecha de seguridad que afecte datos
                                personales, SEDIA notificara a los Usuarios afectados dentro de
                                las 72 horas siguientes al descubrimiento del incidente.
                            </p>
                            <p>
                                15.2. La notificacion incluira: naturaleza del incidente, datos
                                potencialmente afectados, medidas adoptadas y recomendaciones para
                                el Usuario.
                            </p>
                            <p>
                                15.3. SEDIA reportara el incidente al CERT-PY del MITIC conforme a
                                las directrices del Plan Nacional de Ciberseguridad, cuando
                                corresponda.
                            </p>
                        </section>

                        {/* 16. Modificaciones */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                16. Modificaciones a esta Politica
                            </h2>
                            <p>
                                16.1. SEDIA puede modificar esta Politica de Privacidad en
                                cualquier momento. Las modificaciones seran notificadas al Usuario
                                con al menos 30 dias naturales de anticipacion a traves de la
                                Plataforma y/o correo electronico.
                            </p>
                            <p>
                                16.2. Si el Usuario no esta de acuerdo con las modificaciones,
                                podra cancelar su cuenta antes de la entrada en vigor de los
                                cambios.
                            </p>
                            <p>
                                16.3. El uso continuado de la Plataforma despues de la entrada en
                                vigor constituye aceptacion de la Politica modificada.
                            </p>
                        </section>

                        {/* 17. Contacto */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                17. Contacto y Reclamos
                            </h2>
                            <p>
                                Para ejercer sus derechos, realizar consultas o presentar reclamos
                                relacionados con la proteccion de datos personales:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Email:</strong> [EMAIL DE CONTACTO PRIVACIDAD]
                                </li>
                                <li>
                                    <strong>Direccion:</strong> [DIRECCION COMPLETA], Asuncion,
                                    Paraguay
                                </li>
                                <li>
                                    <strong>Telefono:</strong> [NUMERO DE TELEFONO]
                                </li>
                            </ul>
                            <p className="mt-3">
                                El Usuario tambien tiene derecho a presentar reclamos ante:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>SEDECO</strong> (Secretaria de Defensa del Consumidor)
                                    para cuestiones de consumo.
                                </li>
                                <li>
                                    <strong>Poder Judicial</strong> mediante accion de Habeas Data
                                    (Art. 135, Constitucion Nacional) para cuestiones de acceso,
                                    rectificacion o eliminacion de datos.
                                </li>
                            </ul>
                        </section>
                    </div>

                    <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            Documento generado conforme a la legislacion vigente de la Republica
                            del Paraguay. Se recomienda revision periodica por profesional legal
                            habilitado.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PoliticaPrivacidad
