import { expect, test } from "vitest";
import { loadRules, saveRules } from "./rules-store";
import { DEFAULT_RULES } from "@/blackjack/table";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test("saved rules load back", () => {
  const storage = fakeStorage();
  saveRules(storage, { surrender: false, blackjackPayout: "6:5" });
  expect(loadRules(storage)).toEqual({ surrender: false, blackjackPayout: "6:5" });
  saveRules(storage, { surrender: true, blackjackPayout: "3:2" });
  expect(loadRules(storage)).toEqual(DEFAULT_RULES);
});

test("missing, corrupt, or partial rules fall back to the canon table", () => {
  expect(loadRules(fakeStorage())).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": "{oops" }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": '"3:2"' }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": "null" }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": '{"surrender":true}' }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": '{"blackjackPayout":"6:5"}' }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": '{"surrender":"yes","blackjackPayout":"6:5"}' }))).toEqual(DEFAULT_RULES);
  expect(loadRules(fakeStorage({ "blackjack.rules": '{"surrender":true,"blackjackPayout":"7:5"}' }))).toEqual(DEFAULT_RULES);
});
