# AUREUS — Fábrica de páginas web en lotes

> Plomo (negocios sin web, Apify/Google Maps) → oro vendible (Next.js en
> `https://<slug>.example.com`) · Cursor-native · AGPL-3.0

```
RAW → FILTERED → RESEARCHED → MARKET_BRIEFED → SPEC_READY → DEPLOYED → REPORTED
 └─ criba ─┬──── investiga ────┬─── forja ──┬──── construye ────┬── reporta ─┘
           └──────── cualquier fase puede → DISCARDED (con razón) ──────────┘
```

| Agente | Qué hace | Modelo |
|--------|----------|--------|
| `orquestador` | Lee el store y **despacha**. Nunca construye. | grok-4.6, NUNCA Fast |
| `criba` | Normaliza + sanitiza Apify → FILTERED / DISCARDED | grok-4.6, NUNCA Fast |
| `investiga` | Research + brief; **capta o inventa** identidad de marca | grok-4.6, NUNCA Fast |
| `forja` | Arma site-spec (zod) → SPEC_READY | grok-4.6, NUNCA Fast |
| `construye` | One-shot Next.js + deploy → DEPLOYED | **grok-4.6, NUNCA Fast** |

---

## 0. Prerrequisitos (una sola vez)

| # | Qué | Cómo saber que está OK |
|---|-----|------------------------|
| 1 | Node ≥ 18.17 + npm | `node -v` |
| 2 | `gh` autenticado en GitHub (scope `repo`) | `gh auth status` |
| 3 | Vercel CLI autenticado (cuenta que pueda desplegar en tu apex) | `vercel whoami` |
| 4 | Wildcard DNS `*.TU_DOMINIO` → `cname.vercel-dns.com` en **tu** dominio | `dig +short foo.TU_DOMINIO` |
| 5 | Cursor Cloud Secret `GH_TOKEN` = PAT de GitHub con scope `repo` | Cloud Agents → Secrets |
| 6 | Este repo en `main` actualizado | `git pull origin main` |

```bash
git clone https://github.com/jseramn/AUREUS.git && cd AUREUS
npm install
cp .env.example .env   # edita FABRICA_DOMAIN / FABRICA_GH_ORG
```

`.env` mínimo:

```bash
FABRICA_STATE=./state/pipeline.json
FABRICA_DOMAIN=example.com
FABRICA_GH_ORG=YOUR_GITHUB_ORG
# GH_TOKEN lo inyecta Cursor Cloud Secrets; en local usa `gh auth`.
```

---

## 1. Guía E2E completa — de dataset a sitios vivos

Esta es la ruta canónica. Cada paso tiene comando + verificación. Si un paso
falla, **no avances**: lee el error y corrige.

Usa el dataset sintético `examples/sample-apify.json` (nombres de restaurantes
de Cartagena de muestra; no son negocios reales). Sustitúyelo por tu JSON de
Apify cuando tengas leads propios.

### Paso A — Preparar el dataset Apify

El CLI espera un **JSON array** (o NDJSON). Campos útiles (schema permisivo):

```json
[
  {
    "title": "Nombre del negocio",
    "phone": "+57 300 1234567",
    "website": null,
    "street": "Cra. 1 #2-3",
    "city": "Cartagena de Indias",
    "countryCode": "CO",
    "categoryName": "Médico",
    "categories": ["Médico"],
    "url": "https://www.google.com/maps/search/?api=1&query=...",
    "totalScore": 4.9,
    "reviewsCount": 120
  }
]
```

- `website` poblado → **DESCARTADO** (`has_website`). La URL de Maps **no** cuenta.
- Sin teléfono E.164 saneable → el lead puede pasar FILTERED pero **forja lo
  descarta** (`sin_contacto_verificable`). Prioriza móviles `+57 3xx`.
- Si Apify te entrega **XML** (como el crawler de Places), conviértelo primero
  (ver `docs/T7_E2E.md` o el script histórico en `output/t7/`).

Verificación: `jq 'length' examples/sample-apify.json` → número de items.

### Paso B — Ingest (criba)

```bash
npm run fabrica -- ingest examples/sample-apify.json
# opcional: --limit 50  --dry-run  --vertical <v>
npm run fabrica -- state
npm run fabrica -- list --stage FILTERED --limit 20
```

Esperado: `accepted` + `discarded.has_website` + `duplicates`. Store en
`state/pipeline.json` (o `FABRICA_STATE`).

### Paso C — Seleccionar el lote

```bash
# Ranking mental: móvil CO + más reseñas + vertical vendible
npm run fabrica -- list --stage FILTERED
```

Decide `X` (recomendado primer lote: **3–10**; máx. 3 `construye` en paralelo).

### Paso D — Orquestar (Cursor)

En el chat de Cursor, con este repo abierto:

```
@orquestador corre un lote E2E de X leads FILTERED.

Reglas:
- Prioriza teléfono móvil (+57 3xx) y más reseñas.
- Máximo 3 construye simultáneos.
- Lee docs/DESIGN.md (identidad de marca + densidad de confianza).
- Toda la fábrica → **grok-4.6**, NUNCA Fast (construye en background).
- Dominio FABRICA_DOMAIN, org FABRICA_GH_ORG.
- Al terminar: state + list REPORTED + URLs + smoke.
```

Sustituye `X` por el número. El orquestador despacha; **tú no construyes a mano**.

Flujo interno por lead:

1. **investiga** → `output/02-research/<id>.md` + `output/02-market-brief/<id>.md`
   → `advance RESEARCHED` → `advance MARKET_BRIEFED`
2. **forja** → `output/03-site-spec/<id>.json` → `fabrica forja <id> --spec …`
3. **construye** → `sites/<slug>/` + `npm run build` +  
   `fabrica quality sites/<slug>` (**PASS obligatorio**) +  
   `fabrica deploy <id> --dir sites/<slug> --domain $FABRICA_DOMAIN --org $FABRICA_GH_ORG`
4. Smoke (nombre + `wa.me/<tel>`) → DEPLOYED → reporte → `fabrica report <id>`

> **Quality gate:** el deploy **bloquea** sitios demasiado simples (sin
> framer-motion, &lt;8 secciones, CSS delgado, tipografía Inter-sola, sin FAQ/
> método/float WA). Smoke ≠ calidad. Ver `phases/04-construye/quality-gate.ts`.

### Paso E — Verificar

```bash
npm run fabrica -- state
npm run fabrica -- list --stage REPORTED
curl -fsSL "https://<slug>.$FABRICA_DOMAIN" | grep -E 'wa\.me/|<title>'
```

Smoke OK = HTTP 200 + nombre exacto del negocio + `wa.me/<dígitos>` en el HTML.
DNS pendiente (curl no resuelve) ≠ fallo de build: el lead queda DEPLOYED con
`smoke=pendiente`; re-verifica en minutos.

### Paso F — Entregar al comercial

Por cada REPORTED: URL, nombre, vertical, ciudad, teléfono, ángulo de venta
(3 líneas del market brief). Plantilla en `docs/t7-reports/`.

---

## 2. CLI de referencia

```bash
npm run fabrica -- ingest <dataset.json> [--limit N] [--dry-run] [--reset-existing]
npm run fabrica -- state                      # conteos
npm run fabrica -- state <businessId>         # detalle
npm run fabrica -- list [--stage STAGE] [--failed] [--limit N]
npm run fabrica -- advance <id> RESEARCHED|MARKET_BRIEFED --output <path>
npm run fabrica -- forja <id> --spec <spec.json>
npm run fabrica -- quality <sites/slug>       # gate de densidad (bloquea simple)
npm run fabrica -- deploy <id> --dir sites/<slug> --domain <apex> --org <gh-org>
npm run fabrica -- report <id>
npm test                                      # suite gratis (~49 tests)
```

Nota npm: siempre `--` antes de los flags. Alternativa: `npx tsx cli/fabrica.ts …`.
`deploy` corre `quality` automáticamente y **aborta** si el sitio es demasiado simple.

---

## 3. Reglas duras (todas las fases)

1. **Contacto = Apify sanitizado.** Teléfono E.164, URLs http(s), rating 0..5.
   La prosa nunca alimenta teléfono/dirección/IG/URLs.
2. **Sin E.164 → DISCARDED** (`sin_contacto_verificable`). Sin `wa.me` no hay sitio.
3. **`has_website` ON.** Maps URL ≠ website.
4. **Identidad de marca:** research la captura o la inventa
   (`identidad: capturada|inventada`) según `docs/DESIGN.md`. Inventar
   identidad visual ≠ inventar datos de contacto.
5. **Imágenes:** CSS / SVG inline / patrones. Cero stock, cero PII.
6. **Densidad de confianza:** ≥8 secciones con contenido real (ver DESIGN.md §7).
   Estándar vivo: el mejor sitio en `sites/` (referencia: dense scaffold).
   **Enforce:** `fabrica quality` / `fabrica deploy` FALLAN sin framer-motion,
   secciones, tokens CSS, tipografía display+body o señales FAQ/método/float WA.
   Smoke nombre+wa.me **no** sustituye este gate (`phases/04-construye/quality-gate.ts`).
7. **Testimonios:** solo rating/reseñas reales del YAML. Sin nombres inventados.
8. **Política de modelos:** **toda la fábrica = `grok-4.6`**, **NUNCA Fast**
   (orquestador, criba, investiga, forja, construye). Sin Composer ni GLM.
   Si Grok imprime tool-calls como texto: reintenta; si persiste, anota y sigue.

---

## 4. Estructura

```
AUREUS/
├── .cursor/agents/     # orquestador · criba · investiga · forja · construye
├── cli/fabrica.ts      # CLI del pipeline
├── orchestration/      # state-machine JSON (lockfile, atomic write)
├── phases/
│   ├── 01-criba/       # normalize · sanitize · filters · ingest
│   └── 03-forja/       # site-spec zod
├── docs/
│   ├── DESIGN.md       # 7 decisiones + anti-checklist (lectura de construye)
│   ├── GLOSARIO.md
│   ├── T7_E2E.md       # resultado del primer lote
│   └── T8_BATCH.md     # runbook corto del lote de 10
├── sites/              # builds (gitignored) — viven en Vercel + GH
├── output/             # artifacts por fase (gitignored)
└── state/              # pipeline.json (gitignored)
```

---

## 5. Auth que no se pierde (Cloud Agents)

Cada VM de Cursor Cloud es efímera. Los tokens pegados en el chat **mueren**
con la VM. Lo que persiste:

1. **Cursor → Cloud Agents → Secrets → `GH_TOKEN`** = PAT de GitHub con scope `repo`.
2. Vercel: `vercel login` una vez por máquina / o token en Secrets si aplica.
3. DNS wildcard: una sola vez en tu registrador DNS.

Sin `GH_TOKEN`, `fabrica deploy` no puede crear el repo GitHub (el token
integrado `cursor[bot]` lee pero no escribe fuera del run). Workaround
documentado en T7: deploy solo-Vercel + avance manual del store — **no es el
camino de producción**.

---

## 6. Troubleshooting rápido

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| `has_website` descarta de más | Apify metió Maps en `website` | solo `website` cuenta; Maps va en `url`/`googleMapsUrl` |
| forja: teléfono inválido | no E.164 | revisa sanitize; CO default `+57` |
| deploy: `Resource not accessible` | sin PAT (scope `repo`) | Secret `GH_TOKEN` |
| smoke `contenido_malo` | HTML sin nombre/wa | el build mintió — rebuild |
| smoke `pendiente` | DNS propagando | esperar; deployment Vercel ya READY |
| El modelo imprime `<tool_call>` | tool-call como texto | reintentar una vez; si persiste, anotar y seguir |
| store vacío tras `cd sites/…` | CLI busca package `aureus` hacia arriba | corre fabrica desde la raíz |

---

## 7. Prompt listo para pegar (lote de X)

```
@orquestador

Dataset: examples/sample-apify.json (sintético) o <ruta al JSON Apify ya ingerido>
Lote: X leads FILTERED.

Prioridad: móvil +57 3xx, más reseñas, verticales vendibles (salud, legal,
ingeniería, servicios locales). Máx 3 construye en paralelo.

Env: FABRICA_DOMAIN=example.com · FABRICA_GH_ORG=YOUR_GITHUB_ORG
Modelos: toda la fábrica = grok-4.6, NUNCA Fast
Calidad: docs/DESIGN.md (identidad capturada|inventada + densidad §7)
Deploy: fabrica deploy completo (GH repo + Vercel + subdominio + smoke)

Al final dame: tabla businessId | slug | URL | smoke | stage
y npm run fabrica -- state.
```

---

## Licencia

**GNU AGPL-3.0-or-later** — ver `LICENSE`. Créditos en `CREDITS.md`.
