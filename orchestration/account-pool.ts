/**
 * Account Pool — rotation with cooldown and health states.
 * Portable: knows nothing about browsers. The browser session vault is
 * bring-your-own; this only tracks account identity + availability.
 */
export type AccountState = "ok" | "needs_reauth" | "rate_limited" | "banned" | "paused";

export interface Account {
  id: string;
  service: string;
  email?: string;
  state: AccountState;
  lastUsedAt: number | null;
  cooldownUntil: number | null;
}

export interface AccountPool {
  add(account: Omit<Account, "state" | "lastUsedAt" | "cooldownUntil">): void;
  list(service?: string): Account[];
  setState(id: string, state: AccountState, reason?: string): void;
  markUsed(id: string, cooldownMs: number): void;
  pickAvailable(service: string): Account | null;
  remove(id: string): void;
}

export function createAccountPool(): AccountPool {
  const accounts = new Map<string, Account>();

  return {
    add(account) {
      accounts.set(account.id, {
        ...account,
        state: "ok",
        lastUsedAt: null,
        cooldownUntil: null,
      });
    },

    list(service) {
      const all = [...accounts.values()];
      return service ? all.filter((a) => a.service === service) : all;
    },

    setState(id, state, reason) {
      const a = accounts.get(id);
      if (!a) return;
      a.state = state;
      if (state === "needs_reauth" || state === "banned") {
        void reason;
      }
    },

    markUsed(id, cooldownMs) {
      const a = accounts.get(id);
      if (!a) return;
      a.lastUsedAt = Date.now();
      a.cooldownUntil = Date.now() + cooldownMs;
    },

    pickAvailable(service) {
      const now = Date.now();
      const candidates = [...accounts.values()]
        .filter((a) => a.service === service && a.state === "ok")
        .filter((a) => a.cooldownUntil === null || a.cooldownUntil <= now)
        .sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0)); // LRU first
      return candidates[0] ?? null;
    },

    remove(id) {
      accounts.delete(id);
    },
  };
}
