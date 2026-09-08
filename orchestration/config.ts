/**
 * AUREUS config loader.
 *
 * Merges, in priority order:
 *   1. programmatic overrides
 *   2. environment variables (AUREUS_* or legacy names)
 *   3. defaults from variables/registry.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "node:process";

export interface ModelRoute {
  provider: string;
  fallback?: string;
  cost_per_1k?: number;
}
export interface ModelRouter {
  phase2_probe: ModelRoute;
  phase3_forge: ModelRoute;
  phase4_distill: ModelRoute;
  phase5_build: ModelRoute;
  judge: ModelRoute;
}

export interface AppConfig {
  logLevel: string;
  databasePath: string;
  outputDir: string;
  storageStatesDir: string;

  concurrency: { grok: number; mistral: number; zai: number };
  timeoutsMs: {
    grok: number;
    mistralResearch: number;
    zaiBuild: number;
  };

  mistral: { apiKey: string | null; model: string; agentId: string | null };

  stealth: { headless: boolean; proxyHttps: string | null };
  accountCooldownMs: number;

  maxAttempts: number;
  lockTtlMs: number;
  minOutputChars: number;
  minTarBytes: number;

  promptsDir: string;

  modelRouter: ModelRouter;
  costBudgetPerBatch: number | null;
  qualityThresholdLlmJudge: number;
  judgeModel: string;
  batchSizeDynamic: boolean;
  humanGateThreshold: "never" | "pre_publish" | "pre_sell" | "every_batch";
  verticalTemplate: string;
  brandKitRequired: boolean;
  salesPipelineHook: string | null;
}

function num(e: string | undefined, fallback: number): number {
  if (e == null || e.trim() === "") return fallback;
  const n = Number(e);
  return Number.isFinite(n) ? n : fallback;
}

function str(e: string | undefined, fallback: string): string {
  return e && e.trim() !== "" ? e.trim() : fallback;
}

function bool(e: string | undefined, fallback: boolean): boolean {
  if (e == null || e.trim() === "") return fallback;
  return e.trim().toLowerCase() !== "false";
}

interface RegistryFile {
  variables: Array<{ name: string; default: unknown }>;
}

function registryDefaults(registryPath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(resolve(registryPath), "utf8");
    const parsed = JSON.parse(raw) as RegistryFile;
    const out: Record<string, unknown> = {};
    for (const v of parsed.variables) out[v.name] = v.default;
    return out;
  } catch {
    return {};
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const reg = registryDefaults("variables/registry.json");
  const E = (key: string): string | undefined => env[`AUREUS_${key}`] ?? env[key];

  const modelRouter = (reg.MODEL_ROUTER as ModelRouter) ?? ({} as ModelRouter);

  const c: AppConfig = {
    logLevel: str(E("LOG_LEVEL"), String(reg.LOG_LEVEL ?? "info")),
    databasePath: str(E("DATABASE_PATH"), String(reg.DATABASE_PATH ?? "./state/pipeline.json")),
    outputDir: str(E("OUTPUT_DIR"), String(reg.OUTPUT_DIR ?? "./output")),
    storageStatesDir: str(E("STORAGE_STATES_DIR"), String(reg.STORAGE_STATES_DIR ?? "./data/storage-states")),

    concurrency: {
      grok: num(E("CONCURRENCY_GROK"), Number(reg.CONCURRENCY_GROK ?? 20)),
      mistral: num(E("CONCURRENCY_MISTRAL"), Number(reg.CONCURRENCY_MISTRAL ?? 8)),
      zai: num(E("CONCURRENCY_ZAI"), Number(reg.CONCURRENCY_ZAI ?? 1)),
    },
    timeoutsMs: {
      grok: num(E("GROK_TIMEOUT_MS"), Number(reg.GROK_TIMEOUT_MS ?? 1_800_000)),
      mistralResearch: num(E("MISTRAL_REQUEST_TIMEOUT_MS"), Number(reg.MISTRAL_REQUEST_TIMEOUT_MS ?? 600_000)),
      zaiBuild: num(E("ZAI_BUILD_TIMEOUT_MS"), Number(reg.ZAI_BUILD_TIMEOUT_MS ?? 1_800_000)),
    },

    mistral: {
      apiKey: (E("MISTRAL_API_KEY")?.trim() || null) ?? null,
      model: str(E("MISTRAL_MODEL"), String(reg.MISTRAL_MODEL ?? "mistral-large-latest")),
      agentId: (E("MISTRAL_AGENT_ID")?.trim() || null) ?? null,
    },

    stealth: {
      headless: bool(E("STEALTH_HEADLESS"), Boolean(reg.STEALTH_HEADLESS ?? true)),
      proxyHttps: (E("PROXY_HTTPS")?.trim() || null) ?? null,
    },
    accountCooldownMs: num(E("ACCOUNT_COOLDOWN_MS"), Number(reg.ACCOUNT_COOLDOWN_MS ?? 60_000)),

    maxAttempts: num(E("MAX_ATTEMPTS"), Number(reg.MAX_ATTEMPTS ?? 3)),
    lockTtlMs: num(E("LOCK_TTL_MS"), Number(reg.LOCK_TTL_MS ?? 1_800_000)),
    minOutputChars: num(E("MIN_OUTPUT_CHARS"), Number(reg.MIN_OUTPUT_CHARS ?? 500)),
    minTarBytes: num(E("MIN_TAR_BYTES"), Number(reg.MIN_TAR_BYTES ?? 10_000)),

    promptsDir: str(E("MM_PROMPTS_DIR"), String(reg.MM_PROMPTS_DIR ?? "./templates/prompts")),

    modelRouter,
    costBudgetPerBatch: E("COST_BUDGET_PER_BATCH") ? Number(E("COST_BUDGET_PER_BATCH")) : (reg.COST_BUDGET_PER_BATCH as number | null) ?? null,
    qualityThresholdLlmJudge: num(E("QUALITY_THRESHOLD_LLM_JUDGE"), Number(reg.QUALITY_THRESHOLD_LLM_JUDGE ?? 0.75)),
    judgeModel: str(E("JUDGE_MODEL"), String(reg.JUDGE_MODEL ?? "gpt-4.1-mini")),
    batchSizeDynamic: bool(E("BATCH_SIZE_DYNAMIC"), Boolean(reg.BATCH_SIZE_DYNAMIC ?? true)),
    humanGateThreshold: (str(E("HUMAN_GATE_THRESHOLD"), String(reg.HUMAN_GATE_THRESHOLD ?? "pre_sell")) as AppConfig["humanGateThreshold"]),
    verticalTemplate: str(E("VERTICAL_TEMPLATE"), String(reg.VERTICAL_TEMPLATE ?? "generic")),
    brandKitRequired: bool(E("BRAND_KIT_REQUIRED"), Boolean(reg.BRAND_KIT_REQUIRED ?? true)),
    salesPipelineHook: (E("SALES_PIPELINE_HOOK")?.trim() || null) ?? null,

    ...overrides,
  };
  return c;
}
