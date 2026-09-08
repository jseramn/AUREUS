/**
 * AUREUS orchestration — barrel v1.
 *
 * Módulo VIVO del pipeline v1:
 *   - state-machine.ts — el store JSON y las transiciones (única dependencia del CLI)
 *
 * Módulos LEGACY v2026.07 (pipeline Grok/Mistral/z.ai retirado; se conservan
 * como referencia y NO se re-exportan): config.ts, batch-orchestrator.ts,
 * cost-tracker.ts, account-pool.ts, selectors.ts, judge.ts, prompt-utils.ts.
 * Impórtalos directo por path si los necesitas para leer el diseño viejo.
 */
export * from "./state-machine.js";
