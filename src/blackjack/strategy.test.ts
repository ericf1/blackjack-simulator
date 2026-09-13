import { expect, test } from "vitest";
import type { Action, State } from "./table";
import type { Card, Rank } from "./cards";
import { autopilotCommand, basicStrategy } from "./strategy";

// Card fixtures, same convention as table.test.ts
const S = (rank: Rank): Card => ({ rank, suit: "S" });
const H = (rank: Rank): Card => ({ rank, suit: "H" });
const D = (rank: Rank): Card => ({ rank, suit: "D" });
const C = (rank: Rank): Card => ({ rank, suit: "C" });

const ALL: Action[] = ["hit", "stand", "double", "split", "surrender"];

/** A minimal playing-phase State: one Spot, one active two-card Hand, dealer up. */
function playing(player: Card[], up: Card, legal: Action[] = ALL): State {
  return {
    phase: "playing",
    bankroll: 100_00,
    spots: [
      {
        id: 0,
        bet: 10_00,
        hands: [
          { cards: player, bet: 10_00, done: false, surrendered: false, splitAces: false, fromSplit: false },
        ],
      },
    ],
    active: { spot: 0, hand: 0 },
    legal,
    dealer: { cards: [up], holeRevealed: false },
    shoeRemaining: 200,
    needsShuffle: false,
    insuranceCost: 0,
    sessionStart: 100_00,
    history: [],
  };
}

test("hard 16 vs 10 surrenders when available", () => {
  const state = playing([S("10"), S("6")], H("10"));
  expect(basicStrategy(state)).toBe("surrender");
});

// ---- Chart spec -------------------------------------------------------------
// Transcribed from the Wizard of Odds 4-8 deck basic strategy text (H17, DAS,
// late surrender) including its H17 modifications.
// Notation: H hit · S stand · Dh double-else-hit · Ds double-else-stand
//           Rh surrender-else-hit · Rs surrender-else-stand · P split

const UPS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"] as const;
type Cell = "H" | "S" | "Dh" | "Ds" | "Rh" | "Rs" | "P" | "-";

const HARD: Record<number, Cell[]> = {
  5:  Array(10).fill("H"),
  6:  Array(10).fill("H"),
  7:  Array(10).fill("H"),
  8:  Array(10).fill("H"),
  9:  ["H","Dh","Dh","Dh","Dh","H","H","H","H","H"],
  10: ["Dh","Dh","Dh","Dh","Dh","Dh","Dh","Dh","H","H"],
  11: ["Dh","Dh","Dh","Dh","Dh","Dh","Dh","Dh","Dh","Dh"], // H17: 11 doubles vs A
  12: ["H","H","S","S","S","H","H","H","H","H"],
  13: ["S","S","S","S","S","H","H","H","H","H"],
  14: ["S","S","S","S","S","H","H","H","H","H"],
  15: ["S","S","S","S","S","H","H","H","Rh","Rh"], // H17: 15 surrenders vs A
  16: ["S","S","S","S","S","H","H","Rh","Rh","Rh"],
  17: ["S","S","S","S","S","S","S","S","S","Rs"], // H17: 17 surrenders vs A
  18: Array(10).fill("S"),
  19: Array(10).fill("S"),
  20: Array(10).fill("S"),
};

const SOFT: Record<number, Cell[]> = {
  13: ["H","H","H","Dh","Dh","H","H","H","H","H"],
  14: ["H","H","H","Dh","Dh","H","H","H","H","H"],
  15: ["H","H","Dh","Dh","Dh","H","H","H","H","H"],
  16: ["H","H","Dh","Dh","Dh","H","H","H","H","H"],
  17: ["H","Dh","Dh","Dh","Dh","H","H","H","H","H"],
  18: ["Ds","Ds","Ds","Ds","Ds","S","S","H","H","H"],
  19: ["S","S","S","S","Ds","S","S","S","S","S"], // H17: soft 19 doubles vs 6
  20: Array(10).fill("S"),
  21: Array(10).fill("S"),
};

const PAIRS: Record<string, Cell[]> = {
  A:  Array(10).fill("P"),
  "10": Array(10).fill("S"), // never split tens → hard 20
  "9": ["P","P","P","P","P","S","P","P","S","S"],
  "8": ["P","P","P","P","P","P","P","P","P","Rh"], // H17: 8,8 vs A surrenders
  "7": ["P","P","P","P","P","P","H","H","H","H"], // vs 2-7
  "6": ["P","P","P","P","P","H","H","H","H","H"], // DAS: split vs 2
  "5": ["Dh","Dh","Dh","Dh","Dh","Dh","Dh","Dh","H","H"], // fives → hard 10
  "4": ["H","H","H","P","P","H","H","H","H","H"], // DAS: split vs 5-6
  "3": ["P","P","P","P","P","P","H","H","H","H"], // DAS: split vs 2-7
  "2": ["P","P","P","P","P","P","H","H","H","H"], // DAS: split vs 2-7
};

const DECODE: Record<Cell, Action> = {
  H: "hit", S: "stand", Dh: "double", Ds: "double", Rh: "surrender", Rs: "surrender", P: "split", "-": "hit",
};

/** Two cards summing to a hard total (no aces, not a rank pair). */
function hardCards(total: number): Card[] {
  const a = Math.min(10, total - 2);
  return [S(String(a) as Rank), S(String(total - a) as Rank)];
}
const softCards = (total: number): Card[] => [S("A"), S(String(total - 11) as Rank)];
const pairCards = (rank: Rank): Card[] => [S(rank), H(rank)];

test("hard totals match the chart", () => {
  for (const [totalStr, row] of Object.entries(HARD)) {
    UPS.forEach((up, i) => {
      const cell = row[i];
      if (cell === "-") return;
      const got = basicStrategy(playing(hardCards(Number(totalStr)), S(up)));
      expect(got, `hard ${totalStr} vs ${up}`).toBe(DECODE[cell]);
    });
  }
});

test("soft totals match the chart", () => {
  for (const [totalStr, row] of Object.entries(SOFT)) {
    UPS.forEach((up, i) => {
      const got = basicStrategy(playing(softCards(Number(totalStr)), S(up)));
      expect(got, `soft ${totalStr} vs ${up}`).toBe(DECODE[row[i]]);
    });
  }
});

test("pairs match the chart", () => {
  for (const [rank, row] of Object.entries(PAIRS)) {
    UPS.forEach((up, i) => {
      const got = basicStrategy(playing(pairCards(rank as Rank), S(up)));
      expect(got, `${rank},${rank} vs ${up}`).toBe(DECODE[row[i]]);
    });
  }
});

// ---- Degradation: chart preference falls back to the best legal action ------

test("double-else-hit falls back to hit when double is unaffordable", () => {
  const legal: Action[] = ["hit", "stand"];
  expect(basicStrategy(playing(hardCards(11), S("A"), legal))).toBe("hit");
  expect(basicStrategy(playing(pairCards("5"), S("9"), legal))).toBe("hit");
  expect(basicStrategy(playing([S("A"), S("2")], S("6"), legal))).toBe("hit");
});

test("double-else-stand falls back to stand for soft 18/19", () => {
  const legal: Action[] = ["hit", "stand"];
  expect(basicStrategy(playing(softCards(18), S("2"), legal))).toBe("stand");
  expect(basicStrategy(playing(softCards(19), S("6"), legal))).toBe("stand");
});

test("surrender cells fall back per the chart", () => {
  const legal: Action[] = ["hit", "stand"];
  expect(basicStrategy(playing(hardCards(16), S("10"), legal))).toBe("hit");
  expect(basicStrategy(playing(hardCards(17), S("A"), legal))).toBe("stand");
});

test("split cells fall back to the hard/soft total", () => {
  expect(basicStrategy(playing(pairCards("2"), S("6"), ["hit", "stand", "double"]))).toBe("hit"); // hard 4
  expect(basicStrategy(playing(pairCards("8"), S("10"), ["hit", "stand", "surrender"]))).toBe("surrender"); // split unaffordable → 16 vs 10
});

test("8,8 vs A: surrender, else split, else hit", () => {
  expect(basicStrategy(playing(pairCards("8"), S("A")))).toBe("surrender");
  expect(basicStrategy(playing(pairCards("8"), S("A"), ["hit", "stand", "split"]))).toBe("split");
  expect(basicStrategy(playing(pairCards("8"), S("A"), ["hit", "stand"]))).toBe("hit");
});
// ---- Autopilot command flow --------------------------------------------------


const betting = (bankroll: number, claimed: number[] = []): State => ({
  phase: "betting",
  bankroll,
  spots: claimed.map((bet, id) => ({ id, bet, hands: [] })),
  active: null,
  legal: [],
  dealer: { cards: [], holeRevealed: false },
  shoeRemaining: 200,
  needsShuffle: false,
  insuranceCost: 0,
  sessionStart: 100_00,
  history: [],
});

const settled = (): State => ({
  ...betting(100_00),
  phase: "settled",
  spots: [{ id: 0, bet: 10_00, hands: [{ cards: [S("10"), S("9")], bet: 10_00, done: true, surrendered: false, splitAces: false, fromSplit: false, result: "win" }] }],
});

test("autopilot claims the lineup in order, then deals", () => {
  const lineup = [10_00, 25_00, 50_00];
  expect(autopilotCommand(betting(100_00), lineup)).toEqual({ claim: 10_00 });
  expect(autopilotCommand(betting(90_00, [10_00]), lineup)).toEqual({ claim: 25_00 });
  expect(autopilotCommand(betting(65_00, [10_00, 25_00]), lineup)).toEqual({ claim: 50_00 });
  expect(autopilotCommand(betting(15_00, [10_00, 25_00, 50_00]), lineup)).toBe("deal");
});

test("autopilot plays claimed spots as-is when the lineup matches", () => {
  // Human claimed two spots, then pressed Autopilot → deal, no re-claims
  expect(autopilotCommand(betting(100_00, [10_00, 10_00]), [10_00, 10_00])).toBe("deal");
});

test("autopilot stops when the bankroll cannot cover the full lineup", () => {
  expect(autopilotCommand(betting(80_00), [50_00, 50_00, 50_00])).toBeNull();
});

test("autopilot stops when the bankroll cannot cover the table minimum", () => {
  expect(autopilotCommand(betting(5_00), [10_00])).toBeNull();
});

test("autopilot stops with an empty lineup", () => {
  expect(autopilotCommand(betting(100_00), [])).toBeNull();
});

test("autopilot always declines insurance", () => {
  const insurance: State = { ...betting(100_00), phase: "insurance", insuranceCost: 5_00 };
  expect(autopilotCommand(insurance, [10_00])).toBe("decline");
});

test("autopilot rolls into the next round", () => {
  expect(autopilotCommand(settled(), [10_00])).toBe("nextRound");
});

// ---- Driving the real engine ---------------------------------------------------

import { createTable, TABLE_MAX, TABLE_MIN } from "./table";

test("chart splits and resplits 8,8 vs 10, then plays the four hands", () => {
  // split() inserts each twin right after the active hand, so the twins order
  // as [8,4], [8,2], [8,3] after the three resplits of hand 0.
  const deck = [
    S("8"), H("10"), S("8"), D("5"), // P1, up, P2, hole
    S("8"), C("3"), // split 1: hand 0 redraws 8, twin gets 3 → hand 3
    H("8"), S("2"), // split 2: hand 0 redraws 8, twin gets 2 → hand 2
    H("8"), S("4"), // split 3: hand 0 redraws 8, twin gets 4 → hand 1
    H("3"), // hand 0: 16 → hit → 19 → stand
    S("4"), H("5"), // hand 1: 12 → hit 16 → hit 21
    S("6"), H("9"), // hand 2: 10 → hit 16 → hit 25 bust
    S("5"), // hand 3: 11 → double → 16
    H("10"), // dealer 15 hits → 25, bust
  ];
  const table = createTable({ deck });
  table.claim(10_00);
  table.deal();

  // 8,8 vs 10 → split; the drawn 8 makes 8,8 again → resplit (up to 4 hands)
  expect(basicStrategy(table.state)).toBe("split");
  table.split();
  expect(basicStrategy(table.state)).toBe("split");
  table.split();
  expect(basicStrategy(table.state)).toBe("split");
  table.split();
  expect(table.state.spots[0].hands).toHaveLength(4);
  // fromSplit 16 vs 10: surrender no longer legal → hit
  expect(table.state.legal).toEqual(["hit", "stand", "double"]);
  expect(basicStrategy(table.state)).toBe("hit");

  // Drive the rest with the command loop until the round settles
  for (let guard = 0; guard < 20; guard++) {
    const cmd = autopilotCommand(table.state, [10_00]);
    if (cmd === null || cmd === "nextRound" || cmd === "deal" || cmd === "decline") break;
    if (typeof cmd === "string") table[cmd]();
  }
  expect(table.state.phase).toBe("settled");
  // dealer 10+5=15, hits 10 → 25 bust; hand bets 10/10/10/20, hand 2 busted
  expect(table.state.bankroll).toBe(130_00);
  expect(table.state.spots[0].hands.map((h) => h.result)).toEqual(["win", "win", "bust", "win"]);
});

// ---- Soak: seeded shuffles, many rounds, legality invariant --------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function soak(lineup: number[], rounds: number, seed: number): { deals: number; bankroll: number } {
  const table = createTable({ rng: mulberry32(seed), bankroll: 100_000_00 });
  let deals = 0;
  for (let guard = 0; guard < rounds * 40 + 100; guard++) {
    const state = table.state;
    const cmd = autopilotCommand(state, lineup);
    if (cmd === null) break; // bankroll cannot cover the lineup
    if (typeof cmd === "string") {
      if (cmd === "deal") deals += 1;
      else if (cmd === "decline" || cmd === "nextRound") table[cmd]();
      else {
        expect(state.legal, `${cmd} must be legal`).toContain(cmd);
        table[cmd]();
      }
    } else {
      expect(cmd.claim).toBeGreaterThanOrEqual(TABLE_MIN);
      expect(cmd.claim).toBeLessThanOrEqual(TABLE_MAX);
      table.claim(cmd.claim);
    }
    expect(Number.isInteger(table.state.bankroll)).toBe(true);
    if (deals >= rounds) break;
  }
  return { deals, bankroll: table.state.bankroll };
}

test("soak: single spot flat $10 rides basic strategy for 200 rounds", () => {
  const { deals, bankroll } = soak([10_00], 200, 42);
  expect(deals).toBe(200);
  expect(bankroll).toBeGreaterThan(0);
});

test("soak: three spots re-claimed every round from the lineup", () => {
  const { deals } = soak([10_00, 25_00, 50_00], 100, 7);
  expect(deals).toBe(100);
});
