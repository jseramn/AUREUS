# AUREUS — Guía de Adopción

AUREUS es agnóstico al entorno. Carga las piezas que necesites; descarta el resto.

## Quickstart (90 segundos)

```bash
git clone <este-repo> AUREUS
cd AUREUS
pnpm install            # o: npm install
pnpm aureus plan        # plan completo a partir de tu objetivo
pnpm aureus doctor      # verifica entorno + state
```

## Cargar en Claude Project

1. Crea un Project nuevo.
2. Sube como **knowledge**:
   - `docs/MANIFESTO.md`
   - `docs/PHASES.md`
   - `templates/prompts/*.md` (los 5 atoms)
   - `agents/orchestrator.md`
   - `agents/judge.md`
3. **System prompt:**
   > Eres un operador AUREUS. Ante un objetivo de negocio, ejecuta el meta-prompt orquestador de `agents/orchestrator.md`. Ante un artefacto, aplícale la rúbrica Judge de `templates/prompts/judge-rubrics/<fase>.md`. Respeta el registry `variables/registry.json`.

## Cursor / Windsurf

Crea `.cursorrules` (o `.windsurfrules`) en tu workspace con:

```
Eres un operador AUREUS v2026.07.
Framework de 5 fases: Criba → Sondeo → Forja → Destilación → Materialización.
State machine: RAW→FILTERED→GROK_RESEARCHED→META_PROMPTED→MISTRAL_RESEARCHED→ZAI_BUILT→TAR_DOWNLOADED.
Ante "AUREUS: plan para <objetivo>" → ejecuta agents/orchestrator.md.
Ante un artefacto de fase → aplica templates/prompts/judge-rubrics/<fase>.md.
Variables canónicas: variables/registry.json.
```

Comando natural: *"AUREUS: plan para 40 restaurantes en Cartagena en 18 días"*.

## opencode / agente CLI

Skill `aureus-plan`:
- **Trigger:** "plan de fábrica", "generar y vender sitios", "aureus plan".
- **Body:** el contenido de `agents/orchestrator.md`.
- Opcionalmente invoca `pnpm aureus plan` para el template estructurado.

## Desde terminal (una fase)

```bash
pnpm aureus status                          # estado del pipeline
pnpm aureus run --phase criba --limit 3     # smoke
pnpm aureus run --phase forja               # FS puro, segundos
```

> Los workers browser/API (Fases 2, 4, 5) requieren tu propio `Worker` port. AUREUS provee la interfaz y el state machine; el worker concreto es *bring-your-own* (ver `phases/README.md` y la referencia legacy-factory).

## Modo ligero (contexto pequeño)

Carga solo:
- `variables/registry.json`
- `agents/orchestrator.md`
- la rúbrica Judge de la fase activa (`templates/prompts/judge-rubrics/<fase>.md`)
- el prompt atom de la fase activa

Descarta el resto. Re-carga progresiva por fase.

## Runtime no-Node

El `PipelineStore`, los prompt atoms, el registry y el merger son portables. Reescribir workers en Python/Bash es directo porque la lógica es: *leer input → interpolar plantilla → llamar servicio → gate → escribir output → advance*.

## Verticalización (forks)

Un fork = nuevo `templates/prompts/meta-<vertical>.md` + ajuste de filtros Fase 1 + `VERTICAL_TEMPLATE=<vertical>`. El esqueleto no se toca. Ejemplos: restaurants, clinics, salons, mechanics, real-estate.
