/**
 * Fase 1 — Criba: normalizer.
 * ApifyBusiness (raw, schema-permissive) -> Business (canonical, sanitizado).
 *
 * D7/D10: cada campo se sanitiza aquí, determinísticamente, campo por campo.
 * El store FILTERED solo contiene datos limpios (teléfono E.164, URLs http(s),
 * rating 0..5). Nada queda delegado al criterio de un agente LLM.
 */
import { ApifyBusinessSchema, businessIdFor, type ApifyBusiness, type Business } from "../_shared.js";
import {
  sanitizeCount,
  sanitizePhoneE164,
  sanitizeRating,
  sanitizeText,
  sanitizeUrl,
} from "./sanitize.js";

/** Código de país por defecto para teléfonos nacionales sin '+' (Colombia). */
const DEFAULT_COUNTRY_CODE = "57";

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v != null && v.trim() !== "") return v.trim();
  }
  return null;
}

export type NormalizeErrorReason = "schema_error" | "missing_name" | "permanently_closed" | "insufficient_data";

export interface NormalizeResult {
  business: Business | null;
  error?: NormalizeErrorReason;
}

export function normalize(raw: unknown): NormalizeResult {
  let parsed: ApifyBusiness;
  try {
    parsed = ApifyBusinessSchema.parse(raw);
  } catch {
    return { business: null, error: "schema_error" };
  }

  const name = sanitizeText(firstNonEmpty(parsed.name, parsed.title, parsed.displayName));
  if (!name) return { business: null, error: "missing_name" };

  if (parsed.permanentlyClosed === true || parsed.temporarilyClosed === true) {
    return { business: null, error: "permanently_closed" };
  }

  const phone = sanitizePhoneE164(parsed.phone, DEFAULT_COUNTRY_CODE);
  const address = sanitizeText(firstNonEmpty(parsed.address, parsed.fullAddress, parsed.streetAddress));
  const city = sanitizeText(parsed.city);

  // `url` en un scrape de Google Maps es la ficha de Maps, NO un sitio web propio.
  // Solo `website` cuenta como "ya tiene web" (regla has_website).
  const website = sanitizeUrl(parsed.website);
  const rawMapsUrl =
    firstNonEmpty(parsed.googleMapsUrl) ??
    (parsed.url && /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(parsed.url)
      ? parsed.url.trim()
      : null);
  const googleMapsUrl = sanitizeUrl(rawMapsUrl);

  if (!phone && !address && !googleMapsUrl) {
    return { business: null, error: "insufficient_data" };
  }

  const instagramRaw = sanitizeText(parsed.instagram);
  const instagram = instagramRaw?.startsWith("http") ? sanitizeUrl(instagramRaw) : instagramRaw;
  const facebookRaw = sanitizeText(parsed.facebook);
  const facebook = facebookRaw?.startsWith("http") ? sanitizeUrl(facebookRaw) : facebookRaw;

  const business: Business = {
    id: businessIdFor(name, city),
    name,
    category: sanitizeText(firstNonEmpty(parsed.categoryName, parsed.categories?.[0])),
    phone,
    address,
    city,
    country: sanitizeText(firstNonEmpty(parsed.country, parsed.countryCode)),
    googleMapsUrl,
    website,
    instagram,
    facebook,
    rating: sanitizeRating(parsed.rating),
    reviewsCount: sanitizeCount(parsed.reviewsCount),
    permanentlyClosed: false,
    raw: parsed as unknown as Record<string, unknown>,
  };
  return { business };
}
