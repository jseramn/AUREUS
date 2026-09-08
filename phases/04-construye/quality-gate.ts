/**
 * Quality gate — bloquea deploy de sitios "demasiado simples".
 *
 * El smoke de contenido (nombre + wa.me) NO basta: un landing de 3 secciones
 * con WhatsApp pasa smoke y falla la barra de calidad de la fábrica.
 * Este gate corre ANTES de `vercel --prod` y falla ruidoso.
 *
 * Umbrales calibrados contra el estándar vivo (sites/dense-scaffold
 * + norte-spa-demo / dense-scaffold): HTML SSR ~200KB+, landing/ ≥15
 * componentes, globals.css ~12KB. Los demos "thin spa" del lote-10 (~40–75KB
 * HTML, 5–6 secciones flat) PASABAN el gate viejo (mín 8 / 2.5KB) y FALLAN
 * este. Identidad visual distinta = OK; densidad tecnológica = piso duro.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface QualityCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface QualityGateResult {
  ok: boolean;
  dir: string;
  checks: QualityCheck[];
  failures: string[];
}

/** Dense scaffold has ~21 landing components. Thin spa-flat (~10–12) → FAIL. */
const MIN_SECTION_COMPONENTS = 15;
/** JA ~12KB. Thin spa ~2–4KB pasaba el piso viejo 2.5KB. */
const MIN_GLOBALS_CSS_BYTES = 8000;
const MIN_SECTION_SIGNALS = 10;
/** Scaffold denso: carpeta landing/ (o equivalente) con ≥12 tsx. */
const MIN_LANDING_DIR_COMPONENTS = 12;
/**
 * Archivos canónicos del scaffold JA — anti spa-flat.
 * Basta con que existan bajo landing/ (nombre exacto).
 */
const REQUIRED_LANDING_FILES = [
  "AnimatedStats.tsx",
  "FAQSection.tsx",
  "FinalCTA.tsx",
  "WhatsAppFloatingButton.tsx",
] as const;
/** Piso Next: CVE gate Vercel exige ≥15.1.9 (o ^16). 15.1.0 = ERROR en deploy. */
const MIN_NEXT_MAJOR = 15;
const MIN_NEXT_MINOR = 1;
const MIN_NEXT_PATCH = 9;

/** Señales de densidad de confianza (DESIGN.md §7) — case-insensitive. */
const SECTION_SIGNAL_PATTERNS: RegExp[] = [
  /announcement|aviso|banner.?top/i,
  /faq|preguntas?\s+frecuentes/i,
  /whatsapp.*float|float.*whatsapp|floating.?wa|wa.?flotante/i,
  /servicios?|services/i,
  /beneficios?|diferenciales?|por\s+qu[eé]/i,
  /m[eé]todo|c[oó]mo\s+(trabaj|funciona)|proceso|pasos|how.?it.?works/i,
  /testimon|reseñas?|social.?proof|confianza/i,
  /contacto|contact/i,
  /hero/i,
  /footer/i,
  /stats|animated.?stats|métricas|metricas|contador/i,
  /newsletter|boletin|boletín|subscribe|suscrib/i,
];

/**
 * Residuo textual de scaffolds de referencia (anti copy-JA en otro vertical).
 * Extensible: al agregar un scaffold de referencia nuevo (ej. norte-spa-demo),
 * suma un entry aquí con sus propias frases ancla.
 * Las frases DEBEN ser ≥25 chars y específicas del negocio-scaffold — nunca
 * palabras sueltas como "civil" o "ingeniería" que podrían ser legítimas en otro vertical
 * (ej. un bufete de abogados legítimamente puede mencionar "derecho civil").
 */
export interface ScaffoldResidueEntry {
  /** Basename de sites/<slug> que ES el scaffold de referencia — se auto-excluye de su propia auditoría. */
  scaffoldSlug: string;
  /** Frases verbatim que NUNCA deben aparecer fuera de ese scaffold. */
  anchorPhrases: readonly string[];
}

export const SCAFFOLD_RESIDUE_REGISTRY: readonly ScaffoldResidueEntry[] = [
  {
    scaffoldSlug: "dense-scaffold",
    anchorPhrases: [
      "NORTHWIND_DENSE_SCAFFOLD_BIOGRAPHY_LINE",
      "NORTHWIND_SCAFFOLD_FOOTER_TAGLINE_COPY",
      "NORTHWIND_SCAFFOLD_CTA_PLACEHOLDER_LINE",
    ],
  },
] as const;

/** Extensiones de código fuente a auditar (incluye css/mdx, no solo tsx). */
const SRC_CODE_PRED = (name: string): boolean => /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/i.test(name);

function siteBasename(siteDir: string): string {
  const parts = siteDir.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

/**
 * Lista archivos bajo <siteDir>/src recursivamente, saltando SOLO node_modules/.next
 * (a diferencia de listFiles(), este NO salta "ui" — el leak puede estar ahí).
 */
function listSrcFiles(siteDir: string): string[] {
  const srcDir = join(siteDir, "src");
  if (!existsSync(srcDir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next") continue;
        walk(abs);
      } else if (SRC_CODE_PRED(ent.name)) {
        out.push(abs);
      }
    }
  };
  walk(srcDir);
  return out;
}

/**
 * Falla si cualquier frase ancla de un scaffold AJENO aparece en sites/<slug>/src/**.
 * Si siteDir ES el propio scaffold registrado, se salta a sí mismo (no se audita contra sí).
 */
export function checkScaffoldResidue(siteDir: string): QualityCheck {
  const slug = siteBasename(siteDir);
  const files = listSrcFiles(siteDir);
  const blob = files.map(readSafe).join("\n");
  const hits: string[] = [];

  for (const entry of SCAFFOLD_RESIDUE_REGISTRY) {
    if (slug === entry.scaffoldSlug) continue;
    for (const phrase of entry.anchorPhrases) {
      if (phrase.length < 25) continue;
      if (blob.includes(phrase)) {
        hits.push(`[${entry.scaffoldSlug}] "${phrase.slice(0, 48)}…"`);
      }
    }
  }

  if (hits.length === 0) {
    return {
      id: "scaffold-residue",
      ok: true,
      detail: `sin residuo de scaffolds ajenos (${SCAFFOLD_RESIDUE_REGISTRY.length} registrados)`,
    };
  }
  return {
    id: "scaffold-residue",
    ok: false,
    detail:
      `residuo verbatim del scaffold en src/: ${hits.join("; ")} — ` +
      `reescribe About/Footer/FinalCTA/constants with the lead's own copy (not scaffold markers)`,
  };
}

const FORBIDDEN_INTERNAL_PATTERNS: readonly { id: string; re: RegExp }[] = [
  { id: "precio_oferta_cop", re: /precio_oferta_cop/ },
  { id: "precioOfertaCop", re: /precioOfertaCop/ },
  { id: "precioOferta", re: /precioOferta\b/ },
  { id: "precio_oferta", re: /precio_oferta\b/ },
  { id: "Apify-only", re: /Apify-only/i },
] as const;

/** Identificador BUSINESS suelto (no property access / no string). */
const BUSINESS_IDENT_RE = /(?<![\w.$"'`])BUSINESS(?![\w$"'`])/g;
/** Import nombrado de BUSINESS desde cualquier módulo. */
const BUSINESS_IMPORT_RE =
  /import\s*\{[^}]*\bBUSINESS\b[^}]*\}\s*from\s*["'][^"']+["']/;
/** SVG path `d` / animateMotion `path` con porcentajes (inválidos en path data). */
const SVG_PERCENT_PATH_RE =
  /\b(?:d|path)\s*=\s*["'][^"']*%[^"']*["']/;

/**
 * Bloquea client components que referencian `BUSINESS` sin importarlo.
 * El HTML SSR puede salir OK (server no ejecuta el client chunk), pero Chrome
 * tira `Uncaught ReferenceError: BUSINESS is not defined` y Next reemplaza
 * con `html#__next_error__` ("This page couldn't load").
 * Seen when a "use client" banner reads BUSINESS.name without importing it.
 */
export function checkUnboundBusiness(siteDir: string): QualityCheck {
  const files = listSrcFiles(siteDir).filter((f) => /\.(tsx|jsx)$/i.test(f));
  const hits: string[] = [];

  for (const file of files) {
    const text = readSafe(file);
    if (!/^["']use client["']\s*;?/m.test(text)) continue;
    BUSINESS_IDENT_RE.lastIndex = 0;
    if (!BUSINESS_IDENT_RE.test(text)) continue;
    if (BUSINESS_IMPORT_RE.test(text)) continue;
    const rel = file.slice(siteDir.length).replace(/^[/\\]/, "");
    hits.push(rel);
  }

  if (hits.length === 0) {
    return {
      id: "unbound-business",
      ok: true,
      detail: "client components: BUSINESS importado o ausente",
    };
  }
  return {
    id: "unbound-business",
    ok: false,
    detail:
      `BUSINESS sin import en "use client": ${hits.slice(0, 6).join("; ")}` +
      (hits.length > 6 ? ` (+${hits.length - 6} más)` : "") +
      " — agrega `import { BUSINESS } from \"@/lib/constants\"` (ReferenceError en browser)",
  };
}

/**
 * Bloquea path data SVG con porcentajes (`d="M 16.5% 20% ..."`).
 * SVG path commands no aceptan `%`; el path no se dibuja / puede warn en consola.
 */
export function checkSvgPercentPaths(siteDir: string): QualityCheck {
  const files = listSrcFiles(siteDir).filter((f) => /\.(tsx|jsx|svg)$/i.test(f));
  const hits: string[] = [];

  for (const file of files) {
    const text = readSafe(file);
    if (!SVG_PERCENT_PATH_RE.test(text)) continue;
    const rel = file.slice(siteDir.length).replace(/^[/\\]/, "");
    hits.push(rel);
  }

  if (hits.length === 0) {
    return {
      id: "svg-percent-paths",
      ok: true,
      detail: "sin path SVG con porcentajes inválidos",
    };
  }
  return {
    id: "svg-percent-paths",
    ok: false,
    detail:
      `path SVG con % en: ${hits.slice(0, 6).join("; ")}` +
      (hits.length > 6 ? ` (+${hits.length - 6} más)` : "") +
      " — usa viewBox 0 0 100 100 y coordenadas numéricas (ej. M 16.5 20)",
  };
}

/**
 * Bloquea tokens de metadata comercial/interna de AUREUS dentro de sites/<slug>/src/**.
 * precio_oferta_cop es lo que AUREUS cobra por CONSTRUIR el sitio — nunca un precio
 * de servicio del negocio cliente. No debe existir en ningún archivo del sitio.
 */
export function checkNoInternalLeakage(siteDir: string): QualityCheck {
  const files = listSrcFiles(siteDir);
  const found: string[] = [];

  for (const file of files) {
    const text = readSafe(file);
    for (const { id, re } of FORBIDDEN_INTERNAL_PATTERNS) {
      if (re.test(text)) {
        const rel = file.slice(siteDir.length).replace(/^[/\\]/, "");
        found.push(`${id} @ ${rel}`);
      }
    }
  }

  if (found.length === 0) {
    return {
      id: "forbidden-internal-tokens",
      ok: true,
      detail: "src/ limpio de tokens internos (precio_oferta* / Apify-only)",
    };
  }
  return {
    id: "forbidden-internal-tokens",
    ok: false,
    detail:
      `leak de metadata interna en src/: ${found.slice(0, 8).join("; ")}` +
      (found.length > 8 ? ` (+${found.length - 8} más)` : "") +
      " — precio_oferta_cop es deal-meta de AUREUS, NUNCA va al sitio cliente",
  };
}

function listFiles(dir: string, pred: (name: string, abs: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "ui") continue;
        walk(abs);
      } else if (pred(ent.name, abs)) {
        out.push(abs);
      }
    }
  };
  walk(dir);
  return out;
}

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Parsea next en package.json (15.1.0, ^15.1.9, ~16.0.0, >=15.2.0) y
 * comprueba piso ≥15.1.9 (major>15 también OK, p.ej. ^16).
 */
export function nextVersionMeetsFloor(raw: string | undefined): {
  ok: boolean;
  detail: string;
} {
  if (!raw || typeof raw !== "string") {
    return { ok: false, detail: "FALTA dependencia next" };
  }
  const m = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return { ok: false, detail: `next "${raw}" no parseable (exige ≥15.1.9 o ^16)` };
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  const ok =
    major > MIN_NEXT_MAJOR ||
    (major === MIN_NEXT_MAJOR && minor > MIN_NEXT_MINOR) ||
    (major === MIN_NEXT_MAJOR && minor === MIN_NEXT_MINOR && patch >= MIN_NEXT_PATCH);
  return {
    ok,
    detail: ok
      ? `next ${raw} (≥${MIN_NEXT_MAJOR}.${MIN_NEXT_MINOR}.${MIN_NEXT_PATCH})`
      : `next ${raw} < ${MIN_NEXT_MAJOR}.${MIN_NEXT_MINOR}.${MIN_NEXT_PATCH} — bump obligatorio (CVE / Vercel security gate)`,
  };
}

/** Corre el gate sobre un directorio de sitio (sites/<slug>). */
export function runQualityGate(siteDir: string): QualityGateResult {
  const checks: QualityCheck[] = [];
  const pkgPath = join(siteDir, "package.json");
  const globalsPath = join(siteDir, "src", "app", "globals.css");
  const componentsDir = join(siteDir, "src", "components");
  const appDir = join(siteDir, "src", "app");

  // 0. Next ≥15.1.9 (o ^16) — bloquea 15.1.0 CVE en Vercel
  let nextOk = false;
  let nextDetail = "falta package.json";
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const nv = nextVersionMeetsFloor(deps["next"]);
      nextOk = nv.ok;
      nextDetail = nv.detail;
    } catch (e) {
      nextDetail = `package.json ilegible: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  checks.push({ id: "next-version", ok: nextOk, detail: nextDetail });

  // 1. package.json + framer-motion
  let pkgOk = false;
  let pkgDetail = "falta package.json";
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      pkgOk = Boolean(deps["framer-motion"]);
      pkgDetail = pkgOk
        ? `framer-motion ${deps["framer-motion"]}`
        : "FALTA dependencia framer-motion (motion es obligatorio en la barra de calidad)";
    } catch (e) {
      pkgDetail = `package.json ilegible: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  checks.push({ id: "framer-motion", ok: pkgOk, detail: pkgDetail });

  // 2. globals.css tamaño + tokens
  let cssOk = false;
  let cssDetail = "falta src/app/globals.css";
  if (existsSync(globalsPath)) {
    const bytes = statSync(globalsPath).size;
    const css = readSafe(globalsPath);
    const hasTokens =
      /--brand|--color-primary|--primary\s*:|--background\s*:|--foreground\s*:|--ink\s*:|--surface\s*:/i.test(
        css,
      );
    cssOk = bytes >= MIN_GLOBALS_CSS_BYTES && hasTokens;
    cssDetail = cssOk
      ? `globals.css ${bytes}B con tokens`
      : `globals.css ${bytes}B (mín ${MIN_GLOBALS_CSS_BYTES}) tokens=${hasTokens} — sitio demasiado delgado`;
  }
  checks.push({ id: "globals-css", ok: cssOk, detail: cssDetail });

  // 3. Dense scaffold: prefer src/components/landing/
  const landingDir = join(componentsDir, "landing");
  const landingTsx = listFiles(landingDir, (name) => name.endsWith(".tsx"));
  const landingOk = landingTsx.length >= MIN_LANDING_DIR_COMPONENTS;
  checks.push({
    id: "landing-scaffold",
    ok: landingOk,
    detail: landingOk
      ? `landing/ ${landingTsx.length} componentes (≥${MIN_LANDING_DIR_COMPONENTS})`
      : `landing/ tiene ${landingTsx.length} tsx (mín ${MIN_LANDING_DIR_COMPONENTS}) — copia el scaffold denso (sites/dense-scaffold) y recolorea; no inventes un spa de 5 bloques`,
  });

  // 3b. Tripwire anti-flat: archivos canónicos JA deben existir en landing/
  const landingBasenames = new Set(landingTsx.map((p) => p.split(/[/\\]/).pop()!));
  const missingRequired = REQUIRED_LANDING_FILES.filter((f) => !landingBasenames.has(f));
  const requiredOk = missingRequired.length === 0;
  checks.push({
    id: "landing-required-files",
    ok: requiredOk,
    detail: requiredOk
      ? `landing/ tiene ${REQUIRED_LANDING_FILES.join(", ")}`
      : `faltan en landing/: ${missingRequired.join(", ")} — dense scaffold incompleto (spa flat)`,
  });

  // 4. Componentes de sección totales (excluye ui/)
  const sectionTsx = listFiles(componentsDir, (name) => name.endsWith(".tsx"));
  const appTsx = listFiles(appDir, (name, abs) => name.endsWith(".tsx") && !abs.endsWith(`${join("app", "page.tsx")}`) && !abs.endsWith(`${join("app", "layout.tsx")}`));
  const sectionCount = sectionTsx.length;
  const sectionsOk = sectionCount >= MIN_SECTION_COMPONENTS;
  checks.push({
    id: "section-components",
    ok: sectionsOk,
    detail: sectionsOk
      ? `${sectionCount} componentes de sección (≥${MIN_SECTION_COMPONENTS})`
      : `${sectionCount} componentes de sección (mín ${MIN_SECTION_COMPONENTS}) — página demasiado simple; falta densidad DESIGN.md §7 / estándar JA`,
  });

  // 4. Señales de densidad en el código fuente (components + app + lib)
  const libDir = join(siteDir, "src", "lib");
  const libTs = listFiles(libDir, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  const sourceFiles = [
    ...sectionTsx,
    ...appTsx,
    ...libTs,
    join(appDir, "page.tsx"),
    join(appDir, "layout.tsx"),
  ].filter((p) => existsSync(p));
  const blob = sourceFiles.map(readSafe).join("\n");
  const signalsHit = SECTION_SIGNAL_PATTERNS.filter((re) => re.test(blob)).length;
  const signalsOk = signalsHit >= MIN_SECTION_SIGNALS;
  checks.push({
    id: "section-signals",
    ok: signalsOk,
    detail: signalsOk
      ? `${signalsHit}/${SECTION_SIGNAL_PATTERNS.length} señales de densidad`
      : `${signalsHit}/${SECTION_SIGNAL_PATTERNS.length} señales (mín ${MIN_SECTION_SIGNALS}) — faltan FAQ / método / beneficios / stats / newsletter / float WA / announcement`,
  });

  // 5. Tipografía: debe cargar ≥2 familias (next/font o link fonts) y NO Inter/Roboto como display único
  const fontFamilies = new Set<string>();
  for (const m of blob.matchAll(/from\s+["']next\/font\/(?:google|local)["']/g)) {
    void m;
    fontFamilies.add("next/font");
  }
  // named imports: import { Fraunces, Manrope } from 'next/font/google'
  for (const m of blob.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g)) {
    const names = m[1];
    if (!names) continue;
    for (const name of names.split(",")) {
      const n = name.trim().split(/\s+as\s+/)[0]?.trim();
      if (n) fontFamilies.add(n);
    }
  }
  const bannedSolo = /\b(Inter|Roboto|Arial|Open_Sans|OpenSans)\b/.test(blob) && fontFamilies.size <= 2;
  // Require at least 2 named google fonts OR explicit display+body comment tokens
  const namedFonts = [...fontFamilies].filter((f) => f !== "next/font");
  const fontsOk = namedFonts.length >= 2 && !bannedSolo;
  checks.push({
    id: "typography",
    ok: fontsOk,
    detail: fontsOk
      ? `fonts: ${namedFonts.join(", ")}`
      : `tipografía insuficiente (${namedFonts.join(", ") || "ninguna nombrada"}) — exige display+body expresivos; Inter/Roboto solos = FAIL`,
  });

  // 6. WhatsApp cableado — acepta literal wa.me/57… O construcción (`wa.me/${tel}`)
  //    siempre que haya dígitos E.164 en el árbol fuente (constants/lib).
  const waLiteral = /wa\.me\/\d{10,15}/.test(blob);
  const waBuilt =
    /wa\.me\/\$\{/.test(blob) ||
    /wa\.me\/["'`]\s*\+/.test(blob) ||
    (/https:\/\/wa\.me\//.test(blob) && /whatsappNumber|telefono_e164|phoneToWa|waDigits|WHATSAPP_/i.test(blob));
  const hasPhoneDigits = /\b57\d{10}\b/.test(blob) || /\+\s*57[\s-]?\d/.test(blob);
  const waOk = waLiteral || (waBuilt && hasPhoneDigits);
  checks.push({
    id: "whatsapp-href",
    ok: waOk,
    detail: waOk
      ? waLiteral
        ? "wa.me/<tel> literal en fuente"
        : "wa.me construido desde constants + dígitos presentes"
      : "falta wa.me cableado (literal o via constants con dígitos E.164)",
  });

  // 7. Residuo textual de scaffolds de referencia (anti copy-JA en otro vertical)
  checks.push(checkScaffoldResidue(siteDir));

  // 8. Tokens internos de fábrica (precio oferta AUREUS, etc.)
  checks.push(checkNoInternalLeakage(siteDir));

  // 9. BUSINESS suelto en client components → ReferenceError en Chrome
  checks.push(checkUnboundBusiness(siteDir));

  // 10. SVG path con porcentajes inválidos
  checks.push(checkSvgPercentPaths(siteDir));

  const failures = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
  return { ok: failures.length === 0, dir: siteDir, checks, failures };
}

/** Formato legible para CLI / agentes. */
export function formatQualityGate(result: QualityGateResult): string {
  const lines = [
    `quality-gate ${result.ok ? "PASS" : "FAIL"} — ${result.dir}`,
    ...result.checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}`),
  ];
  if (!result.ok) {
    lines.push("");
    lines.push("BLOQUEO: el sitio es demasiado simple para deploy.");
    lines.push("Lee docs/DESIGN.md §7 (densidad) + anti-checklist. Rebuild al nivel de");
    lines.push("sites/dense-scaffold (referencia de densidad, NO template de copia).");
    lines.push(
      "También bloquean: scaffold-residue (copy JA verbatim en otro vertical) y",
    );
    lines.push(
      "forbidden-internal-tokens (precio_oferta_cop / Apify-only — deal-meta de AUREUS).",
    );
    lines.push(
      "También: unbound-business (BUSINESS en use client sin import) y svg-percent-paths.",
    );
    lines.push("Luego: npm run fabrica -- quality <dir> && reintenta deploy.");
    lines.push("Scaffold: cp -a sites/dense-scaffold sites/<slug> y recolorea (no spa thin).");
  }
  return lines.join("\n");
}
