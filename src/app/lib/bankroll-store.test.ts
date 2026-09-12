import { expect, test } from "vitest";
import { loadBankroll, saveBankroll } from "./bankroll-store";
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

test("missing or corrupt bankroll falls back to the starting amount", () => {
  expect(loadBankroll(fakeStorage())).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "banana" }))).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "-5" }))).toBe(START_BANKROLL);
  expect(loadBankroll(fakeStorage({ "blackjack.bankroll": "10.5" }))).toBe(START_BANKROLL);
});