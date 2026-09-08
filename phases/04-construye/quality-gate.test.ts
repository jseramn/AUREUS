import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runQualityGate } from "./quality-gate.js";

function writeSite(
  root: string,
  opts: {
    framer?: boolean;
    cssBytes?: number;
    sections?: string[];
    fonts?: string[];
    wa?: boolean;
    signalsExtra?: string;
    next?: string;
    flatComponents?: boolean;
  },
): void {
  mkdirSync(join(root, "src", "app"), { recursive: true });
  const compRoot = opts.flatComponents
    ? join(root, "src", "components")
    : join(root, "src", "components", "landing");
  mkdirSync(compRoot, { recursive: true });
  const deps: Record<string, string> = { next: "15.1.9", react: "19.0.0" };
  if (opts.framer !== false) deps["framer-motion"] = "^11.0.0";
  if (opts.next) deps["next"] = opts.next;
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", dependencies: deps }));
  const cssPad = "/* pad */\n".repeat(Math.max(0, Math.ceil((opts.cssBytes ?? 9000) / 10)));
  writeFileSync(
    join(root, "src", "app", "globals.css"),
    `:root { --brand-primary: #123; --brand-accent: #456; --surface: #fff; --ink: #111; }\n${cssPad}`,
  );
  const fonts = opts.fonts ?? ["Fraunces", "Manrope"];
  writeFileSync(
    join(root, "src", "app", "layout.tsx"),
    `import { ${fonts.join(", ")} } from "next/font/google";\nexport default function L({children}){return children}\n`,
  );
  const wa = opts.wa !== false ? 'href="https://wa.me/573001234567"' : "";
  writeFileSync(
    join(root, "src", "app", "page.tsx"),
    `export default function Page(){return <a ${wa}>wa</a>}\n`,
  );
  const sections = opts.sections ?? [
    "AnnouncementBar",
    "Hero",
    "AnimatedStats",
    "Services",
    "HowItWorks",
    "Benefits",
    "Testimonials",
    "FAQSection",
    "EnhancedContactMap",
    "FinalCTA",
    "Footer",
    "WhatsAppFloatingButton",
    "SocialProofNotification",
    "Newsletter",
    "ScrollProgressBar",
    "PageLoader",
  ];
  for (const name of sections) {
    const body = `
      /* announcement servicios beneficios metodo faq preguntas contacto footer hero whatsapp float reseñas confianza stats métricas newsletter subscribe */
      export function ${name}(){ return <section id="${name}">${name} ${opts.signalsExtra ?? ""}</section> }
    `;
    writeFileSync(join(compRoot, `${name}.tsx`), body);
  }
}

describe("quality-gate", () => {
  it("PASS on dense site (JA-shaped)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-pass-"));
    try {
      writeSite(dir, {});
      const r = runQualityGate(dir);
      assert.equal(r.ok, true, formatFail(r));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL without framer-motion (T8 failure mode)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-noframer-"));
    try {
      writeSite(dir, { framer: false });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("framer-motion:")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL with Next 15.1.0 (CVE / Vercel security gate)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-nextcve-"));
    try {
      writeSite(dir, { next: "15.1.0" });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("next-version:")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PASS with Next ^16", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-next16-"));
    try {
      writeSite(dir, { next: "^16.0.0" });
      const r = runQualityGate(dir);
      assert.equal(r.ok, true, formatFail(r));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL with too few section components (simple landing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-thin-"));
    try {
      writeSite(dir, { sections: ["Hero", "Contact", "Footer"] });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(
        r.failures.some((f) => f.startsWith("section-components:") || f.startsWith("landing-scaffold:")),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL when landing/ misses JA canonical files (anti-flat tripwire)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-noreq-"));
    try {
      // Dense counts but rename away required JA files
      writeSite(dir, {
        sections: [
          "AnnouncementBar",
          "Hero",
          "StatsBlock", // not AnimatedStats
          "Services",
          "HowItWorks",
          "Benefits",
          "Testimonials",
          "FaqBlock", // not FAQSection
          "EnhancedContactMap",
          "CtaBlock", // not FinalCTA
          "Footer",
          "WaFloat", // not WhatsAppFloatingButton
          "SocialProofNotification",
          "Newsletter",
          "ScrollProgressBar",
          "PageLoader",
        ],
      });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("landing-required-files:")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL thin spa flat scaffold (lote-10 failure mode)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-flat-"));
    try {
      writeSite(dir, {
        flatComponents: true,
        cssBytes: 3000,
        sections: [
          "AnnouncementBar",
          "Hero",
          "Services",
          "Method",
          "Benefits",
          "Faq",
          "Contact",
          "Footer",
          "WhatsAppFloat",
          "SocialProof",
        ],
      });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("landing-scaffold:")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL thin globals.css", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-css-"));
    try {
      writeSite(dir, { cssBytes: 200 });
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("globals-css:")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PASS against real JA reference if present", async () => {
    const ja = join(process.cwd(), "sites", "dense-scaffold");
    const { existsSync } = await import("node:fs");
    if (!existsSync(ja)) return; // skip in CI without sites/
    const r = runQualityGate(ja);
    assert.equal(r.ok, true, formatFail(r));
  });

  it("FAIL scaffold-residue when JA bio phrase appears in another site", () => {
    const parent = mkdtempSync(join(tmpdir(), "qg-ja-leak-"));
    const dir = join(parent, "otro-negocio-demo");
    try {
      mkdirSync(dir, { recursive: true });
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "AboutPoli.tsx"),
        `export function AboutSection(){ return <p>NORTHWIND_DENSE_SCAFFOLD_BIOGRAPHY_LINE</p> }\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("scaffold-residue:")), formatFail(r));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("FAIL scaffold-residue on Footer JA tagline phrase", () => {
    const parent = mkdtempSync(join(tmpdir(), "qg-ja-footer-"));
    const dir = join(parent, "otro-negocio-demo");
    try {
      mkdirSync(dir, { recursive: true });
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "Footer.tsx"),
        `export function Footer(){ return <footer>NORTHWIND_SCAFFOLD_FOOTER_TAGLINE_COPY</footer> }\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(r.failures.some((f) => f.startsWith("scaffold-residue:")), formatFail(r));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("PASS scaffold-residue when siteDir basename IS the JA scaffold", () => {
    const parent = mkdtempSync(join(tmpdir(), "qg-ja-self-"));
    const dir = join(parent, "dense-scaffold");
    try {
      mkdirSync(dir, { recursive: true });
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "AboutPoli.tsx"),
        `export function AboutSection(){ return <p>NORTHWIND_DENSE_SCAFFOLD_BIOGRAPHY_LINE</p> }\n`,
      );
      const r = runQualityGate(dir);
      const check = r.checks.find((c) => c.id === "scaffold-residue");
      assert.ok(check, "missing scaffold-residue check");
      assert.equal(check!.ok, true, check!.detail);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("PASS scaffold-residue on clean dense site (no JA phrases)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-clean-"));
    try {
      writeSite(dir, {});
      const r = runQualityGate(dir);
      const check = r.checks.find((c) => c.id === "scaffold-residue");
      assert.ok(check, "missing scaffold-residue check");
      assert.equal(check!.ok, true, check!.detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL forbidden-internal-tokens on precioOfertaCop in constants (subjudice mode)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-precio-camel-"));
    try {
      writeSite(dir, {});
      mkdirSync(join(dir, "src", "lib"), { recursive: true });
      writeFileSync(
        join(dir, "src", "lib", "constants.ts"),
        `export const BUSINESS = { name: "X", precioOfertaCop: 500_000 };\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(
        r.failures.some((f) => f.startsWith("forbidden-internal-tokens:")),
        formatFail(r),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL forbidden-internal-tokens on precio_oferta_cop snake_case", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-precio-snake-"));
    try {
      writeSite(dir, {});
      mkdirSync(join(dir, "src", "lib"), { recursive: true });
      writeFileSync(
        join(dir, "src", "lib", "deal-meta.ts"),
        `export const meta = { precio_oferta_cop: 500000 };\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(
        r.failures.some((f) => f.startsWith("forbidden-internal-tokens:")),
        formatFail(r),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PASS forbidden-internal-tokens when only client service prices appear", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-client-prices-"));
    try {
      writeSite(dir, {});
      mkdirSync(join(dir, "src", "lib"), { recursive: true });
      writeFileSync(
        join(dir, "src", "lib", "prices.ts"),
        `export const PRICES = { limpiezaFacial: "$150.000", masaje: "$85.000" };\n`,
      );
      const r = runQualityGate(dir);
      const check = r.checks.find((c) => c.id === "forbidden-internal-tokens");
      assert.ok(check, "missing forbidden-internal-tokens check");
      assert.equal(check!.ok, true, check!.detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL unbound-business when use client references BUSINESS without import", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-unbound-biz-"));
    try {
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "AnnouncementBar.tsx"),
        `"use client";\nexport function AnnouncementBar(){ return <strong>{BUSINESS.name}</strong> }\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(
        r.failures.some((f) => f.startsWith("unbound-business:")),
        formatFail(r),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PASS unbound-business when BUSINESS is imported in use client", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-bound-biz-"));
    try {
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "AnnouncementBar.tsx"),
        `"use client";\nimport { BUSINESS } from "@/lib/constants";\nexport function AnnouncementBar(){ return <strong>{BUSINESS.name}</strong> }\n`,
      );
      const r = runQualityGate(dir);
      const check = r.checks.find((c) => c.id === "unbound-business");
      assert.ok(check, "missing unbound-business check");
      assert.equal(check!.ok, true, check!.detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAIL svg-percent-paths when path d contains percentages", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-svg-pct-"));
    try {
      writeSite(dir, {});
      writeFileSync(
        join(dir, "src", "components", "landing", "Benefits.tsx"),
        `export function Benefits(){ return <path d="M 16.5% 20% L 50% 55%" /> }\n`,
      );
      const r = runQualityGate(dir);
      assert.equal(r.ok, false);
      assert.ok(
        r.failures.some((f) => f.startsWith("svg-percent-paths:")),
        formatFail(r),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function formatFail(r: { failures: string[]; checks: { id: string; ok: boolean; detail: string }[] }): string {
  return r.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}`).join("\n");
}
