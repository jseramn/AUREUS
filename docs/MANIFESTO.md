# AUREUS — Manifiesto

AUREUS es la destilación, en framework, de una máquina alquímica real y funcionando: un pipeline que toma **plomo** — negocios locales sin presencia web, matter bruto raspado de Google Maps — y lo transmuta, en cinco fases reverberantes, en **oro vendible** — productos web completos empaquetados como `.tar`, listos para que un humano los cure y los venda.

## Visión

La visión original del creador es precisa y no se toca: **ningún negocio con web ingresa al horno** (filtro `has_website` hardcoded ON — la premisa ética del proyecto es *"servir a quien no tiene"*). Cada negocio es una unidad de trabajo soberana que avanza por una state machine idempotente, reanudable y observable. Si el pipeline crashea a la mitad de 500 negocios, se levanta desde el último estado de cada uno. Si la UI de un servicio cambia, se arregla un JSON de selectores, no el código. Si una cuenta cae en muro de reauth, se rota a la siguiente con cooldown.

## Principios

1. **Libertad Primero.** AUREUS no te ata a grok, ni a Mistral, ni a z.ai, ni a Node, ni a Claude. Cada fase es un *prompt atom* con variables `{{DELIMITADAS}}`, cada worker es una función pura `(Business, Deps) → Result`, cada cuenta es reemplazable, cada servicio se abstrae tras una interfaz.
2. **Soberanía del creador.** El humano **nunca** es eliminado del bucle en los puntos críticos: la curación del portfolio, la decisión de vender, la decisión de publicar. La automatización llega hasta `TAR_DOWNLOADED`; ahí comienza, deliberadamente, el trabajo humano.
3. **Ética "Todo o nada".** Un lote no se "vende a medias". Las 5 fases se completan, se auditan, se curan, o no se entregan. Un `.tar` corrupto se detecta por tamaño, se marca `failed`, se reintenta. Un research huérgano sin build no es producto.
4. **Context as Code.** Cada fase tiene su system prompt versionado en `templates/prompts/`. El contexto no se improvisa: se guarda, se diffa, se versiona.
5. **Stateful Resume, Always.** Toda unidad de trabajo es una fila en una state machine persistente. Cualquier crash es recuperable. Idempotencia es ley.
6. **Evaluation-First.** Ninguna fase avanza sin pasar un gate. En 2026 los gates son `LLM-as-Judge` con rúbrica, no solo `min_chars`. Lo que no se mide no se entrega.
7. **Modular Prompt Atoms.** Un prompt = una responsabilidad = un archivo. Autocontenido, con schema de output declarado, instrucción de self-critique, y fallback embebido.
8. **Batch Intelligence.** Lotes seriales con `batch_size`, `concurrency`, `backpressure`, reintentos con backoff exponencial, y `batch_size_dynamic` que se adapta a rate-limits observados.
9. **Provenance or it Didn't Happen.** Cada artefacto lleva un sidecar de auditoría con `businessId`, `accountId`, timestamps, señales, source path. Trazabilidad total para la venta.
10. **Selectors over Spaghetti.** Toda interacción DOM vive en bundles JSON con fallback jerárquico. Una UI que cambia se repara en un archivo, no en una release.

## Carga y generación de planes

Cuando cargas AUREUS en cualquier agente (Claude Project, `.cursorrules`, system prompt de CLI, skill de opencode), el framework **no es pasivo**: expone un *meta-prompt orquestador* (`agents/orchestrator.md`) que, al recibir un objetivo de negocio en lenguaje natural — *"40 sitios para restaurantes en Cartagena en 18 días"* — devuelve un plan completo: sizing de lotes, configuración de variables por fase, timeline, gates, estimación de costos, riesgos. El framework vive cuando se le pregunta *"¿cómo ejecuto esto?"*.

## Genealogía

AUREUS es la destilación en framework del pipeline *legacy-factory* (privado, TypeScript + Playwright + SQLite). De ese proyecto hereda: la state machine de 7 estados, la lógica de filtros de Fase 1, el merger de Fase 3, el patrón batch/worker, el account rotation, los selectors-as-data y el header de provenance. Aquí viven las **piezas portables** (sin dependencias browser ni nativas); los patrones browser/stealth se conservan como referencia en `docs/PHASES.md`.
