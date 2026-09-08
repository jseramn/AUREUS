# AGENTS.md — AUREUS

Fábrica de páginas web en lotes, **Cursor-native**. Convierte leads (Apify /
Google Maps) en sitios Next.js desplegados en `https://<slug>.example.com`.
El `subdominio_slug` **siempre** termina en `-demo` (ej. `demo-site`).
El pipeline lo orquestan los agentes de `.cursor/agents/`; el CLI `fabrica`
maneja el **estado** y el **deploy**.

> Este documento describe el **camino activo (fábrica v1)**. El script legacy
> `aureus` (`cli/aureus.ts`) y los stages `GROK_RESEARCHED` / `META_PROMPTED`
> pertenecen al pipeline **viejo** (Grok → `.tar`) y **no** son el flujo actual.

## Package manager

- **npm** (`package-lock.json`). Instala con `npm install`.
- `pnpm-lock.yaml` es **legacy**; no lo uses para el flujo v1.
- No hay build step para desarrollo: TypeScript corre vía `tsx`.

## Pipeline

```
RAW → FILTERED → RESEARCHED → MARKET_BRIEFED → SPEC_READY → DEPLOYED → REPORTED
```

Cualquier fase puede derivar a `DISCARDED` (con razón). `REPORTED` es terminal.
La state machine vive en `orchestration/state-machine.ts` (JSON idempotente y
reanudable en `state/pipeline.json`).

## CLI

```
npm run fabrica -- <subcomando>
```

Subcomandos: `ingest | state | list | forja | deploy | report`.

- `ingest <dataset.json>` — Apify JSON → FILTERED (criba + sanitize)
- `state` / `state <businessId>` — conteos por stage / detalle de un lead
- `list` — lista leads (businessId, stage, slug, attempts)
- `forja <businessId> --spec <s.json>` — valida site-spec (zod) → SPEC_READY
- `deploy <businessId>` — repo GitHub + Vercel prod + subdominio → DEPLOYED
- `report <businessId>` — marca REPORTED (tras enviar al comercial)

Nota npm: los flags requieren separador `--`, p. ej.
`npm run fabrica -- forja <id> --spec s.json` (o directo:
`npx tsx cli/fabrica.ts forja <id> --spec s.json`).

## Agentes (`.cursor/agents/`)

| Agente | Rol | Modelo |
|--------|-----|--------|
| `orquestador` | Lee el store y despacha; nunca construye | grok-4.6 (fast=false, effort medium) |
| `criba` | Normaliza + sanitiza Apify → FILTERED / DISCARDED | grok-4.6 (fast=false, effort low/medium) |
| `investiga` | Research + brief + identidad de marca | grok-4.6 (fast=false, effort high) |
| `forja` | Arma site-spec (zod) → SPEC_READY | grok-4.6 (fast=false, effort high) |
| `construye` | One-shot Next.js + deploy → DEPLOYED | **grok-4.6** (fast=false, effort high/xhigh) |

Política de modelos: **toda la fábrica corre con `grok-4.6`**, **NUNCA Fast**.
El effort se elige por hardening (`low`/`medium`/`high`/`xhigh`), nunca default/auto.
Sin Composer, sin GLM, sin `grok-4.5`.

## Auth y configuración

- `GH_TOKEN` — PAT de GitHub con scope `repo`, provisto vía **Cursor Cloud
  Secrets** (se inyecta como env var al arrancar cada VM). Necesario para
  `deploy` (crear repos) y para operaciones de escritura en GitHub.
- `FABRICA_DOMAIN=example.com` — apex con wildcard DNS `*.example.com` →
  Vercel (default de `--domain` en `deploy`).
- `FABRICA_GH_ORG=YOUR_GITHUB_ORG` — owner de los repos generados.
- `FABRICA_STATE` — ruta del store (default `./state/pipeline.json`).
- Copia `.env.example` → `.env` y ajusta `FABRICA_DOMAIN` / `FABRICA_GH_ORG`.

## Comandos estándar

- `npm install` — dependencias.
- `npm test` — suite (`node --test` vía `tsx`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run fabrica -- state` — estado del pipeline (read-only).

## Documentación

- **Guía E2E:** `README.md` (pasos A–F: prerrequisitos → ingest → deploy →
  report).
- **Diseño / identidad / política de modelos:** `docs/DESIGN.md`.
- **Prompts de aterrizaje y de lote:** `docs/PROMPTS.md`.

## Runtime (gitignored)

`state/` · `output/` · `sites/` · `node_modules/` — efímeros, no se commitean.
El store es reanudable; borra `state/pipeline.json` para empezar de cero.
