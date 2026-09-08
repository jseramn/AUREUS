#!/usr/bin/env npx tsx
/**
 * Descarta un lead en el store FABRICA_STATE.
 * Usage: FABRICA_STATE=... npx tsx scripts/discard-lead.ts <businessId> <reason>
 */
import { createJsonPipelineStore, DISCARDED_STAGE } from "../orchestration/state-machine.js";
import { join } from "node:path";

const ROOT = process.cwd();
const STATE_PATH = process.env.FABRICA_STATE ?? join(ROOT, "state", "pipeline.json");
const [businessId, reason] = process.argv.slice(2);
if (!businessId || !reason) {
  console.error("Usage: FABRICA_STATE=... npx tsx scripts/discard-lead.ts <businessId> <reason>");
  process.exit(1);
}
const s = createJsonPipelineStore(STATE_PATH);
const row = s.get(businessId);
if (!row) {
  console.error(`No state for ${businessId}`);
  process.exit(1);
}
if (row.stage === DISCARDED_STAGE) {
  console.log(`already DISCARDED ${businessId}: ${row.discardReason}`);
  process.exit(0);
}
s.discard(businessId, reason);
console.log(`DISCARDED ${businessId}: ${reason}`);
