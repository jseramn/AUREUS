# Orquestación AUREUS — árbol de lote

Doctrina operativa del lote. **4 chats de etapa**, hijos adentro, store como memoria.

## El árbol

```
Orquestador del lote (AUREUS / @orquestador)
  - Criba (1 cloud agent por lote, SIN hijos; una pasada CLI)
  - Investiga (1 cloud agent por lote)
      -- hijo lead 1 (nace vacío, investiga SOLO ese negocio, escribe store, muere)
      -- hijo lead 2
      -- … en TANDAS de 10-20, nunca 400 a la vez
  - Forja (igual: 1 agente de etapa, hijos por lead en tandas)
  - Construye (1 agente de etapa; hijos por lead EN FILA: un sitio, publica, el siguiente)
```

## En cristiano

1. **Orquestador** solo mira `npm run fabrica -- state` / `list` y lanza la **siguiente etapa** cuando la anterior cerró. No build, no research, no site-specs.
2. **Cuatro chats**, no cuatrocientos: criba → investiga → forja → construye. Los hijos por lead son subagentes **dentro** del chat de etapa (Task), no cloud agents sueltos.
3. **Criba** = una corrida `npm run fabrica -- ingest <dataset.json>`. Sin hijos. `has_website` → `DISCARDED`.
4. **Investiga / Forja** parten hijos por `businessId` en **tandas de 10–20**. Cada hijo escribe artifacts y hace `advance` / `forja` en el store.
5. **Construye** va **en fila** (Hobby Vercel): un hijo termina deploy+smoke y recién ahí sale el siguiente. Scaffold = **dense scaffold**. Slug `*-demo`, domain `example.com`, org `YOUR_GITHUB_ORG`. Quality-gate obligatorio. Precio / deal-meta **no** va a la web.
6. **Memoria = store** (`FABRICA_STATE` / `state/pipeline-*.json`) vía `npm run fabrica`. El chat no guarda el lote.
7. **Falla un lead** → relanzar **ese** hijo, no la etapa ni el lote.
8. **Modelos:** `grok-4.6` en toda la fábrica, **NUNCA Fast**.

## Dónde vive

| Pieza | Path |
|-------|------|
| Orquestador | `.cursor/agents/orquestador.md` |
| Criba / Investiga / Forja / Construye | `.cursor/agents/*.md` |
| Store / CLI | `npm run fabrica` · `state/` |

`docs/PHASES.md` es legacy (pipeline viejo). Este archivo es el árbol activo.
