/**
 * Fase 3 — Forja: site-spec (Cursor-native).
 * RESEARCHED/MARKET_BRIEFED -> SPEC_READY via zod validation.
 * El builder one-shot (agente Cursor) consume el site-spec validado.
 */
export {
  PublicSiteSpecSchema,
  DealMetaSchema,
  ForjaInputSchema,
  SiteSpecSchema,
  validateSiteSpec,
  validateForjaInput,
  isContactable,
  SLUG,
  SLUG_DEMO,
  DEMO_SLUG_SUFFIX,
  E164,
} from "./site-spec.js";
export type {
  PublicSiteSpec,
  DealMeta,
  ForjaInput,
  SiteSpec,
  SiteSpecValidation,
  ForjaInputValidation,
} from "./site-spec.js";
