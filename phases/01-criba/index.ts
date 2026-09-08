/**
 * Fase 1 — Criba: complete.
 * Ingest Apify dataset -> normalize -> filter (has_website ON) -> dedup -> FILTERED.
 *
 * See: normalizer.ts, filters.ts, ingest.ts, criba.test.ts.
 * Prompt atom: templates/prompts/filter-agent.md
 * Judge rubric: templates/prompts/judge-rubrics/01-criba.md
 */
export { normalize } from "./normalizer.js";
export { applyFilters, newDiscardReport, bumpDiscard } from "./filters.js";
export type { NormalizeResult, NormalizeErrorReason } from "./normalizer.js";
export type { FilterDecision, FilterReason, DiscardReport, DiscardReason } from "./filters.js";
export { ingestDataset } from "./ingest.js";
export type { IngestOptions, IngestReport } from "./ingest.js";
