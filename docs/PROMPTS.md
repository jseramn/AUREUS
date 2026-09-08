# Prompt — Cloud Agent (aterrizar fábrica en este repo)

Pégalo en una **nueva** instancia Cloud Agent cuyo repo sea este checkout
público (`https://github.com/jseramn/AUREUS.git`, o el fork bajo
`YOUR_GITHUB_ORG`). El secret `GH_TOKEN` (PAT con scope `repo`) debe estar en
Cloud Agents → Secrets.

```
Eres el agente de aterrizaje de AUREUS. Objetivo: dejar main con la fábrica v1
lista para lotes E2E.

1) Auth: verifica `echo ${GH_TOKEN:+SET}` y `gh auth status`. Si GH_TOKEN no
   está, PARA y reporta (el secret no llegó a la VM).

2) Working tree:
   git fetch origin && git checkout main && git pull origin main
   Confirma que el remoto es este repo público (o YOUR_GITHUB_ORG/AUREUS).
   No hagas fetch de mirrors privados ni de branches de ops.

3) Config de fábrica (no commitees secretos):
   cp .env.example .env
   FABRICA_DOMAIN=example.com
   FABRICA_GH_ORG=YOUR_GITHUB_ORG

4) Smoke del repo:
   npm install && npm test
   npm run fabrica -- state
   Verifica que README.md es la guía E2E y que TODOS los agentes en
   .cursor/agents/ tienen model: grok-4.6, NUNCA Fast.

5) Reporta: SHA de main, `npm test` OK/FAIL.
   NO corras un lote todavía — el humano te soltará el dataset en el siguiente mensaje.
```

---

# Prompt — Lote E2E (humano → agente, con dataset)

Pégalo cuando la instancia ya esté en `main` limpio. Para una prueba usa
`examples/sample-apify.json` (sintético).

```
@orquestador

Ejecuta el E2E completo de AUREUS según README.md.

1. Ingest: npm run fabrica -- ingest examples/sample-apify.json
   (o <RUTA_DATASET.json> si el humano te pasa otro)
2. Lote: X leads FILTERED (prioridad móvil +57 3xx + más reseñas).
3. Máx 3 construye en paralelo.
4. Env: FABRICA_DOMAIN=example.com · FABRICA_GH_ORG=YOUR_GITHUB_ORG
5. Modelos: toda la fábrica = grok-4.6, NUNCA Fast
6. Calidad: docs/DESIGN.md (identidad capturada|inventada + densidad §7)
7. Deploy completo: fabrica deploy (GH repo + Vercel + subdominio + smoke)
8. Al final: tabla businessId|slug|URL|smoke|stage + npm run fabrica -- state

Sustituye X. No inventes contactos. Si un lead falla
2 veces con el mismo error, DESCÁRTALO y sigue.
```
