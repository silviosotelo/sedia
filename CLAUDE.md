# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SEDIA (SET Comprobantes)** — Plataforma SaaS multitenant para gestión de comprobantes fiscales del SET Paraguay (Marangatu + eKuatia) con facturación electrónica SIFEN. Dashboard React + backend Fastify + PostgreSQL + worker de jobs (cola en PostgreSQL, sin Redis).

## Environments

| Env | Path | Compose file | API port | DB | Branch |
|-----|------|-------------|----------|-----|--------|
| Local | `/var/www/sedia/` | `docker-compose.local.yml` | 4000 | `set_comprobantes` (containerizado) | `develop` |
| Staging | `/var/www/sedia-dev/` | `docker-compose.dev.yml` | 4002 | `set_comprobantes_staging` | `develop` |
| Production | `/var/www/sedia/` | `docker-compose.yml` | 4000 | `set_comprobantes` | `main` |

- Staging/Prod: PostgreSQL nativo en host, accedido via `host.docker.internal`
- Local: PostgreSQL containerizado (puerto host 5433)
- Variables de entorno: `.env` raíz alimenta Docker Compose; `backend/.env` para desarrollo sin Docker
- CI/CD: `.github/workflows/deploy.yml` despliega `main` a Hostinger VPS

## Common Commands

### Backend (desde `backend/`)
```bash
npm run dev              # API dev (ts-node-dev, hot reload, puerto 4000)
npm run dev:worker       # Worker dev
npm run build            # Compilar TS a dist/
npm run migrate          # Ejecutar migraciones SQL pendientes
npm run typecheck        # tsc --noEmit
```

### Frontend (desde raíz)
```bash
npm run dev              # Vite dev server (puerto 5173)
npm run build            # Build producción
npm run typecheck        # tsc --noEmit -p tsconfig.app.json
npm run lint             # ESLint
```

### Docker (local — todo containerizado)
```bash
docker compose -f docker-compose.local.yml up -d --build   # Build y levantar todo
docker compose -f docker-compose.local.yml logs -f api      # Logs API
docker compose -f docker-compose.local.yml down -v          # Parar y borrar datos
```

### Docker (staging)
```bash
docker compose -f docker-compose.dev.yml build api worker
docker compose -f docker-compose.dev.yml up -d api worker
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml --profile migrate up migrate
```

### Seeds (datos de prueba)
```bash
# Ejecutar seed de usuarios de prueba directo en postgres
docker exec sedia-local-postgres psql -U postgres -d set_comprobantes -f /dev/stdin < backend/src/db/seeds/001_usuarios_prueba.sql
```

## Architecture

### Monorepo layout
- Raíz (`/`) — Frontend React (Vite + Tailwind CSS + TypeScript)
- `backend/` — API Fastify + Worker + Scheduler (TypeScript + node-postgres)

### Three backend processes
1. **API** (`backend/src/main.ts`) — Fastify REST, Swagger UI en `/docs`
2. **Worker** (`backend/src/worker.ts`) — Loop que reclama jobs con `FOR UPDATE SKIP LOCKED`
3. **Scheduler** (`backend/src/workers/scheduler.ts`) — Cron cada 5 min, encola syncs por tenant

### Backend layers
```
backend/src/
  api/routes/         → 21 archivos de rutas Fastify (prefijo /api)
  api/middleware/      → auth.middleware.ts (requireAuth, requirePermiso, assertTenantAccess)
                        error.middleware.ts (ApiError → JSON consistente)
                        plan.middleware.ts (checkFeature para gates de plan/addon)
  services/           → 34 archivos de lógica de negocio
  db/connection.ts    → Pool PostgreSQL singleton con keep-alive y monitoreo
  db/repositories/    → Data access (SQL parametrizado, no ORM)
  db/migrations/      → SQL secuencial (001..034+), NO usar CONCURRENTLY en CREATE INDEX
  db/seeds/           → Datos de prueba (001_usuarios_prueba.sql)
  workers/            → job.worker.ts, scheduler.ts, sifen.worker.ts
  config/env.ts       → Configuración tipada (requireEnv, optionalEnv)
  config/logger.ts    → Logger custom con stack traces (debug, info, warn, error)
  types/              → TypeScript interfaces
```

### Data access pattern
```typescript
import { query, queryOne, withTransaction } from '../db/connection';
// query<T>(sql, params) → T[]
// queryOne<T>(sql, params) → T | null
// withTransaction(async (client) => { ... })
// SQL params: $1, $2, ... — NEVER string interpolation
```

### PostgreSQL connection pool
- `db/connection.ts`: singleton `Pool` con `idleTimeoutMillis: 0` (conexiones permanentes)
- TCP keep-alive habilitado en cada conexión para evitar conexiones zombi
- Monitoreo cada 60s: logea WARN si hay clientes en espera (`waitingCount > 0`)
- Los errores de query incluyen: `pg_code`, `stack`, estado del pool
- **NO usar `CREATE INDEX CONCURRENTLY`** en migraciones (incompatible con transacciones del migrator)

### Frontend
- SPA React **sin router** — navegación por estado en `App.tsx` con `PAGE_ACCESS` map
- `contexts/AuthContext.tsx` — Auth state, token en localStorage (`saas_token`), RBAC con `hasPermission(recurso, accion)` y `hasFeature(feature)`
- `contexts/TenantContext.tsx` — Tenant seleccionado (super_admin puede cambiar, usuarios regulares bloqueados a su tenant)
- `lib/api.ts` — HTTP client centralizado (~836 líneas), namespaces: `api.tenants`, `api.jobs`, `api.comprobantes`, `api.sifen`, `api.billing`, etc.
- `BASE_URL` = `VITE_API_URL` env var (baked en build time) o fallback `/api`
- Tailwind CSS, Lucide icons, Tremor charts, Recharts
- Soporte mock mode (`VITE_MOCK_MODE=true`) con datos in-memory

### Auth & RBAC
- 4 roles: `super_admin` (sin tenant), `admin_empresa`, `usuario_empresa`, `readonly`
- Permisos como strings `"recurso:accion"` (ej: `"sifen:ver"`, `"tenants:editar"`)
- Plan features como `Record<string, boolean>` — gated por `checkFeature()` middleware
- Super admin bypasses todas las restricciones de permisos y features
- Token en header: `Authorization: Bearer <token>` o query param `?token=`

### Job types
`SYNC_COMPROBANTES`, `DESCARGAR_XML`, `ENVIAR_A_ORDS`, `SYNC_FACTURAS_VIRTUALES`, `RECONCILIAR_CUENTA`, `IMPORTAR_PROCESADOR`, plus SIFEN jobs: `EMITIR_SIFEN`, `SIFEN_ENVIAR_LOTE`, `SIFEN_CONSULTAR_LOTE`, `SIFEN_ANULAR`, `SIFEN_GENERAR_KUDE`, `SIFEN_REINTENTAR_FALLIDOS`, `SEND_INVOICE_EMAIL`

### SIFEN state machine
```
DRAFT → GENERATED → SIGNED → ENQUEUED → IN_LOTE → SENT → APPROVED/REJECTED
                                                        → CANCELLED (anulación)
                                                        → ERROR
```

### Data flow
```
Marangatu (Puppeteer scraping) → comprobantes (hash_unico dedup)
    → eKuatia (Puppeteer + CAPTCHA → SolveCaptcha API) → XML parse → detalles_xml
    → Oracle ORDS (BASIC/BEARER/NONE auth)
    → SIFEN (XML gen → Sign cert → QR → Lote batch → SET API → Poll status)
```

## Key Modules

- **SIFEN** — Facturación electrónica. 6 services (`sifen*.service.ts`), worker (`sifen.worker.ts`). Libs: `facturacionelectronicapy-xmlgen/xmlsign/setapi/kude/qrgen`
- **Billing** — Suscripciones Bancard, features por plan, addons modulares. `billing.service.ts`, `bancard.service.ts`
- **Bancos** — Import CSV extractos, conciliación automática comprobantes↔transacciones. `bankImport.service.ts`, `reconciliation.service.ts`
- **Anomalías** — Detección anomalías fiscales con forecast. `anomaly.service.ts`, `forecast.service.ts`
- **Webhooks** — Delivery con retry queue y DLQ. `webhook.service.ts`
- **Audit** — Log de auditoría con export. `audit.service.ts`
- **White-label** — Branding por tenant (logo, colores, nombre app). CSS variables dinámicas en frontend

## Key Conventions

- **SQL directo** con `pg` — parámetros `$1, $2...`, sin ORM. Dedup con `ON CONFLICT ... DO UPDATE/NOTHING`
- **Credenciales** cifradas AES-256-GCM (`crypto.service.ts`) — campos `*_encrypted` en `tenant_config`
- **Passwords** hasheadas con PBKDF2-SHA512 (100k iterations, salt aleatorio) en `auth.service.ts`
- **Migraciones** SQL secuenciales: `backend/src/db/migrations/NNN_nombre.sql`. Corren dentro de transacción
- **Multitenant**: todas las tablas tienen `tenant_id`. Aislamiento vía `assertTenantAccess()` en middleware
- **Idioma**: español para dominio (comprobantes, tenants, facturas), inglés para patrones técnicos
- **In-memory caching**: `Map<key, { value, cachedAt }>` con TTL manual (auth tokens 120s, addon features 60s)
- **Storage**: Cloudflare R2 en prod, buffer directo en dev (`R2_ENABLED=false`)
- **Validación**: Zod en route handlers, SQL constraints en DB
- **Rutas Fastify**: todas exportan `async function xxxRoutes(app: FastifyInstance)`, registradas en `server.ts`
- **Error handling**: `ApiError(statusCode, code, message, details)` → JSON `{ success: false, error: { code, message } }`
