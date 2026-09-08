# DESIGN.md — Mejores prácticas de diseño (Fábrica AUREUS)

Este documento es **lectura obligatoria del agente `construye`** antes de tocar disco.
Método: design-system workflow (identidad, tipografía, color y densidad antes de
codificar).

## Principio rector: identidad de marca primero

Cada sitio parte de una **identidad de marca**, nunca de un template.

1. **Capturada** — si el research encontró identidad real (colores de logo/local,
   tono de sus reseñas, fotos de fachada, IG): úsala.
2. **Inventada** — si no hay señal (caso típico: negocio sin web), el agente
   INVENTA una identidad coherente para el vertical y la ciudad, siguiendo las
   secciones de abajo. Inventar identidad ≠ inventar datos de contacto (eso
   sigue prohibido — YAML Apify-only).

La identidad viene en `brief_marca` del site-spec. Si el `brief_marca` es
delgado, el builder lo **eleva** a un sistema completo antes de codificar.

## Sistema por sitio (las 7 decisiones)

Toda web de la fábrica define esto ANTES del primer componente:

### 1. Dirección estética
Una frase: "¿qué transmite este negocio en 3 segundos?" Ej: jurídico =
"solidez editorial, papel y tinta"; médico = "calma clínica premium";
ingeniería = "precisión industrial". Nombra 2-3 sitios de referencia del
vertical (mentales, no copiar).

### 2. Tipografía (display + body, NUNCA solo una)
- **Display:** serif expresiva o grotesk con carácter (Fraunces, Cormorant
  Garamond, Barlow Condensed, Bricolage Grotesque, Instrument Serif...).
- **Body:** sans limpia legible (Manrope, Source Sans 3, DM Sans, Figtree...).
- **PROHIBIDO:** Inter, Roboto, Arial, Open Sans como display. Si el sitio
  podría confundirse con un template de SaaS, la tipografía falló.
- Escala: hero `clamp(40px, 6vw, 72px)`, body 16px, micro-labels 11-12px
  (uppercase + tracking para etiquetas técnicas).

### 3. Color (tokens, no clases sueltas)
- Un solo `globals.css` con CSS variables nombradas (`--brand-primary`,
  `--brand-accent`, `--surface`, `--ink`). Recolorear el sitio = tocar 5 líneas.
- **Acento restringido:** el color de acento es raro y significativo (CTAs,
  badges, un dato clave). El chrome queda neutro.
- Neutros cálidos o fríos según vertical — decidir, no defaultear.
- **PROHIBIDO:** morado-sobre-blanco genérico de IA, gradientes arcoíris,
  #7C3AED como primario "porque sí".
- Contraste AA mínimo en texto sobre fondo.

### 4. Spacing y layout
- Base 4px; densidad cómoda (ni Bloomberg ni landing vacía).
- Max-width contenido 1100-1200px; grid 12 col en desktop, 1 col mobile.
- Radius consistente: cards 12px, botones 8px, pills 9999px.

### 5. Motion (framer-motion, funcional)
- Scroll-reveal con stagger en secciones; springs suaves en CTAs; parallax
  sutil en hero. Duraciones 150-400ms, easing `cubic-bezier(0.16,1,0.3,1)`.
- La animación aclara jerarquía; si distrae, sobra.

### 6. Materialidad (anti-template)
- Grain/noise SVG sutil (opacity 0.02-0.04) o patrón geométrico propio del
  vertical (planos técnicos, cruz médica, sello legal) como fondo.
- Un motivo gráfico SVG inline recurrente que le pertenezca a ESTA marca
  (monograma, trama, línea de firma). Cero stock, cero hotlinks.

### 7. Densidad de confianza (lo que separa un sitio "nice" de uno vacío)
**Piso tecnológico = dense scaffold** (misma densidad de implementación;
estética libre por marca). Enforce: `fabrica quality` exige `landing/` ≥12,
secciones ≥15, `globals.css` ≥8KB. HTML SSR denso (~200KB+), no spa thin
(~40–75KB).

El estándar mínimo de secciones para un lead de la fábrica:
- Announcement bar o badge contextual (vertical + ciudad)
- Nav sticky con CTA WhatsApp
- Hero premium: nombre exacto + propuesta + 2 CTAs + trust chips
- Barra de social proof REAL (rating + nº reseñas del YAML, enlace a Maps)
- Stats / métricas animadas (rating, reseñas, líneas de servicio)
- Servicios (grid 4-6, iconos SVG propios)
- Sobre nosotros / método de trabajo (3-4 pasos)
- Beneficios / diferenciales
- Prueba social agregada (SOLO rating/reseñas reales; sin testimonios con
  nombres inventados — frases genéricas del vertical claramente no atribuidas
  si se necesita textura)
- FAQ (4-6 preguntas del vertical)
- Contacto (dirección/teléfono del YAML + mapa embebido vía google_maps_url)
- Footer completo + newsletter/CTA + botón WhatsApp flotante
- JSON-LD (`LocalBusiness`/`MedicalBusiness`/`ProfessionalService`) + OG + SEO

Scaffold obligatorio: `cp -a sites/dense-scaffold sites/<slug>` y recolorea.

## Reglas duras (heredan del pipeline)

1. Datos de contacto SOLO del YAML del spec. Prosa = tono, nunca facts.
2. Imágenes: CSS gradients / SVG inline / patrones. Cero PII, cero fotos cliente.
3. Español colombiano; cero lorem ipsum. Si el sitio muestra el precio de un
   **servicio del negocio**, formato COP colombiano (ej. `$150.000`, `$85.000`),
   siempre desde datos reales del research — nunca inventado. Nunca uses
   `$500.000` como ejemplo por defecto: ese monto es el piso comercial interno
   de AUREUS (`precio_oferta_cop`, vive en `output/03-deal-meta/`), no un
   precio de menú/servicio del cliente. `precio_oferta_cop` NUNCA va a
   `sites/<slug>/src/`.
4. Tras `cp -a` del dense scaffold: reescribe TODA la prosa (bio de About,
   tagline de Footer, copy de FinalCTA, claves de WhatsApp en constants). El
   quality-gate (`scaffold-residue`) bloquea el deploy si queda copy del
   scaffold en un vertical distinto.
5. `lang="es"`, mobile-first, build de producción debe pasar.
6. El contenido clave (nombre + wa.me) debe estar en el HTML SSR (smoke real).

## Anti-checklist (si aparece, el sitio NO pasa)

- [ ] ¿Parece template de SaaS con otro logo? → falla estética
- [ ] ¿Inter/Roboto en display? → falla tipografía
- [ ] ¿Morado IA / gradiente genérico? → falla color
- [ ] ¿Menos de 15 secciones / sin `landing/` / globals &lt;8KB? → falla densidad
- [ ] ¿HTML SSR ~40–75KB tipo “spa minimal”? → falla densidad (piso dense-scaffold ~200KB+)
- [ ] ¿Testimonios con nombres de personas inventadas? → falla integridad
- [ ] ¿El hero no dice qué hace el negocio + ciudad en 3 seg? → falla mensaje
