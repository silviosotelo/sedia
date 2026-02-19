# SET Comprobantes Backend

Servicio de automatización de comprobantes fiscales SET Paraguay.
Arquitectura multitenant con cola de jobs PostgreSQL y automatización Puppeteer.

---

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework HTTP | Fastify |
| Base de datos | PostgreSQL 15 |
| ORM / Query | node-postgres (pg) directo |
| Automatización | Puppeteer (headless Chromium) |
| Scheduler | node-cron |
| HTTP client | Axios |
| Validación | Zod |
| Cifrado | AES-256-GCM (crypto nativo) |

---

## Estructura del proyecto

```
backend/
├── src/
│   ├── api/
│   │   ├── middleware/         # Error handler, validaciones
│   │   └── routes/             # tenant, job, comprobante routes
│   ├── config/
│   │   ├── env.ts              # Variables de entorno tipadas
│   │   └── logger.ts           # Logger centralizado
│   ├── db/
│   │   ├── connection.ts       # Pool PostgreSQL
│   │   ├── migrate.ts          # Runner de migraciones
│   │   ├── migrations/
│   │   │   └── 001_initial.sql # Schema completo
│   │   └── repositories/       # Acceso a datos por entidad
│   ├── services/
│   │   ├── crypto.service.ts   # AES-256-GCM + hash único
│   │   ├── marangatu.service.ts # Puppeteer - scraping Marangatu
│   │   ├── ords.service.ts     # Envío a Oracle ORDS
│   │   └── sync.service.ts     # Orquestación (sync + ORDS)
│   ├── workers/
│   │   ├── job.worker.ts       # Loop de procesamiento de jobs
│   │   └── scheduler.ts        # Cron - encola jobs automáticos
│   ├── types/index.ts          # Tipos compartidos
│   ├── main.ts                 # Entry point API
│   └── worker.ts               # Entry point Worker
├── .env.example
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar:

```bash
cp .env.example .env
```

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | Sí |
| `ENCRYPTION_KEY` | Clave AES-256 (min 32 chars) | Sí |
| `PORT` | Puerto del servidor API | No (default 4000) |
| `NODE_ENV` | Entorno (development/production) | No |
| `DEBUG` | Logs detallados | No (default false) |
| `PUPPETEER_HEADLESS` | Puppeteer sin UI | No (default true) |
| `PUPPETEER_TIMEOUT_MS` | Timeout navegador | No (default 30000) |
| `MARANGATU_BASE_URL` | URL base Marangatu | No |
| `WORKER_POLL_INTERVAL_MS` | Intervalo polling jobs (ms) | No (default 5000) |
| `WORKER_MAX_CONCURRENT_JOBS` | Jobs paralelos en el worker | No (default 3) |

**IMPORTANTE**: `ENCRYPTION_KEY` se usa para cifrar las credenciales de Marangatu
y de ORDS en la DB. En producción usar un secrets manager (Vault, AWS Secrets Manager).

---

## Instalación local

```bash
# Instalar dependencias
npm install

# Configurar entorno
cp .env.example .env
# Editar .env con los valores correctos

# Ejecutar migraciones
npm run migrate

# Iniciar API (desarrollo)
npm run dev

# Iniciar Worker (desarrollo, otra terminal)
npm run dev:worker
```

---

## Con Docker Compose

```bash
# En la raíz del proyecto (donde está docker-compose.yml)
cp .env.example .env
# Editar .env

# Ejecutar migraciones (una sola vez)
docker compose --profile migrate up migrate

# Levantar API + Worker + PostgreSQL
docker compose up -d api worker postgres

# Ver logs
docker compose logs -f api
docker compose logs -f worker
```

---

## API Endpoints

La documentación interactiva Swagger está disponible en:
`http://localhost:4000/docs`

### Tenants

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/tenants` | Crear empresa con configuración |
| GET | `/tenants` | Listar todas las empresas |
| GET | `/tenants/:id` | Ver detalle de una empresa |
| PUT | `/tenants/:id` | Actualizar empresa y config |

**Ejemplo: Crear tenant con config completa**

```json
POST /tenants
{
  "nombre_fantasia": "Farmacia Central",
  "ruc": "80012345-6",
  "email_contacto": "admin@farmaciacentral.com.py",
  "config": {
    "ruc_login": "80012345-6",
    "usuario_marangatu": "usuario_set",
    "clave_marangatu": "mi_clave_secreta",
    "enviar_a_ords_automaticamente": true,
    "frecuencia_sincronizacion_minutos": 60,
    "ords_base_url": "https://mi-oracle.empresa.com/ords",
    "ords_endpoint_facturas": "/api/v1/facturas",
    "ords_tipo_autenticacion": "BASIC",
    "ords_usuario": "oracle_user",
    "ords_password": "oracle_pass"
  }
}
```

### Jobs

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/tenants/:id/jobs/sync-comprobantes` | Encolar sync inmediato |
| GET | `/jobs` | Listar jobs (filtros: tenant_id, tipo_job, estado) |
| GET | `/jobs/:id` | Ver detalle de un job |

**Ejemplo: Encolar sync manual**

```json
POST /tenants/uuid-del-tenant/jobs/sync-comprobantes
{
  "mes": 11,
  "anio": 2024
}
```

### Comprobantes

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/tenants/:id/comprobantes` | Listar comprobantes (paginado) |
| GET | `/tenants/:id/comprobantes/:comprobanteId` | Ver detalle |

**Filtros disponibles en listado:**
- `fecha_desde` (YYYY-MM-DD)
- `fecha_hasta` (YYYY-MM-DD)
- `tipo_comprobante` (FACTURA, NOTA_CREDITO, NOTA_DEBITO, etc.)
- `ruc_vendedor`
- `page` (default 1)
- `limit` (default 20, max 100)

---

## Worker y Scheduler

El worker es un proceso independiente que:

1. **Loop de polling** (`job.worker.ts`): cada `WORKER_POLL_INTERVAL_MS` ms,
   consulta la tabla `jobs` buscando jobs `PENDING` con `next_run_at <= NOW()`.
   Usa `FOR UPDATE SKIP LOCKED` para soportar múltiples instancias del worker.

2. **Scheduler cron** (`scheduler.ts`): corre cada 5 minutos y encola
   jobs `SYNC_COMPROBANTES` automáticamente para todos los tenants activos.
   Respeta la `frecuencia_sincronizacion_minutos` de cada tenant.

**Flujo de un job SYNC_COMPROBANTES:**
```
Worker → reclama job → SyncService.ejecutarSyncComprobantes()
  → MarangatuService.syncComprobantes()
    → Puppeteer: login → navegación → extracción paginada
    → upsertComprobante() para cada fila
  → Si enviar_a_ords_automaticamente=true:
    → markEnviosOrdsPendingAfterSync()
    → encola job ENVIAR_A_ORDS
```

**Flujo de un job ENVIAR_A_ORDS:**
```
Worker → reclama job → SyncService.ejecutarEnvioOrds()
  → OrdsService.procesarEnviosPendientes()
    → Por cada comprobante_envio_ords PENDING:
      → buildOrdsPayload() → POST al endpoint ORDS
      → updateEnvioOrdsSuccess() o updateEnvioOrdsFailed()
```

---

## Implementar selectores Puppeteer

Los métodos de Puppeteer tienen TODOs marcados en `src/services/marangatu.service.ts`.
Para completar la implementación:

1. Abrir Chrome DevTools en `https://marangatu.set.gov.py`
2. Inspeccionar el formulario de login → obtener `name`/`id` de los campos
3. Navegar al módulo de comprobantes → inspeccionar la tabla de resultados
4. Completar los métodos:
   - `loginMarangatu()` – selectores del formulario de login
   - `navegarAGestionComprobantes()` – URL y selector de período/mes
   - `extraerFilasDeComprobantes()` – selectores de la tabla de resultados
   - `irSiguientePagina()` – selector del botón de paginación

---

## Payload ORDS

El payload enviado a Oracle ORDS tiene esta estructura (personalizable en `ords.service.ts`):

```json
{
  "rucVendedor": "80012345-6",
  "razonSocialVendedor": "Empresa XYZ S.A.",
  "cdc": "01800123456001001000000012024110112345678901",
  "numeroComprobante": "001-001-0001234",
  "tipoComprobante": "FACTURA",
  "fechaEmision": "2024-11-01",
  "totalOperacion": 150000,
  "origen": "ELECTRONICO",
  "tenantRuc": "80099999-9",
  "metadatos": {}
}
```

Ajustar `buildOrdsPayload()` en `ords.service.ts` según el schema exacto del endpoint ORDS de cada cliente.

---

## Seguridad

- Las contraseñas y tokens se cifran con **AES-256-GCM** antes de persistir en DB.
- Las claves cifradas **nunca se retornan** en las respuestas de la API.
- En producción, usar un **secrets manager** (HashiCorp Vault, AWS Secrets Manager)
  para gestionar `ENCRYPTION_KEY` y las credenciales de tenants.
- Las queries usan parámetros PostgreSQL (`$1`, `$2`) — sin riesgo de SQL injection.

---

## Health check

```
GET /health
→ { "status": "ok", "timestamp": "...", "version": "1.0.0" }
```
