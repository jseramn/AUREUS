/**
 * Tests — criba (normalize + filters + sanitize wiring).
 * Pinnea la premisa ética (has_website) y el fix Maps-URL ≠ website.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./normalizer.js";
import { applyFilters } from "./filters.js";

const BASE = {
  title: "Norte Spa & Wellness",
  city: "Example City",
  countryCode: "CO",
  phone: "+57 300 1234567",
  categories: ["Spa terapéutico"],
  categoryName: "Spa terapéutico",
};

test("normalize: record con solo Maps URL en `url` NO cuenta como website", () => {
  const { business, error } = normalize({
    ...BASE,
    website: null,
    url: "https://www.google.com/maps/search/?api=1&query=x",
  });
  assert.equal(error, undefined);
  assert.ok(business);
  assert.equal(business!.website, null);
  assert.match(business!.googleMapsUrl ?? "", /google\.com\/maps/);
  const decision = applyFilters(business!);
  assert.equal(decision.pass, true);
});

test("normalize: website real dispara has_website (premisa ética)", () => {
  const { business } = normalize({ ...BASE, website: "https://example.com" });
  assert.ok(business);
  const decision = applyFilters(business!);
  assert.deepEqual(decision, { pass: false, reason: "has_website" });
});

test("normalize: url no-Maps no es website ni googleMapsUrl", () => {
  const { business } = normalize({ ...BASE, url: "https://facebook.com/negocio" });
  assert.ok(business);
  assert.equal(business!.website, null);
  assert.equal(business!.googleMapsUrl, null);
});

test("normalize: permanentlyClosed se descarta", () => {
  const { business, error } = normalize({ ...BASE, permanentlyClosed: true });
  assert.equal(business, null);
  assert.equal(error, "permanently_closed");
});

test("normalize: temporarilyClosed se descarta (cerrado)", () => {
  const { business, error } = normalize({ ...BASE, temporarilyClosed: true });
  assert.equal(business, null);
  assert.equal(error, "permanently_closed");
});

test("normalize: sin phone/address/maps -> insufficient_data", () => {
  const { business, error } = normalize({ title: "X", city: "C" });
  assert.equal(business, null);
  assert.equal(error, "insufficient_data");
});

test("normalize: sin nombre -> missing_name", () => {
  const { business, error } = normalize({ phone: "+573001112233" });
  assert.equal(business, null);
  assert.equal(error, "missing_name");
});

test("sanitize wiring: phone crudo de Apify sale E.164 en Business", () => {
  const { business } = normalize({ ...BASE, phone: "+57 300 1234567" });
  assert.ok(business);
  assert.equal(business!.phone, "+573001234567");
});

test("sanitize wiring: celular CO local recibe +57", () => {
  const { business } = normalize({ ...BASE, phone: "300 123 4567" });
  assert.ok(business);
  assert.equal(business!.phone, "+573001234567");
});

test("sanitize wiring: teléfono basura queda null (y sin address/maps descarta)", () => {
  const { business, error } = normalize({
    title: "X",
    city: "C",
    phone: "llámanos!",
  });
  assert.equal(business, null);
  assert.equal(error, "insufficient_data");
});

test("sanitize wiring: googleMapsUrl javascript: se elimina", () => {
  const { business } = normalize({
    ...BASE,
    googleMapsUrl: "javascript:alert(1)",
  });
  assert.ok(business);
  assert.equal(business!.googleMapsUrl, null);
});

test("sanitize wiring: rating fuera de rango se clampa", () => {
  const { business } = normalize({ ...BASE, rating: 9, reviewsCount: -5 });
  assert.ok(business);
  assert.equal(business!.rating, 5);
  assert.equal(business!.reviewsCount, null);
});
