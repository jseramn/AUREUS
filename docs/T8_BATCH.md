# T8 — Lote de 10 leads (desde Cursor)

Objetivo: validar throughput de la fábrica con 10 leads FILTERED, corriendo
los agentes nativos de Cursor. Para una prueba local usa el dataset sintético
`examples/sample-apify.json`.

## Prerrequisitos (una sola vez)

| Item | Cómo verificar |
|------|----------------|
| Secret `GH_TOKEN` en Cursor (Cloud Agents → Secrets) | PAT con scope `repo` |
| Wildcard `*.example.com` → `cname.vercel-dns.com` | en tu registrador DNS |
| Vercel CLI autenticado | `vercel whoami` |
| `gh` autenticado (scope `repo`) | `gh auth status` |
| Branch de trabajo actualizada | `git pull` |

En la raíz de AUREUS crea `.env` (o exporta):

```bash
export FABRICA_STATE=./state/pipeline.json   # o el store que uses
export FABRICA_DOMAIN=example.com
export FABRICA_GH_ORG=YOUR_GITHUB_ORG
```

## Pasos

1. **Abre AUREUS en Cursor** (la branch con la fábrica).
2. **Ingesta** (si es dataset nuevo):
   ```bash
   npm run fabrica -- ingest examples/sample-apify.json
   npm run fabrica -- state
   ```
3. **Invoca al orquestador** en el chat de Cursor:
   > @orquestador procesa 10 leads FILTERED: prioriza teléfono móvil (+57 3xx)
   > y más reseñas. Lotes de construye de a 3 máximo.
4. El orquestador despacha por fase (política de modelos fija):
   - `investiga` ×N (grok-4.6, NUNCA Fast) → RESEARCHED → MARKET_BRIEFED
   - `forja` ×N (grok-4.6, NUNCA Fast) → SPEC_READY
   - `construye` ×N (**grok-4.6**, NUNCA Fast, background) → build + `fabrica deploy`
5. `fabrica deploy <id> --dir sites/<slug>` hace TODO el camino con `GH_TOKEN`:
   repo GitHub privado `YOUR_GITHUB_ORG/<slug>` + push, Vercel prod, subdominio, smoke.
6. Al llegar `DEPLOYED`: reporte ejecutivo → `npm run fabrica -- report <id>`.
7. **Verifica:**
   ```bash
   npm run fabrica -- state
   npm run fabrica -- list --stage REPORTED
   ```

## Guardas del lote

- Máximo **3 `construye` simultáneos** (rate limits de Vercel y del modelo).
- Lead `FAILED` 2 veces con el mismo error → descartar y seguir; no insistir.
- El modelo imprime tool-calls como texto en vez de ejecutarlos? → reintenta el
  turno; si persiste, anota el lead y sigue (ver `construye.md`).
- Smoke = nombre exacto + `wa.me/<tel>` en el HTML. Sin eso no hay REPORTED.

## Métricas a anotar (para el retro)

- Leads/hora de punta a punta; % FAILED por fase; costo aproximado del lote;
  cuántos smoke=pendiente por DNS.
