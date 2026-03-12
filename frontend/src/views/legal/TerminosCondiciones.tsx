const TerminosCondiciones = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 sm:p-12">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        Terminos y Condiciones de Uso
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                        Ultima actualizacion: 11 de marzo de 2026
                    </p>

                    <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
                        {/* 1. Identificacion */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                1. Identificacion del Prestador
                            </h2>
                            <p>
                                La plataforma SEDIA (en adelante, "la Plataforma") es operada por
                                [RAZON SOCIAL], con RUC [NUMERO DE RUC], domiciliada en [DIRECCION
                                COMPLETA], Asuncion, Republica del Paraguay (en adelante, "SEDIA",
                                "nosotros" o "el Prestador").
                            </p>
                            <p>
                                Contacto: [EMAIL DE CONTACTO] | Telefono: [NUMERO DE TELEFONO]
                            </p>
                        </section>

                        {/* 2. Objeto y Aceptacion */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                2. Objeto y Aceptacion
                            </h2>
                            <p>
                                Los presentes Terminos y Condiciones (en adelante, "T&C") regulan
                                el acceso y uso de la Plataforma SEDIA, un servicio de software
                                como servicio (SaaS) para la gestion de comprobantes fiscales
                                emitidos por la Subsecretaria de Estado de Tributacion (SET) del
                                Paraguay, incluyendo la integracion con los sistemas Marangatu,
                                eKuatia y el Sistema Integrado de Facturacion Electronica Nacional
                                (SIFEN).
                            </p>
                            <p>
                                El registro y uso de la Plataforma implica la aceptacion plena e
                                incondicional de estos T&C, de conformidad con lo establecido en la
                                Ley 4868/2013 de Comercio Electronico, el Codigo Civil Paraguayo
                                (Ley 1183/1985) y demas normativa aplicable.
                            </p>
                        </section>

                        {/* 3. Descripcion del Servicio */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                3. Descripcion del Servicio
                            </h2>
                            <p>SEDIA ofrece las siguientes funcionalidades, segun el plan contratado:</p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    <strong>Gestion de comprobantes:</strong> Consulta, descarga y
                                    organizacion de comprobantes fiscales obtenidos de Marangatu y eKuatia.
                                </li>
                                <li>
                                    <strong>Facturacion electronica SIFEN:</strong> Emision, firma
                                    digital, envio por lotes, consulta de estado, anulacion y generacion
                                    de KUDE de Documentos Electronicos (DE) ante el SET.
                                </li>
                                <li>
                                    <strong>Gestion multitenant:</strong> Administracion de multiples
                                    empresas (contribuyentes) desde una unica cuenta.
                                </li>
                                <li>
                                    <strong>Conciliacion bancaria:</strong> Importacion de extractos
                                    bancarios y conciliacion automatica con comprobantes fiscales.
                                </li>
                                <li>
                                    <strong>Deteccion de anomalias:</strong> Identificacion automatica
                                    de irregularidades en comprobantes fiscales mediante analisis
                                    estadistico.
                                </li>
                                <li>
                                    <strong>Automatizaciones:</strong> Alertas, webhooks, tokens de API,
                                    notificaciones y clasificacion automatica de comprobantes.
                                </li>
                                <li>
                                    <strong>Metricas e informes:</strong> Dashboards con indicadores
                                    fiscales y reportes de actividad.
                                </li>
                                <li>
                                    <strong>Auditoria:</strong> Registro detallado de todas las
                                    acciones realizadas en la Plataforma.
                                </li>
                            </ul>
                        </section>

                        {/* 4. Registro y Cuenta */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                4. Registro y Cuenta de Usuario
                            </h2>
                            <p>
                                Para utilizar la Plataforma, el Usuario debe crear una cuenta
                                proporcionando informacion veraz, completa y actualizada. El
                                Usuario es responsable de mantener la confidencialidad de sus
                                credenciales de acceso y de todas las actividades realizadas bajo
                                su cuenta.
                            </p>
                            <p>
                                El Usuario se compromete a notificar inmediatamente a SEDIA
                                cualquier uso no autorizado de su cuenta o cualquier otra violacion
                                de seguridad.
                            </p>
                        </section>

                        {/* 5. Planes, Precios y Facturacion */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                5. Planes, Precios y Facturacion
                            </h2>
                            <p>
                                5.1. SEDIA ofrece diferentes planes de suscripcion con
                                funcionalidades variables. Los precios, caracteristicas y
                                limitaciones de cada plan se detallan en la seccion "Planes" de la
                                Plataforma.
                            </p>
                            <p>
                                5.2. Los precios estan expresados en Guaranies (PYG) e incluyen el
                                Impuesto al Valor Agregado (IVA) del 10% conforme a la Ley
                                125/1991.
                            </p>
                            <p>
                                5.3. La facturacion se realiza de forma mensual y anticipada. El
                                cobro se procesa a traves de Bancard u otros medios de pago
                                habilitados.
                            </p>
                            <p>
                                5.4. La falta de pago por un periodo mayor a 15 dias habiles podra
                                resultar en la suspension temporal del servicio. Transcurridos 30
                                dias sin regularizacion, SEDIA podra dar por terminado el contrato.
                            </p>
                            <p>
                                5.5. Los addons (funcionalidades adicionales) se facturan por
                                separado y pueden activarse o desactivarse en cualquier momento
                                desde la Plataforma.
                            </p>
                        </section>

                        {/* 6. Derecho de Retracto */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                6. Derecho de Retracto
                            </h2>
                            <p>
                                De conformidad con el Art. 7 de la Ley 4868/2013 de Comercio
                                Electronico y los Arts. 26-28 de la Ley 1334/1998 de Defensa del
                                Consumidor, el Usuario tiene derecho a retractarse de la
                                contratacion dentro de los 10 (diez) dias habiles siguientes a la
                                fecha de contratacion, sin necesidad de justificacion y sin
                                penalidad alguna.
                            </p>
                            <p>
                                Para ejercer este derecho, el Usuario debera comunicarlo por
                                escrito a [EMAIL DE CONTACTO]. En caso de ejercicio del derecho de
                                retracto, SEDIA procedera a la devolucion integra de los importes
                                abonados dentro de los 15 dias habiles siguientes.
                            </p>
                        </section>

                        {/* 7. Rol de SEDIA como Intermediario Tecnico */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                7. Rol de SEDIA como Intermediario Tecnico
                            </h2>
                            <p>
                                7.1. SEDIA actua exclusivamente como intermediario tecnico para
                                facilitar la interaccion del Usuario con los sistemas del SET
                                (Marangatu, eKuatia, SIFEN). SEDIA no es un agente fiscal, no
                                presta servicios de asesoria tributaria ni contable.
                            </p>
                            <p>
                                7.2. El Usuario es el unico responsable de la veracidad, exactitud
                                y legalidad de los datos fiscales ingresados en la Plataforma y de
                                los documentos electronicos emitidos a traves de ella.
                            </p>
                            <p>
                                7.3. SEDIA no garantiza la disponibilidad continua de los sistemas
                                del SET, los cuales son operados por la Subsecretaria de Estado de
                                Tributacion de forma independiente.
                            </p>
                            <p>
                                7.4. El Usuario reconoce y acepta que la emision de documentos
                                electronicos a traves de SIFEN genera obligaciones fiscales de
                                exclusiva responsabilidad del contribuyente, conforme a la Ley
                                125/1991 y el Decreto 7795/2017.
                            </p>
                        </section>

                        {/* 8. Custodia de Certificados Digitales */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                8. Custodia de Certificados Digitales y Credenciales
                            </h2>
                            <p>
                                8.1. Para la operacion de SIFEN, el Usuario debera proporcionar su
                                certificado digital (clave privada y certificado publico) emitido
                                por un Prestador de Servicios de Certificacion habilitado conforme
                                a la Ley 4017/2010 y su modificatoria Ley 6822/2021.
                            </p>
                            <p>
                                8.2. SEDIA almacena las claves privadas de forma cifrada mediante
                                algoritmo AES-256-GCM. El acceso a las claves se encuentra
                                restringido exclusivamente a los procesos automatizados de firma
                                digital.
                            </p>
                            <p>
                                8.3. Al depositar su certificado digital, el Usuario autoriza
                                expresamente a SEDIA a firmar documentos electronicos en su
                                nombre, en el marco de las operaciones SIFEN configuradas por el
                                propio Usuario en la Plataforma.
                            </p>
                            <p>
                                8.4. El Usuario es responsable de la vigencia, renovacion y
                                revocacion de sus certificados digitales. SEDIA notificara con
                                anticipacion razonable la proximidad del vencimiento del
                                certificado registrado.
                            </p>
                            <p>
                                8.5. Las credenciales de acceso a Marangatu y eKuatia
                                proporcionadas por el Usuario se almacenan cifradas (AES-256-GCM)
                                y se utilizan exclusivamente para las sincronizaciones configuradas
                                por el Usuario.
                            </p>
                        </section>

                        {/* 9. Obligaciones del Usuario */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                9. Obligaciones del Usuario
                            </h2>
                            <p>El Usuario se compromete a:</p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    Utilizar la Plataforma de conformidad con la legislacion vigente y
                                    los presentes T&C.
                                </li>
                                <li>
                                    Ser el titular legitimo del RUC y las credenciales fiscales
                                    proporcionadas a SEDIA, o contar con autorizacion expresa del
                                    titular.
                                </li>
                                <li>
                                    Mantener actualizadas sus credenciales, certificados digitales y
                                    datos de contacto.
                                </li>
                                <li>
                                    No utilizar la Plataforma para actividades ilegales, fraudulentas
                                    o que violen derechos de terceros.
                                </li>
                                <li>
                                    No intentar acceder a datos de otros usuarios o tenants de la
                                    Plataforma.
                                </li>
                                <li>
                                    No realizar ingenieria inversa, descompilar o intentar extraer el
                                    codigo fuente de la Plataforma.
                                </li>
                                <li>
                                    Resguardar la confidencialidad de sus tokens de API y
                                    credenciales de acceso.
                                </li>
                                <li>
                                    Cooperar con cualquier requerimiento del SET en relacion con los
                                    documentos electronicos emitidos.
                                </li>
                            </ul>
                        </section>

                        {/* 10. Propiedad Intelectual */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                10. Propiedad Intelectual
                            </h2>
                            <p>
                                10.1. La Plataforma, incluyendo su codigo fuente, diseno, logotipos,
                                marcas, textos y demas contenidos, es propiedad exclusiva de SEDIA
                                y se encuentra protegida por la legislacion de propiedad
                                intelectual de la Republica del Paraguay y los tratados
                                internacionales aplicables.
                            </p>
                            <p>
                                10.2. La suscripcion otorga al Usuario una licencia limitada, no
                                exclusiva, intransferible y revocable para utilizar la Plataforma
                                durante la vigencia de la suscripcion.
                            </p>
                            <p>
                                10.3. Los datos fiscales del Usuario son de su exclusiva propiedad.
                                SEDIA no adquiere derechos sobre los datos del Usuario mas alla de
                                lo necesario para la prestacion del servicio.
                            </p>
                        </section>

                        {/* 11. White Label */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                11. Servicio White Label
                            </h2>
                            <p>
                                11.1. Los planes que incluyan la funcionalidad White Label permiten
                                al Usuario personalizar la apariencia de la Plataforma con su
                                propia marca (logo, colores, nombre de aplicacion).
                            </p>
                            <p>
                                11.2. El Usuario que utilice White Label es responsable de contar
                                con los derechos sobre las marcas y elementos graficos que
                                configure. SEDIA no sera responsable por infracciones a derechos
                                de terceros derivadas de la personalizacion realizada por el
                                Usuario.
                            </p>
                        </section>

                        {/* 12. Uso de API y Webhooks */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                12. Uso de API y Webhooks
                            </h2>
                            <p>
                                12.1. Los planes que incluyan acceso a API y/o webhooks permiten al
                                Usuario integrar la Plataforma con sistemas de terceros.
                            </p>
                            <p>
                                12.2. El Usuario es responsable de la seguridad de sus tokens de
                                API y de la configuracion de los endpoints de webhook.
                            </p>
                            <p>
                                12.3. SEDIA se reserva el derecho de aplicar limites de tasa (rate
                                limiting) para garantizar la estabilidad del servicio.
                            </p>
                            <p>
                                12.4. La transmision de datos a traves de webhooks se realiza bajo
                                la configuracion y responsabilidad del Usuario. SEDIA no es
                                responsable del tratamiento que terceros den a los datos recibidos
                                por esta via.
                            </p>
                        </section>

                        {/* 13. Disponibilidad y Nivel de Servicio */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                13. Disponibilidad y Nivel de Servicio
                            </h2>
                            <p>
                                13.1. SEDIA se compromete a mantener una disponibilidad del
                                servicio del 99.5% mensual, excluyendo ventanas de mantenimiento
                                programado y circunstancias de fuerza mayor.
                            </p>
                            <p>
                                13.2. SEDIA podra realizar mantenimientos programados, los cuales
                                seran notificados con al menos 24 horas de anticipacion a traves
                                de la Plataforma o por correo electronico.
                            </p>
                            <p>
                                13.3. La disponibilidad de los servicios del SET (Marangatu,
                                eKuatia, SIFEN) no esta bajo control de SEDIA y no se incluye en
                                el compromiso de disponibilidad.
                            </p>
                        </section>

                        {/* 14. Conservacion de Datos Fiscales */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                14. Conservacion de Datos Fiscales
                            </h2>
                            <p>
                                14.1. De conformidad con la Ley 125/1991, los documentos
                                electronicos y comprobantes fiscales se conservaran por un periodo
                                minimo de 5 (cinco) anos desde su emision o recepcion.
                            </p>
                            <p>
                                14.2. Al finalizar la relacion contractual, SEDIA mantendra los
                                datos fiscales del Usuario durante el periodo legalmente exigido.
                                El Usuario podra solicitar la exportacion de sus datos antes de la
                                terminacion del servicio.
                            </p>
                            <p>
                                14.3. SEDIA respeta el secreto fiscal conforme al Art. 189 de la
                                Ley 125/1991. Los datos tributarios del Usuario no seran revelados
                                a terceros salvo requerimiento legal de autoridad competente.
                            </p>
                        </section>

                        {/* 15. Aislamiento de Datos Multitenant */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                15. Aislamiento de Datos entre Empresas
                            </h2>
                            <p>
                                15.1. SEDIA garantiza el aislamiento logico de los datos entre las
                                distintas empresas (tenants) registradas en la Plataforma. Cada
                                empresa solo tiene acceso a sus propios datos.
                            </p>
                            <p>
                                15.2. Los administradores de plataforma (super admin) tienen acceso
                                a datos operativos de todas las empresas exclusivamente con fines
                                de soporte tecnico y mantenimiento del servicio.
                            </p>
                        </section>

                        {/* 16. Limitacion de Responsabilidad */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                16. Limitacion de Responsabilidad
                            </h2>
                            <p>
                                16.1. SEDIA sera responsable por los danos directos causados al
                                Usuario que resulten del incumplimiento de sus obligaciones
                                conforme a estos T&C, hasta un maximo equivalente al importe
                                abonado por el Usuario en los ultimos 12 meses de servicio.
                            </p>
                            <p>
                                16.2. SEDIA no sera responsable por danos indirectos, lucro
                                cesante, perdida de datos (salvo que resulte de negligencia grave o
                                dolo de SEDIA), ni por danos derivados de:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>
                                    Indisponibilidad, modificaciones o errores en los sistemas del
                                    SET (Marangatu, eKuatia, SIFEN).
                                </li>
                                <li>
                                    Datos fiscales incorrectos ingresados por el Usuario.
                                </li>
                                <li>
                                    Uso indebido de credenciales o tokens de API por parte del
                                    Usuario o terceros.
                                </li>
                                <li>
                                    Vencimiento o revocacion de certificados digitales del Usuario.
                                </li>
                                <li>Causas de fuerza mayor o caso fortuito.</li>
                            </ul>
                            <p>
                                16.3. Nada en estos T&C excluye la responsabilidad de SEDIA por
                                dolo, negligencia grave, o por aquellas responsabilidades que la
                                ley paraguaya no permite excluir, conforme al Art. 20 de la Ley
                                1334/1998.
                            </p>
                        </section>

                        {/* 17. Suspension y Terminacion */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                17. Suspension y Terminacion
                            </h2>
                            <p>
                                17.1. El Usuario puede cancelar su suscripcion en cualquier
                                momento desde la seccion de Facturacion de la Plataforma. La
                                cancelacion sera efectiva al final del periodo de facturacion en
                                curso.
                            </p>
                            <p>
                                17.2. SEDIA podra suspender o terminar el acceso del Usuario en
                                los siguientes casos:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Incumplimiento de estos T&C.</li>
                                <li>
                                    Falta de pago por mas de 30 dias habiles.
                                </li>
                                <li>
                                    Uso de la Plataforma para actividades ilegales o fraudulentas.
                                </li>
                                <li>
                                    Requerimiento de autoridad competente.
                                </li>
                            </ul>
                            <p>
                                17.3. En caso de terminacion, SEDIA permitira al Usuario exportar
                                sus datos durante un periodo de 30 dias naturales contados desde la
                                notificacion de terminacion.
                            </p>
                        </section>

                        {/* 18. Modificaciones */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                18. Modificaciones a los Terminos
                            </h2>
                            <p>
                                18.1. SEDIA se reserva el derecho de modificar estos T&C. Toda
                                modificacion sera notificada al Usuario con al menos 30 dias
                                naturales de anticipacion a traves de la Plataforma y/o correo
                                electronico.
                            </p>
                            <p>
                                18.2. Si el Usuario no esta de acuerdo con las modificaciones,
                                podra cancelar su suscripcion antes de la fecha de entrada en vigor
                                de los cambios, sin penalidad alguna, conforme al Art. 20 de la
                                Ley 1334/1998.
                            </p>
                            <p>
                                18.3. El uso continuado de la Plataforma despues de la fecha de
                                entrada en vigor de las modificaciones constituye aceptacion de los
                                nuevos terminos.
                            </p>
                        </section>

                        {/* 19. Fuerza Mayor */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                19. Fuerza Mayor
                            </h2>
                            <p>
                                Ninguna de las partes sera responsable por el incumplimiento de sus
                                obligaciones cuando este sea consecuencia de eventos de fuerza
                                mayor o caso fortuito, conforme al Art. 426 del Codigo Civil
                                Paraguayo, incluyendo pero no limitado a: desastres naturales,
                                interrupciones de servicios publicos (electricidad, internet),
                                actos de gobierno, pandemias, o indisponibilidad de los sistemas
                                del SET.
                            </p>
                        </section>

                        {/* 20. Resolucion de Controversias */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                20. Resolucion de Controversias
                            </h2>
                            <p>
                                20.1. Las partes se comprometen a resolver cualquier controversia
                                derivada de estos T&C de buena fe, mediante negociacion directa en
                                un plazo de 30 dias.
                            </p>
                            <p>
                                20.2. En caso de no llegar a un acuerdo, las partes podran acudir
                                a mediacion ante un centro de mediacion habilitado en la ciudad de
                                Asuncion.
                            </p>
                            <p>
                                20.3. Si la mediacion no resuelve la controversia, las partes se
                                someten a la jurisdiccion de los Juzgados y Tribunales ordinarios
                                de la ciudad de Asuncion, Republica del Paraguay.
                            </p>
                            <p>
                                20.4. El Usuario podra ademas acudir a la Secretaria de Defensa
                                del Consumidor (SEDECO) para la resolucion de reclamos, conforme a
                                la Ley 1334/1998.
                            </p>
                        </section>

                        {/* 21. Ley Aplicable */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                21. Ley Aplicable
                            </h2>
                            <p>
                                Los presentes T&C se rigen por las leyes de la Republica del
                                Paraguay, en particular:
                            </p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>Codigo Civil (Ley 1183/1985)</li>
                                <li>Ley 4868/2013 de Comercio Electronico</li>
                                <li>Ley 1334/1998 de Defensa del Consumidor</li>
                                <li>Ley 6534/2020 de Proteccion de Datos Personales Crediticios</li>
                                <li>Ley 4017/2010 de Firma Electronica y Digital</li>
                                <li>Ley 125/1991 Regimen Tributario</li>
                                <li>Decreto 7795/2017 (SIFEN)</li>
                            </ul>
                        </section>

                        {/* 22. Disposiciones Finales */}
                        <section>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-8 mb-3">
                                22. Disposiciones Finales
                            </h2>
                            <p>
                                22.1. Si alguna clausula de estos T&C fuera declarada nula o
                                inaplicable, las demas clausulas mantendran su plena vigencia y
                                efecto.
                            </p>
                            <p>
                                22.2. La falta de ejercicio de un derecho por parte de SEDIA no
                                constituye renuncia al mismo.
                            </p>
                            <p>
                                22.3. Estos T&C, junto con la Politica de Privacidad, constituyen
                                el acuerdo completo entre las partes en relacion con el uso de la
                                Plataforma.
                            </p>
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

export default TerminosCondiciones
