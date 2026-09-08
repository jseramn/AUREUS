/**
 * Cost & Token Tracker — accumulates token usage and USD cost per batch,
 * gated by COST_BUDGET_PER_BATCH.
 */
export interface TokenUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface CostRow extends TokenUsage {
  costUsd: number;
  at: string;
  note?: string;
}

export interface CostTracker {
  add(usage: TokenUsage, note?: string): CostRow;
  total(): { tokensIn: number; tokensOut: number; costUsd: number };
  rows(): CostRow[];
  withinBudget(budget: number | null): boolean;
  remaining(budget: number | null): number | null;
}

export function createCostTracker(pricesPer1k: Record<string, { in: number; out: number }>): CostTracker {
  const ledger: CostRow[] = [];

  return {
    add(usage, note) {
      const price = pricesPer1k[usage.model] ?? { in: 0, out: 0 };
      const costUsd = (usage.tokensIn / 1000) * price.in + (usage.tokensOut / 1000) * price.out;
      const row: CostRow = { ...usage, costUsd, at: new Date().toISOString(), note };
      ledger.push(row);
      return row;
    },
    total() {
      return ledger.reduce(
        (acc, r) => ({
          tokensIn: acc.tokensIn + r.tokensIn,
          tokensOut: acc.tokensOut + r.tokensOut,
          costUsd: acc.costUsd + r.costUsd,
        }),
        { tokensIn: 0, tokensOut: 0, costUsd: 0 },
      );
    },
    rows() {
      return [...ledger];
    },
    withinBudget(budget) {
      if (budget == null) return true;
      return this.total().costUsd <= budget;
    },
    remaining(budget) {
      if (budget == null) return null;
      return budget - this.total().costUsd;
    },
  };
}
