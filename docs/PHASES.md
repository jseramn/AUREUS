# AUREUS — Las 5 Fases

State machine canónica:

```
RAW → FILTERED → GROK_RESEARCHED → META_PROMPTED → MISTRAL_RESEARCHED → ZAI_BUILT → TAR_DOWNLOADED
```

Cualquier stage puede además ser `FAILED` / `DISCARDED` / `QC_FAILED` (no terminales para reintento).

---

## Fase 1 — La Criba: Captura y Filtrado del Mineral Bruto
`RAW → FILTERED`

**Objetivo:** Transformar un dataset Apify (scrape Google Maps) en una población limpia, normalizada, deduplicada y filtrada para excluir cualquier negocio que ya tenga web.

**Implementación:** `phases/01-criba/` — completa (pure logic, sin browser).
**Prompt atom:** `templates/prompts/filter-agent.md`
**Judge rubric:** `templates/prompts/judge-rubrics/01-criba.md`

**Inputs:** `apify-dataset.json | .ndjson` (auto-detect).
**Variables:** `VERTICAL_TEMPLATE`, `--limit`, `--dry-run`, `--reset-existing`.

**Filter chain (hardcoded):**
1. `schema_error` — zod parse falla.
2. `missing_name` — sin name/title/displayName.
3. `permanently_closed` — `permanentlyClosed === true`.
4. `insufficient_data` — falta name + (phone O address O googleMapsUrl).
5. `has_website` — **premisa ética, siempre ON.**

**Output:** Filas `Business` en estado `FILTERED` + `DiscardReport`.
**Human Gate:** No, salvo si `>40%` descartado por `insufficient_data` (problema de fuente).

---

## Fase 2 — El Sondeo: Investigación Viva
`FILTERED → GROK_RESEARCHED`

**Objetivo:** Por cada negocio, abrir conversación en el LLM de investigación, inyectar JSON + plantilla, esperar respuesta completa (3 señales), extraer del DOM, persistir `.md`.

**Implementación:** `phases/02-sondeo/` — interfaz (`Worker` port); el worker browser concreto vive en *legacy-factory* (`packages/research-grok/`). El router permite reemplazarlo por un agente API con web search.
**Prompt atom:** `templates/prompts/research.md` (interpola `{{BUSINESS_NAME}}`, `{{BUSINESS_JSON}}`).
**Judge rubric:** `templates/prompts/judge-rubrics/02-sondeo.md`

**Variables:** `CONCURRENCY_GROK`, `GROK_TIMEOUT_MS`, `STEALTH_HEADLESS`, `PROXY_HTTPS`, `ACCOUNT_COOLDOWN_MS`, `MAX_ATTEMPTS`.

**3 señales de completitud (patrón browser):** botón "Copy" visible + contenido estabilizado 8s (md5) + indicador "Thinking" gone. Extracción vía DOM (`[data-testid='assistant-turn']` último), sin portapapeles.

**Human Gate:** No por defecto. Sí si `HUMAN_GATE_THRESHOLD=every_batch`.

---

## Fase 3 — La Forja: Síntesis del Meta-Prompt
`GROK_RESEARCHED → META_PROMPTED`

**Objetivo:** Fusionar el `.md` de research con la plantilla maestra, interpolando variables del negocio, produciendo el prompt autocontenido que alimenta la destilación.

**Implementación:** `phases/03-forja/` — completa (pure FS, sin browser). El más rápido y determinista.
**Prompt atom:** `templates/prompts/meta-prompt.md` (UNIFICADO v3 — resuelve el gap de la doble plantilla del original).
**Judge rubric:** `templates/prompts/judge-rubrics/03-forja.md`

**Variables interpoladas:** `{{TARGET_NAME}}`, `{{INSTAGRAM_HANDLE}}`, `{{WEB_URL}}`, `{{ADDITIONAL_SOURCES}}`, `{{GROK_RESEARCH}}`, `{{VERTICAL_TEMPLATE}}`, `{{BRAND_KIT_REQUIRED}}`.

**Fallback inteligente:** si la plantilla no usa `{{GROK_RESEARCH}}`, se adjunta el research al final bajo "## Investigación previa" para no perder contexto. `escapeReplacement()` protege `$` en nombres tipo "Pizzería $100".

**Human Gate:** Sí solo si aparece `[NEEDS_HUMAN_BRAND]` (paleta no extraíble).

---

## Fase 4 — La Destilación: Deep Research Estratégico
`META_PROMPTED → MISTRAL_RESEARCHED`

**Objetivo:** Tomar el meta-prompt y ejecutar investigación profunda con búsqueda web premium para refinar competencia, pricing, gaps y oportunidades — el informe final que se entrega al builder.

**Implementación:** `phases/04-destilacion/` — interfaz; el worker concreto (Mistral Agents API + `web_search_premium`) vive en *legacy-factory* (`packages/research-mistral/`). El router permite otros proveedores.
**Prompt atom:** `templates/prompts/mistral-agent.md` (agent instructions).
**Judge rubric:** `templates/prompts/judge-rubrics/04-destilacion.md`

**Variables:** `CONCURRENCY_MISTRAL` (8), `MISTRAL_REQUEST_TIMEOUT_MS`, `MISTRAL_MODEL`, `MISTRAL_AGENT_ID`, `MIN_OUTPUT_CHARS` (500, ⭐ reemplazable por Judge), `COST_BUDGET_PER_BATCH`.

**Agent provisioning:** si `MISTRAL_AGENT_ID` set → reutiliza; si no → crea y cachea (siguiente run: setear ID en `.env`).
**Human Gate:** No (API automático). Sí si `COST_BUDGET_PER_BATCH` se excede → pausa.

---

## Fase 5 — La Materialización: Construcción y Descarga
`MISTRAL_RESEARCHED → ZAI_BUILT → TAR_DOWNLOADED` (terminal del pipeline automatizado)

**Objetivo:** Inyectar el research final en el builder, esperar la construcción, descargar el `.tar` y escribir el sidecar de auditoría. El humano curará el portfolio.

**Implementación:** `phases/05-materializacion/` — interfaz; el worker browser concreto (z.ai fullstack-dev) vive en *legacy-factory* (`packages/builder-zai/`).
**Prompt atom:** el contenido íntegro de `MISTRAL_RESEARCHED_<id>.md` (z.ai construye del research).
**Judge rubric:** `templates/prompts/judge-rubrics/05-materializacion.md`

**Variables:** `CONCURRENCY_ZAI` (1 — builder pesado), `ZAI_BUILD_TIMEOUT_MS` (30 min), `MIN_TAR_BYTES` (10KB), `ACCOUNT_COOLDOWN_MS`.

**Output:**
- `output/tars/NEGOCIO_<id>.tar`
- `output/tars/NEGOCIO_<id>.tar.meta.json` — auditoría (`businessId`, `accountId`, timestamps, `sizeBytes`, `signals`, `sourceMistralMd`, ⭐`sellable`, ⭐`approvedBy`).

**Human Gate (soberano):** Tras `TAR_DOWNLOADED`, curación manual del portfolio. ⭐ Gate `pre_sell` explícito: sign-off `sellable:true, approvedBy, approvedAt` en el meta antes de ofrecer a cliente.

---

## Mapeo a la implementación original (legacy-factory)

| Fase AUREUS | Paquete original | Estado port |
|---|---|---|
| Fase 1 Criba | `packages/dataset/` | Port completo |
| Fase 2 Sondeo | `packages/research-grok/` | Interfaz + prompt (worker browser en origen) |
| Fase 3 Forja | `packages/prompt-builder/` | Port completo |
| Fase 4 Destilación | `packages/research-mistral/` | Interfaz + agent instructions (worker API en origen) |
| Fase 5 Materialización | `packages/builder-zai/` | Interfaz (worker browser en origen) |
| Transversal | `packages/core/`, `packages/state/`, `packages/browser/`, `packages/orchestrator/` | Ports portable en `orchestration/` |

Ver `docs/CHANGELOG.md` para el mapeo pieza a pieza y los gaps cerrados.
