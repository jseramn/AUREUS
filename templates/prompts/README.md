# templates/prompts

Prompt atoms de AUREUS. Un prompt = una responsabilidad = un archivo.

## Convención de variables

Todas las variables interpolables se delimitan con `{{UPPER_SNAKE_CASE}}`. El interpolador:
- regex global case-insensitive: `/\{\{\s*KEY\s*\}\}/gi`
- admite whitespace interno: `{{ KEY }}` == `{{KEY}}`
- escapa `$` en el replacement (protege nombres tipo "Pizzería $100")

## Resolución jerárquica (override)

El worker busca cada plantilla en orden:
1. `$MM_PROMPTS_DIR/<name>.md` (override explícito)
2. `<cwd>/templates/prompts/<name>.md`
3. fallback embebido en el worker (mínimo viable)

## Archivos

| Archivo | Fase | Variables |
|---|---|---|
| `filter-agent.md` | 1 Criba | `{{BUSINESS_JSON}}`, `{{VERTICAL_TEMPLATE}}` |
| `research.md` | 2 Sondeo | `{{BUSINESS_NAME}}`, `{{BUSINESS_JSON}}` |
| `meta-prompt.md` | 3 Forja | `{{TARGET_NAME}}`, `{{INSTAGRAM_HANDLE}}`, `{{WEB_URL}}`, `{{ADDITIONAL_SOURCES}}`, `{{GROK_RESEARCH}}`, `{{VERTICAL_TEMPLATE}}`, `{{BRAND_KIT_REQUIRED}}` |
| `mistral-agent.md` | 4 Destilación | (system prompt del agente, sin interpolación) |
| `builder.md` | 5 Materialización | `{{MISTRAL_RESEARCH}}` |

## Judge rubrics

`judge-rubrics/<fase>.md` — rúbricas LLM-as-Judge. Output JSON estricto `{score, dimensions, verdict, repair_hint}`. `verdict ∈ {advance, repair, discard, human}`.

## Self-critique

Todo prompt atom incluye una sección `[SELF-CRITIQUE]` que el LLM ejecuta antes de emitir. Es el primer bucle constitucional; el Judge es el segundo.
