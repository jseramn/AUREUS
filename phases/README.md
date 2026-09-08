# Fases — Fábrica AUREUS v1 (Cursor-native)

```
RAW → FILTERED → RESEARCHED → MARKET_BRIEFED → SPEC_READY → DEPLOYED → REPORTED
                ↘ DISCARDED (cualquier fase no-terminal, con razón)
```

| # | Fase | Transición | Implementación | Agente |
|---|------|-----------|----------------|--------|
| 1 | **Criba** | `RAW → FILTERED` (o `DISCARDED`) | `01-criba/` — completa (normalize + sanitize + filters + ingest) | `criba` |
| 2 | **Investiga** | `FILTERED → RESEARCHED → MARKET_BRIEFED` | agente + `fabrica advance` | `investiga` |
| 3 | **Forja** | `→ SPEC_READY` | `03-forja/` — schema zod del site-spec | `forja` |
| 4 | **Construye** | `→ DEPLOYED` | agente (`grok-4.5`, background) + `fabrica deploy` | `construye` |
| 5 | **Reporta** | `→ REPORTED` | `fabrica report` | `orquestador` |

## 01-criba

- `normalizer.ts` — record Apify (permisivo) → `Business` canónico **sanitizado**
  (teléfono E.164 con default `+57` para celulares colombianos, URLs http(s),
  rating 0..5). La URL de la ficha de Maps NO cuenta como website.
- `sanitize.ts` — sanitizadores campo por campo + `E164` (fuente única del regex).
- `filters.ts` — `has_website` (premisa ética, siempre ON), `vertical_mismatch`.
- `ingest.ts` — dataset JSON/NDJSON → store en una sola escritura (`store.batch`),
  descartes persistidos con razón, dedup cross-batch, slug default en FILTERED.

## 03-forja

- `site-spec.ts` — `SiteSpecSchema` (zod): bloque de datos Apify-only + prosa.
  `validateSiteSpec()` (errores legibles), `isContactable()`, `SLUG`, `E164`.
  URLs restringidas a http(s) — `z.string().url()` solo acepta demasiado.

## Tests

`npm test` corre `node --test` sobre `phases/**/*.test.ts` y
`orchestration/**/*.test.ts`: criba (premisa ética + wiring de sanitize),
sanitize (contratos E164/SLUG), site-spec (schema + XSS) y state machine
(transiciones forward-only, discard terminal, corrupción, batch, locks).

## Legacy

Las fases v2026.07 (Sondeo/Destilación/Materialización vía Grok/Mistral/z.ai)
fueron reemplazadas por los agentes Cursor. Referencia histórica en `docs/` y
`templates/`; terminología en `docs/GLOSARIO.md` §11.
