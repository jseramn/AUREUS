/**
 * Fábrica v1 — state machine (Cursor-native pipeline).
 *
 *   RAW
 *     -> FILTERED          (criba: normaliza + filtra + dedup)
 *     -> RESEARCHED        (research ligero, hechos verificables)
 *     -> MARKET_BRIEFED    (brief de mercado / ángulo de venta)
 *     -> SPEC_READY        (site-spec validado con zod)
 *     -> DEPLOYED          (repo GitHub + Vercel prod + subdominio)
 *     -> REPORTED          (reporte ejecutivo al comercial)  [terminal]
 *
 * Cualquier stage puede ir a DISCARDED (terminal) o FAILED (reintentable).
 *
 * Backend: un solo JSON (default ./state/pipeline.json). Garantías:
 *   - Escritura atómica (tmp + rename) con backup .bak rotado por escritura.
 *   - Archivo corrupto => ERROR explícito (nunca se trata como pipeline vacío,
 *     que sobreescribiría el libro de registro en el siguiente persist).
 *   - Lockfile inter-proceso (O_EXCL + retry) alrededor de cada mutación:
 *     dos invocaciones concurrentes del CLI no se pisan.
 *   - advance() solo permite transiciones HACIA ADELANTE (STAGE_ORDER creciente);
 *     resetTo() es el único escape hacia atrás. discard() rechaza stages
 *     terminales salvo force.
 *   - batch(fn): difiere la persistencia a UNA escritura (ingest O(N), no O(N²)).
 *
 * El orquestador NUNCA ejecuta: solo lee el store y despacha a los agentes.
 */
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export const PIPELINE_STAGES = [
  "RAW",
  "FILTERED",
  "RESEARCHED",
  "MARKET_BRIEFED",
  "SPEC_READY",
  "DEPLOYED",
  "REPORTED",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Terminal success stage. */
export const TERMINAL_STAGE: PipelineStage = "REPORTED";

/** Terminal discard stage (lead no apto). */
export const DISCARDED_STAGE = "DISCARDED" as const;

export const STAGE_ORDER: Record<PipelineStage, number> = {
  RAW: 0,
  FILTERED: 1,
  RESEARCHED: 2,
  MARKET_BRIEFED: 3,
  SPEC_READY: 4,
  DEPLOYED: 5,
  REPORTED: 6,
};

export type StageOutputs = Partial<Record<PipelineStage, string>>;

export interface PipelineState {
  businessId: string;
  stage: PipelineStage | typeof DISCARDED_STAGE;
  /** Razón de descarte cuando stage === DISCARDED (ej. "sin_contacto_verificable"). */
  discardReason: string | null;
  attempts: number;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Artifact path (relative to outputDir) produced at each stage. */
  outputs: StageOutputs;
  /** Slug kebab-case para <slug>.<dominio> (default en FILTERED via slugify(name); forja lo puede reemplazar con el del spec). */
  slug: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransitionOptions {
  output?: string;
  clearLock?: boolean;
  slug?: string;
}

export interface PipelineStore {
  ensure(businessId: string): PipelineState;
  get(businessId: string): PipelineState | null;
  lock(businessId: string, workerId: string, ttlMs: number): boolean;
  unlock(businessId: string, workerId: string): void;
  clearStaleLocks(ttlMs: number): number;
  clearAllLocks(): number;
  advance(
    businessId: string,
    expectedFrom: PipelineStage,
    next: PipelineStage,
    opts?: TransitionOptions,
  ): PipelineState;
  discard(businessId: string, reason: string, opts?: { force?: boolean }): PipelineState;
  markFailed(businessId: string, errorMessage: string): PipelineState;
  resetTo(businessId: string, stage: PipelineStage): PipelineState;
  listReady(stage: PipelineStage, limit: number): PipelineState[];
  countsByStage(): Record<string, number>;
  listAll(opts?: { limit?: number; offset?: number }): PipelineState[];
  /** Difiere persist() a UNA escritura al final de fn. Para ingest en lote. */
  batch<T>(fn: () => T): T;
}

export function hasReachedStage(from: PipelineStage, to: PipelineStage): boolean {
  return STAGE_ORDER[from] >= STAGE_ORDER[to];
}

export function nextStage(current: PipelineStage): PipelineStage | null {
  const idx = STAGE_ORDER[current];
  if (idx >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[idx + 1] ?? null;
}

interface StoreFile {
  version: number;
  states: Record<string, PipelineState>;
}

const STORE_VERSION = 2;

function now(): string {
  return new Date().toISOString();
}

function stale(dateStr: string | null, ttlMs: number): boolean {
  if (!dateStr) return true;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > ttlMs;
}

/** Lockfile inter-proceso: O_EXCL + retry. Locks viejos (>staleMs) se rompen. */
function acquireFileLock(lockPath: string, timeoutMs = 5_000, staleMs = 30_000): void {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      try {
        const { mtimeMs } = statSync(lockPath);
        if (Date.now() - mtimeMs > staleMs) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        // lockfile desapareció entre el open y el stat — reintenta
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`No se pudo adquirir el lock del store (${lockPath}) en ${timeoutMs}ms`);
      }
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) { /* spin corto — CLI de vida corta */ }
    }
  }
}

function releaseFileLock(lockPath: string): void {
  rmSync(lockPath, { force: true });
}

export function createJsonPipelineStore(dbPath: string): PipelineStore {
  const absPath = resolve(dbPath);
  const lockPath = `${absPath}.lock`;
  const bakPath = `${absPath}.bak`;
  const tmpPath = `${absPath}.tmp`;

  /** Cache activo solo dentro de batch(). */
  let batchFile: StoreFile | null = null;
  let batchDirty = false;

  const load = (): StoreFile => {
    if (batchFile) return batchFile;
    if (!existsSync(absPath)) return { version: STORE_VERSION, states: Object.create(null) };
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim() === "") return { version: STORE_VERSION, states: Object.create(null) };
    let parsed: StoreFile;
    try {
      parsed = JSON.parse(raw) as StoreFile;
    } catch (e) {
      // NUNCA tratar un archivo corrupto como pipeline vacío: el siguiente
      // persist sobreescribiría el libro de registro completo.
      throw new Error(
        `Store corrupto en ${absPath} (${(e as Error).message}). ` +
        `Restaura desde ${bakPath} o repara el JSON manualmente. Me niego a operar.`,
      );
    }
    if (!parsed.states || typeof parsed.states !== "object") {
      throw new Error(`Store inválido en ${absPath}: falta el objeto 'states'.`);
    }
    // Null-proto: businessIds como "constructor" no deben resolver al prototype.
    const states = Object.assign(Object.create(null), parsed.states) as Record<string, PipelineState>;
    return { version: parsed.version ?? 1, states };
  };

  const persist = (file: StoreFile): void => {
    if (batchFile) {
      batchDirty = true;
      return;
    }
    const dir = dirname(absPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (existsSync(absPath)) copyFileSync(absPath, bakPath);
    file.version = STORE_VERSION;
    // Compacto: el store es machine-owned; pretty-print duplica el costo de IO.
    writeFileSync(tmpPath, JSON.stringify(file), "utf8");
    renameSync(tmpPath, absPath); // atómico en el mismo filesystem
  };

  /** Mutación protegida por lockfile inter-proceso (no aplica dentro de batch: batch ya lo tomó). */
  const mutate = <T>(fn: () => T): T => {
    if (batchFile) return fn();
    acquireFileLock(lockPath);
    try {
      return fn();
    } finally {
      releaseFileLock(lockPath);
    }
  };

  const store: PipelineStore = {
    batch<T>(fn: () => T): T {
      if (batchFile) return fn(); // batch anidado: no-op
      acquireFileLock(lockPath);
      batchFile = load();
      batchDirty = false;
      try {
        const result = fn();
        if (batchDirty) {
          const file = batchFile;
          batchFile = null;
          persist(file);
        } else {
          batchFile = null;
        }
        return result;
      } catch (e) {
        batchFile = null; // descarta mutaciones en memoria; el disco queda intacto
        throw e;
      } finally {
        batchFile = null;
        releaseFileLock(lockPath);
      }
    },

    ensure(businessId) {
      return mutate(() => {
        const file = load();
        if (!Object.hasOwn(file.states, businessId)) {
          file.states[businessId] = {
            businessId,
            stage: "RAW",
            discardReason: null,
            attempts: 0,
            lastError: null,
            lastErrorAt: null,
            outputs: {},
            slug: null,
            lockedBy: null,
            lockedAt: null,
            createdAt: now(),
            updatedAt: now(),
          };
          persist(file);
        }
        return file.states[businessId]!;
      });
    },

    get(businessId) {
      const file = load();
      return Object.hasOwn(file.states, businessId) ? file.states[businessId]! : null;
    },

    lock(businessId, workerId, ttlMs) {
      return mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) return false;
        const heldByOther = row.lockedBy !== null && row.lockedBy !== workerId && !stale(row.lockedAt, ttlMs);
        if (heldByOther) return false;
        row.lockedBy = workerId;
        row.lockedAt = now();
        row.updatedAt = now();
        persist(file);
        return true;
      });
    },

    unlock(businessId, workerId) {
      mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) return;
        if (row.lockedBy === workerId) {
          row.lockedBy = null;
          row.lockedAt = null;
          row.updatedAt = now();
          persist(file);
        }
      });
    },

    clearStaleLocks(ttlMs) {
      return mutate(() => {
        const file = load();
        let cleared = 0;
        for (const row of Object.values(file.states)) {
          if (row.lockedBy !== null && stale(row.lockedAt, ttlMs)) {
            row.lockedBy = null;
            row.lockedAt = null;
            row.updatedAt = now();
            cleared++;
          }
        }
        if (cleared > 0) persist(file);
        return cleared;
      });
    },

    clearAllLocks() {
      return mutate(() => {
        const file = load();
        let cleared = 0;
        for (const row of Object.values(file.states)) {
          if (row.lockedBy !== null) {
            row.lockedBy = null;
            row.lockedAt = null;
            cleared++;
          }
        }
        if (cleared > 0) persist(file);
        return cleared;
      });
    },

    advance(businessId, expectedFrom, next, opts = {}) {
      return mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) throw new Error(`No pipeline state for ${businessId}`);
        if (row.stage !== expectedFrom) {
          throw new Error(`Stage mismatch for ${businessId}: expected ${expectedFrom}, found ${row.stage}`);
        }
        const fromOrder = STAGE_ORDER[expectedFrom as PipelineStage];
        const nextOrder = STAGE_ORDER[next];
        if (fromOrder === undefined || nextOrder === undefined) {
          throw new Error(`Stage inválido en advance(${expectedFrom} -> ${next}) para ${businessId}`);
        }
        if (nextOrder <= fromOrder) {
          throw new Error(
            `advance() solo va hacia adelante (${expectedFrom} -> ${next} para ${businessId}). Usa resetTo() para retroceder.`,
          );
        }
        row.stage = next;
        row.attempts = 0;
        row.lastError = null;
        row.lastErrorAt = null;
        if (opts.output) row.outputs[next] = opts.output;
        if (opts.slug) row.slug = opts.slug;
        if (opts.clearLock ?? true) {
          row.lockedBy = null;
          row.lockedAt = null;
        }
        row.updatedAt = now();
        persist(file);
        return row;
      });
    },

    discard(businessId, reason, opts = {}) {
      return mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) throw new Error(`No pipeline state for ${businessId}`);
        const terminal = row.stage === "DEPLOYED" || row.stage === "REPORTED";
        if (terminal && !opts.force) {
          throw new Error(
            `${businessId} está en ${row.stage} (terminal); discard requiere force. "No redeploy" también aplica al descarte.`,
          );
        }
        row.stage = DISCARDED_STAGE;
        row.discardReason = reason;
        row.lockedBy = null;
        row.lockedAt = null;
        row.updatedAt = now();
        persist(file);
        return row;
      });
    },

    markFailed(businessId, errorMessage) {
      return mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) throw new Error(`No pipeline state for ${businessId}`);
        row.attempts += 1;
        row.lastError = errorMessage;
        row.lastErrorAt = now();
        row.lockedBy = null;
        row.lockedAt = null;
        row.updatedAt = now();
        persist(file);
        return row;
      });
    },

    resetTo(businessId, stage) {
      return mutate(() => {
        const file = load();
        const row = Object.hasOwn(file.states, businessId) ? file.states[businessId] : undefined;
        if (!row) throw new Error(`No pipeline state for ${businessId}`);
        row.stage = stage;
        row.discardReason = null;
        row.attempts = 0;
        row.lastError = null;
        row.lastErrorAt = null;
        row.lockedBy = null;
        row.lockedAt = null;
        row.updatedAt = now();
        persist(file);
        return row;
      });
    },

    listReady(stage, limit) {
      const file = load();
      return Object.values(file.states)
        .filter((r) => r.stage === stage && r.lockedBy === null)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
        .slice(0, limit);
    },

    countsByStage() {
      const file = load();
      const out: Record<string, number> = {};
      for (const s of PIPELINE_STAGES) out[s] = 0;
      out[DISCARDED_STAGE] = 0;
      for (const row of Object.values(file.states)) {
        out[row.stage] = (out[row.stage] ?? 0) + 1;
      }
      return out;
    },

    listAll(opts = {}) {
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;
      const file = load();
      return Object.values(file.states)
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(offset, offset + limit);
    },
  };

  return store;
}
