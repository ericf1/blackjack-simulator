import { DEFAULT_RULES, type Rules } from "@/blackjack/table";

const KEY = "blackjack.rules";

/**
 * Table rules persistence adapter (ADR-0001): the engine stays pure;
 * only this adapter knows about localStorage. Same pattern as bankroll-store.
 * A record that is missing, corrupt, or partial falls back to the whole
 * docs/rules.md canon — an unreadable table is the default table.
 */
export function loadRules(storage: Pick<Storage, "getItem">): Rules {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return { ...DEFAULT_RULES };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_RULES };
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.surrender !== "boolean") return { ...DEFAULT_RULES };
    if (obj.blackjackPayout !== "3:2" && obj.blackjackPayout !== "6:5") return { ...DEFAULT_RULES };
    return { surrender: obj.surrender, blackjackPayout: obj.blackjackPayout };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRules(storage: Pick<Storage, "setItem">, rules: Rules): void {
  storage.setItem(KEY, JSON.stringify(rules));
}
