/**
 * Batch Orchestrator — generic serial-batch runner with worker pool,
 * exponential backoff retries, and dynamic batch sizing on rate-limit storms.
 *
 * Portable: knows nothing about browsers or APIs. It calls a user-provided
 * `work(unit)` function under a PQueue with the configured concurrency.
 */
import PQueue from "p-queue";

export interface WorkResult<U> {
  unit: U;
  success: boolean;
  error?: string;
  attempts: number;
  waitedMs?: number;
  retryable?: boolean;
}

export interface BatchOrchestratorOptions<U> {
  concurrency: number;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  dynamicBatch?: boolean;
  onBatchStart?: (info: { batch: number; totalBatches: number; size: number }) => void;
  onBatchEnd?: (info: { batch: number; totalBatches: number; succeeded: number; failed: number }) => void;
  onUnit?: (unit: U, level: string, msg: string, ctx?: Record<string, unknown>) => void;
  shouldAbort?: () => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runBatches<U>(
  units: U[],
  work: (unit: U) => Promise<WorkResult<U>>,
  opts: BatchOrchestratorOptions<U>,
): Promise<{ total: number; succeeded: number; failed: number; results: WorkResult<U>[] }> {
  const concurrency = Math.max(1, opts.concurrency);
  const baseBatch = Math.max(1, opts.batchSize ?? concurrency);
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffBase = opts.backoffBaseMs ?? 5_000;
  const dynamic = opts.dynamicBatch ?? true;

  const results: WorkResult<U>[] = [];
  let succeeded = 0;
  let failed = 0;
  let currentBatch = baseBatch;
  let consecutive429 = 0;

  const totalBatches = Math.ceil(units.length / currentBatch);

  for (let offset = 0, b = 0; offset < units.length; offset += currentBatch, b++) {
    if (opts.shouldAbort?.()) break;

    const batch = units.slice(offset, offset + currentBatch);
    opts.onBatchStart?.({ batch: b + 1, totalBatches, size: batch.length });

    const queue = new PQueue({ concurrency, autoStart: true });
    const tasks = batch.map((unit) =>
      queue.add(async () => {
        let last: WorkResult<U> | null = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          opts.onUnit?.(unit, "info", "attempt start", { attempt });
          last = await work(unit);
          if (last.success) {
            succeeded++;
            results.push(last);
            return;
          }
          const isRateLimit = /429|rate.?limit/i.test(last.error ?? "");
          if (isRateLimit) consecutive429++;
          else consecutive429 = 0;

          if (!last.retryable) {
            opts.onUnit?.(unit, "warn", "non-retryable", { error: last.error });
            break;
          }
          if (attempt < maxAttempts) {
            const backoff = backoffBase * attempt;
            opts.onUnit?.(unit, "info", "backoff", { backoffMs: backoff });
            await sleep(backoff);
          }
        }
        failed++;
        results.push(last ?? { unit, success: false, error: "unknown", attempts: maxAttempts });
      }),
    );
    await Promise.all(tasks);

    opts.onBatchEnd?.({ batch: b + 1, totalBatches, succeeded, failed });

    if (dynamic && consecutive429 >= 3 && currentBatch > 1) {
      currentBatch = Math.max(1, Math.floor(currentBatch / 2));
      consecutive429 = 0;
      opts.onUnit?.(units[0] as U, "warn", "dynamic batch halved", { newBatchSize: currentBatch });
    }
  }

  return { total: units.length, succeeded, failed, results };
}
