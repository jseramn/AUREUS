# Scaffold patches

Canonical patches for recurring dense-scaffold bugs. The quality gate
enforces them in `phases/04-construye/quality-gate.ts`.

## unbound-business

**Síntoma:** HTTP 200 + HTML SSR OK; Chrome tira
`Uncaught ReferenceError: BUSINESS is not defined` → Next error boundary
(`html#__next_error__` / "This page couldn't load").

**Causa:** un `"use client"` (típ. `AnnouncementBar.tsx`) usa `BUSINESS.name`
sin `import { BUSINESS } from "@/lib/constants"`. SSR no ejecuta el chunk;
el client sí.

**Fix:** ver `AnnouncementBar.business-import.tsx.snippet`.

## svg-percent-paths

**Síntoma:** path SVG con `d="M 16.5% 20% ..."` (inválido en path data).

**Fix:** ver `Benefits.connecting-flow.svg.snippet` — `viewBox="0 0 100 100"`
+ coordenadas numéricas.
