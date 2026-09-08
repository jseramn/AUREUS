# Glosario — Ecosistema Fábrica AUREUS

> Terminología completa del proyecto: pipeline, agentes, código, infraestructura, diseño y negocio. Si un término no está aquí, agrégalo cuando aparezca.

---

## 1. Negocio y proyecto

| Término | Definición |
|---|---|
| **Fábrica AUREUS** | El sistema completo de producción de sitios web en lotes: leads de Apify entran, sitios deployados en subdominio salen. Cursor-native (v1). |
| **AUREUS** | Repo `jseramn/AUREUS` (AGPL-3.0). "Framework Soberano para la Fábrica de Páginas Web en Lotes Seriales". v1 = pipeline Cursor-native; v2026.07 = pipeline legacy (Grok/Mistral/z.ai → `.tar`). |
| **Lead** | Un negocio raspado de Google Maps (vía Apify) que es candidato a recibir un sitio web. Unidad de trabajo del pipeline. |
| **Vertical** | Categoría de negocio del lead (spa, restaurante, clínica, gimnasio…). Determina copy, paleta y estructura del sitio. |
| **Pyme** | Pequeña/mediana empresa. El cliente objetivo: negocios locales colombianos sin sitio web propio. |
| **Comercial** | La persona (rep de ventas) que recibe el reporte ejecutivo y cierra la venta por WhatsApp. Dueña del precio y el post-venta. |
| **Precio piso (floor price)** | 500.000 COP. Precio mínimo de oferta de un sitio (`precio_oferta_cop`). |
| **Métrica probada** | 15 leads contactados → 1 venta. Pipeline viejo producía máx ~8 sitios/día. |
| **Demo de venta** | El sitio generado NO reemplaza la web del cliente: es el **gancho comercial** que el comercial muestra por WhatsApp para cerrar. |
| **Ángulo de venta** | 3 líneas del market brief que el comercial usa como pitch. |
| **Reporte ejecutivo** | Entregable final por lead: URL del sitio + nombre + vertical + ángulo de venta + teléfono + rating. Va al comercial. |
| **Wedge (T0)** | La prueba manual de UNA unidad completa del flujo (lead → sitio deployado) ANTES de construir el framework. Gate de T1–T5. |
| **T0–T8** | Las tareas del plan: T0 wedge manual (gate), T1 state machine, T2 criba+sanitize, T3 forja+zod, T4 agentes, T5 deploy, T6 DNS, T7 E2E, T8 golden eval. |
| **Criterio duro de tiempo** | Total del wedge < 90 min end-to-end. |

## 2. Pipeline v1 (stages de la state machine)

| Término | Definición |
|---|---|
| **RAW** | Stage inicial: el lead existe en el store pero no ha pasado criba. |
| **FILTERED** | Pasó criba: normalizado, sanitizado, deduplicado, con filtros aplicados. |
| **RESEARCHED** | Tiene research ligero: hechos verificables (qué venden, tono, reseñas). |
| **MARKET_BRIEFED** | Tiene brief de mercado: propuesta de valor, ángulo de venta, brief de marca. |
| **SPEC_READY** | Tiene site-spec validado con zod. Listo para el builder. |
| **DEPLOYED** | Sitio construido, en GitHub, deployado en Vercel prod, con subdominio propio y smoke pasado. |
| **REPORTED** | Terminal de éxito: reporte ejecutivo enviado al comercial. **No hay redeploy después de REPORTED.** |
| **DISCARDED** | Terminal de descarte: el lead no es apto. Siempre con `discardReason`. Desde cualquier stage. |
| **FAILED** | No es un stage: es un estado transitorio (`lastError` + `attempts`). Reintentable en el mismo stage. |
| **Transición** | Movimiento entre stages. Solo vía `advance(businessId, expectedFrom, next)` — falla si el stage actual no coincide (idempotencia). |
| **Razones de descarte** | `sin_contacto_verificable` (sin teléfono E.164), `has_website` (ya tiene web propia), `permanently_closed`, `insufficient_data`, `schema_error`, `missing_name`, `vertical_mismatch`, `duplicado`. |

## 3. Fases y agentes

| Término | Definición |
|---|---|
| **Fase 1 — Criba** | RAW → FILTERED. Normaliza el record Apify, sanitiza campo por campo, aplica filtros, deduplica. Agente: `criba`. CLI: `fabrica ingest`. |
| **Fase 2 — Investiga** | FILTERED → RESEARCHED → MARKET_BRIEFED. Research ligero (10–15 min máx/lead, solo hechos) + brief de mercado. Agente: `investiga`. |
| **Fase 3 — Forja** | MARKET_BRIEFED → SPEC_READY. Fusiona Apify sanitizado + brief en un site-spec validado con zod. Agente: `forja`. CLI: `fabrica forja`. |
| **Fase 4 — Construye** | SPEC_READY → DEPLOYED. Build one-shot del sitio Next.js + deploy completo. Agente: `construye` (`model: grok-4.6`, NUNCA Fast, `is_background: true`). CLI del deploy: `fabrica deploy`. |
| **Fase 5 — Reporta** | DEPLOYED → REPORTED. Reporte ejecutivo al comercial. CLI: `fabrica report`. |
| **Orquestador** | Agente que **NUNCA ejecuta**: lee el store, identifica leads listos y despacha al agente correcto. No escribe código de producto, no investiga, no construye. |
| **Agente Cursor** | Archivo markdown con frontmatter en `.cursor/agents/` que define un rol especializado. Frontmatter soporta `name`, `description`, `model`, `is_background`. |
| **`model: grok-4.6`** | Modelo de **toda** la fábrica AUREUS v1 (orquestador, criba, investiga, forja, construye). **NUNCA Fast.** |
| **`is_background`** | Flag del frontmatter: el agente corre en background (no bloquea el chat principal). |
| **One-shot** | Filosofía del builder: UNA pasada completa (spec → código → build → deploy → smoke) sin idas y vueltas. |
| **Wipe-and-regenerate** | Si el directorio del sitio tiene basura o el build hay que reintentarlo, se borra y regenera completo. Nunca se parcha a mano. |
| **Regla de 2 fallos** | Si algo falla 2 veces con el mismo error de fondo (build, deploy, dominio, smoke), el agente PARA y reporta. No improvisa plan B. |

## 4. Artefactos y contratos

| Término | Definición |
|---|---|
| **Dataset Apify** | JSON array (o NDJSON) de negocios raspados de Google Maps. Única fuente de datos de contacto. |
| **Record Apify** | Un negocio individual del dataset. Campos típicos: `title`, `phone`, `street`, `city`, `categories`, `website`, `url`, `totalScore`, `reviewsCount`. |
| **Site-spec (público)** | El contrato entre forja y construye. JSON validado con zod (`PublicSiteSpecSchema`): bloque de datos (Apify-only) + prosa (research). Artifact en `output/03-site-spec/<id>.json` — es lo único que `construye` puede leer. |
| **Deal-meta (interno)** | `precio_oferta_cop` — precio que AUREUS cobra al negocio por construirle el sitio. Vive SOLO en `output/03-deal-meta/<id>.json` (`DealMetaSchema`); nunca en el site-spec público ni en `sites/<slug>/src/`. El quality-gate (`forbidden-internal-tokens`) bloquea el deploy si aparece. |
| **Bloque YAML / bloque de datos** | La parte del site-spec público con datos de contacto: `nombre`, `telefono_e164`, `direccion`, `ciudad`, `categoria`, `instagram`, `google_maps_url`, `subdominio_slug`, `rating`, `reviews_count`. **Sale EXCLUSIVAMENTE de Apify sanitizado.** |
| **Prosa** | La parte del site-spec que viene del research: `resumen`, `propuesta_valor`, `materia_prima`, `brief_marca`, `seo`, `whatsapp_mensaje`. Alimenta tono/estructura/copy, **nunca datos de contacto**. |
| **Market brief** | Artifact de la fase 2: propuesta de valor + ángulo de venta + brief de marca. |
| **Brief de marca** | Tono, colores HEX sugeridos por vertical, tipografía display+body, do's/don'ts. |
| **Materia prima** | Bullets de hechos verificables para el copy. Si no se vio, no se pone. |
| **Wedge kit** | Los 3 documentos del T0: kit 1 = template del site-spec, kit 2 = prompt one-shot para el builder, kit 3 = runbook con tabla de medición. |
| **Runbook** | Procedimiento paso a paso con cronómetro y tabla de retoques (kit 3). |
| **Golden eval (T8)** | Lead de referencia con resultado esperado conocido, para validar regresiones del pipeline. |

## 5. Reglas duras (invariantes del sistema)

| Término | Definición |
|---|---|
| **Apify-only (D7/D10)** | Los datos de contacto salen EXCLUSIVAMENTE del record estructurado de Apify. Nunca del research, nunca inventados. |
| **Sanitización campo por campo** | Cada campo se limpia individualmente (`sanitize.ts`): teléfono→E.164, texto→trim+colapso, URL→http(s) válida, rating→clamp 0..5, slug→kebab. |
| **E.164** | Formato internacional de teléfono: `+` seguido de 7–15 dígitos, sin espacios (`+573001234567`). Regla: sin E.164 no hay `wa.me` → DISCARDED. |
| **`wa.me`** | Link de WhatsApp: `https://wa.me/<dígitos_sin_+>?text=<mensaje_url_encoded>`. El CTA principal de todos los sitios. |
| **has_website ON** | Filtro hardcodeado: si el negocio ya tiene web propia, se descarta. La premisa del negocio es "pymes SIN web". |
| **Maps-URL ≠ website** | La URL de la ficha de Google Maps (`url` del record) NO cuenta como sitio propio. Solo `website` dispara `has_website`. (Bug corregido en v1.) |
| **Smoke real** | Un HTTP 200 NO basta. El HTML de producción debe contener: (1) el nombre exacto del negocio, (2) un `href` a `wa.me/` con el teléfono correcto. |
| **Cero imágenes externas** | Solo CSS gradients, patrones y SVG inline. Nunca hotlinks, nunca `src` a archivos inexistentes, nunca fotos de clientes de otros proyectos. Lección del pipeline viejo: broken images matan la venta. |
| **Cero PII ajena** | Al reutilizar patrones de demos previos (dense-scaffold), jamás copiar nombres, teléfonos, direcciones, quotes de personas reales. |
| **Cero lorem ipsum** | Copy real en español colombiano. Sin placeholders tipo "Tu empresa aquí". |
| **Precio COP** | Formato colombiano con separador de miles, ej. `$150.000 COP` — solo precio de servicio verificado del negocio. Nunca `precio_oferta_cop` (ese es deal-meta interno, ver arriba). |
| **Testimonios** | Solo el badge agregado de Apify (ej. "5.0★ · 315 reseñas"). Sin quotes inventadas. Genéricos/anónimos si se muestran tarjetas. |
| **Barra de calidad (baseline)** | El demo `dense-scaffold` es el **piso** de calidad, NO un template a copiar literal. Mínimos: tokens recoloreables, tipografía display+body, hero premium, secciones con motion, JSON-LD. Desde ahí, cada agente **crea** según el vertical. Decisión registrada (2026-08-06). |

## 6. Código (AUREUS v1)

| Término | Definición |
|---|---|
| **State machine** | `orchestration/state-machine.ts`. Backend JSON (`state/pipeline.json`), transiciones idempotentes, locks con TTL. |
| **`PipelineStore`** | Interfaz del store: `ensure`, `get`, `advance`, `discard`, `markFailed`, `resetTo`, `listReady`, `countsByStage`, `lock`/`unlock`. |
| **`PipelineState`** | El registro de un lead: `businessId`, `stage`, `discardReason`, `attempts`, `lastError`, `outputs`, `slug`, locks, timestamps. |
| **`businessId`** | ID determinístico: `slug(nombre)__slug(ciudad)` (ej. `demo-site__example-city`). |
| **`slug` / `subdominio_slug`** | Kebab-case, sin tildes, ≤63 chars, **termina en `-demo`**. Define el subdominio: `<nombre>-demo.<apex>` (ej. `demo-site.example.com`). |
| **`outputs`** | Mapa stage→path del artifact producido en cada stage. |
| **Lock / `lockedBy` / TTL** | Mecanismo anti-doble-procesamiento: un worker toma el lock; locks viejos (stale) se limpian por TTL. |
| **Normalizer** | `phases/01-criba/normalizer.ts`. Record Apify (permisivo) → `Business` (canónico). |
| **`Business`** | Tipo canónico interno: id, name, category, phone, address, city, googleMapsUrl, website, rating, reviewsCount, raw. |
| **Filters** | `phases/01-criba/filters.ts`. `has_website`, `vertical_mismatch`. Post-normalización, pre-inserción. |
| **`DiscardReport`** | Conteo de descartes por razón en el ingest. |
| **Sanitize** | `phases/01-criba/sanitize.ts`. `sanitizePhoneE164`, `sanitizeText`, `slugify`, `sanitizeUrl`, `sanitizeRating`, `sanitizeCount`, `phoneToWaDigits`. |
| **`SiteSpecSchema`** | `phases/03-forja/site-spec.ts`. Schema zod del site-spec. `validateSiteSpec()` devuelve errores legibles; `isContactable()` chequea E.164. |
| **zod** | Librería de validación de schemas TypeScript-first. Valida el site-spec en runtime. |
| **CLI `fabrica`** | `cli/fabrica.ts`. Comandos: `ingest` (dataset→FILTERED), `state` (conteos/detalle), `forja` (spec→SPEC_READY), `deploy` (→DEPLOYED), `report` (→REPORTED). |
| **`FABRICA_STATE`** | Env var: path del store JSON (default `./state/pipeline.json`). |
| **`FABRICA_DOMAIN`** | Env var: apex por defecto para `fabrica deploy --domain`. |
| **tsx** | Runner TypeScript usado por los scripts npm (`npm run fabrica`). |

## 7. Infraestructura y deploy

| Término | Definición |
|---|---|
| **Apex (dominio)** | El dominio raíz (ej. `example.com`). Los sitios viven en subdominios de él. |
| **Subdominio** | `<slug>.<apex>` (ej. `demo-site.example.com`). Todos los demos terminan en `…demo.example.com`. |
| **Wildcard DNS** | Registro CNAME `*` → `cname.vercel-dns.com` en tu registrador DNS. Se configura UNA vez (manual o por API); cubre todos los subdominios futuros. |
| **`cname.vercel-dns.com`** | Target CNAME de Vercel para dominios custom. |
| **API del registrador DNS** | Token del registrador (si lo usas) para crear records DNS. El flujo por-lead de v1 **no** llama a esa API: el wildcard se configura una vez. |
| **`vercel link`** | Vincula un directorio local a un proyecto Vercel (crea `.vercel/`). |
| **`vercel --prod`** | Deploy a producción. Estado esperado: `READY`. |
| **`vercel alias set`** | Apunta un dominio a un deployment. **No basta solo**: sin el dominio agregado al proyecto, el SSO protection bloquea. |
| **Add-domain-to-project** | `POST /v9/projects/<proj>/domains` (o `vercel domains add <fqdn> <proyecto>`). El paso que hace público el subdominio. Lección del wedge T0. |
| **SSO / Deployment Protection** | Protección de Vercel que devuelve "Login – Vercel" en URLs no exentas. Config del team: `all_except_custom_domains` → los custom domains quedan públicos. |
| **`gh` CLI** | GitHub CLI. En la VM cloud conviven dos identidades: `cursor` (token `ghs_`, solo repos del workspace) y tu cuenta (device flow `gho_` o PAT `ghp_`, para repos que tú controlas). |
| **Device flow** | Login de GitHub por código de un solo uso en `github.com/login/device`. Frágil en la VM (el token a veces no persiste) → preferir PAT. |
| **PAT (GitHub)** | Personal Access Token `ghp_…` con scope `repo`. Método robusto para push/PR. No pegues tokens en el chat. |
| **Smoke (deploy)** | Verificación curl post-deploy del subdominio. `fabrica deploy` lo hace best-effort (DNS puede estar propagando). |
| **Propagación DNS** | Espera hasta que el wildcard resuelva. Reintenta con backoff; el runbook tolera minutos. |

## 8. Stack de los sitios generados

| Término | Definición |
|---|---|
| **Next.js App Router** | Framework base (v16, `src/app/`). TypeScript + Tailwind CSS 4. |
| **Tailwind 4** | CSS engine. Config vía `@import "tailwindcss"` + `@theme inline` (no `tailwind.config.js` legacy). |
| **shadcn/ui** | Librería de componentes Radix pre-armados (`components/ui/`). dense-scaffold trae 48. |
| **framer-motion** | Librería de animación (v12). La fuente del "premium feel": scroll reveal, springs, parallax, loops. |
| **Tokens (design tokens)** | Variables CSS con nombre semántico (`--color-forest`, `--color-sage`, `--background`, `--radius`). Cambiar los HEX en `globals.css` recolorea TODO el sitio sin tocar componentes. |
| **Fraunces / Manrope** | Tipografías del wedge v2: display serif expresiva + body sans limpia. Regla: no Inter/Roboto/Arial como display. |
| **`next/font/google`** | Carga de fuentes con CSS vars (`--font-display`, `--font-body`). |
| **JSON-LD** | Structured data en `<script type="application/ld+json">`. Schema según vertical: `MedicalBusiness`, `LocalBusiness`, `FitnessStudio`… con geo, rating agregado, dirección. |
| **OpenGraph** | Metadata para compartir en redes/WhatsApp (title, description, locale `es_CO`). |
| **`lang="es"`** | Todo sitio sale en español (colombiano). |
| **Mobile-first** | Diseño desde 375px hacia arriba. El cliente ve el demo en su teléfono. |

## 9. Patrones de diseño premium (vocabulario dense-scaffold)

| Término | Definición |
|---|---|
| **Grain / noise overlay** | Textura de ruido con SVG `feTurbulence` en `mixBlendMode: overlay`. Da textura de film al hero. |
| **Mesh gradient** | Fondo de múltiples `radial-gradient` superpuestos. Sustituye fotos. |
| **Magnetic button** | CTA que sigue al cursor con spring (framer-motion). |
| **Typing effect** | El H1 se escribe carácter a carácter con cursor parpadeante. |
| **Parallax** | Capas que se mueven a velocidades distintas al scrollear (`useScroll` + `useTransform`). |
| **Conic border / rotating border** | Borde `conic-gradient` girando 360° alrededor de una tarjeta (trust card). |
| **Glass morphism** | Tarjetas `bg-white/[0.06]` + `backdrop-blur-md` + borde sutil. |
| **Scroll reveal** | Secciones que aparecen al entrar al viewport (`whileInView` + `viewport={{once:true}}`). |
| **Stagger** | Hijos que animan en cascada (`delay: i*0.1`). |
| **Blobs / orbs** | Formas orgánicas con `borderRadius` morfando y blur, flotando en loop. |
| **AnimatedStats** | Contadores que suben con `requestAnimationFrame` (ease-out-quart) + anillos SVG de progreso (`strokeDashoffset`). |
| **PageLoader** | Splash de marca (~1.8s) con logo, anillo giratorio y barra shimmer. Sensación de producto terminado. |
| **ScrollProgressBar** | Barra fija arriba con gradiente de marca que refleja el avance del scroll. |
| **SectionDivider** | SVGs decorativos (wave/leaf/curve) entre secciones. |
| **SocialProofNotification** | Toasts intermitentes de actividad ("Alguien en tu zona agendó…"). FOMO. En la fábrica: SIEMPRE genéricos/anónimos. |
| **WhatsAppFloatingButton** | Botón flotante fijo con el `wa.me` del negocio. |
| **Shimmer** | Brillo que atraviesa un elemento (keyframe `background-position`). |
| **Pulse glow** | Halo respirante en CTAs (`box-shadow` animado). |
| **Hero premium** | La suma: parallax + grain + magnetic CTA + typing + badge con ping + trust card con conic border + scroll indicator. |

## 10. Ecosistema de repos

| Término | Definición |
|---|---|
| **`jseramn/AUREUS`** | La fábrica (este repo). Público, AGPL-3.0. Clone: `https://github.com/jseramn/AUREUS.git`. |
| **dense-scaffold** | Scaffold denso de referencia (`sites/dense-scaffold`). **Piso de calidad de la fábrica**, no un template a copiar literal. |
| **Repos de sitios** | Cada lead DEPLOYED crea un repo bajo `FABRICA_GH_ORG` (`YOUR_GITHUB_ORG/<slug>`) y un subdominio `<slug>.example.com`. |
| **Herramientas externas** | Skills o CLIs de planificación/review de terceros son opcionales y **no forman parte de AUREUS**. |

## 11. Legacy AUREUS v2026.07 (referencia histórica)

| Término | Definición |
|---|---|
| **Pipeline viejo** | `RAW → FILTERED → GROK_RESEARCHED → META_PROMPTED → MISTRAL_RESEARCHED → ZAI_BUILT → TAR_DOWNLOADED`. Reemplazado por v1. |
| **Sondeo (Fase 2 vieja)** | Research vía browser con cuentas Grok. |
| **Destilación (Fase 4 vieja)** | Deep research vía API Mistral. |
| **Materialización (Fase 5 vieja)** | Build vía z.ai (GLM) y descarga de `.tar`. |
| **`.tar`** | El entregable viejo: sitio comprimido para deploy manual. v1 lo reemplaza por deploy directo a subdominio. |
| **Prompt atom** | Template de prompt con variables `{{DELIMITADAS}}` (`templates/prompts/`). |
| **Meta-prompt** | Prompt fusionado (template + research) que alimentaba al builder viejo. |
| **LLM-as-Judge** | Gate de calidad automatizado con un modelo evaluador y rúbricas (`judge-rubrics/`). Diferido en v1 (P5): los sitios son ganchos de venta, el cierre es conversacional. |
| **Human gate** | Punto de sign-off humano (`pre_sell`). |
| **Account pool / cooldown** | Rotación de cuentas browser con enfriamiento (patrón del pipeline viejo). |
| **`variables/registry.json`** | Registro canónico de variables de configuración del framework viejo. |
| **z-ai-web-dev-sdk** | SDK de z.ai (GLM) usado por el pipeline viejo. |

## 12. Herramientas y entorno de trabajo

| Término | Definición |
|---|---|
| **Cursor** | El IDE/agente donde vive todo: agentes, orquestación, chats. |
| **Cloud agent (VM)** | Esta máquina remota de Cursor donde se ejecuta el trabajo autónomo. |
| **Composer** | Modelo de Cursor. **No** es el modelo de la fábrica v1 (política: `grok-4.6`, NUNCA Fast). |
| **GLM 5.2** | Modelo de z.ai del pipeline legacy (z.ai → `.tar`). Ya no es el modelo del agente `construye`; en la fábrica v1 `construye` usa grok-4.6 (NUNCA Fast). |
| **Long task** | Modo de ejecución larga de GLM donde construía proyectos completos multi-fase. |
| **Apify** | Plataforma de scraping. El actor de Google Maps produce los datasets de leads. |
| **`browse`** | CLI de browser headless (Playwright) para screenshots/smoke visual. Opcional; no forma parte de AUREUS. |
| **Lucidchart (MCP)** | Conector para generar diagramas del proyecto (state machine, sequence, ERD, mind map). |
| **tmux** | Multiplexor de terminal usado en la VM para flujos interactivos (device login de gh). |
| **Device code** | Código de un solo uso del flujo OAuth de GitHub (ej. `XXXX-XXXX`). |
| **Artifacts (`/opt/cursor/artifacts/`)** | Carpeta de la VM cuyos archivos se suben automáticamente al chat (screenshots, reportes, kits). |
| **Secrets de Cursor** | Almacén de credenciales (Dashboard → Cloud Agents → Secrets) inyectadas como env vars. Preferible a pegar tokens en chat. |

## 13. Decisiones registradas (no re-litigar)

| ID | Decisión |
|---|---|
| **Plan A** | Mutar AUREUS a skill pack Cursor-native (no fork completo de gentle-ai). |
| **P5 off** | Sin jueces LLM en v1: los sitios son ganchos de venta, el cierre es conversacional. |
| **D3/T6** | DNS wildcard manual una-vez en tu registrador DNS (sin API del registrador en el flujo por-lead). |
| **D7/D10** | Datos de contacto del site-spec: Apify only, sanitización campo por campo. |
| **D9** | T0 (wedge manual) GATEA T1–T5. Cumplido y aprobado. |
| **Agent files = fuente única** | Los `.cursor/agents/*.md` son la única fuente de prompts de los agentes. |
| **Wipe-and-regenerate** | En retry de build se borra y regenera; no se parcha. |
| **Vercel Pro** | Requerido para escala. Hobby sirve para demos; un lote grande necesita plan de equipo. |
| **dense-scaffold = piso** | Barra de calidad mínima, NO template. Los agentes crean desde ese piso según vertical (2026-08-06). |
| **Subagentes** | No delegar tandas de `Write` grandes a subagentes (riesgo de loop). Bulk por shell + ediciones quirúrgicas. |

---

*Actualizado: 2026-08-06. Mantenimiento: agregar términos nuevos al aparecer; no borrar los legacy (sirven para leer `docs/` y `templates/` viejos).*
