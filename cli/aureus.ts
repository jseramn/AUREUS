#!/usr/bin/env node
/**
 * aureus CLI — punto de entrada legacy.
 *
 * AUREUS v1 es Cursor-native: el pipeline real vive en `fabrica`.
 * Este shim mapea los subcomandos viejos y delega.
 */
const LEGACY_MAP: Record<string, string> = {
  status: "state",
};

const cmd = process.argv[2];
if (cmd && LEGACY_MAP[cmd]) {
  process.argv[2] = LEGACY_MAP[cmd];
}
if (cmd && ["plan", "doctor", "smoke", "run"].includes(cmd)) {
  console.error(
    `aureus ${cmd}: comando del pipeline v2026.07 retirado. ` +
    `El pipeline v1 vive en 'fabrica' (ingest/state/list/advance/forja/deploy/report).`,
  );
  process.exit(1);
}

try {
  await import("./fabrica.js");
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

export {};
