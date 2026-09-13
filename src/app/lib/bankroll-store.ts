import { START_BANKROLL, type Phase } from "@/blackjack/table";

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

/**
 * When the bankroll may be persisted. Mid-round the stake is already deducted
 * and on the table, so saving then would let a reload silently forfeit it.
 * The safe checkpoints are settled Rounds and betting with nothing claimed
 * (releases and top-ups included); a reload mid-round instead restores the
 * last settled balance — the round is abandoned, the stake is not.
 */
export function isBankrollCheckpoint(phase: Phase, claimedSpots: number): boolean {
  return phase === "settled" || (phase === "betting" && claimedSpots === 0);
}