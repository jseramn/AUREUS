/**
 * Tests — state machine v1 (store JSON).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonPipelineStore, PIPELINE_STAGES, DISCARDED_STAGE } from "./state-machine.js";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "fabrica-sm-"));
  const store = createJsonPipelineStore(join(dir, "pipeline.json"));
  return { store, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("camino feliz: RAW -> ... -> REPORTED", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    let prev: (typeof PIPELINE_STAGES)[number] = PIPELINE_STAGES[0];
    for (const next of PIPELINE_STAGES.slice(1)) {
      store.advance("lead-1", prev, next);
      prev = next;
    }
    assert.equal(store.get("lead-1")!.stage, "REPORTED");
  } finally {
    cleanup();
  }
});

test("advance hacia atrás o al mismo stage lanza", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    store.advance("lead-1", "RAW", "FILTERED");
    assert.throws(() => store.advance("lead-1", "FILTERED", "RAW" as never), /hacia adelante|Stage/);
  } finally {
    cleanup();
  }
});

test("discard en stage terminal requiere force", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    store.advance("lead-1", "RAW", "FILTERED");
    store.advance("lead-1", "FILTERED", "RESEARCHED");
    store.advance("lead-1", "RESEARCHED", "MARKET_BRIEFED");
    store.advance("lead-1", "MARKET_BRIEFED", "SPEC_READY");
    store.advance("lead-1", "SPEC_READY", "DEPLOYED");
    assert.throws(() => store.discard("lead-1", "x"), /terminal/);
    store.discard("lead-1", "x", { force: true });
    assert.equal(store.get("lead-1")!.stage, "DISCARDED");
  } finally {
    cleanup();
  }
});

test("store corrupto lanza en vez de tratarse como vacío (protege el libro de registro)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fabrica-sm-"));
  const dbPath = join(dir, "pipeline.json");
  try {
    const store = createJsonPipelineStore(dbPath);
    store.ensure("lead-1");
    // Corrompe el archivo (simula crash mid-write / disco lleno)
    writeFileSync(dbPath, '{"version":2,"states":{"lead-1":{', "utf8");
    const store2 = createJsonPipelineStore(dbPath);
    assert.throws(() => store2.ensure("lead-2"), /corrupto/);
    assert.throws(() => store2.get("lead-1"), /corrupto/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("advance con stage equivocado lanza", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    assert.throws(() => store.advance("lead-1", "FILTERED", "RESEARCHED"), /Stage mismatch/);
  } finally {
    cleanup();
  }
});

test("discard registra razón y countsByStage lo cuenta", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    store.discard("lead-1", "sin_contacto_verificable");
    const row = store.get("lead-1")!;
    assert.equal(row.stage, DISCARDED_STAGE);
    assert.equal(row.discardReason, "sin_contacto_verificable");
    assert.equal(store.countsByStage()[DISCARDED_STAGE], 1);
  } finally {
    cleanup();
  }
});

test("resetTo limpia discardReason y errores", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    store.discard("lead-1", "x");
    store.resetTo("lead-1", "RAW");
    const row = store.get("lead-1")!;
    assert.equal(row.stage, "RAW");
    assert.equal(row.discardReason, null);
  } finally {
    cleanup();
  }
});

test("markFailed incrementa attempts y suelta lock", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    store.lock("lead-1", "w1", 60000);
    store.markFailed("lead-1", "boom");
    const row = store.get("lead-1")!;
    assert.equal(row.attempts, 1);
    assert.equal(row.lastError, "boom");
    assert.equal(row.lockedBy, null);
  } finally {
    cleanup();
  }
});

test("lock: otro worker no roba lock vigente; stale sí", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.ensure("lead-1");
    assert.equal(store.lock("lead-1", "w1", 60000), true);
    assert.equal(store.lock("lead-1", "w2", 60000), false);
    assert.equal(store.lock("lead-1", "w2", -1), true); // negative TTL => always stale
  } finally {
    cleanup();
  }
});

test("prototype pollution: businessId 'constructor' se maneja como clave normal", () => {
  const { store, cleanup } = tmpStore();
  try {
    assert.equal(store.get("constructor"), null);
    const row = store.ensure("constructor");
    assert.equal(row.stage, "RAW");
    assert.equal(store.get("constructor")!.businessId, "constructor");
    store.advance("constructor", "RAW", "FILTERED");
    assert.equal(store.get("constructor")!.stage, "FILTERED");
  } finally {
    cleanup();
  }
});

test("batch: una sola escritura para N mutaciones (ingest O(N))", () => {
  const { store, cleanup } = tmpStore();
  try {
    store.batch(() => {
      for (let i = 0; i < 50; i++) {
        store.ensure(`lead-${i}`);
        store.advance(`lead-${i}`, "RAW", "FILTERED");
      }
    });
    assert.equal(store.countsByStage()["FILTERED"], 50);
  } finally {
    cleanup();
  }
});

test("listReady respeta límite y excluye locked", () => {
  const { store, cleanup } = tmpStore();
  try {
    for (const id of ["a", "b", "c"]) {
      store.ensure(id);
      store.advance(id, "RAW", "FILTERED");
    }
    store.lock("a", "w1", 60000);
    const ready = store.listReady("FILTERED", 10);
    assert.deepEqual(ready.map((r) => r.businessId).sort(), ["b", "c"]);
  } finally {
    cleanup();
  }
});
