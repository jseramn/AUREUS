/**
 * Tests — sanitize (Fase 1).
 * Pinnea el contrato del sanitizador campo por campo (D7/D10).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizePhoneE164,
  phoneToWaDigits,
  sanitizeText,
  slugify,
  slugifyDemo,
  compactSlugBase,
  allocateUniqueDemoSlug,
  sanitizeUrl,
  sanitizeRating,
  sanitizeCount,
  E164,
} from "./sanitize.js";
import { SLUG, SLUG_DEMO } from "../03-forja/site-spec.js";

test("sanitizePhoneE164: E.164 con espacios se normaliza", () => {
  assert.equal(sanitizePhoneE164("+57 300 1234567"), "+573001234567");
});

test("sanitizePhoneE164: celular colombiano local (10 dígitos, inicia en 3) recibe +57", () => {
  assert.equal(sanitizePhoneE164("300-123-4567", "57"), "+573001234567");
  assert.equal(sanitizePhoneE164("3001234567", "57"), "+573001234567");
});

test("sanitizePhoneE164: sin '+' y sin heurística aplicable -> null (no inventar país)", () => {
  assert.equal(sanitizePhoneE164("3001234567"), null); // sin defaultCountryCode
  assert.equal(sanitizePhoneE164("45152796", "57"), null); // 8 dígitos, no celular CO
});

test("sanitizePhoneE164: basura y ceros a la izquierda -> null", () => {
  assert.equal(sanitizePhoneE164("no es tel"), null);
  assert.equal(sanitizePhoneE164("+0573001234567"), null); // E164 no permite 0 inicial
  assert.equal(sanitizePhoneE164(""), null);
  assert.equal(sanitizePhoneE164(null), null);
});

test("contrato: todo output de sanitizePhoneE164 pasa el E164 del site-spec", () => {
  const samples = ["+57 300 1234567", "3001234567", "+1 (415) 555-0100", "310 456 7890"];
  for (const s of samples) {
    const out = sanitizePhoneE164(s, "57");
    if (out !== null) assert.match(out, E164, `output ${out} debe cumplir E164`);
  }
});

test("phoneToWaDigits: quita el +", () => {
  assert.equal(phoneToWaDigits("+573001234567"), "573001234567");
});

test("sanitizeText: colapsa espacios y vacío -> null", () => {
  assert.equal(sanitizeText("  hola   mundo  "), "hola mundo");
  assert.equal(sanitizeText("   "), null);
  assert.equal(sanitizeText(null), null);
});

test("slugify: tildes y ñ", () => {
  assert.equal(slugify("Peluquería Ñoño & Café"), "peluqueria-nono-cafe");
  assert.equal(slugify("Pizzería Doña"), "pizzeria-dona");
});

test("slugify: truncado a 63 no deja guión final", () => {
  const name = "a".repeat(62) + "-bcdef";
  const out = slugify(name);
  assert.ok(out.length <= 63);
  assert.ok(!out.endsWith("-"), `no debe terminar en guión: ${out}`);
});

test("slugify: sin alfanuméricos ASCII -> string vacío (forja lo rechaza vía SLUG)", () => {
  assert.equal(slugify("日本語"), "");
});

test("contrato: slugify no-vacío siempre cumple el SLUG del site-spec", () => {
  const samples = ["Norte Spa & Wellness", "Café---Río", "x"];
  for (const s of samples) {
    const out = slugify(s);
    if (out !== "") assert.match(out, SLUG, `slug ${out} debe cumplir SLUG`);
  }
});

test("slugifyDemo: siempre termina en -demo y ≤63", () => {
  assert.equal(slugifyDemo("Acme Glow"), "acme-glow-demo");
  assert.equal(slugifyDemo("Norte Spa"), "norte-spa-demo");
  assert.equal(slugifyDemo("ya-tiene-demo"), "ya-tiene-demo"); // no duplica
  const long = slugifyDemo("a".repeat(80));
  assert.ok(long.endsWith("-demo"));
  assert.ok(long.length <= 63);
  assert.match(long, SLUG_DEMO);
});

test("slugifyDemo: quita fluff inmobiliaria/constructora/sas/medellin/agencia-de", () => {
  assert.equal(slugifyDemo("ACME INMOBILIARIA & CONSTRUCTORA"), "acme-demo");
  assert.equal(slugifyDemo("FOOBAR inmobiliaria Medellín"), "foobar-demo");
  assert.equal(slugifyDemo("RENTALS DEMOCO S.A.S"), "rentals-democo-demo");
  assert.equal(slugifyDemo("Agencia de Arrendamientos DemoCo"), "arrendamientos-democo-demo");
  assert.equal(slugifyDemo("North Studio S.A.S."), "north-studio-demo");
});

test("compactSlugBase: si solo hay fluff, conserva el original", () => {
  assert.equal(compactSlugBase("inmobiliaria"), "inmobiliaria");
  assert.equal(compactSlugBase("sas"), "sas");
});

test("allocateUniqueDemoSlug: colisiones → stem-2-demo", () => {
  const used = new Set<string>();
  assert.equal(allocateUniqueDemoSlug("Acme", used), "acme-demo");
  assert.equal(allocateUniqueDemoSlug("ACME INMOBILIARIA", used), "acme-2-demo");
  assert.equal(allocateUniqueDemoSlug("Acme Constructora", used), "acme-3-demo");
});

test("contrato: slugifyDemo no-vacío cumple SLUG_DEMO", () => {
  for (const s of ["Pizzería Doña Luigi", "North Studio S.A.S.", "x"]) {
    const out = slugifyDemo(s);
    if (out !== "") assert.match(out, SLUG_DEMO, `slug ${out} debe cumplir SLUG_DEMO`);
  }
});

test("sanitizeUrl: http(s) pasa, esquemas peligrosos -> null", () => {
  assert.equal(sanitizeUrl("https://maps.app.goo.gl/x"), "https://maps.app.goo.gl/x");
  assert.equal(sanitizeUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeUrl("data:text/html,x"), null);
  assert.equal(sanitizeUrl("ftp://x"), null);
  assert.equal(sanitizeUrl("no-es-url"), null);
});

test("sanitizeRating: clamp 0..5", () => {
  assert.equal(sanitizeRating(7), 5);
  assert.equal(sanitizeRating(-1), 0);
  assert.equal(sanitizeRating(4.6), 4.6);
  assert.equal(sanitizeRating("x"), null);
});

test("sanitizeCount: entero >= 0", () => {
  assert.equal(sanitizeCount(315), 315);
  assert.equal(sanitizeCount(3.9), 3);
  assert.equal(sanitizeCount(-2), null);
  assert.equal(sanitizeCount(null), null);
});
