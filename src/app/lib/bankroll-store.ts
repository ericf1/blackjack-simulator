import { START_BANKROLL } from "@/blackjack/table";

const KEY = "blackjack.bankroll";

/**
 * Bankroll persistence adapter (ADR-0001): the engine stays pure;
 * only this adapter knows about localStorage.
 * Swap `storage` for a fake in tests, or for a server store later.
 */
export function loadBankroll(storage: Pick<Storage, "getItem">): number {
  const raw = storage.getItem(KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : START_BANKROLL;
}

export function saveBankroll(storage: Pick<Storage, "setItem">, bankroll: number): void {
  storage.setItem(KEY, String(bankroll));
}