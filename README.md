# SET Comprobantes — Plataforma de Gestión Fiscal

Sistema multitenant para automatizar la descarga, procesamiento y reenvío de comprobantes fiscales del SET Paraguay (Marangatu + eKuatia), con dashboard de administración en React y backend en Fastify + PostgreSQL.

---

## Tabla de contenidos

1. [Descripción del sistema](#descripción-del-sistema)
2. [Stack tecnológico](#stack-tecnológico)
3. [Estructura del monorepo](#estructura-del-monorepo)
4. [Arquitectura](#arquitectura)
5. [Requisitos previos](#requisitos-previos)
6. [Instalación con Docker Compose](#instalación-con-docker-compose)
7. [Instalación local (sin Docker)](#instalación-local-sin-docker)
8. [Variables de entorno](#variables-de-entorno)
9. [Configuración de tenants](#configuración-de-tenants)
10. [API Reference](#api-reference)
11. [Flujos de procesamiento](#flujos-de-procesamiento)
12. [Schema de base de datos](#schema-de-base-de-datos)
13. [Payload ORDS](#payload-ords)
14. [Frontend — Dashboard de administración](#frontend--dashboard-de-administración)
15. [Seguridad](#seguridad)
16. [Colección Postman](#colección-postman)
17. [Troubleshooting](#troubleshooting)

---

## Descripción del sistema

**SET Comprobantes** automatiza tres procesos críticos para empresas contribuyentes en Paraguay:

1. **Sincronización de comprobantes** — Accede a Marangatu (portal fiscal SET) con las credenciales del tenant, navega la sección de comprobantes de compras y extrae todos los registros usando Puppeteer (headless Chromium).

2. **Descarga de XMLs desde eKuatia** — Resuelve automáticamente el reCAPTCHA v2 del portal eKuatia via SolveCaptcha API y descarga el XML SIFEN de cada comprobante electrónico. Parsea y almacena los datos estructurados (emisor, receptor, ítems, totales, IVA).

3. **Envío a Oracle ORDS** — Reenvía el payload completo (datos básicos + XML parseado) al endpoint Oracle REST configurado por el tenant. Soporta autenticación BASIC, BEARER y sin autenticación.

**Características principales:**

- Arquitectura multitenant completa — aislamiento total de datos por empresa
- Cola de jobs en PostgreSQL sin Redis (`SELECT ... FOR UPDATE SKIP LOCKED`)
- Scheduler automático configurable por tenant (frecuencia en minutos)
- Cifrado AES-256-GCM para credenciales sensibles
- Dashboard React con monitoreo de jobs en tiempo real
- RBAC con 4 roles: `super_admin`, `admin_empresa`, `usuario_empresa`, `readonly`
- Soporte para múltiples workers en paralelo sin colisiones
- API REST con documentación Swagger interactiva

---

## Stack tecnológico

### Backend

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 + TypeScript 5.4 |
| Framework HTTP | Fastify 4.26 |
| Base de datos | PostgreSQL 15 |
| Query builder | node-postgres (`pg`) — queries parametrizadas directas |
| Automatización web | Puppeteer 22.6 (headless Chromium) |
| Parser XML | `@xmldom/xmldom` |
| Resolver CAPTCHA | SolveCaptcha API |
| Cola de jobs | PostgreSQL (`FOR UPDATE SKIP LOCKED`) — sin Redis |
| Scheduler | node-cron |
| HTTP client | Axios 1.6 |
| Validación | Zod 3.22 |
| Cifrado | AES-256-GCM (módulo `crypto` nativo de Node) |
| Logging | Pino vía Fastify |
| Documentación API | Fastify Swagger + Swagger UI |

### Frontend

| Componente | Tecnología |
|---|---|
| Framework | React 18.3 |
| Language | TypeScript 5.5 |
| Build tool | Vite 5.4 |
| Estilos | Tailwind CSS 3.4 |
| Iconos | Lucide React 0.344 |
| Linting | ESLint 9.9 |

### DevOps

| Componente | Tecnología |
|---|---|
| Contenedores | Docker |
| Orquestación | Docker Compose |
| Imagen DB | postgres:15-alpine |

---

## Estructura del monorepo

```
set-comprobantes/
├── backend/                          # API + Worker (Fastify + Node.js)
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/               # Rutas HTTP (tenants, jobs, comprobantes, auth, usuarios, metrics)
│   │   │   ├── middleware/           # Auth JWT, error handling
│   │   │   └── server.ts             # Configuración Fastify
│   │   ├── db/
│   │   │   ├── migrations/           # SQL migrations (001..00N)
│   │   │   ├── repositories/         # Capa de acceso a datos
│   │   │   ├── connection.ts         # Pool PostgreSQL
│   │   │   └── migrate.ts            # Runner de migraciones
│   │   ├── services/
│   │   │   ├── sync.service.ts       # Orquestación de jobs
│   │   │   ├── marangatu.service.ts  # Scraping Puppeteer (Marangatu)
│   │   │   ├── ekuatia.service.ts    # Descarga XMLs + parser SIFEN
│   │   │   ├── ords.service.ts       # Integración Oracle ORDS
│   │   │   ├── crypto.service.ts     # Cifrado AES-256-GCM
│   │   │   ├── captcha.service.ts    # Resolución CAPTCHA (SolveCaptcha)
│   │   │   └── auth.service.ts       # Autenticación + gestión de usuarios
│   │   ├── workers/
│   │   │   ├── job.worker.ts         # Loop principal del worker
│   │   │   └── scheduler.ts          # Cron de sincronización automática
│   │   ├── types/                    # Interfaces TypeScript
│   │   ├── config/                   # Variables de entorno y logger
│   │   ├── main.ts                   # Entry point API HTTP
│   │   └── worker.ts                 # Entry point Worker process
│   ├── postman_collection.json       # Colección Postman lista para importar
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── src/                              # Frontend React
│   ├── pages/
│   │   ├── Dashboard.tsx             # Vista principal con métricas
│   │   ├── Tenants.tsx               # Gestión de empresas
│   │   ├── Comprobantes.tsx          # Listado y búsqueda de comprobantes
│   │   ├── Jobs.tsx                  # Monitor de cola de jobs
│   │   ├── Usuarios.tsx              # Gestión de usuarios
│   │   ├── Metricas.tsx              # Analíticas (solo super_admin)
│   │   └── Login.tsx                 # Autenticación
│   ├── components/
│   │   ├── layout/                   # Shell, Sidebar, Header
│   │   ├── tenants/                  # TenantForm, SyncModal, VirtualSyncModal
│   │   └── ui/                       # Badge, Modal, Pagination, Toast, Spinner
│   ├── contexts/
│   │   └── AuthContext.tsx           # Estado global de autenticación
│   ├── hooks/
│   │   └── useToast.ts               # Hook de notificaciones
│   ├── lib/
│   │   ├── api.ts                    # Cliente HTTP para el backend
│   │   ├── mock-data.ts              # Datos de prueba para modo demo
│   │   └── utils.ts                  # Utilidades generales
│   ├── types/
│   │   └── index.ts                  # Tipos TypeScript del dominio
│   ├── App.tsx                       # Componente raíz + routing
│   └── main.tsx                      # Entry point Vite
│
├── docker-compose.yml                # Orquestación: postgres + api + worker
├── package.json                      # Dependencias del frontend
├── vite.config.ts                    # Configuración Vite
├── tailwind.config.js                # Configuración Tailwind
└── tsconfig.json
```

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                       │
│   Dashboard · Tenants · Comprobantes · Jobs · Usuarios          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP REST
┌─────────────────────────────▼───────────────────────────────────┐
│                         API (Fastify)                           │
│  POST /tenants   GET /tenants/:id/comprobantes   POST /jobs     │
│  GET /auth/me    GET /usuarios    GET /metrics                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    Tabla jobs (PostgreSQL)
                    FOR UPDATE SKIP LOCKED
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Worker Loop                              │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ SYNC_COMPROBANTES│  │  ENVIAR_A_ORDS  │  │ DESCARGAR_XML │  │
│  └────────┬─────────┘  └────────┬────────┘  └───────┬───────┘  │
│           │                     │                   │          │
│    Puppeteer →           Axios POST →       SolveCaptcha →     │
│    Marangatu             Oracle ORDS        eKuatia XML DL     │
│    (scraping)            (REST API)         (parse SIFEN)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                    PostgreSQL 15
                    (tenants · jobs · comprobantes · usuarios)
```

**Multitenant:** todas las tablas tienen `tenant_id`. Cada empresa tiene credenciales cifradas, cola de jobs y configuración ORDS propia.

**Sin Redis:** la cola de jobs es la tabla `jobs` usando `SELECT ... FOR UPDATE SKIP LOCKED`. Soporta múltiples instancias del worker en paralelo sin colisiones.

---

## Requisitos previos

- Docker 24+ y Docker Compose v2 (para instalación con Docker)
- Node.js 20+ y npm 10+ (para instalación local)
- PostgreSQL 15+ (solo para instalación local)
- Cuenta activa en [SolveCaptcha](https://solvecaptcha.com/) para descarga de XMLs desde eKuatia

---

## Instalación con Docker Compose

### 1. Clonar el repositorio

```bash
git clone <repo>
cd set-comprobantes
```

### 2. Configurar variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

Editar `backend/.env` con los valores reales. Los únicos campos obligatorios para arrancar son:

```env
DATABASE_URL=postgresql://postgres:password@postgres:5432/set_comprobantes
ENCRYPTION_KEY=una_clave_de_al_menos_32_caracteres_aqui!
SOLVECAPTCHA_API_KEY=tu_api_key_de_solvecaptcha
```

### 3. Levantar todos los servicios

```bash
docker compose up -d
```

Esto levanta tres contenedores:
- `postgres` — PostgreSQL 15 en puerto 5432
- `api` — Fastify API en puerto 4000
- `worker` — Worker de jobs (proceso independiente, sin puerto expuesto)

### 4. Ejecutar migraciones (primera vez)

```bash
docker compose --profile migrate up migrate
```

O directamente desde el contenedor api:

```bash
docker compose exec api npm run migrate
```

### 5. Acceder a los servicios

| Servicio | URL |
|---|---|
| Frontend (Vite dev) | `http://localhost:5173` |
| API REST | `http://localhost:4000` |
| Swagger UI | `http://localhost:4000/docs` |
| Health check | `http://localhost:4000/health` |

### 6. Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f api
docker compose logs -f worker

# Reiniciar un servicio
docker compose restart api

# Detener todo (conserva la DB)
docker compose down

# Detener y borrar la DB (borra todos los datos)
docker compose down -v
```

---

## Instalación local (sin Docker)

### 1. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 2. Crear la base de datos PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE set_comprobantes;"
```

### 3. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
# Editar backend/.env con los valores reales
```

### 4. Ejecutar migraciones

```bash
cd backend
npm run migrate
```

### 5. Iniciar API y Worker en terminales separadas

```bash
# Terminal 1: API HTTP
cd backend
npm run dev

# Terminal 2: Worker de jobs
cd backend
npm run dev:worker
```

### 6. Instalar dependencias del frontend e iniciar

```bash
# En la raíz del monorepo
npm install
npm run dev
```

### Scripts del backend

| Script | Descripción |
|---|---|
| `npm run dev` | API en modo desarrollo (hot reload con ts-node-dev) |
| `npm run dev:worker` | Worker en modo desarrollo |
| `npm run build` | Compilar TypeScript a `dist/` |
| `npm start` | Ejecutar API compilada |
| `npm run start:worker` | Ejecutar Worker compilado |
| `npm run migrate` | Correr todas las migraciones SQL pendientes |
| `npm run typecheck` | Verificar tipos sin compilar |

### Scripts del frontend

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo Vite con HMR |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Vista previa del build de producción |
| `npm run typecheck` | Verificar tipos TypeScript |

---

## Variables de entorno

Todas las variables se configuran en `backend/.env`.

### Requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL completo | `postgresql://user:pass@host:5432/set_comprobantes` |
| `ENCRYPTION_KEY` | Clave AES-256 para cifrar credenciales. Mínimo 32 caracteres. **Nunca cambiarla en producción sin re-cifrar todos los registros.** | `my_super_secret_key_32chars_min!` |
| `SOLVECAPTCHA_API_KEY` | API Key de [SolveCaptcha](https://solvecaptcha.com/) para resolver el reCAPTCHA de eKuatia | `abc123...` |

### Opcionales — API

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del servidor HTTP |
| `NODE_ENV` | `development` | Entorno: `development` o `production` |
| `DEBUG` | `false` | Activa logs de debug detallados |
| `DB_POOL_MIN` | `2` | Conexiones mínimas en el pool PostgreSQL |
| `DB_POOL_MAX` | `10` | Conexiones máximas en el pool PostgreSQL |

### Opcionales — Worker

| Variable | Default | Descripción |
|---|---|---|
| `WORKER_POLL_INTERVAL_MS` | `5000` | Cada cuántos ms el worker consulta nuevos jobs |
| `WORKER_MAX_CONCURRENT_JOBS` | `3` | Cuántos jobs puede procesar el worker en paralelo |
| `STUCK_JOB_TIMEOUT_MINUTES` | `60` | Tiempo en minutos tras el cual un job RUNNING se resetea a PENDING |

### Opcionales — Puppeteer

| Variable | Default | Descripción |
|---|---|---|
| `PUPPETEER_HEADLESS` | `true` | `false` para ver el browser durante desarrollo local |
| `PUPPETEER_TIMEOUT_MS` | `30000` | Timeout general de Puppeteer en ms |
| `MARANGATU_BASE_URL` | `https://marangatu.set.gov.py` | URL base del portal Marangatu |
| `EKUATIA_BASE_URL` | `https://ekuatia.set.gov.py` | URL base del portal eKuatia |

> **Produccion:** usar un secrets manager (HashiCorp Vault, AWS Secrets Manager) para `ENCRYPTION_KEY` y `SOLVECAPTCHA_API_KEY`. Nunca commitear estos valores al repositorio.

---

## Configuración de tenants

Cada empresa cliente se registra como un **tenant** con su propia configuración. Las credenciales sensibles (`clave_marangatu`, `ords_password`, `ords_token`) se cifran automáticamente con AES-256-GCM antes de persistir.

### Crear un tenant

```
POST /tenants
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "nombre_fantasia": "Farmacia Central",
  "ruc": "80012345-6",
  "email_contacto": "admin@farmaciacentral.com.py",
  "config": {
    "ruc_login": "80012345-6",
    "usuario_marangatu": "mi_usuario_set",
    "clave_marangatu": "mi_clave_secreta",
    "enviar_a_ords_automaticamente": true,
    "frecuencia_sincronizacion_minutos": 60,
    "ords_base_url": "https://oracle.empresa.com/ords",
    "ords_endpoint_facturas": "/api/v1/facturas",
    "ords_tipo_autenticacion": "BASIC",
    "ords_usuario": "oracle_user",
    "ords_password": "oracle_pass"
  }
}
```

### Campos de configuración

| Campo | Tipo | Descripción |
|---|---|---|
| `ruc_login` | string | RUC usado para login en Marangatu |
| `usuario_marangatu` | string | Usuario del portal SET |
| `clave_marangatu` | string | Contraseña (se cifra al guardar) |
| `enviar_a_ords_automaticamente` | boolean | Si `true`, encola envío ORDS después de cada sync |
| `frecuencia_sincronizacion_minutos` | number | Cada cuántos minutos el scheduler encola un sync automático |
| `ords_base_url` | string? | URL base del servidor ORDS |
| `ords_endpoint_facturas` | string? | Path del endpoint de facturas en ORDS |
| `ords_tipo_autenticacion` | `BASIC` \| `BEARER` \| `NONE` | Tipo de auth para ORDS |
| `ords_usuario` | string? | Usuario para auth BASIC |
| `ords_password` | string? | Contraseña para auth BASIC (se cifra al guardar) |
| `ords_token` | string? | Token para auth BEARER (se cifra al guardar) |

### SolveCaptcha por tenant (campo `extra_config`)

Si se quiere usar una API key de SolveCaptcha diferente por tenant:

```json
{
  "config": {
    "extra_config": {
      "solvecaptcha_api_key": "api_key_especifica_de_este_tenant"
    }
  }
}
```

Si no se define, se usa la variable de entorno `SOLVECAPTCHA_API_KEY` como fallback global.

---

## API Reference

La documentación interactiva Swagger UI esta disponible en: `http://localhost:4000/docs`

### Autenticación

Todos los endpoints (excepto `/health` y `/auth/login`) requieren el header:

```
Authorization: Bearer <jwt_token>
```

### Auth

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Login con email + password. Retorna JWT token. |
| `POST` | `/auth/logout` | Invalida el token actual. |
| `GET` | `/auth/me` | Datos del usuario autenticado. |

**Login — Body:**
```json
{
  "email": "admin@empresa.com",
  "password": "mi_password"
}
```

**Login — Respuesta `200`:**
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "email": "admin@empresa.com",
    "nombre": "Admin",
    "rol": "super_admin",
    "tenant_id": null
  }
}
```

---

### Tenants

| Método | Endpoint | Rol requerido | Descripción |
|---|---|---|---|
| `GET` | `/tenants` | super_admin | Lista todas las empresas |
| `GET` | `/tenants/:id` | admin_empresa+ | Detalle de una empresa |
| `POST` | `/tenants` | super_admin | Crea empresa con configuración |
| `PUT` | `/tenants/:id` | admin_empresa+ | Actualiza datos y/o configuración |

---

### Jobs

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/jobs` | Lista jobs con filtros opcionales |
| `GET` | `/jobs/:id` | Detalle de un job (incluye `error_message`) |
| `POST` | `/tenants/:id/jobs/sync-comprobantes` | Encola sync manual de comprobantes |
| `POST` | `/tenants/:id/jobs/descargar-xml` | Encola descarga manual de XMLs |
| `POST` | `/tenants/:id/jobs/enviar-a-ords` | Encola envío manual a ORDS |

**GET /jobs — Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `tenant_id` | uuid | Filtrar por empresa |
| `tipo_job` | string | `SYNC_COMPROBANTES`, `ENVIAR_A_ORDS`, `DESCARGAR_XML` |
| `estado` | string | `PENDING`, `RUNNING`, `DONE`, `FAILED` |
| `limit` | number | Máximo resultados (default 20) |

**POST sync-comprobantes — Body (opcional):**
```json
{
  "mes": 11,
  "anio": 2024
}
```

---

### Comprobantes

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/tenants/:id/comprobantes` | Lista paginada con filtros |
| `GET` | `/tenants/:id/comprobantes/:comprobanteId` | Detalle completo con XML parseado |

**GET comprobantes — Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `fecha_desde` | `YYYY-MM-DD` | Filtro fecha inicio |
| `fecha_hasta` | `YYYY-MM-DD` | Filtro fecha fin |
| `tipo_comprobante` | string | `FACTURA`, `NOTA_CREDITO`, `NOTA_DEBITO`, `AUTOFACTURA`, `OTRO` |
| `ruc_vendedor` | string | RUC del emisor |
| `xml_descargado` | boolean | `true` = solo con XML, `false` = solo sin XML |
| `page` | number | Página (default 1) |
| `limit` | number | Resultados por página (default 20, max 100) |

**Respuesta `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "ruc_vendedor": "80012345-6",
      "razon_social_vendedor": "Empresa XYZ S.A.",
      "cdc": "01800123456001001000000012024110112345678901",
      "numero_comprobante": "001-001-0001234",
      "tipo_comprobante": "FACTURA",
      "fecha_emision": "2024-11-01",
      "total_operacion": "194000",
      "origen": "ELECTRONICO",
      "xml_descargado_at": "2025-01-15T10:05:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 342
  }
}
```

---

### Usuarios

| Método | Endpoint | Rol requerido | Descripción |
|---|---|---|---|
| `GET` | `/usuarios` | admin_empresa+ | Lista usuarios (filtrado por tenant para no-superadmins) |
| `POST` | `/usuarios` | admin_empresa+ | Crear usuario |
| `PUT` | `/usuarios/:id` | admin_empresa+ | Actualizar usuario |
| `DELETE` | `/usuarios/:id` | admin_empresa+ | Desactivar usuario |
| `GET` | `/roles` | admin_empresa+ | Lista roles disponibles |

---

### Métricas

| Método | Endpoint | Rol requerido | Descripción |
|---|---|---|---|
| `GET` | `/metrics/overview` | super_admin | Stats generales del sistema |
| `GET` | `/metrics/tenants/:id` | admin_empresa+ | Métricas por tenant |
| `GET` | `/metrics/saas` | super_admin | Métricas multitenant SaaS |

---

### Health

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/health` | Liveness check. No requiere auth. |

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Flujos de procesamiento

### SYNC_COMPROBANTES

```
Scheduler (cron cada 5 min) o API manual
  → crea job SYNC_COMPROBANTES en tabla jobs
  → Worker reclama job (FOR UPDATE SKIP LOCKED)
  → SyncService.ejecutarSyncComprobantes()
      → MarangatuService.sincronizarComprobantes()
          → Puppeteer: login en Marangatu con credenciales del tenant
          → navega a Gestión de Comprobantes Virtuales → COMPRAS
          → selecciona año y mes
          → extrae filas de la tabla (con paginación)
          → upsert en tabla comprobantes (hash_unico como deduplicador)
      → Si enviar_a_ords_automaticamente = true:
          → markEnviosOrdsPendingAfterSync()
          → encola job ENVIAR_A_ORDS automáticamente
      → Si hay comprobantes con CDC:
          → enqueueXmlDownloads() en comprobante_xml_jobs
          → encola job DESCARGAR_XML automáticamente
```

### DESCARGAR_XML

```
Worker reclama job DESCARGAR_XML
  → SyncService.ejecutarDescargarXml()
      → obtenerPendientesXml() — lee comprobante_xml_jobs PENDING
      → Por cada comprobante pendiente con CDC:
          → EkuatiaService.descargarXml(cdc)
              → CaptchaService.resolverCaptcha()
                  → POST https://api.solvecaptcha.com/in.php
                  → polling GET /res.php hasta obtener token (~10-30s)
              → GET https://ekuatia.set.gov.py/docs/documento-electronico-xml/{cdc}
              → parsearXml() — extrae todos los campos SIFEN (emisor, receptor, items, totales)
          → guardarXmlDescargado() — persiste xml_contenido + detalles_xml (JSONB)
          → Si falla: marcarXmlJobFallido() con retry automático (max 3 intentos)
      → Si quedan pendientes: re-encola job DESCARGAR_XML automáticamente
```

### ENVIAR_A_ORDS

```
Worker reclama job ENVIAR_A_ORDS
  → SyncService.ejecutarEnvioOrds()
      → OrdsService.procesarEnviosPendientes()
          → findPendingOrdsEnvios() — lee comprobante_envio_ords PENDING
          → Por cada envío pendiente:
              → buildOrdsPayload() — arma JSON con datos básicos + detalles_xml completo
              → POST al endpoint ORDS configurado (BASIC, BEARER o sin auth)
              → Si éxito: updateEnvioOrdsSuccess() — estado = SENT
              → Si falla: updateEnvioOrdsFailed() con retry exponencial (max 3 intentos)
```

### Scheduler automático

El scheduler (`scheduler.ts`) ejecuta un cron **cada 5 minutos**. Para cada tenant activo, verifica si corresponde encolar un nuevo sync según `frecuencia_sincronizacion_minutos`. Si el tenant tiene frecuencia 60, solo encola si el último job fue hace más de 60 minutos. También resetea jobs RUNNING que llevan más de 60 minutos sin actualizar (jobs colgados).

---

## Schema de base de datos

### Diagrama de relaciones

```
tenants (1) ──── (1) tenant_config
   │
   ├──── (N) jobs
   │
   └──── (N) comprobantes
               │
               ├──── (1) comprobante_envio_ords
               └──── (1) comprobante_xml_jobs
```

### Tablas

**`tenants`** — Empresas registradas
```sql
id UUID PRIMARY KEY
nombre_fantasia VARCHAR(255) NOT NULL
ruc VARCHAR(20) UNIQUE NOT NULL
email_contacto VARCHAR(255)
timezone VARCHAR(50) DEFAULT 'America/Asuncion'
activo BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
```

**`tenant_config`** — Configuración sensible (uno por tenant)
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
ruc_login VARCHAR(20)
usuario_marangatu VARCHAR(255)
clave_marangatu_encrypted TEXT           -- AES-256-GCM
marangatu_base_url VARCHAR(500)
ords_base_url VARCHAR(500)
ords_endpoint_facturas VARCHAR(500)
ords_tipo_autenticacion ENUM('BASIC','BEARER','NONE')
ords_usuario VARCHAR(255)
ords_password_encrypted TEXT             -- AES-256-GCM
ords_token_encrypted TEXT                -- AES-256-GCM
enviar_a_ords_automaticamente BOOLEAN
frecuencia_sincronizacion_minutos INTEGER DEFAULT 60
extra_config JSONB
created_at TIMESTAMP
updated_at TIMESTAMP
```

**`jobs`** — Cola de trabajos
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
tipo_job ENUM('SYNC_COMPROBANTES','ENVIAR_A_ORDS','DESCARGAR_XML','SYNC_FACTURAS_VIRTUALES')
payload JSONB
estado ENUM('PENDING','RUNNING','DONE','FAILED')
intentos INTEGER DEFAULT 0
max_intentos INTEGER DEFAULT 3
error_message TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
last_run_at TIMESTAMP
next_run_at TIMESTAMP
```

> El worker usa `SELECT ... FOR UPDATE SKIP LOCKED` para evitar colisiones entre múltiples instancias.

**`comprobantes`** — Comprobantes fiscales
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
origen ENUM('ELECTRONICO','VIRTUAL')
ruc_vendedor VARCHAR(20)
razon_social_vendedor VARCHAR(500)
cdc VARCHAR(44)                          -- Código de Documento Comercial
numero_comprobante VARCHAR(50)
tipo_comprobante ENUM('FACTURA','NOTA_CREDITO','NOTA_DEBITO','AUTOFACTURA','OTRO')
fecha_emision DATE
total_operacion NUMERIC(18,2)
raw_payload JSONB                        -- datos originales scrapeados
hash_unico VARCHAR(64) UNIQUE            -- SHA-256 para deduplicación
xml_contenido TEXT                       -- XML SIFEN crudo
xml_url VARCHAR(500)
xml_descargado_at TIMESTAMP
detalles_xml JSONB                       -- XML parseado en estructura JSON
created_at TIMESTAMP
updated_at TIMESTAMP
```

> `hash_unico` es SHA-256 de `tenant_id|ruc_vendedor|numero_comprobante|fecha_emision`. Garantiza que no haya duplicados en el upsert.

**`comprobante_envio_ords`** — Tracking de envíos a Oracle ORDS
```sql
id UUID PRIMARY KEY
comprobante_id UUID REFERENCES comprobantes(id)
tenant_id UUID REFERENCES tenants(id)
estado_envio ENUM('PENDING','SENT','FAILED')
intentos INTEGER DEFAULT 0
last_sent_at TIMESTAMP
error_message TEXT
respuesta_ords JSONB                     -- respuesta HTTP del servidor ORDS
created_at TIMESTAMP
updated_at TIMESTAMP
```

**`comprobante_xml_jobs`** — Tracking de descarga de XMLs
```sql
id UUID PRIMARY KEY
comprobante_id UUID REFERENCES comprobantes(id)
tenant_id UUID REFERENCES tenants(id)
estado ENUM('PENDING','RUNNING','DONE','FAILED')
intentos INTEGER DEFAULT 0
last_attempt_at TIMESTAMP
error_message TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

**`usuarios`** — Usuarios del sistema
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)   -- NULL para super_admin
email VARCHAR(255) UNIQUE NOT NULL
password_hash TEXT NOT NULL              -- bcrypt
nombre VARCHAR(255)
rol ENUM('super_admin','admin_empresa','usuario_empresa','readonly')
activo BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## Payload ORDS

El payload que se envía al endpoint Oracle ORDS tiene esta estructura:

```json
{
  "rucVendedor": "80012345-6",
  "razonSocialVendedor": "Empresa XYZ S.A.",
  "cdc": "01800123456001001000000012024110112345678901",
  "numeroComprobante": "001-001-0001234",
  "tipoComprobante": "FACTURA",
  "fechaEmision": "2024-11-01",
  "totalOperacion": 194000,
  "origen": "ELECTRONICO",
  "tenantRuc": "80099999-9",
  "detalles": {
    "cdc": "01800123456001001000000012024110112345678901",
    "tipoDocumento": "1",
    "version": "150",
    "emisor": {
      "ruc": "80012345-6",
      "razonSocial": "Empresa XYZ S.A.",
      "nombreFantasia": "XYZ",
      "timbrado": "12345678",
      "establecimiento": "001",
      "punto": "001",
      "numero": "0001234",
      "direccion": "Av. Mcal. Lopez 123",
      "ciudad": "Asuncion",
      "departamento": "Central"
    },
    "receptor": {
      "ruc": "12345678-9",
      "razonSocial": "Cliente Final S.A.",
      "tipoContribuyente": "1"
    },
    "fechaEmision": "2024-11-01T10:30:00",
    "moneda": "PYG",
    "condicionVenta": "1",
    "items": [
      {
        "descripcion": "Amoxicilina 500mg",
        "cantidad": 10,
        "precioUnitario": 15000,
        "descuento": 0,
        "subtotal": 150000,
        "iva": 13636,
        "tasaIva": 10
      }
    ],
    "totales": {
      "subtotal": 150000,
      "descuento": 0,
      "anticipo": 0,
      "total": 150000,
      "ivaTotal": 13636,
      "iva5": 0,
      "iva10": 13636,
      "exentas": 0
    },
    "timbrado": "12345678",
    "numeroComprobante": "001-001-0001234",
    "qrUrl": "https://ekuatia.set.gov.py/...",
    "xmlHash": "abc123..."
  },
  "metadatos": {}
}
```

Para adaptar el payload a un schema ORDS diferente, modificar `buildOrdsPayload()` en `backend/src/services/ords.service.ts`.

---

## Frontend — Dashboard de administración

El frontend es una SPA en React que consume la API del backend.

### Páginas

| Página | Ruta | Descripción |
|---|---|---|
| Login | `/login` | Autenticación con email y contraseña |
| Dashboard | `/` | Vista general: contadores, actividad reciente |
| Tenants | `/tenants` | Gestión de empresas y sus configuraciones |
| Comprobantes | `/tenants/:id/comprobantes` | Listado, filtros, descarga de XMLs, ver detalles |
| Jobs | `/jobs` | Monitor de cola de jobs con estado en tiempo real |
| Usuarios | `/usuarios` | Gestión de usuarios y roles |
| Metricas | `/metricas` | Analíticas (solo super_admin) |

### Control de acceso por rol

| Rol | Descripcion |
|---|---|
| `super_admin` | Acceso total. Puede ver y gestionar todos los tenants, usuarios y métricas globales. |
| `admin_empresa` | Administrador de su empresa. Gestiona configuracion, usuarios y comprobantes de su tenant. |
| `usuario_empresa` | Usuario operativo de una empresa. Puede ver comprobantes y lanzar jobs manuales. |
| `readonly` | Solo lectura. Ve comprobantes y jobs pero no puede crear ni modificar nada. |

### Configuración de la URL del backend

El frontend apunta al backend via la variable de entorno `VITE_API_URL`. En desarrollo, Vite usa un proxy configurado en `vite.config.ts` para evitar problemas de CORS.

---

## Seguridad

- Las contraseñas y tokens se cifran con **AES-256-GCM** antes de insertar en la DB. El IV y el auth tag se incluyen en el campo cifrado. Ver `backend/src/services/crypto.service.ts`.
- Las claves cifradas **nunca se retornan** en las respuestas de la API.
- Todas las queries usan parametros PostgreSQL (`$1`, `$2`, ...) — sin riesgo de SQL injection.
- Las contraseñas de usuario se hashean con **bcrypt** (12 rounds).
- Los JWT tienen tiempo de expiración configurable.
- En produccion, gestionar `ENCRYPTION_KEY` y `SOLVECAPTCHA_API_KEY` con un secrets manager. **Nunca commitear estos valores al repositorio.**
- El campo `hash_unico` es SHA-256 de `tenant_id|ruc_vendedor|numero_comprobante|fecha_emision` — evita duplicados en upsert.

---

## Colección Postman

La colección Postman se encuentra en `backend/postman_collection.json`.

Para importarla:
1. Abrir Postman
2. `File → Import`
3. Seleccionar `backend/postman_collection.json`
4. Configurar la variable de entorno `base_url` a `http://localhost:4000`

---

## Troubleshooting

**El worker no procesa jobs**
- Verificar que `DATABASE_URL` apunta a la misma DB que la API.
- Correr las migraciones: `npm run migrate` o `docker compose --profile migrate up migrate`.
- Revisar logs: `docker compose logs -f worker`.

**Puppeteer falla al iniciar**
- En Linux sin interfaz gráfica, asegurarse que Chromium tiene las dependencias del sistema. El `Dockerfile` ya las instala.
- Para debug visual, setear `PUPPETEER_HEADLESS=false` y ejecutar localmente (no en Docker).
- Verificar que las credenciales del tenant en Marangatu son correctas.

**Error de cifrado al crear o actualizar tenant**
- `ENCRYPTION_KEY` debe tener mínimo 32 caracteres.
- Si se cambia esta variable en produccion, todos los registros existentes quedan ilegibles. Requiere re-cifrado manual de todos los campos `_encrypted`.

**SolveCaptcha retorna error o timeout**
- Verificar saldo disponible en la cuenta de SolveCaptcha.
- El site key de eKuatia es `6LchFioUAAAAAL1JVkV0YFmLd0nMEd_C5P60eaTi`.
- Revisar la latencia de respuesta de SolveCaptcha; los CAPTCHAs pueden tardar 30-90 segundos en resolverse.

**Jobs quedan en estado RUNNING indefinidamente**
- El scheduler resetea automáticamente los jobs RUNNING con mas de 60 minutos sin actualizar (`STUCK_JOB_TIMEOUT_MINUTES`).
- Para un reset inmediato, actualizar manualmente el estado en la DB: `UPDATE jobs SET estado = 'PENDING', intentos = 0 WHERE id = 'uuid';`

**El frontend no conecta con el backend**
- Verificar que `VITE_API_URL` o la configuracion de proxy en `vite.config.ts` apunta a `http://localhost:4000`.
- Verificar que el contenedor `api` está corriendo: `docker compose ps`.
