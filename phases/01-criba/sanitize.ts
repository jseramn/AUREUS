/**
 * Sanitizer campo por campo (Apify-only).
 *
 * Regla D7/D10: los datos de contacto salen EXCLUSIVAMENTE del record
 * estructurado de Apify. Cada campo se limpia y valida individualmente.
 * Nunca se inventa un dato que Apify no trajo.
 */

/** E.164 canónico: '+', primer dígito 1-9, 7 a 15 dígitos totales.
 *  Fuente única — site-spec.ts la importa para que los dos validadores no diverjan. */
export const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Normaliza un teléfono a E.164.
 *
 * - Si trae '+': se limpia y valida contra E164.
 * - Si NO trae '+': solo se acepta con `defaultCountryCode` y si parece un
 *   número nacional inequívoco (celular colombiano: 10 dígitos iniciando en 3
 *   cuando defaultCountryCode === "57"). Nunca se prepende '+' a ciegas —
 *   "3001234567" sin país NO es "+3001234567" (eso sería Bélgica).
 * - Cualquier otro caso -> null (mejor descartar que un wa.me roto).
 */
export function sanitizePhoneE164(
  raw: string | null | undefined,
  defaultCountryCode?: string,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const stripped = trimmed.replace(/[\s\-().]/g, "");

  if (stripped.startsWith("+")) {
    return E164.test(stripped) ? stripped : null;
  }

  if (!/^\d{7,15}$/.test(stripped)) return null;

  if (defaultCountryCode === "57" && /^3\d{9}$/.test(stripped)) {
    const candidate = `+57${stripped}`;
    return E164.test(candidate) ? candidate : null;
  }

  return null;
}

/** Dígitos sin '+' para wa.me. */
export function phoneToWaDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Trim + colapsa espacios internos. Vacío -> null. */
export function sanitizeText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Slug kebab-case seguro para subdominio (DNS label: ≤63, sin guión al borde). */
export function slugify(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  // El slice puede dejar un guión al final; re-trim.
  s = s.replace(/-+$/g, "");
  return s;
}

const DEMO_SUFFIX = "-demo";

/**
 * Tokens legales / geográficos / de vertical que no aportan identidad al slug.
 * Se quitan tras kebab-case para slugs compactos (ej. zitios-demo).
 */
const SLUG_FLUFF_TOKENS = new Set([
  "inmobiliaria",
  "inmobiliarias",
  "inmobiliario",
  "inmobiliarios",
  "constructora",
  "constructoras",
  "constructor",
  "sas",
  "ltda",
  "sa",
  "medellin",
  "agencia",
]);

/**
 * Compacta un slug kebab quitando fluff (inmobiliaria, sas, medellin, agencia-de…).
 * Si queda vacío, devuelve el original (mejor slug largo que vacío).
 */
export function compactSlugBase(base: string): string {
  if (!base) return base;
  const parts = base.split("-").filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]!;
    // S.A.S. → s-a-s tras slugify
    if (cur === "s" && parts[i + 1] === "a" && parts[i + 2] === "s") {
      i += 2;
      continue;
    }
    if (SLUG_FLUFF_TOKENS.has(cur)) continue;
    kept.push(cur);
  }
  // "agencia-de-…" deja un "de" huérfano al inicio
  while (kept.length > 0 && kept[0] === "de") kept.shift();
  const compact = kept.join("-");
  return compact || base;
}

/**
 * Slug de fábrica: `{nombre}-demo` (≤63). Si ya termina en `-demo`, no duplica.
 * Reserva espacio para el sufijo al truncar el nombre.
 * Quita fluff (inmobiliaria, constructora, sas, ltda, s-a-s, medellin, agencia-de).
 */
export function slugifyDemo(raw: string): string {
  let base = slugify(raw);
  if (!base) return "";
  if (base === "demo" || base.endsWith(DEMO_SUFFIX)) {
    return base.slice(0, 63).replace(/-+$/g, "");
  }
  base = compactSlugBase(base);
  const maxBase = 63 - DEMO_SUFFIX.length;
  const trimmed = base.slice(0, maxBase).replace(/-+$/g, "");
  if (!trimmed) return "";
  return `${trimmed}${DEMO_SUFFIX}`;
}

/**
 * Asigna un slug *-demo único dentro de un set (colisiones → stem-2-demo, …).
 */
export function allocateUniqueDemoSlug(raw: string, used: Set<string>): string {
  const primary = slugifyDemo(raw);
  if (!primary) return "";
  if (!used.has(primary)) {
    used.add(primary);
    return primary;
  }
  const stem = primary.endsWith(DEMO_SUFFIX)
    ? primary.slice(0, -DEMO_SUFFIX.length)
    : primary;
  let n = 2;
  while (n < 10_000) {
    const suffix = `-${n}${DEMO_SUFFIX}`;
    const maxStem = 63 - suffix.length;
    const trimmedStem = stem.slice(0, maxStem).replace(/-+$/g, "");
    if (!trimmedStem) return "";
    const candidate = `${trimmedStem}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    n += 1;
  }
  return "";
}

/** URL http(s) válida o null. Rechaza javascript:, data:, ftp:, etc. */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  const t = sanitizeText(raw);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Número finito o null. */
export function sanitizeNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Rating clamp 0..5. */
export function sanitizeRating(raw: unknown): number | null {
  const n = sanitizeNumber(raw);
  if (n == null) return null;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

/** Entero >= 0 o null. */
export function sanitizeCount(raw: unknown): number | null {
  const n = sanitizeNumber(raw);
  if (n == null) return null;
  const i = Math.floor(n);
  return i >= 0 ? i : null;
}
