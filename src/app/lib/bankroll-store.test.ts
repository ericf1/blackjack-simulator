import { expect, test } from "vitest";
import { isBankrollCheckpoint, loadBankroll, saveBankroll } from "./bankroll-store";
import { START_BANKROLL } from "@/blackjack/table";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test("saved bankroll loads back", () => {
  const storage = fakeStorage();
  saveBankroll(storage, 12500);
  expect(loadBankroll(storage)).toBe(12500);
});

test("the bankroll saves only at safe checkpoints, never mid-round", () => {
  // settled rounds, or betting with nothing claimed — the stake is safe
  expect(isBankrollCheckpoint("settled", 2)).toBe(true);
  expect(isBankrollCheckpoint("betting", 0)).toBe(true);
  // a claimed stake, or a live round, blocks the save
  expect(isBankrollCheckpoint("betting", 1)).toBe(false);
  expect(isBankrollCheckpoint("insurance", 0)).toBe(false);
  expect(isBankrollCheckpoint("playing", 3)).toBe(false);
});

test("missing or corrupt bankroll falls back to the starting amount", () => {
  expect(loadBankroll(fakeStorage())).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "banana" }))).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "-5" }))).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "10.5" }))).toBe(START_BANKROLL);
});