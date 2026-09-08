# JUDGE — AUREUS LLM-as-Judge (sistema)

El Judge es el segundo bucle constitucional de AUREUS (el primero es el `[SELF-CRITIQUE]` de cada prompt atom). Decide si un artefacto avanza, se repara, se descarta o requiere humano.

## Filosofía

- **Barato y rápido:** el Judge corre en `JUDGE_MODEL` (default `gpt-4.1-mini`), no en el modelo de producción.
- **Declarativo:** cada fase tiene su rúbrica en `templates/prompts/judge-rubrics/<fase>.md`. El Judge no improvisa criterios; aplica la rúbrica.
- **Reparable, no binario:** un `verdict=repair` viene con `repair_hint` que el worker usa para re-intentar con un prompt dirigido a las dimensiones flacas.
- **Soberano en lo humano:** el Judge **nunca** autoriza venta. El sign-off `sellable` es humano (gate pre-sell).

## Contrato del Judge

```
Input:  artefacto + rúbrica + QUALITY_THRESHOLD_LLM_JUDGE
Output: {
  "score": <0-1>,
  "dimensions": { "<dim>": <0-1>, ... },
  "verdict": "advance" | "repair" | "discard" | "human",
  "repair_hint": <string|null>
}
```

### Verdicts

| Verdict | Acción del worker |
|---|---|
| `advance` | `pipelineStore.advance(...)` al siguiente stage. |
| `repair` | re-intenta con prompt dirigido por `repair_hint` (hasta `MAX_ATTEMPTS`). |
| `discard` | `pipelineStore.markFailed` con reason; cuarentena. |
| `human` | pausa; emite marker `[NEEDS_HUMAN_*]`; notifica. |

## Cómo invocar (patrón port)

```ts
const result = await judge({
  rubric: loadRubric("03-forja"),
  artifact: metaPromptMd,
  threshold: config.QUALITY_THRESHOLD_LLM_JUDGE,
  model: config.JUDGE_MODEL,
});
if (result.verdict !== "advance") { /* repair / discard / human */ }
```

El `judge()` concreto es *bring-your-own* (depende del provider). AUREUS provee la firma en `orchestration/judge.ts`.

## Rúbricas

Una por fase en `templates/prompts/judge-rubrics/`:
- `01-criba.md` — calidad del negocio cribado.
- `02-sondeo.md` — research + detección de alucinación.
- `03-forja.md` — meta-prompt accionable + Brand Kit.
- `04-destilacion.md` — informe de deep research.
- `05-materializacion.md` — `.tar` buildable + brand aplicado.

## Calibración

Tras cada lote, los artefactos rechazados en curación (`sellable:false`) son datos de entrenamiento. Re-etiquetar y ajustar `QUALITY_THRESHOLD_LLM_JUDGE` por vertical cada N lotes (ver `docs/ADOPTION.md` → Evolución).
