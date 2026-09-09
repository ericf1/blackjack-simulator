import { describe, expect, test } from "vitest";
import { applyCommand, createInitialState, type Card, type GameState, type Result } from "./engine";

/** Unwrap a Result, failing the test with the engine's error if the command was rejected. */
const ok = (result: Result): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

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