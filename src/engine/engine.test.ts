import { describe, expect, test } from "vitest";
import { applyCommand, createInitialState, type Card, type GameState, type Result } from "./engine";
import { activeBox, canDeal, inPlay, rebuyAvailable, roundNet } from "./selectors";

/** Unwrap a Result, failing the test with the engine's error if the command was rejected. */
const ok = (result: Result): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

/** Assert a Result was rejected, returning the engine's error message. */
const rejected = (result: Result): string => {
  if (result.ok) throw new Error(`expected rejection, got phase ${result.state.phase}`);
  return result.error;
};

/** A state one command short of a dealt round: one Box funded with $10. */
const seated = (shoeCodes = "2C 3D 4H 5S"): GameState => {
  let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe(shoeCodes) });
  state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
  return ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
};

/** A dealt round: one Box funded with $10, Player phase. */
const dealt = (shoeCodes = "2C 3D 4H 5S"): GameState => ok(applyCommand(seated(shoeCodes), { type: "deal" }));

// Test rig: stack the shoe so every outcome is a known fact.
const card = (code: string): Card => {
  const [rank, suit] = [code.slice(0, -1), code.slice(-1)];
  return { id: code, rank: rank as Card["rank"], suit: suit as Card["suit"], faceUp: true };
};

/** Repeat a sequence of card codes until the shoe holds `decks × 52` cards. */
const stackedShoe = (codes: string, decks = 6): Card[] => {
  const pattern = codes.trim().split(/\s+/).map(card);
  return Array.from({ length: decks * 52 }, (_, i) => ({ ...pattern[i % pattern.length], id: `c${i}` }));
};

/** A hand-stacked Shoe of exactly `count` cards — the pattern repeating. */
const shortShoe = (codes: string, count: number): Card[] => {
  const pattern = codes.trim().split(/\s+/).map(card);
  return Array.from({ length: count }, (_, i) => ({ ...pattern[i % pattern.length], id: `s${i}` }));
};

describe("selectors", () => {
  test("canDeal says yes only when at least one Box holds a legal Bet", () => {
    const state = seated();
    expect(canDeal({ ...state, boxes: [{ bet: 0, hands: [] }] })).toBe(false);
    expect(canDeal(state)).toBe(true); // $10 composed
    expect(canDeal({ ...state, boxes: [{ bet: 500, hands: [] }] })).toBe(false); // under the Minimum bet
    expect(canDeal({ ...state, boxes: [{ bet: 1000, hands: [] }, { bet: 500, hands: [] }] })).toBe(false);
  });

  test("activeBox walks the Boxes in order while Hands are unfinished", () => {
    let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe("2C 3D 4H 5S") });
    state = ok(applyCommand(state, { type: "setBoxes", count: 2 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "bet", box: 1, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    expect(activeBox(state)).toBe(0);
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(activeBox(state)).toBe(1); // the second Box is up
    state = ok(applyCommand(state, { type: "stand", box: 1 }));
    expect(activeBox(state)).toBe(null); // settled, nothing to act on
  });

  test("inPlay counts composed Bets while betting and committed Hands during the Round", () => {
    let state = seated();
    expect(inPlay(state)).toBe(1000);
    state = ok(applyCommand(state, { type: "deal" }));
    expect(inPlay(state)).toBe(1000); // the Hand carries the commitment
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(inPlay(state)).toBe(1000); // settled Hands are still this Round's money
  });

  test("roundNet reports the Round's net once settled", () => {
    let state = dealt("KH 6D KS 6S KH");
    expect(roundNet(state)).toBe(null); // nothing settled yet
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(roundNet(state)).toBe(1000); // won $10
  });
});

describe("the Shoe running short", () => {
  test("a Deal that would outrun the Shoe reshuffles first, with a notice", () => {
    // A 32-card stacked Shoe: one more round would run it dry.
    let state = createInitialState({
      deckCount: 6,
      autoShuffle: true,
      stackedShoe: shortShoe("2C 3D 4H 5S", 32),
    });
    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));
    expect(state.shoe.cards).toHaveLength(32); // the short Shoe was still good for this round
    expect(state.shoe.next).toBe(4); // the round was dealt from the top
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(state.shoe.next).toBe(7); // the Dealer drew three cards to reach 17
    state = ok(applyCommand(state, { type: "nextRound" }));

    const result = applyCommand(state, { type: "deal" }, () => 0.5);

    if (!result.ok) throw new Error(result.error);
    expect(result.notices?.join(" ")).toMatch(/reshuffled/i);
    expect(result.state.shoe.cards).toHaveLength(6 * 52); // a fresh six-deck Shoe
    expect(result.state.shoe.next).toBe(4); // the round was dealt from the top
    expect(result.state.phase).toBe("player");
  });

  test("a normal Deal never reshuffles", () => {
    const state = dealt();

    expect(state.shoe.next).toBe(4);
  });
});

describe("Rebuy", () => {
  test("the engine offers Rebuy exactly when the Bankroll can't cover the Minimum bet", () => {
    // Stacked shoe: Player 2♣+4♥ = 8 stands; Dealer draws to 17. The $95 Bet is lost, leaving $5.
    let state = seated("2C 3D 4H 5S");
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 8500 }));
    state = ok(applyCommand(state, { type: "deal" }));
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    state = ok(applyCommand(state, { type: "nextRound" })); // bet auto-cleared, Bankroll $5
    expect(state.bankroll).toBe(500);

    expect(rebuyAvailable(state)).toBe(true);
    // Even after the last chips are bet, the Bankroll still can't cover the Minimum bet.
    expect(rebuyAvailable(ok(applyCommand(state, { type: "bet", box: 0, amount: 500 })))).toBe(true);
  });

  test("Rebuy resets the Bankroll to the Buy-in and clears Bets, on the Player's explicit command", () => {
    let state = seated("2C 3D 4H 5S");
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 8500 }));
    state = ok(applyCommand(state, { type: "deal" }));
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    state = ok(applyCommand(state, { type: "nextRound" }));
    expect(state.bankroll).toBe(500);

    const result = applyCommand(state, { type: "rebuy" });

    if (!result.ok) throw new Error(result.error);
    expect(result.state.bankroll).toBe(10000); // a fresh Buy-in
    expect(result.state.boxes[0].bet).toBe(0); // Bets cleared
    expect(result.state.phase).toBe("betting");
    expect(result.notices?.join(" ")).toMatch(/rebuy/i);
  });

  test("the engine rejects Rebuy while the Bankroll can still cover the Minimum bet", () => {
    const state = seated();

    expect(rejected(applyCommand(state, { type: "rebuy" }))).toMatch(/minimum/i);
  });

  test("the engine rejects Rebuy outside the betting phase", () => {
    let state = dealt("2C 3D 4H 5S");
    state = { ...state, bankroll: 500 }; // broke mid-Round; Rebuy still waits for the betting phase

    expect(rejected(applyCommand(state, { type: "rebuy" }))).toMatch(/betting/i);
  });
});

describe("kept Bets between Rounds", () => {
  test("after settlement the next Round returns to betting with the Bet kept and recommitted", () => {
    // Stacked shoe: Player K♣+K♠ = 20; Dealer 6♦+6♠ = 12 draws K♥ to bust. Player wins.
    let state = dealt("KH 6D KS 6S KH");
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(state.phase).toBe("settled");
    expect(state.boxes[0].hands[0].outcome).toBe("win");
    expect(state.bankroll).toBe(11000); // stake returned plus winnings

    state = ok(applyCommand(state, { type: "nextRound" }));

    expect(state.phase).toBe("betting");
    expect(state.boxes[0].bet).toBe(1000); // the Bet stays composed on its Box
    expect(state.boxes[0].hands).toHaveLength(0);
    expect(state.dealer.cards).toHaveLength(0);
    expect(state.bankroll).toBe(10000); // the kept Bet is recommitted from the Bankroll
  });

  test("replaying the kept Bet is one Deal away", () => {
    let state = dealt("KH 6D KS 6S KH");
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    state = ok(applyCommand(state, { type: "nextRound" }));

    state = ok(applyCommand(state, { type: "deal" }));

    expect(state.phase).toBe("player");
    expect(state.boxes[0].hands[0].bet).toBe(1000);
  });

  test("the engine rejects a next Round while a Round is still in play", () => {
    const state = seated();

    expect(rejected(applyCommand(state, { type: "nextRound" }))).toMatch(/settled/i);
  });

  test("a kept Bet the Bankroll can no longer cover auto-clears with a notice", () => {
    // Stacked shoe: Player 2♣+4♥ = 8 stands; Dealer draws 2♣, 3♦, 4♥ to 17. The $95 Bet is lost, leaving $5.
    let state = seated("2C 3D 4H 5S");
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 8500 })); // Box now holds $95
    state = ok(applyCommand(state, { type: "deal" }));
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    expect(state.bankroll).toBe(500);

    const result = applyCommand(state, { type: "nextRound" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.boxes[0].bet).toBe(0); // auto-cleared
    expect(result.state.bankroll).toBe(500); // nothing recommitted
    expect(result.notices?.join(" ")).toMatch(/clear/i);
  });

  test("Boxes keep their Bets in order until the Bankroll can no longer recommit", () => {
    // Two Boxes at $30 each; a $60 loss leaves $40 — only the first kept Bet can be recommitted.
    let state = createInitialState({
      deckCount: 6,
      autoShuffle: true,
      stackedShoe: stackedShoe("5C 5D 6H 5S 5C 6D 9H 2C 3D 4H"),
    });
    state = ok(applyCommand(state, { type: "setBoxes", count: 2 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 3000 }));
    state = ok(applyCommand(state, { type: "bet", box: 1, amount: 3000 }));
    state = ok(applyCommand(state, { type: "deal" }));
    state = ok(applyCommand(state, { type: "stand", box: 0 }));
    state = ok(applyCommand(state, { type: "stand", box: 1 })); // both bust
    expect(state.bankroll).toBe(4000);

    const result = applyCommand(state, { type: "nextRound" });

    if (!result.ok) throw new Error(result.error);
    expect(result.state.boxes[0].bet).toBe(3000); // recommitted
    expect(result.state.boxes[1].bet).toBe(0); // auto-cleared
    expect(result.state.bankroll).toBe(1000);
    expect(result.notices?.join(" ")).toMatch(/clear/i);
  });
});

describe("clearing a Bet", () => {
  test("the Player can empty a composed Bet and the chips return to the Bankroll", () => {
    const state = seated(); // Box holds $10, Bankroll shows $90

    const next = ok(applyCommand(state, { type: "clearBet", box: 0 }));

    expect(next.boxes[0].bet).toBe(0);
    expect(next.bankroll).toBe(10000);
  });

  test("the Player can reduce a composed Bet by an exact amount", () => {
    const state = seated(); // Box holds $10

    const next = ok(applyCommand(state, { type: "clearBet", box: 0, amount: 500 }));

    expect(next.boxes[0].bet).toBe(500);
    expect(next.bankroll).toBe(9500);
  });

  test("the engine rejects clearing more than the Bet, nothing at all, or outside the betting phase", () => {
    let state = seated();

    expect(rejected(applyCommand(state, { type: "clearBet", box: 0, amount: 1001 }))).toMatch(/bet/i);
    expect(rejected(applyCommand(state, { type: "clearBet", box: 0, amount: 0 }))).toBeTruthy();

    state = ok(applyCommand(state, { type: "deal" }));
    expect(rejected(applyCommand(state, { type: "clearBet", box: 0 }))).toMatch(/betting/i);
  });
});

describe("deal validation", () => {
  test("the engine rejects a Deal with no funded Box", () => {
    let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe("2C 3D 4H 5S") });
    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));

    const error = rejected(applyCommand(state, { type: "deal" }));

    expect(error).toMatch(/funded/i);
    expect(state.phase).toBe("betting");
  });

  test("the engine rejects a Deal while a composed Bet sits under the Minimum bet", () => {
    let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe("2C 3D 4H 5S") });
    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 500 }));

    const error = rejected(applyCommand(state, { type: "deal" }));

    expect(error).toMatch(/minimum/i);
    expect(state.phase).toBe("betting");
  });

  test("an unfunded Box sits out the round", () => {
    let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe("2C 3D 4H 5S") });
    state = ok(applyCommand(state, { type: "setBoxes", count: 2 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    expect(state.boxes[0].hands).toHaveLength(1);
    expect(state.boxes[1].hands).toHaveLength(0); // no Bet, no Hand
    expect(state.bankroll).toBe(9000); // dealing itself moves no money
  });

  test("the engine rejects acting on a Box with no Hand in play", () => {
    const betting = seated();

    expect(rejected(applyCommand(betting, { type: "hit", box: 0 }))).toMatch(/player phase/i);
    expect(rejected(applyCommand(betting, { type: "stand", box: 0 }))).toMatch(/player phase/i);

    let state = createInitialState({ deckCount: 6, autoShuffle: true, stackedShoe: stackedShoe("2C 3D 4H 5S") });
    state = ok(applyCommand(state, { type: "setBoxes", count: 2 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    expect(rejected(applyCommand(state, { type: "hit", box: 1 }))).toMatch(/no Hand in play/i);
  });
});

describe("bet validation", () => {
  test("the engine rejects a Bet over the remaining Bankroll and leaves the Bankroll untouched", () => {
    const state = seated();

    const error = rejected(applyCommand(state, { type: "bet", box: 0, amount: 9001 }));

    expect(error).toMatch(/Bankroll/i);
    expect(state.bankroll).toBe(9000); // unchanged
  });

  test("the engine rejects composing Bets outside the betting phase", () => {
    let state = seated();
    state = ok(applyCommand(state, { type: "deal" }));

    const error = rejected(applyCommand(state, { type: "bet", box: 0, amount: 100 }));

    expect(state.phase).toBe("player");
    expect(state.bankroll).toBe(9000); // nothing leaked out of the Bankroll
    expect(error).toMatch(/betting/i);
  });

  test("the engine rejects a non-positive Bet", () => {
    const state = seated();

    expect(rejected(applyCommand(state, { type: "bet", box: 0, amount: 0 }))).toBeTruthy();
    expect(rejected(applyCommand(state, { type: "bet", box: 0, amount: -500 }))).toBeTruthy();
  });

  test("the engine rejects a command aimed at a Box that does not exist", () => {
    const state = seated();

    const error = rejected(applyCommand(state, { type: "bet", box: 5, amount: 100 }));

    expect(error).toMatch(/box/i);
  });
});

describe("a round", () => {
  test("a dealt round commits the Box's bet and hands the Player two cards against a hidden hole card", () => {
    let state = createInitialState({
      deckCount: 6,
      autoShuffle: true,
      stackedShoe: stackedShoe("2C 3D 4H 5S"),
    });

    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    expect(state.bankroll).toBe(9000); // $100 buy-in less the $10 bet
    expect(state.phase).toBe("player");
    expect(state.boxes[0].hands).toHaveLength(1);
    expect(state.boxes[0].hands[0].cards).toHaveLength(2);
    expect(state.dealer.cards).toHaveLength(2);
    expect(state.dealer.cards[0].faceUp).toBe(true);
    expect(state.dealer.cards[1].faceUp).toBe(false); // the hole card
  });

  test("when the Player stands, the Dealer reveals and draws to seventeen, and the better hand settles", () => {
    // Stacked shoe: Player holds 2♣+4♥ = 8. Dealer shows 3♦, hole card 5♠ = 8,
    // then draws 2♣, 3♦, 4♥ to reach 17. Dealer wins.
    let state = createInitialState({
      deckCount: 6,
      autoShuffle: true,
      stackedShoe: stackedShoe("2C 3D 4H 5S"),
    });
    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    state = ok(applyCommand(state, { type: "stand", box: 0 }));

    expect(state.phase).toBe("settled");
    expect(state.dealer.cards.every((card) => card.faceUp)).toBe(true); // Reveal
    expect(state.boxes[0].hands[0].outcome).toBe("lose");
    expect(state.bankroll).toBe(9000); // losing bet stays lost
  });

  test("when the Player busts, the hand loses immediately and the Dealer does not draw", () => {
    // Stacked shoe: Player 2♣+K♥ = 12; hits 2♣, 3♦, K♥ → busts at 27.
    let state = createInitialState({
      deckCount: 6,
      autoShuffle: true,
      stackedShoe: stackedShoe("2C 3D KH 5S"),
    });
    state = ok(applyCommand(state, { type: "setBoxes", count: 1 }));
    state = ok(applyCommand(state, { type: "bet", box: 0, amount: 1000 }));
    state = ok(applyCommand(state, { type: "deal" }));

    state = ok(applyCommand(state, { type: "hit", box: 0 }));
    state = ok(applyCommand(state, { type: "hit", box: 0 }));
    state = ok(applyCommand(state, { type: "hit", box: 0 }));

    expect(state.phase).toBe("settled");
    expect(state.boxes[0].hands[0].outcome).toBe("lose");
    expect(state.dealer.cards).toHaveLength(2); // no dealer draw after a busted Player
    expect(state.bankroll).toBe(9000);
  });
});