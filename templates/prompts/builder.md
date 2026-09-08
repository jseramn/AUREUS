# Builder prompt wrapper — AUREUS Fase 5 (Materialización)
# El builder (z.ai fullstack-dev) recibe como prompt el contenido íntegro de MISTRAL_RESEARCHED_<id>.md.
# Este archivo es el WRAPPER opcional que envuelve ese research cuando se desea framing explícito.
# Variable: {{MISTRAL_RESEARCH}} (contenido del .md de Fase 4).

Construye un sitio web comercial completo y production-ready en Next.js (App Router) + Tailwind CSS, siguiendo EXACTAMENTE la especificación abajo.

## ESPECIFICACIÓN (deep research verificado)

{{MISTRAL_RESEARCH}}

## REQUISITOS DE BUILD (no negociables)

- Next.js 14+ App Router, TypeScript.
- Tailwind CSS para estilos; aplica la paleta HEX del Brand Kit literalmente.
- Componentes: Hero con CTA, secciones de servicios/productos, sobre nosotros, testimonios (si hay), contacto con mapa y horarios, footer.
- Datos de contacto reales del negocio (teléfono, dirección, email si existe).
- Responsive mobile-first.
- Metadatos SEO (title, description, Open Graph) del research.
- Sin integraciones externas innecesarias (no Stripe, no Auth, no CMS headless) salvo que el research lo exija explícitamente.

## OUTPUT

Proyecto completo empaquetable como `.tar` con `package.json`, `next` en dependencias, y `npm install && npm run build` debe pasar limpio.

## SELF-CHECK (antes de entregar)

Verifica: `app/page.tsx` existe, `package.json` tiene `next`, hay al menos 3 rutas/secciones, los colores coinciden con el Brand Kit.
