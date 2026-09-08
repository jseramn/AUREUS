/**
 * Selectors-as-data — bundle loader with hierarchical fallback.
 * Priority: role > aria-label > text > placeholder > CSS.
 *
 * Browser-agnostic: returns the resolved selector entry. The caller (a
 * Playwright/Puppeteer worker) interprets each entry shape.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type SelectorEntry =
  | { role: string; name?: string }
  | { ariaLabel: string }
  | { text: string }
  | { placeholder: string }
  | { css: string };

export type SelectorBundle = Record<string, SelectorEntry[]>;

const cache = new Map<string, SelectorBundle>();

export function loadSelectorConfig(dir: string, service: string): SelectorBundle {
  const key = `${dir}:${service}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const path = resolve(dir, `${service}.json`);
  if (!existsSync(path)) {
    throw new Error(`Selector bundle not found for service "${service}" at ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SelectorBundle;
  cache.set(key, parsed);
  return parsed;
}

export function pickSelector(bundle: SelectorBundle, key: string): SelectorEntry | null {
  const entries = bundle[key];
  if (!entries || entries.length === 0) return null;
  // First entry wins; the array IS the fallback order.
  return entries[0] ?? null;
}
