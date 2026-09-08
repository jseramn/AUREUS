#!/usr/bin/env node
/**
 * fabrica CLI — Fábrica AUREUS v1 (Cursor-native).
 *
 * El orquestador NUNCA ejecuta el build: solo lee el store y despacha a los
 * agentes de .cursor/agents/. Este CLI maneja el estado y el deploy.
 *
 * Commands:
 *   fabrica ingest <dataset.json>     Apify JSON -> FILTERED (criba + sanitize)
 *                                     flags: --limit N, --dry-run, --vertical <v>, --reset-existing
 *   fabrica state                     Conteos por stage
 *   fabrica state <businessId>        Detalle de un lead
 *   fabrica list                      Lista leads (businessId, stage, slug, attempts)
 *                                     flags: --stage <STAGE>, --failed, --limit N
 *   fabrica advance <businessId> <stage>  Avanza un lead (solo hacia adelante)
 *                                     flags: --output <path>
 *   fabrica forja <businessId>        Valida site-spec (zod) -> SPEC_READY
 *                                     flags: --spec <archivo.json>
 *   fabrica deploy <businessId>       GitHub repo + Vercel prod + subdominio -> DEPLOYED
 *                                     flags: --dir <sites/slug>, --domain <apex>, --org <gh-org>
 *   fabrica report <businessId>       Marca REPORTED (tras enviar al comercial)
 *
 * Nota npm: los flags requieren separador — `npm run fabrica -- forja <id> --spec s.json`
 * o directo: `npx tsx cli/fabrica.ts forja <id> --spec s.json`.
 */
import { parseArgs } from "node:util";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createJsonPipelineStore,
  PIPELINE_STAGES,
  DISCARDED_STAGE,
  type PipelineStage,
} from "../orchestration/state-machine.js";
import { ingestDataset } from "../phases/01-criba/index.js";
import { validateForjaInput, SLUG, SLUG_DEMO } from "../phases/03-forja/index.js";
import { runQualityGate, formatQualityGate } from "../phases/04-construye/index.js";
import { phoneToWaDigits } from "../phases/01-criba/sanitize.js";
import { businessIdFor } from "../phases/_shared.js";

/**
 * Root del repo: sube desde cwd buscando un package.json de "aureus".
 * Evita el split-brain de correr `fabrica` desde sites/<slug>/ y crear
 * un state/pipeline.json nuevo y vacío ahí.
 */
function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
        if (parsed.name === "aureus") return dir;
      } catch { /* sigue subiendo */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findRoot();
const STATE_PATH = process.env.FABRICA_STATE ?? join(ROOT, "state", "pipeline.json");

function store() {
  return createJsonPipelineStore(STATE_PATH);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "ingest":
      return ingest(rest);
    case "state":
      return state(rest);
    case "list":
      return list(rest);
    case "advance":
      return advance(rest);
    case "forja":
      return forja(rest);
    case "deploy":
      return deploy(rest);
    case "quality":
      return quality(rest);
    case "report":
      return report(rest);
    default:
      printHelp();
      process.exit(cmd ? 1 : 0);
  }
}

function printHelp(): void {
  console.log(`fabrica — Fábrica AUREUS v1 (Cursor-native)

Usage (con npm agrega '--' antes de los flags: npm run fabrica -- <cmd> ...):
  fabrica ingest <dataset.json>       Apify JSON -> FILTERED (criba + sanitize)
                                      flags: --limit N, --dry-run, --vertical <v>, --reset-existing
  fabrica state                       Conteos por stage
  fabrica state <businessId>          Detalle de un lead
  fabrica list [--stage S] [--failed] Lista leads con businessId, stage, slug, attempts
  fabrica advance <businessId> <stage> [--output <path>]   Avanza (solo adelante)
  fabrica forja <businessId> --spec <archivo.json>         Valida spec -> SPEC_READY
  fabrica deploy <businessId> --dir <sites/slug> --domain <apex> --org <gh-org>
  fabrica quality <sites/slug>        Gate de densidad (bloquea sitios simples)
  fabrica report <businessId>         Marca REPORTED

Pipeline: RAW -> FILTERED -> RESEARCHED -> MARKET_BRIEFED -> SPEC_READY -> DEPLOYED -> REPORTED
Descarte: cualquier stage no-terminal -> DISCARDED (razón registrada).
Deploy corre quality-gate ANTES de Vercel: sin framer-motion / <8 secciones / CSS delgado = FAIL.
`);
}

/* ── ingest ─────────────────────────────────────────────────────────── */
function ingest(rest: string[]): void {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      limit: { type: "string" },
      "dry-run": { type: "boolean" },
      vertical: { type: "string" },
      "reset-existing": { type: "boolean" },
    },
    allowPositionals: true,
  });
  const dataset = positionals[0];
  if (!dataset) {
    console.error("Usage: fabrica ingest <dataset.json> [--limit N] [--dry-run] [--vertical v] [--reset-existing]");
    process.exit(1);
  }
  const report = ingestDataset(resolve(dataset), store(), {
    vertical: (values.vertical as string) ?? undefined,
    limit: values.limit ? Number(values.limit) : undefined,
    dryRun: Boolean(values["dry-run"]),
    resetExisting: Boolean(values["reset-existing"]),
  });
  console.log(JSON.stringify({
    total: report.total,
    accepted: report.accepted,
    duplicates: report.duplicates,
    skippedOverLimit: report.skippedOverLimit,
    discarded: report.discarded,
  }, null, 2));
}

/* ── state ──────────────────────────────────────────────────────────── */
function state(rest: string[]): void {
  const s = store();
  const id = rest[0];
  if (id) {
    const row = s.get(id);
    if (!row) {
      console.error(`No state for ${id}`);
      process.exit(1);
    }
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  const counts = s.countsByStage();
  const known = new Set<string>([...PIPELINE_STAGES, DISCARDED_STAGE]);
  console.log("fabrica pipeline status\n=======================");
  let total = 0;
  for (const stage of [...PIPELINE_STAGES, DISCARDED_STAGE]) {
    const n = counts[stage] ?? 0;
    total += n;
    const bar = "█".repeat(Math.min(40, n));
    console.log(`  ${stage.padEnd(16)} ${String(n).padStart(5)}  ${bar}`);
  }
  // Stages desconocidos (store legacy pre-v1): visibles, nunca silenciados.
  for (const [stage, n] of Object.entries(counts)) {
    if (!known.has(stage) && n > 0) {
      total += n;
      console.log(`  ${(stage + " (legacy)").padEnd(16)} ${String(n).padStart(5)}  ⚠`);
    }
  }
  console.log(`\n  TOTAL: ${total}`);
}

/* ── list ───────────────────────────────────────────────────────────── */
function list(rest: string[]): void {
  const { values } = parseArgs({
    args: rest,
    options: {
      stage: { type: "string" },
      failed: { type: "boolean" },
      limit: { type: "string" },
    },
  });
  const s = store();
  const limit = values.limit ? Number(values.limit) : 100;
  let rows = s.listAll({ limit: 10_000 });
  if (values.stage) rows = rows.filter((r) => r.stage === values.stage);
  if (values.failed) rows = rows.filter((r) => r.attempts > 0 || r.lastError !== null);
  rows = rows.slice(0, limit);
  if (rows.length === 0) {
    console.log("(sin leads que coincidan)");
    return;
  }
  for (const r of rows) {
    const err = r.lastError ? ` err="${r.lastError.slice(0, 60)}" (x${r.attempts})` : "";
    const reason = r.discardReason ? ` reason=${r.discardReason}` : "";
    console.log(`${r.stage.padEnd(14)} ${r.businessId}  slug=${r.slug ?? "-"}${reason}${err}`);
  }
}

/* ── advance ────────────────────────────────────────────────────────── */
/**
 * Solo para las transiciones del agente investiga. Los demás stages tienen
 * comando propio con validación real: forja -> SPEC_READY, deploy -> DEPLOYED,
 * report -> REPORTED. Sin esto, `advance <id> DEPLOYED` saltaría el deploy.
 */
const ADVANCE_ALLOWED_NEXT: PipelineStage[] = ["RESEARCHED", "MARKET_BRIEFED"];

function advance(rest: string[]): void {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { output: { type: "string" } },
    allowPositionals: true,
  });
  const [businessId, nextRaw] = positionals;
  if (!businessId || !nextRaw) {
    console.error("Usage: fabrica advance <businessId> <RESEARCHED|MARKET_BRIEFED> [--output <path>]");
    process.exit(1);
  }
  const next = nextRaw as PipelineStage;
  if (!ADVANCE_ALLOWED_NEXT.includes(next)) {
    console.error(
      `advance solo cubre ${ADVANCE_ALLOWED_NEXT.join("/")} (fase investiga). ` +
      `SPEC_READY = 'fabrica forja', DEPLOYED = 'fabrica deploy', REPORTED = 'fabrica report'.`,
    );
    process.exit(1);
  }
  const s = store();
  const row = s.get(businessId);
  if (!row) {
    console.error(`No state for ${businessId}`);
    process.exit(1);
  }
  if (row.stage === DISCARDED_STAGE) {
    console.error(`${businessId} está DISCARDED (${row.discardReason}). Usa resetTo manualmente si de verdad quieres revivirlo.`);
    process.exit(1);
  }
  const updated = s.advance(businessId, row.stage as PipelineStage, next, {
    output: values.output as string | undefined,
  });
  console.log(`${updated.stage} ${businessId}`);
}

/* ── forja ──────────────────────────────────────────────────────────── */
const FORJA_ALLOWED_FROM: PipelineStage[] = ["FILTERED", "RESEARCHED", "MARKET_BRIEFED"];

function forja(rest: string[]): void {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { spec: { type: "string" } },
    allowPositionals: true,
  });
  const businessId = positionals[0];
  if (!businessId) {
    console.error("Usage: fabrica forja <businessId> --spec <archivo.json>");
    process.exit(1);
  }
  const specPath = values.spec as string | undefined;
  if (!specPath || !existsSync(resolve(specPath))) {
    console.error("forja: falta --spec <archivo.json> con el site-spec");
    process.exit(1);
  }
  const s = store();
  const row = s.get(businessId);
  if (!row) {
    console.error(`No state for ${businessId}`);
    process.exit(1);
  }
  if (row.stage === DISCARDED_STAGE) {
    console.error(`forja: ${businessId} está DISCARDED (${row.discardReason}). Respeta el descarte.`);
    process.exit(1);
  }
  if (!FORJA_ALLOWED_FROM.includes(row.stage as PipelineStage)) {
    console.error(`forja: ${businessId} está en ${row.stage}; se permite desde ${FORJA_ALLOWED_FROM.join("/")}.`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(specPath), "utf8"));
  } catch (e) {
    console.error(`forja: spec no es JSON válido: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const result = validateForjaInput(raw);
  if (!result.ok) {
    const errors = result.errors ?? [];
    // Sin teléfono E.164 no hay wa.me: descarte TERMINAL, no retry.
    if (errors.some((e) => e.startsWith("telefono_e164:"))) {
      s.discard(businessId, "sin_contacto_verificable");
      console.log(`DISCARDED ${businessId}: sin_contacto_verificable`);
      return;
    }
    console.error("forja: site-spec inválido:");
    for (const err of errors) console.error(`  - ${err}`);
    s.markFailed(businessId, `site-spec inválido: ${errors.join("; ")}`);
    process.exit(1);
  }

  const { publicSpec, dealMeta } = result;
  const publicSpecOk = publicSpec!;
  const dealMetaOk = dealMeta!;

  // El spec debe pertenecer a ESTE lead (evita bind cruzado A↔B).
  const expectedId = businessIdFor(publicSpecOk.nombre, publicSpecOk.ciudad);
  if (expectedId !== businessId) {
    console.error(
      `forja: el spec parece de otro negocio (businessIdFor(nombre, ciudad) = ${expectedId}, esperado ${businessId}).`,
    );
    s.markFailed(businessId, `spec de otro negocio: ${expectedId}`);
    process.exit(1);
  }

  // Slug único cross-tenant: dos negocios distintos no comparten subdominio/repo/proyecto.
  const collision = s
    .listAll({ limit: 10_000 })
    .find((r) => r.slug === publicSpecOk.subdominio_slug && r.businessId !== businessId);
  if (collision) {
    const suffix = publicSpecOk.ciudad?.split(" ")[0]?.toLowerCase() ?? "2";
    console.error(
      `forja: slug "${publicSpecOk.subdominio_slug}" ya pertenece a ${collision.businessId}. Usa un sufijo antes de -demo (ej. mi-negocio-cartagena-demo).`,
    );
    s.markFailed(businessId, `slug en colisión con ${collision.businessId}`);
    process.exit(1);
  }

  // Persist public spec (SIN precio comercial) + deal meta interna
  const outDir = join(ROOT, "output", "03-site-spec");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${businessId}.json`);
  writeFileSync(outFile, JSON.stringify(publicSpecOk, null, 2), "utf8");

  const dealDir = join(ROOT, "output", "03-deal-meta");
  mkdirSync(dealDir, { recursive: true });
  writeFileSync(
    join(dealDir, `${businessId}.json`),
    JSON.stringify({ business_id: businessId, ...dealMetaOk }, null, 2),
    "utf8",
  );

  s.advance(businessId, row.stage as PipelineStage, "SPEC_READY", {
    output: `03-site-spec/${businessId}.json`,
    slug: publicSpecOk.subdominio_slug,
  });
  console.log(`SPEC_READY ${businessId} (slug=${publicSpecOk.subdominio_slug})`);
}

/* ── deploy ─────────────────────────────────────────────────────────── */
const SH_TIMEOUT_DEFAULT_MS = 120_000;
const SH_TIMEOUT_LONG_MS = 1_200_000; // vercel --prod / push: hasta 20 min

function sh(cmd: string, args: string[], cwd: string, timeoutMs = SH_TIMEOUT_DEFAULT_MS): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
}

const SITE_GITIGNORE = `node_modules/
.next/
out/
.vercel/
.env
.env.*
*.log
.DS_Store
`;

function deploy(rest: string[]): void {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      dir: { type: "string" },
      domain: { type: "string" },
      org: { type: "string" },
    },
    allowPositionals: true,
  });
  const businessId = positionals[0];
  if (!businessId) {
    console.error("Usage: fabrica deploy <businessId> --dir <sites/slug> --domain <apex> --org <gh-org>");
    process.exit(1);
  }
  const s = store();
  const row = s.get(businessId);
  if (!row) {
    console.error(`No state for ${businessId}`);
    process.exit(1);
  }
  if (row.stage !== "SPEC_READY") {
    console.error(`deploy: ${businessId} debe estar en SPEC_READY (está en ${row.stage})`);
    process.exit(1);
  }
  const slug = row.slug;
  // Re-validar SIEMPRE: el state file es JSON editable; un slug "../x" o
  // "--flag" se convertiría en path traversal / argument injection.
  if (!slug || !SLUG.test(slug)) {
    console.error(`deploy: slug inválido o ausente ("${slug}"). Corre forja primero.`);
    process.exit(1);
  }
  // Piso de marca: todo sitio público de la fábrica termina en -demo
  // (https://<slug>.example.com). Rechaza legacy sin sufijo.
  if (!SLUG_DEMO.test(slug)) {
    console.error(
      `deploy: slug "${slug}" debe terminar en -demo (SLUG_DEMO). Ejemplo: mi-negocio-demo.`,
    );
    process.exit(1);
  }
  const dir = values.dir ? resolve(values.dir as string) : resolve(ROOT, "sites", slug);
  const sitesRoot = resolve(ROOT, "sites");
  if (!dir.startsWith(sitesRoot + "/") && dir !== join(sitesRoot, slug)) {
    console.error(`deploy: --dir debe estar bajo ${sitesRoot} (recibido ${dir})`);
    process.exit(1);
  }
  const apex = (values.domain as string) ?? process.env.FABRICA_DOMAIN;
  if (!apex) {
    console.error("deploy: falta --domain <apex> (ej. midominio.com) o FABRICA_DOMAIN");
    process.exit(1);
  }
  const org = (values.org as string) ?? process.env.FABRICA_GH_ORG;
  if (!org) {
    console.error("deploy: falta --org <gh-org> o FABRICA_GH_ORG (no hay default: es tu cuenta de GitHub)");
    process.exit(1);
  }
  if (!existsSync(join(dir, "package.json"))) {
    console.error(`deploy: no hay proyecto en ${dir} (falta package.json). El agente construye debe correr primero.`);
    process.exit(1);
  }

  // Quality gate ANTES de tocar GitHub/Vercel — un landing "básico" no se publica.
  const gate = runQualityGate(dir);
  console.log(formatQualityGate(gate));
  if (!gate.ok) {
    s.markFailed(
      businessId,
      `quality-gate FAIL: sitio demasiado simple (${gate.failures.join("; ")})`,
    );
    console.error(
      `deploy: quality-gate bloqueó ${businessId}. Rebuild to the dense scaffold in DESIGN.md and retry.`,
    );
    process.exit(1);
  }

  const fqdn = `${slug}.${apex}`;
  console.log(`deploy ${businessId} → ${fqdn}`);

  try {
    // 0. .gitignore SIEMPRE antes de git add -A (no subir node_modules/.env/.vercel)
    const giPath = join(dir, ".gitignore");
    if (!existsSync(giPath)) {
      writeFileSync(giPath, SITE_GITIGNORE, "utf8");
    }

    // 1. GitHub repo + push — SOLO el .git DENTRO de sites/<slug>.
    //    `git rev-parse` desde un subdir sin .git propio resuelve el monorepo
    //    AUREUS y contaminaría main (commits "Regenerate <slug>" en el factory).
    console.log("  [1/4] GitHub repo + push");
    let freshRepo = false;
    const siteGitDir = join(dir, ".git");
    if (!existsSync(siteGitDir)) {
      sh("git", ["init", "-q", "-b", "main"], dir);
      freshRepo = true;
    }
    // Commit SIEMPRE el contenido actual (wipe-and-regenerate produce árbol nuevo;
    // pushear un HEAD viejo entregaría al comercial un repo distinto al sitio servido).
    sh("git", ["add", "-A"], dir);
    try {
      // Commit author from env so the factory never hardcodes a person.
      // Vercel rejects placeholder identities like fabrica@localhost.
      const gitName = process.env.FABRICA_GIT_NAME ?? process.env.GIT_AUTHOR_NAME ?? "aureus-factory";
      const gitEmail = process.env.FABRICA_GIT_EMAIL ?? process.env.GIT_AUTHOR_EMAIL ?? "aureus-factory@users.noreply.github.com";
      sh(
        "git",
        [
          "-c",
          `user.name=${gitName}`,
          "-c",
          `user.email=${gitEmail}`,
          "commit",
          "-q",
          "-m",
          freshRepo ? `Site ${slug}` : `Regenerate ${slug}`,
        ],
        dir,
      );
    } catch { /* nada que commitear: árbol sin cambios */ }

    const hasOrigin = (() => {
      try {
        sh("git", ["remote", "get-url", "origin"], dir);
        return true;
      } catch {
        return false;
      }
    })();
    if (!hasOrigin) {
      try {
        sh("gh", ["repo", "create", `${org}/${slug}`, "--private", "--source=.", "--remote=origin", "--push"], dir, SH_TIMEOUT_LONG_MS);
        try {
          sh("gh", ["api", "-X", "PATCH", `repos/${org}/${slug}`, "-f", "default_branch=main"], dir);
        } catch { /* best-effort; no bloquea el deploy si falla */ }
      } catch {
        // Repo ya existe (retry de wipe-and-regenerate): configura origin y push normal.
        sh("git", ["remote", "add", "origin", `https://github.com/${org}/${slug}.git`], dir);
        sh("git", ["push", "-u", "origin", "HEAD"], dir, SH_TIMEOUT_LONG_MS);
        try {
          sh("gh", ["api", "-X", "PATCH", `repos/${org}/${slug}`, "-f", "default_branch=main"], dir);
        } catch { /* best-effort; no bloquea el deploy si falla */ }
      }
    } else {
      sh("git", ["push", "-u", "origin", "HEAD"], dir, SH_TIMEOUT_LONG_MS);
    }

    // 2. Vercel link + prod
    console.log("  [2/4] Vercel link + prod");
    try {
      sh("vercel", ["link", "--yes"], dir);
    } catch { /* already linked */ }
    const deployOut = sh("vercel", ["--prod", "--yes"], dir, SH_TIMEOUT_LONG_MS);
    const deployUrlMatch = deployOut.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    const deployUrl = deployUrlMatch ? deployUrlMatch[0] : null;

    // 3. Add custom domain to project (API — alias solo no basta con SSO protection)
    console.log("  [3/4] add domain to project");
    let domainOk = true;
    try {
      sh("vercel", ["domains", "add", fqdn, slug], dir);
    } catch {
      try {
        sh("vercel", ["alias", "set", deployUrl ?? `${slug}.vercel.app`, fqdn], dir);
      } catch {
        domainOk = false;
      }
    }

    // 4. Smoke real: nombre del negocio + wa.me/<dígitos> en el HTML.
    //    - Contenido incorrecto (HTML llega pero sin nombre/teléfono) => FAILED.
    //    - DNS aún propagando (curl no resuelve) => DEPLOYED con smoke=pendiente
    //      (el deployment en sí ya fue verificado por vercel --prod READY).
    console.log("  [4/4] smoke");
    let smoke: "ok" | "pendiente" | "contenido_malo" = "pendiente";
    const specPath = join(ROOT, "output", "03-site-spec", `${businessId}.json`);
    let expectedName: string | null = null;
    let expectedWa: string | null = null;
    if (existsSync(specPath)) {
      try {
        const spec = JSON.parse(readFileSync(specPath, "utf8")) as { nombre?: string; telefono_e164?: string };
        expectedName = spec.nombre ?? null;
        expectedWa = spec.telefono_e164 ? `wa.me/${phoneToWaDigits(spec.telefono_e164)}` : null;
      } catch { /* sin spec legible: smoke degradado a substring */ }
    }
    try {
      const html = sh("curl", ["-fsSL", "--max-time", "30", `https://${fqdn}`], dir);
      const nameOk = expectedName ? html.includes(expectedName) : html.includes("wa.me/");
      const waOk = expectedWa ? html.includes(expectedWa) : html.includes("wa.me/");
      smoke = nameOk && waOk ? "ok" : "contenido_malo";
    } catch { /* DNS propagando */ }

    if (smoke === "contenido_malo") {
      s.markFailed(businessId, `smoke falló: el HTML de https://${fqdn} no contiene nombre + wa.me esperados`);
      console.error(`deploy: smoke de contenido falló en https://${fqdn} — lead marcado FAILED`);
      process.exit(1);
    }

    s.advance(businessId, "SPEC_READY", "DEPLOYED", {
      output: `https://${fqdn} (smoke=${smoke}${domainOk ? "" : ", domain=pendiente"})`,
    });
    console.log(JSON.stringify({
      slug,
      fqdn,
      deployUrl,
      repo: `https://github.com/${org}/${slug}`,
      domain: domainOk ? "ok" : "pendiente",
      smoke,
    }, null, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    s.markFailed(businessId, `deploy falló: ${msg}`);
    console.error(`deploy falló: ${msg}`);
    process.exit(1);
  }
}

/* ── quality ────────────────────────────────────────────────────────── */
function quality(rest: string[]): void {
  const dirArg = rest[0];
  if (!dirArg) {
    console.error("Usage: fabrica quality <sites/slug>");
    process.exit(1);
  }
  const dir = resolve(dirArg);
  const gate = runQualityGate(dir);
  console.log(formatQualityGate(gate));
  process.exit(gate.ok ? 0 : 1);
}

/* ── report ─────────────────────────────────────────────────────────── */
function report(rest: string[]): void {
  const businessId = rest[0];
  if (!businessId) {
    console.error("Usage: fabrica report <businessId>");
    process.exit(1);
  }
  const s = store();
  const row = s.get(businessId);
  if (!row) {
    console.error(`No state for ${businessId}`);
    process.exit(1);
  }
  if (row.stage !== "DEPLOYED") {
    console.error(`report: ${businessId} debe estar en DEPLOYED (está en ${row.stage})`);
    process.exit(1);
  }

  const siteSpecPath = join(ROOT, "output", "03-site-spec", `${businessId}.json`);
  const dealMetaPath = join(ROOT, "output", "03-deal-meta", `${businessId}.json`);
  if (!existsSync(siteSpecPath)) {
    console.error(`report: missing ${siteSpecPath}`);
    process.exit(1);
  }

  let publicSpec: {
    nombre?: string;
    telefono_e164?: string;
    ciudad?: string | null;
    categoria?: string | null;
    subdominio_slug?: string;
  };
  try {
    publicSpec = JSON.parse(readFileSync(siteSpecPath, "utf8")) as typeof publicSpec;
  } catch (e) {
    console.error(`report: site-spec inválido: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const phone = typeof publicSpec.telefono_e164 === "string" ? publicSpec.telefono_e164.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    console.error(`report: telefono_e164 inválido en site-spec ("${phone}")`);
    process.exit(1);
  }

  const deployedRaw = row.outputs.DEPLOYED ?? "";
  const demoMatch = deployedRaw.match(/https:\/\/[^\s)]+/);
  const apex = process.env.FABRICA_DEMO_APEX?.trim();
  const demo_url =
    demoMatch?.[0] ??
    (row.slug && apex ? `https://${row.slug}.${apex}` : null);
  if (!demo_url) {
    console.error(
      `report: no pude resolver demo_url desde outputs.DEPLOYED ("${deployedRaw}"). Set FABRICA_DEMO_APEX o re-deploy.`,
    );
    process.exit(1);
  }

  let precio_oferta_cop: number | undefined;
  if (existsSync(dealMetaPath)) {
    try {
      const dealMeta = JSON.parse(readFileSync(dealMetaPath, "utf8")) as {
        precio_oferta_cop?: number;
      };
      if (typeof dealMeta.precio_oferta_cop === "number") {
        precio_oferta_cop = dealMeta.precio_oferta_cop;
      }
    } catch {
      /* deal-meta optional for handoff shape */
    }
  }

  const business_name =
    typeof publicSpec.nombre === "string" && publicSpec.nombre.trim()
      ? publicSpec.nombre.trim()
      : businessId;
  const city =
    typeof publicSpec.ciudad === "string" && publicSpec.ciudad.trim()
      ? publicSpec.ciudad.trim()
      : undefined;
  const vertical =
    typeof publicSpec.categoria === "string" && publicSpec.categoria.trim()
      ? publicSpec.categoria.trim()
      : undefined;

  const handoff = {
    version: 1 as const,
    businessId,
    phone_e164: phone,
    demo_url,
    business_name,
    contact_name: business_name,
    city,
    vertical,
    observation: city
      ? `su negocio ${business_name} en ${city} con Instagram/presencia operativa y sin sitio profesional fuerte`
      : `su negocio ${business_name} con presencia operativa y sin sitio profesional fuerte`,
    precio_oferta_cop,
    deal_meta_path: existsSync(dealMetaPath) ? `output/03-deal-meta/${businessId}.json` : null,
    site_spec_path: `output/03-site-spec/${businessId}.json`,
    deployed_output: deployedRaw,
  };

  const handoffDir = join(ROOT, "output", "05-sales-handoff");
  mkdirSync(handoffDir, { recursive: true });
  const handoffPath = join(handoffDir, `${businessId}.json`);
  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2), "utf8");

  s.advance(businessId, "DEPLOYED", "REPORTED", {
    output: `05-sales-handoff/${businessId}.json`,
  });
  console.log(
    JSON.stringify(
      {
        stage: "REPORTED",
        businessId,
        handoff: `output/05-sales-handoff/${businessId}.json`,
        demo_url,
        phone_e164: phone,
        next: "Pass output/05-sales-handoff/<id>.json to your sales pipeline",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
