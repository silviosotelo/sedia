# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SEDIA (SET Comprobantes)** — Plataforma SaaS multitenant para gestión de comprobantes fiscales del SET Paraguay (Marangatu + eKuatia) con facturación electrónica SIFEN. Dashboard React + backend Fastify + PostgreSQL + worker de jobs (cola en PostgreSQL, sin Redis).

## Environments

| Env | Path | Compose file | API port | DB |
|-----|------|-------------|----------|-----|
| Staging | `/var/www/sedia-dev/` | `docker-compose.dev.yml` | 4002 | `set_comprobantes_staging` |
| Production | `/var/www/sedia/` | `docker-compose.yml` | 4000 | `set_comprobantes` |

- PostgreSQL nativo en host (no containerizado), accedido via `host.docker.internal`
- Variables de entorno: el `.env` raíz del proyecto alimenta Docker Compose; `backend/.env` es para desarrollo local sin Docker
- Branch staging: `develop` | Branch prod: `main`

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

### Docker (staging)
```bash
docker compose -f docker-compose.dev.yml build api worker
docker compose -f docker-compose.dev.yml up -d api worker
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml --profile migrate up migrate
```

### Docker (producción — desde `/var/www/sedia/`)
```bash
docker compose build api worker && docker compose up -d api worker
docker compose --profile migrate up migrate
```

## Architecture

### Monorepo layout
- Raíz (`/`) — Frontend React (Vite + Tailwind CSS + TypeScript)
- `backend/` — API Fastify + Worker + Scheduler (TypeScript + node-postgres)

### Three backend processes
1. **API** (`src/main.ts`) — Fastify REST, Swagger UI en `/docs`
2. **Worker** (`src/worker.ts`) — Loop que reclama jobs con `FOR UPDATE SKIP LOCKED`
3. **Scheduler** (`src/workers/scheduler.ts`) — Cron cada 5 min, encola syncs por tenant

### Backend layers
```
api/routes/         → HTTP handlers (Fastify)
api/middleware/     → Auth (auth.middleware.ts), plan/feature gates (plan.middleware.ts)
services/           → Business logic
db/repositories/    → Data access (parametrized SQL, no ORM)
db/migrations/      → Sequential SQL (001..033+)
workers/            → job.worker.ts, scheduler.ts, sifen.worker.ts
config/             → env.ts, logger.ts (Pino)
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

### Frontend
- SPA React sin router — navegación por estado en `App.tsx` con `PAGE_ACCESS` map
- `contexts/AuthContext.tsx` — Auth state (token en localStorage como `saas_token`)
- `contexts/TenantContext.tsx` — Tenant seleccionado
- `lib/api.ts` — HTTP client centralizado
- Tailwind CSS, Lucide icons, Tremor charts, Recharts

### Job types
`SYNC_COMPROBANTES`, `DESCARGAR_XML`, `ENVIAR_A_ORDS`, `SYNC_FACTURAS_VIRTUALES`, plus SIFEN jobs via `sifen.worker.ts`

### Data flow
```
Marangatu (Puppeteer scraping) → comprobantes → eKuatia (XML + CAPTCHA) → Oracle ORDS
                                                                        → SIFEN (factura electrónica)
```

## Key Modules

- **SIFEN** — Facturación electrónica completa. Libs: `facturacionelectronicapy-xmlgen`, `facturacionelectronicapy-xmlsign`, `facturacionelectronicapy-setapi`, `facturacionelectronicapy-kude`. Services: `sifen*.service.ts`, worker: `sifen.worker.ts`
- **Billing** — Suscripciones con Bancard checkout, features por plan, addons modulares
- **Bancos** — Import CSV extractos bancarios, conciliación automática
- **Anomalías** — Detección anomalías fiscales con forecast

## Key Conventions

- **SQL directo** con `pg` — parámetros `$1, $2...`, sin ORM
- **Credenciales** cifradas AES-256-GCM (`crypto.service.ts`) — campos `*_encrypted` en `tenant_config`
- **Passwords de usuario** hasheadas con PBKDF2-SHA512 (100k iterations, salt aleatorio) en `auth.service.ts`
- **Migraciones** SQL secuenciales: `backend/src/db/migrations/NNN_nombre.sql`
- **Multitenant**: todas las tablas tienen `tenant_id`. RBAC con roles en tabla `roles`
- **Idioma**: español para dominio (comprobantes, tenants, facturas), inglés para patrones técnicos
- **In-memory caching**: pattern `Map<key, { value, cachedAt }>` con TTL manual (auth tokens 120s, addon features 60s)
- **Storage**: Cloudflare R2 en prod, buffer directo en dev (`R2_ENABLED=false`)
- **Validación**: Zod
