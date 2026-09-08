# orchestration/selectors

Selector bundles as data. When a service UI changes, fix one JSON file, not code.

## Convención

Cada clave mapea a un **array** de entradas; el array define el orden de fallback. El `locate()`/`pickSelector()` del worker prueba cada entrada en orden y usa la primera que matchea.

## Prioridad jerárquica (recomendada al escribir entradas)

`role` > `aria-label` > `text` > `placeholder` > CSS.

Los selectores basados en `role`/`aria-label`/`text` sobreviven a reshuffles de CSS classes; el CSS es último recurso.

## Formato de entrada

```ts
{ "role": "textbox", "name": "Chat" }
{ "ariaLabel": "Submit" }
{ "text": "New chat" }
{ "placeholder": "Ask anything" }
{ "css": "textarea[autocomplete='off']" }
```

## Archivos

- `grok.json` — grok.com (Fase 2).
- `zai.json` — z.ai fullstack-dev (Fase 5).
- `gemini.json` — gemini.com (legacy Fase 4, referencia histórica).
