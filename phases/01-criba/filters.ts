/**
 * Fase 1 — Criba: filters.
 * Applied AFTER normalization, BEFORE insertion. The website filter is
 * hardcoded ON (the entire premise: "negocios que NO tienen web").
 */
import type { Business } from "../_shared.js";

export type FilterReason = "has_website" | "vertical_mismatch";

export interface FilterDecision {
  pass: boolean;
  reason?: FilterReason;
}

/**
 * Hardcoded filter chain for businesses that passed normalization.
 * `verticalCategories` plugs in per-vertical filtering.
 */
export function applyFilters(
  b: Business,
  opts: { vertical?: string; verticalCategories?: string[] } = {},
): FilterDecision {
  if (b.website) return { pass: false, reason: "has_website" };
  if (opts.vertical && opts.vertical !== "generic" && opts.verticalCategories && opts.verticalCategories.length > 0) {
    const cat = (b.category ?? "").toLowerCase();
    const matches = opts.verticalCategories.some((v) => cat.includes(v.toLowerCase()));
    if (!matches) return { pass: false, reason: "vertical_mismatch" };
  }
  return { pass: true };
}

export interface DiscardReport {
  schema_error: number;
  missing_name: number;
  permanently_closed: number;
  insufficient_data: number;
  has_website: number;
  vertical_mismatch: number;
  total: number;
}

export function newDiscardReport(): DiscardReport {
  return {
    schema_error: 0,
    missing_name: 0,
    permanently_closed: 0,
    insufficient_data: 0,
    has_website: 0,
    vertical_mismatch: 0,
    total: 0,
  };
}

export type DiscardReason = keyof Omit<DiscardReport, "total">;

export function bumpDiscard(report: DiscardReport, reason: DiscardReason): void {
  report[reason] += 1;
  report.total += 1;
}
