import { expect, test } from "vitest";
import { createTable } from "./table";
import type { Card, Rank } from "./cards";

// Card fixtures: suit letter prefix, e.g. S("10") = 10 of spades
const S = (rank: Rank): Card => ({ rank, suit: "S" });
const H = (rank: Rank): Card => ({ rank, suit: "H" });
const D = (rank: Rank): Card => ({ rank, suit: "D" });
const C = (rank: Rank): Card => ({ rank, suit: "C" });

test("tracer: bet, deal, stand on 20, dealer draws to 17 and loses", () => {
  // deal order for one spot: P1, dealer-up, P2, dealer-hole
  const table = createTable({ deck: [S("10"), H("10"), S("K"), H("7")] });
  table.claim(1000); // $10 in cents, deducted from $100 bankroll
  table.deal();

  const spot = table.state.spots[0];
  expect(spot.hands[0].cards).toEqual([S("10"), S("K")]);
  expect(table.state.active).toEqual({ spot: 0, hand: 0 });
  expect(table.state.legal).toEqual(["hit", "stand", "double", "surrender"]);

  table.stand();
  expect(table.state.phase).toBe("settled");
  // dealer 17 < player 20 → even money: 10000 + 1000 stake back + 1000 win
  expect(table.state.bankroll).toBe(11000);
  expect(table.state.spots[0].hands[0].result).toBe("win");
});

// ---- Slice 2: settlement math ----------------------------------------------

test("player natural on the deal pays 3:2", () => {
  // P1=A♠, up=9♠, P2=K♠ → natural; dealer 9+5=14, draws 2→16, 3→19
  const table = createTable({ deck: [S("A"), S("9"), S("K"), S("5"), S("2"), S("3")] });
  table.claim(1000);
  table.deal();
  // natural is auto-done → no active hand → dealer plays immediately
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("blackjack");
  // $100 − $10 bet + $10 stake + $15 (3:2) = $115
  expect(table.state.bankroll).toBe(11500);
});

test("equal totals push and return the bet", () => {
  const table = createTable({ deck: [S("10"), S("10"), S("8"), H("8")] });
  table.claim(1000);
  table.deal();
  table.stand();
  expect(table.state.spots[0].hands[0].result).toBe("push");
  expect(table.state.bankroll).toBe(10000);
});

test("player bust loses immediately and dealer does not draw", () => {
  const table = createTable({ deck: [S("10"), S("6"), S("9"), S("10"), S("3")] });
  table.claim(1000);
  table.deal();
  table.hit(); // 19 + 3 = 22
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("bust");
  // dealer 16, hole revealed but no third card: all hands were dead
  expect(table.state.dealer.cards).toHaveLength(2);
  expect(table.state.bankroll).toBe(9000);
});

// ---- Slice 3: dealer play --------------------------------------------------

test("dealer hits soft 17 (H17)", () => {
  // P1=10♠, up=6♠, P2=8♠ → 18 stands; dealer 6+A = soft 17 → hits 4 → 21, wins
  const table = createTable({ deck: [S("10"), S("6"), S("8"), S("A"), S("4")] });
  table.claim(1000);
  table.deal();
  table.stand();
  expect(table.state.dealer.cards).toHaveLength(3);
  expect(table.state.spots[0].hands[0].result).toBe("lose");
  expect(table.state.bankroll).toBe(9000);
});

test("dealer peeks on a ten-up and a natural ends the round", () => {
  // up=H10, hole=A♦ → dealer natural; player 20 loses without playing
  const table = createTable({ deck: [S("10"), H("10"), S("8"), D("A")] });
  table.claim(1000);
  table.deal();
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("lose");
  expect(table.state.bankroll).toBe(9000);
});

test("player natural vs dealer natural pushes", () => {
  const table = createTable({ deck: [S("A"), H("10"), S("K"), H("A")] });
  table.claim(1000);
  table.deal();
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("push");
  expect(table.state.bankroll).toBe(10000);
});
// ---- Slice 4: insurance ----------------------------------------------------

test("ace up offers insurance; declining resolves the peek and plays on", () => {
  // P1=8♠, up=A♠, P2=9♠ (17); hole=4♠ → no dealer BJ; dealer A+4 soft 15 → 5 → 20
  const table = createTable({ deck: [S("8"), S("A"), S("9"), S("4"), S("5")] });
  table.claim(1000);
  table.deal();
  expect(table.state.phase).toBe("insurance");
  table.decline();
  expect(table.state.phase).toBe("playing");
  table.stand();
  expect(table.state.spots[0].hands[0].result).toBe("lose");
  expect(table.state.bankroll).toBe(9000);
});

test("insurance taken pays 2:1 when dealer has blackjack (net push)", () => {
  const table = createTable({ deck: [S("8"), S("A"), S("9"), H("K")]});
  table.claim(1000);
  table.deal();
  expect(table.state.phase).toBe("insurance");
  table.insure(); // costs $5 (half the bet)
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("lose");
  // −$10 bet − $5 insurance + $15 insurance payout = $100 again
  expect(table.state.bankroll).toBe(10000);
});

test("insurance taken is lost when dealer has no blackjack", () => {
  // P1=7♠, up=A♠, P2=8♠ (15); hole=2♠ → no BJ; dealer A+2 soft 13 → 4 (soft 17) → 2 → 19
  const table = createTable({ deck: [S("7"), S("A"), S("8"), S("2"), S("4"), S("2")] });
  table.claim(1000);
  table.deal();
  table.insure();
  expect(table.state.phase).toBe("playing");
  table.stand(); // 15 loses to 19
  expect(table.state.spots[0].hands[0].result).toBe("lose");
  expect(table.state.bankroll).toBe(8500);
});

// ---- Slice 5: player actions -----------------------------------------------

test("double down takes one card and doubles the stake", () => {
  // P1=5♠, up=7♠, P2=6♠ → 11; double → 9♠ → 20; dealer 15 → 2 → 17
  const table = createTable({ deck: [S("5"), S("7"), S("6"), S("8"), S("9"), S("2")] });
  table.claim(1000);
  table.deal();
  expect(table.state.legal).toContain("double");
  table.double();
  const hand = table.state.spots[0].hands[0];
  expect(hand.cards).toHaveLength(3);
  expect(hand.bet).toBe(2000);
  expect(table.state.bankroll).toBe(12000); // −10 −10 stake + 40 payout
});

test("split a pair into two independently settled hands", () => {
  // P1=8♠, up=6♠, P2=8♥; hole=9♠; split: hand1 8♠+8♦=16, hand2 8♥+5♣=13
  // dealer 15 → 2 → 17; both hands lose
  const table = createTable({
    deck: [S("8"), S("6"), H("8"), S("9"), D("8"), C("5"), S("2")],
  });
  table.claim(1000);
  table.deal();
  expect(table.state.legal).toContain("split");
  table.split();
  const spot = table.state.spots[0];
  expect(spot.hands).toHaveLength(2);
  expect(spot.hands[0].cards).toEqual([S("8"), D("8")]);
  expect(spot.hands[1].cards).toEqual([H("8"), C("5")]);
  expect(table.state.active).toEqual({ spot: 0, hand: 0 });
  table.stand();
  expect(table.state.active).toEqual({ spot: 0, hand: 1 });
  table.stand();
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands.map((h) => h.result)).toEqual(["lose", "lose"]);
  expect(table.state.bankroll).toBe(8000);
});

test("split aces: one card each, both done, no resplit", () => {
  // P1=A♠, up=6♠, P2=A♥; hole=9♠; split: A♠+A♦=12, A♥+A♣=12; dealer 15 → 10 → bust
  const table = createTable({
    deck: [S("A"), S("6"), H("A"), S("9"), D("A"), C("A"), S("10")],
  });
  table.claim(1000);
  table.deal();
  table.split();
  const spot = table.state.spots[0];
  expect(spot.hands).toHaveLength(2);
  expect(spot.hands.every((h) => h.done)).toBe(true);
  expect(spot.hands.every((h) => h.cards.length === 2)).toBe(true);
  expect(table.state.phase).toBe("settled"); // both done → dealer plays at once
  expect(table.state.dealer.cards).toHaveLength(3); // 15 → 10 → 25 bust
  expect(table.state.spots[0].hands.map((h) => h.result)).toEqual(["win", "win"]);
  expect(table.state.bankroll).toBe(12000);
});

test("late surrender forfeits half the bet", () => {
  // P1=10♠, up=6♠, P2=6♠ → 16 surrender; dealer 6+7=13 but no live hands → no draw
  const table = createTable({ deck: [S("10"), S("6"), S("6"), S("7")] });
  table.claim(1000);
  table.deal();
  expect(table.state.legal).toContain("surrender");
  table.surrender();
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("surrender");
  expect(table.state.bankroll).toBe(9500);
  expect(table.state.dealer.cards).toHaveLength(2);
});

test("table limits: five spots, $10–$2000 bets, bankroll cover", () => {
  const table = createTable({ deck: [] });
  for (let i = 0; i < 5; i++) table.claim(1000);
  expect(() => table.claim(1000)).toThrow(/at most 5 spots/);
  const fresh = createTable({ deck: [] });
  expect(() => fresh.claim(999)).toThrow();
  expect(() => fresh.claim(1050)).toThrow(/whole dollars/);
  expect(() => fresh.claim(200001)).toThrow();
  expect(() => fresh.claim(200000)).toThrow(/insufficient bankroll/);
});

test("two spots are dealt and played in claim order", () => {
  // P1a=10♠, P2a=9♠, up=H10, P1b=D10 → 20, P2b=H9 → 18, hole=H9 → dealer 19
  const table = createTable({
    deck: [S("10"), S("9"), H("10"), D("10"), H("9"), H("9")],
  });
  table.claim(1000);
  table.claim(1000);
  table.deal();
  expect(table.state.active).toEqual({ spot: 0, hand: 0 });
  table.stand();
  expect(table.state.active).toEqual({ spot: 1, hand: 0 });
  table.stand();
  expect(table.state.phase).toBe("settled");
  expect(table.state.spots[0].hands[0].result).toBe("win"); // 20 vs 19
  expect(table.state.spots[1].hands[0].result).toBe("lose"); // 18 vs 19
  expect(table.state.bankroll).toBe(10000);
});

// ---- Slice 6: shoe & round lifecycle ---------------------------------------

test("nextRound clears the spots and keeps the bankroll", () => {
  const table = createTable({ deck: [S("10"), H("10"), S("K"), H("7")] });
  table.claim(1000);
  table.deal();
  table.stand();
  expect(table.state.bankroll).toBe(11000);
  table.nextRound();
  expect(table.state.phase).toBe("betting");
  expect(table.state.spots).toHaveLength(0);
  table.claim(1000);
  table.deal();
  expect(table.state.phase).toBe("playing");
});

test("cut card triggers a reshuffle before the next deal", () => {
  // 1 deck = 52 cards, cut at 39; each round burns exactly 4 cards
  const round = [S("10"), S("K"), H("K"), S("7")]; // 20 vs 17, player wins
  const deck: Card[] = [];
  for (let i = 0; i < 10; i++) deck.push(...round);
  while (deck.length < 52) deck.push(S("2")); // filler: rounds never reach these
  const table = createTable({ deck });
  for (let i = 0; i < 9; i++) {
    table.claim(1000);
    table.deal();
    table.stand();
    table.nextRound();
  }
  expect(table.state.needsShuffle).toBe(false); // 36 drawn < 39
  table.claim(1000);
  table.deal();
  table.stand();
  expect(table.state.needsShuffle).toBe(true); // 40 drawn ≥ 39
  table.nextRound();
  table.claim(1000);
  table.deal(); // must not throw: shoe refreshed past the cut
  expect(table.state.phase).toBe("playing");
  expect(table.state.needsShuffle).toBe(false);
  table.stand();
  expect(table.state.spots[0].hands[0].result).toBe("win"); // the replayed deck is the exact injected order
});

test("top-up refills a wiped-out bankroll", () => {
  // five $20 bets, every hand busted → bankroll $0
  const cards: Card[] = [
    S("10"), S("10"), S("10"), S("10"), S("10"),
    S("6"),
    S("10"), S("10"), S("10"), S("10"), S("10"),
    S("K"),
    H("2"), H("2"), H("2"), H("2"), H("2"),
  ];
  const table = createTable({ deck: cards });
  for (let i = 0; i < 5; i++) table.claim(2000);
  table.deal();
  for (let i = 0; i < 5; i++) table.hit(); // 20 + 2 → bust ×5
  expect(table.state.bankroll).toBe(0);
  table.topUp();
  expect(table.state.bankroll).toBe(10000);
});

test("shoe is five decks by default", () => {
  const table = createTable({ rng: () => 0.5 });
  expect(table.state.shoeRemaining).toBe(260);
});

// ---- Slice 7: bankroll injection & spot release ----------------------------

test("table starts from an injected bankroll", () => {
  const table = createTable({ deck: [], bankroll: 5000 });
  expect(table.state.bankroll).toBe(5000);
});

test("releasing a spot refunds its bet", () => {
  const table = createTable({ deck: [] });
  table.claim(1000);
  table.claim(2000);
  table.release(0);
  expect(table.state.spots).toHaveLength(1);
  expect(table.state.spots[0].bet).toBe(2000);
  expect(table.state.bankroll).toBe(8000);
});
