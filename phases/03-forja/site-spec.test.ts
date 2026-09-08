/**
 * Tests — site-spec (Fase 3, contrato zod forja → construye).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSiteSpec, validateForjaInput, isContactable, SLUG_DEMO } from "./site-spec.js";

const VALID_PUBLIC = {
  nombre: "Norte Spa & Wellness",
  telefono_e164: "+573001234567",
  direccion: "Calle 1 #2-3",
  ciudad: "Example City",
  categoria: "Spa terapéutico",
  instagram: null,
  google_maps_url: "https://www.google.com/maps/search/?api=1&query=x",
  subdominio_slug: "norte-spa-demo",
  rating: 5,
  reviews_count: 315,
};

const VALID_FORJA_INPUT = { ...VALID_PUBLIC, precio_oferta_cop: 500000 };

test("spec válido pasa", () => {
  const r = validateSiteSpec(VALID_PUBLIC);
  assert.equal(r.ok, true);
  assert.equal(r.spec!.subdominio_slug, "norte-spa-demo");
});

test("teléfono no E.164 falla con error legible", () => {
  const r = validateSiteSpec({ ...VALID_PUBLIC, telefono_e164: "3001234567" });
  assert.equal(r.ok, false);
  assert.ok(r.errors!.some((e) => e.startsWith("telefono_e164:")));
});

test("slug inválido falla", () => {
  const r = validateSiteSpec({ ...VALID_PUBLIC, subdominio_slug: "Con Espacios" });
  assert.equal(r.ok, false);
  assert.ok(r.errors!.some((e) => e.startsWith("subdominio_slug:")));
});

test("slug sin sufijo -demo falla", () => {
  const r = validateSiteSpec({ ...VALID_PUBLIC, subdominio_slug: "norte-spa" });
  assert.equal(r.ok, false);
  assert.ok(r.errors!.some((e) => e.includes("-demo") || e.startsWith("subdominio_slug:")));
});

test("slug *-demo válido cumple SLUG_DEMO", () => {
  assert.match("demo-site-demo", SLUG_DEMO);
  assert.match("norte-spa-demo", SLUG_DEMO);
  assert.doesNotMatch("acmeglow", SLUG_DEMO);
  assert.doesNotMatch("demo", SLUG_DEMO);
});

test("google_maps_url javascript: se rechaza (XSS almacenado)", () => {
  const r = validateSiteSpec({ ...VALID_PUBLIC, google_maps_url: "javascript:alert(1)" });
  assert.equal(r.ok, false);
  assert.ok(r.errors!.some((e) => e.startsWith("google_maps_url:")));
});

test("instagram: handle o URL https válidos; javascript: se rechaza", () => {
  assert.equal(validateSiteSpec({ ...VALID_PUBLIC, instagram: "@donluigi" }).ok, true);
  assert.equal(validateSiteSpec({ ...VALID_PUBLIC, instagram: "https://instagram.com/x" }).ok, true);
  assert.equal(validateSiteSpec({ ...VALID_PUBLIC, instagram: "javascript:alert(1)" }).ok, false);
});

test("rating fuera de 0..5 falla", () => {
  assert.equal(validateSiteSpec({ ...VALID_PUBLIC, rating: 6 }).ok, false);
});

test("validateSiteSpec rechaza precio_oferta_cop residual (strict)", () => {
  const r = validateSiteSpec({ ...VALID_PUBLIC, precio_oferta_cop: 500000 });
  assert.equal(r.ok, false);
});

test("validateForjaInput separa publicSpec y dealMeta", () => {
  const r = validateForjaInput(VALID_FORJA_INPUT);
  assert.equal(r.ok, true);
  assert.equal(r.dealMeta!.precio_oferta_cop, 500000);
  assert.equal((r.publicSpec as any).precio_oferta_cop, undefined);
  assert.equal(r.publicSpec!.subdominio_slug, "norte-spa-demo");
});

test("validateForjaInput sin precio_oferta_cop falla", () => {
  assert.equal(validateForjaInput(VALID_PUBLIC).ok, false);
});

test("validateForjaInput con precio_oferta_cop: 0 falla", () => {
  assert.equal(validateForjaInput({ ...VALID_FORJA_INPUT, precio_oferta_cop: 0 }).ok, false);
});

test("isContactable", () => {
  assert.equal(isContactable({ telefono_e164: "+573001234567" }), true);
  assert.equal(isContactable({ telefono_e164: "573001234567" }), false);
});
