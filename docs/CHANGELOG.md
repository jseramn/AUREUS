# Changelog

Todos los cambios notables de AUREUS. Versionado `YYYY.MM.patch`.

## 2026.7.1 — Génesis

Framework destilado del pipeline *legacy-factory* (privado), sin tocar el original. Piezas portables; patrones browser como referencia.

### Mapeo desde la implementación original

| Pieza original | En AUREUS | Notas |
|---|---|---|
| `packages/core/src/config.ts` + `.env.example` | `variables/registry.json` | Mismo schema + variables 2026 nuevas |
| `packages/core/src/stages.ts` | `orchestration/state-machine.ts` | State machine idéntica (7 estados) |
| `packages/core/src/business.ts` (`ApifyBusinessSchema`) | `phases/01-criba/schema.ts` | zod, sin cambio |
| `packages/dataset/` | `phases/01-criba/` | Port completo + ⭐ Judge + ⭐ dedup fuzzy |
| `packages/research-grok/` | `phases/02-sondeo/` (interfaz) + `templates/prompts/research.md` | Worker browser se referencia, no se duplica |
| `packages/prompt-builder/merger.ts` | `phases/03-forja/` | Port completo |
| `prompts/meta-prompt.md` (SDD v1) **+** `DEFAULT_TEMPLATE` merger | **UNIFICADO** → `templates/prompts/meta-prompt.md` v3 | ⭐ Gap crítico cerrado |
| `packages/research-mistral/` | `phases/04-destilacion/` (interfaz) + `templates/prompts/mistral-agent.md` | Worker API se referencia |
| `packages/research-gemini/` (deprecated) | Referencia histórica | Patrón reutilizable para forks |
| `packages/builder-zai/` | `phases/05-materializacion/` (interfaz) | Worker browser se referencia |
| `packages/state/pipeline-store.ts` | `orchestration/state-machine.ts` | JSON backend (portable); misma interfaz |
| `packages/state/account-store.ts` | `orchestration/account-pool.ts` | pickAvailable LRU + cooldown |
| `packages/browser/` (stealth, humanizer, vault, selectors) | `orchestration/selectors/` + referencia en `docs/PHASES.md` | Selectors-as-data portado |
| `packages/orchestrator/cli.ts` (`mm`) | `cli/aureus.ts` | `plan`, `doctor`, `status`, `run` |
| PQueue + batch loop en `runner.ts` | `orchestration/batch-orchestrator.ts` | + ⭐ `BATCH_SIZE_DYNAMIC` |
| Header `.md` + `.tar.meta.json` | Provenance (sin cambio) | + ⭐ campo `sellable`/`approvedBy` |

### Gaps cerrados vs el original

1. **Doble meta-prompt divergente** (SDD v1 en disco vs `DEFAULT_TEMPLATE` embebido) → unificado en plantilla v3.
2. **Gates crudos** (`min_chars=500`, `min_tar_bytes=10KB`) → añadido `LLM-as-Judge` con rúbrica por fase.
3. **Sin tracking de costo** → añadido `orchestration/cost-tracker.ts` + `COST_BUDGET_PER_BATCH`.
4. **Batch estático** → añadido `BATCH_SIZE_DYNAMIC` (reduce a la mitad tras ≥3 `429`).
5. **Human gate implícito** → sign-off `sellable` explícito pre-venta en `.tar.meta.json`.

### Variables 2026 añadidas

`MODEL_ROUTER`, `COST_BUDGET_PER_BATCH`, `QUALITY_THRESHOLD_LLM_JUDGE`, `JUDGE_MODEL`, `BATCH_SIZE_DYNAMIC`, `HUMAN_GATE_THRESHOLD`, `VERTICAL_TEMPLATE`, `BRAND_KIT_REQUIRED`, `SALES_PIPELINE_HOOK`.
