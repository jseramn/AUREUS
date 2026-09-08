/**
 * Prompt atom utilities — interpolation + hierarchical template resolution.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Interpolate {{KEY}} placeholders (case-insensitive, whitespace-tolerant).
 * Escapes literal `$` in replacements so names like "Pizzería $100" don't
 * break String.replace.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    out = out.replace(re, escapeReplacement(value));
  }
  return out;
}

export function escapeReplacement(s: string): string {
  return s.replace(/\$/g, "$$$$");
}

export interface ResolvedTemplate {
  content: string;
  source: string;
}

/**
 * Resolve a template by name with hierarchical fallback:
 *   1. $MM_PROMPTS_DIR/<name>
 *   2. <cwd>/templates/prompts/<name>
 *   3. <cwd>/../templates/prompts/<name>
 *   4. provided fallback string
 */
export function loadTemplate(name: string, fallback: string, promptsDir?: string): ResolvedTemplate {
  const candidates = [
    promptsDir && join(promptsDir, name),
    join(process.cwd(), "templates", "prompts", name),
    join(process.cwd(), "..", "templates", "prompts", name),
    resolve("templates", "prompts", name),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (path && existsSync(path)) {
      return { content: readFileSync(path, "utf8"), source: path };
    }
  }
  return { content: fallback, source: "(inline fallback)" };
}

/**
 * Strip a metadata header comment block from a generated .md, keeping
 * everything from the first markdown heading onward.
 */
export function stripMetadataHeader(md: string): string {
  const match = md.match(/\n?(#{1,6}\s[^\n]+)/);
  if (!match || match.index === undefined) {
    return md.replace(/<!--[\s\S]*?-->/g, "").trim();
  }
  return md.slice(match.index).trim();
}

/**
 * Compact JSON (no indentation) for embedding inside a prompt — saves tokens.
 */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 0);
}
