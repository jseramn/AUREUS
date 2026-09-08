/**
 * Fase 1 — Criba: ingest.
 * Reads an Apify dataset (JSON array or NDJSON), normalizes, filters, dedups,
 * and writes FILTERED businesses into the pipeline store.
 *
 * - Una sola escritura del store por corrida (store.batch) — O(N), no O(N²).
 * - Los descartes con identidad (business normalizado que falla filtros) se
 *   PERSISTEN como DISCARDED con razón. Los rechazos de normalización
 *   (schema_error, missing_name, etc.) no tienen id estable — solo se cuentan.
 * - Dedup cross-batch: un lead ya presente más allá de RAW cuenta como
 *   duplicado, no como aceptado.
 * - Slug default asignado en FILTERED (slugifyDemo compacto → `{nombre}-demo`);
 *   forja lo puede reemplazar con el subdominio_slug del spec (también *-demo).
 *   Colisiones de slug se resuelven con `-2-demo`, `-3-demo`, …
 */
import { readFileSync } from "node:fs";
import { normalize } from "./normalizer.js";
import { applyFilters, bumpDiscard, newDiscardReport, type DiscardReport, type DiscardReason } from "./filters.js";
import { allocateUniqueDemoSlug } from "./sanitize.js";
import type { Business } from "../_shared.js";
import type { PipelineStore } from "../../orchestration/state-machine.js";

export interface IngestOptions {
  vertical?: string;
  verticalCategories?: string[];
  limit?: number;
  dryRun?: boolean;
  resetExisting?: boolean;
}

export interface IngestReport {
  total: number;
  accepted: number;
  discarded: DiscardReport;
  duplicates: number;
  skippedOverLimit: number;
  businesses: Business[];
}

function parseDataset(content: string): unknown[] {
  const trimmed = content.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown[];
  }
  // NDJSON: one JSON object per line
  return trimmed
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as unknown);
}

export function ingestDataset(
  datasetPath: string,
  store: PipelineStore,
  opts: IngestOptions = {},
): IngestReport {
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new Error(`--limit debe ser un entero >= 1 (recibido: ${opts.limit})`);
  }

  const content = readFileSync(datasetPath, "utf8");
  const rows = parseDataset(content);
  const report: IngestReport = {
    total: rows.length,
    accepted: 0,
    discarded: newDiscardReport(),
    duplicates: 0,
    skippedOverLimit: 0,
    businesses: [],
  };

  const seenIds = new Set<string>();
  const usedSlugs = new Set<string>();

  const run = () => {
    let emitted = 0;
    for (const row of rows) {
      const { business, error } = normalize(row);
      if (error) {
        bumpDiscard(report.discarded, error as DiscardReason);
        continue;
      }
      if (!business) continue;

      const decision = applyFilters(business, {
        vertical: opts.vertical,
        verticalCategories: opts.verticalCategories,
      });
      if (!decision.pass) {
        bumpDiscard(report.discarded, decision.reason as DiscardReason);
        // Persistir el descarte: hay identidad estable, queda el audit trail.
        if (!opts.dryRun) {
          const state = store.ensure(business.id);
          if (state.stage === "RAW") {
            store.discard(business.id, decision.reason as string);
          }
        }
        continue;
      }

      if (seenIds.has(business.id)) {
        report.duplicates += 1;
        continue;
      }
      seenIds.add(business.id);

      if (opts.limit && emitted >= opts.limit) {
        report.skippedOverLimit += 1;
        continue;
      }

      if (!opts.dryRun) {
        const state = store.ensure(business.id);
        if (opts.resetExisting && state.stage !== "RAW") {
          store.resetTo(business.id, "RAW");
        }
        const current = store.get(business.id)!;
        if (current.stage === "RAW") {
          const slug = allocateUniqueDemoSlug(business.name, usedSlugs);
          store.advance(business.id, "RAW", "FILTERED", slug ? { slug } : undefined);
        } else {
          // Ya estaba más allá de RAW en una corrida anterior: es un duplicado
          // cross-batch, no un lead nuevo.
          report.duplicates += 1;
          continue;
        }
      } else {
        allocateUniqueDemoSlug(business.name, usedSlugs);
      }

      report.accepted += 1;
      report.businesses.push(business);
      emitted += 1;
    }
  };

  if (opts.dryRun) {
    run();
  } else {
    store.batch(run);
  }

  return report;
}
