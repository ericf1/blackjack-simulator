import { expect, test } from "vitest";
import { DEFAULT_SPEED, SPEED_MAX, SPEED_MIN, loadSpeed, saveSpeed } from "./speed-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test("saved Speed loads back", () => {
  const storage = fakeStorage();
  saveSpeed(storage, 2);
  expect(loadSpeed(storage)).toBe(2);
});

test("missing or corrupt Speed falls back to the default", () => {
  expect(loadSpeed(fakeStorage())).toBe(DEFAULT_SPEED);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "banana" }))).toBe(DEFAULT_SPEED);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "" }))).toBe(DEFAULT_SPEED);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "  " }))).toBe(DEFAULT_SPEED);
});

test("out-of-range Speed clamps to the range; off-grid Speed snaps to the 0.25 grid", () => {
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "99" }))).toBe(SPEED_MAX);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "-3" }))).toBe(SPEED_MIN);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "1.3" }))).toBe(1.25);
  expect(loadSpeed(fakeStorage({ "blackjack.speed": "2.1" }))).toBe(2);
});