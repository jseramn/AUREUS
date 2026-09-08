/**
 * Site-spec — schema zod (T3: Forja).
 *
 * El site-spec es el contrato entre research/brief y el builder one-shot.
 * El bloque YAML (datos de contacto) sale SOLO de Apify sanitizado.
 * La prosa enriquece copy/diseño pero NUNCA alimenta teléfono/dirección/IG/URLs.
 *
 * `precio_oferta_cop` es metadata comercial INTERNA de AUREUS (lo que cobra al
 * cliente por construirle el sitio). Vive en DealMeta — NUNCA en el artifact
 * público que consume el builder (`output/03-site-spec/<id>.json`).
 */
import { z } from "zod";
import { E164 } from "../01-criba/sanitize.js";

export { E164 };

/** Slug kebab-case para subdominio (DNS label). Exportado para contract tests. */
export const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Slug de demo de fábrica: `{nombre-negocio}-demo`.
 * Obligatorio — los sitios viven en `https://<slug>-demo.<apex>`
 * (ej. `demo-site.example.com`).
 */
export const SLUG_DEMO = /^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?-demo$/;

/** Sufijo fijo del subdominio comercial/demo. */
export const DEMO_SLUG_SUFFIX = "-demo";

/** Solo http(s) — zod .url() acepta javascript:/data:, esto lo cierra (XSS almacenado). */
const HTTPS_ONLY = (u: string) => /^https?:\/\//i.test(u);

/** Instagram: handle (@usuario o usuario) o URL https. */
const IG_HANDLE_OR_URL = /^@?[a-zA-Z0-9._]{1,30}$|^https?:\/\/\S+$/;

/** Contenido público del sitio — lo que el builder puede leer. Sin precio comercial. */
export const PublicSiteSpecSchema = z.object({
  /** OBLIGATORIO — nombre del negocio (title/name del record Apify). */
  nombre: z.string().min(1),
  /** OBLIGATORIO — E.164. Sin esto no hay wa.me → descartar. */
  telefono_e164: z.string().regex(E164, "teléfono debe ser E.164 (+573001234567)"),
  /** Dirección si Apify la trae; si no, omitir en el sitio. */
  direccion: z.string().nullable().default(null),
  /** OBLIGATORIO. */
  ciudad: z.string().min(1),
  /** OBLIGATORIO — vertical. */
  categoria: z.string().min(1),
  /** OPCIONAL — handle (@usuario) o URL https; vacío → omitir. */
  instagram: z
    .string()
    .regex(IG_HANDLE_OR_URL, "instagram debe ser handle o URL")
    .refine((v) => !v.startsWith("http") || HTTPS_ONLY(v), "instagram: solo http(s)")
    .nullable()
    .default(null),
  /** URL de Google Maps si Apify la trae. Solo http(s). */
  google_maps_url: z
    .string()
    .url()
    .refine(HTTPS_ONLY, "google_maps_url: solo http(s)")
    .nullable()
    .default(null),
  /**
   * OBLIGATORIO — slug kebab-case que TERMINA en `-demo`
   * (`{nombre}-demo.<apex>`). Sin el sufijo forja rechaza el spec.
   */
  subdominio_slug: z
    .string()
    .regex(SLUG, "slug debe ser kebab-case válido")
    .regex(SLUG_DEMO, "slug debe terminar en -demo (ej. mi-negocio-demo)"),
  /** OPCIONAL — rating 0..5. */
  rating: z.number().min(0).max(5).nullable().default(null),
  /** OPCIONAL — entero >= 0. */
  reviews_count: z.number().int().min(0).nullable().default(null),

  /* ── Prosa (research + criterio). No alimenta datos de contacto. ── */
  /** Resumen del negocio (hechos verificables). */
  resumen: z.string().default(""),
  /** Propuesta de valor. */
  propuesta_valor: z.string().default(""),
  /** Bullets de hechos reales. */
  materia_prima: z.array(z.string()).default([]),
  /** Brief de marca: tono, colores HEX, tipografía, do/don't. */
  brief_marca: z
    .object({
      tono: z.string().default(""),
      color_primario: z.string().default(""),
      color_secundario: z.string().default(""),
      color_acento: z.string().default(""),
      tipografia_display: z.string().default(""),
      tipografia_body: z.string().default(""),
      dos: z.string().default(""),
      donts: z.string().default(""),
    })
    .default({}),
  /** SEO. */
  seo: z
    .object({
      title: z.string().default(""),
      description: z.string().default(""),
      keywords: z.array(z.string()).default([]),
    })
    .default({}),
  /** Mensaje pre-escrito de WhatsApp (sin url-encodear). */
  whatsapp_mensaje: z.string().default(""),
});

/** Metadata comercial interna de AUREUS — nunca llega al builder ni al sitio. */
export const DealMetaSchema = z.object({
  /** Precio de oferta al cliente por construirle el sitio (COP entero). */
  precio_oferta_cop: z.number().int().positive(),
});

/**
 * Input plano que produce el agente `forja` hoy (público + deal meta mezclados).
 * Retrocompatible con el JSON de entrada actual.
 */
export const ForjaInputSchema = PublicSiteSpecSchema.and(DealMetaSchema);

/** @deprecated usa PublicSiteSpecSchema / ForjaInputSchema */
export const SiteSpecSchema = ForjaInputSchema;

export type PublicSiteSpec = z.infer<typeof PublicSiteSpecSchema>;
export type DealMeta = z.infer<typeof DealMetaSchema>;
export type ForjaInput = z.infer<typeof ForjaInputSchema>;
/** @deprecated usa PublicSiteSpec */
export type SiteSpec = PublicSiteSpec;

export interface SiteSpecValidation {
  ok: boolean;
  spec?: PublicSiteSpec;
  errors?: string[];
}

export interface ForjaInputValidation {
  ok: boolean;
  publicSpec?: PublicSiteSpec;
  dealMeta?: DealMeta;
  errors?: string[];
}

function formatIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

/**
 * Valida el artifact público (`output/03-site-spec/<id>.json`).
 * Usa `.strict()` — si llega `precio_oferta_cop` residual, FALLA a propósito
 * para forzar regenerar forja (no filtrar en silencio).
 */
export function validateSiteSpec(input: unknown): SiteSpecValidation {
  const res = PublicSiteSpecSchema.strict().safeParse(input);
  if (res.success) return { ok: true, spec: res.data };
  return { ok: false, errors: formatIssues(res.error.issues) };
}

/**
 * Valida el input plano de forja (público + deal meta).
 * Separa `precio_oferta_cop` del resto para persistir artifacts distintos.
 */
export function validateForjaInput(input: unknown): ForjaInputValidation {
  const res = ForjaInputSchema.safeParse(input);
  if (!res.success) return { ok: false, errors: formatIssues(res.error.issues) };

  const { precio_oferta_cop, ...rest } = res.data;
  const publicRes = PublicSiteSpecSchema.safeParse(rest);
  if (!publicRes.success) return { ok: false, errors: formatIssues(publicRes.error.issues) };

  return {
    ok: true,
    publicSpec: publicRes.data,
    dealMeta: { precio_oferta_cop },
  };
}

/** Regla dura: sin teléfono verificable no hay wa.me → descartar. */
export function isContactable(spec: Pick<PublicSiteSpec, "telefono_e164">): boolean {
  return E164.test(spec.telefono_e164);
}
