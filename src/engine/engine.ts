// The blackjack engine: a pure state machine over Rounds, Boxes, Hands and the Shoe.
// No React, no localStorage, no timers — the UI owns all of those. See CONTEXT.md
// for the domain language and docs/adr/0001 for why this is client-side and pure.

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  id: string;
  rank: Rank;
  suit: Suit;
  faceUp: boolean;
};

export type Hand = {
  cards: Card[];
  /** Committed bet in cents for this hand. */
  bet: number;
  done: boolean;
  outcome?: "win" | "lose" | "push";
};

export type Box = {
  /** The bet being composed on this box during the betting phase, in cents. */
  bet: number;
  hands: Hand[];
};

export type Phase = "betting" | "player" | "dealer" | "settled";

export type GameState = {
  phase: Phase;
  boxes: Box[];
  dealer: { cards: Card[] };
  shoe: {
    cards: Card[];
    /** Index of the next card to draw. */
    next: number;
    /** Card count at which the shoe is reshuffled (the cut card). */
    cutCard: number;
  };
  bankroll: number;
  settings: { deckCount: number; autoShuffle: boolean };
};

export type Command =
  | { type: "setBoxes"; count: number }
  | { type: "bet"; box: number; amount: number }
  | { type: "clearBet"; box: number; /** Chips to take back; omit to empty the Box. */ amount?: number }
  | { type: "deal" }
  | { type: "hit"; box: number }
  | { type: "stand"; box: number }
  | { type: "nextRound" }
  | { type: "rebuy" };

export type Result =
  | { ok: true; state: GameState; /** Engine-driven events the Player should see. */ notices?: string[] }
  | { ok: false; error: string };

export type InitialConfig = {
  deckCount: number;
  autoShuffle: boolean;
  /** Test rig: exact card order for the shoe. */
  stackedShoe?: Card[];
  /** Test rig: source of randomness when no stackedShoe is given. */
  rng?: () => number;
};

const CUT_CARD_PENETRATION = 0.75;
export const BUY_IN_CENTS = 10000; // the Buy-in: $100
/** The smallest legal Bet: $10. */
export const MINIMUM_BET_CENTS = 1000;

function buildShoe(deckCount: number, rng: () => number): GameState["shoe"] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const raw: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        raw.push({ id: `${d}${suit}${rank}`, rank, suit, faceUp: true });
      }
    }
  }
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return {
    cards: raw,
    next: 0,
    cutCard: Math.floor(raw.length * CUT_CARD_PENETRATION),
  };
}

function freshShoe(config: InitialConfig): GameState["shoe"] {
  if (config.stackedShoe) {
    return {
      cards: config.stackedShoe,
      next: 0,
      cutCard: Math.floor(config.stackedShoe.length * CUT_CARD_PENETRATION),
    };
  }
  return buildShoe(config.deckCount, config.rng ?? Math.random);
}

/** The Box must hold an unfinished Hand for the Player to act on. */
function playableHand(state: GameState, box: number): string | null {
  if (box < 0 || box >= state.boxes.length) return "that Box is not at the Table";
  const hand = state.boxes[box].hands[0];
  if (!hand) return "that Box has no Hand in play";
  if (hand.done) return "that Hand is already finished";
  return null;
}

/** Initial deal: one card per funded Box, dealer upcard, second card per funded Box, hole card. */
function dealRound(state: GameState, fundedBoxes: number, notices: string[] = []): Result {
  let next = state.shoe.next;
  const cards = state.shoe.cards;
  const draw = (): Card => ({ ...cards[next++] });
  const boxes = state.boxes.map((box) =>
    box.bet >= MINIMUM_BET_CENTS
      ? { ...box, hands: [{ cards: [] as Card[], bet: box.bet, done: false }] }
      : { ...box, hands: [] },
  );
  // Dealing order: one card to each funded Box, the Dealer's upcard, a second card per funded Box, the hole card.
  for (const box of boxes) if (box.hands.length > 0) box.hands[0].cards.push(draw());
  const upcard = draw();
  for (const box of boxes) if (box.hands.length > 0) box.hands[0].cards.push(draw());
  const holeCard = { ...draw(), faceUp: false };
  return {
    ok: true,
    state: {
      ...state,
      phase: "player",
      boxes,
      dealer: { cards: [upcard, holeCard] },
      shoe: { ...state.shoe, next },
    },
    ...(notices.length > 0 ? { notices } : {}),
  };
}

export function createInitialState(config: InitialConfig): GameState {
  return {
    phase: "betting",
    boxes: [{ bet: 0, hands: [] }],
    dealer: { cards: [] },
    shoe: freshShoe(config),
    bankroll: BUY_IN_CENTS,
    settings: { deckCount: config.deckCount, autoShuffle: config.autoShuffle },
  };
}

export function applyCommand(state: GameState, command: Command, rng: () => number = Math.random): Result {
  const validBox = (state: GameState, box: number): string | null =>
    Number.isInteger(box) && box >= 0 && box < state.boxes.length ? null : "that Box is not at the Table";

  switch (command.type) {
    case "setBoxes": {
      if (state.phase !== "betting") return { ok: false, error: "Boxes are set during the betting phase" };
      if (command.count < 1 || command.count > 5) {
        return { ok: false, error: "a Table holds one to five Boxes" };
      }
      const boxes = Array.from({ length: command.count }, () => ({ bet: 0, hands: [] }));
      return { ok: true, state: { ...state, boxes } };
    }
    case "bet": {
      if (state.phase !== "betting") return { ok: false, error: "Bets are composed during the betting phase" };
      const boxError = validBox(state, command.box);
      if (boxError) return { ok: false, error: boxError };
      if (!Number.isInteger(command.amount) || command.amount <= 0) {
        return { ok: false, error: "a Bet is composed from chips" };
      }
      if (command.amount > state.bankroll) {
        return { ok: false, error: "the Bet exceeds the remaining Bankroll" };
      }
      const boxes = state.boxes.map((box, i) =>
        i === command.box ? { ...box, bet: box.bet + command.amount } : box,
      );
      return { ok: true, state: { ...state, boxes, bankroll: state.bankroll - command.amount } };
    }
    case "clearBet": {
      if (state.phase !== "betting") return { ok: false, error: "Bets are cleared during the betting phase" };
      const boxError = validBox(state, command.box);
      if (boxError) return { ok: false, error: boxError };
      const bet = state.boxes[command.box].bet;
      if (command.amount !== undefined && (!Number.isInteger(command.amount) || command.amount <= 0)) {
        return { ok: false, error: "clear a positive amount of chips" };
      }
      if (command.amount !== undefined && command.amount > bet) {
        return { ok: false, error: "the clear takes back more than the Bet holds" };
      }
      const removed = command.amount ?? bet;
      const boxes = state.boxes.map((box, i) => (i === command.box ? { ...box, bet: box.bet - removed } : box));
      return { ok: true, state: { ...state, boxes, bankroll: state.bankroll + removed } };
    }
    case "deal": {
      if (state.phase !== "betting") return { ok: false, error: "the Round is dealt during the betting phase" };
      const underFunded = state.boxes.findIndex((box) => box.bet > 0 && box.bet < MINIMUM_BET_CENTS);
      if (underFunded >= 0) {
        return { ok: false, error: `the Bet on Box ${underFunded + 1} is under the $10 Minimum bet` };
      }
      if (!state.boxes.some((box) => box.bet >= MINIMUM_BET_CENTS)) {
        return { ok: false, error: "Deal requires at least one funded Box" };
      }
      // Force-shuffle: a Round always completes, so deal from a fresh Shoe when this one can't cover the round.
      const funded = state.boxes.filter((box) => box.bet >= MINIMUM_BET_CENTS).length;
      const remaining = state.shoe.cards.length - state.shoe.next;
      const needed = 12 * funded + 16; // initial deal + worst-case Player hits and Dealer draws
      if (remaining < needed) {
        return dealRound({ ...state, shoe: buildShoe(state.settings.deckCount, rng) }, funded, [
          "The Shoe ran short and was reshuffled",
        ]);
      }
      return dealRound(state, funded);
    }
    case "stand": {
      if (state.phase !== "player") return { ok: false, error: "the Player acts during the player phase" };
      const standError = playableHand(state, command.box);
      if (standError) return { ok: false, error: standError };
      const boxes = state.boxes.map((box, i) =>
        i === command.box
          ? { ...box, hands: box.hands.map((hand) => ({ ...hand, done: true })) }
          : box,
      );
      if (!boxes.every((b) => b.hands.every((h) => h.done))) {
        return { ok: true, state: { ...state, boxes } };
      }
      return settle({ ...state, boxes }, true);
    }
    case "hit": {
      if (state.phase !== "player") return { ok: false, error: "the Player acts during the player phase" };
      const hitError = playableHand(state, command.box);
      if (hitError) return { ok: false, error: hitError };
      let next = state.shoe.next;
      const cards = state.shoe.cards;
      const boxes = state.boxes.map((box, i) =>
        i === command.box
          ? {
              ...box,
              hands: box.hands.map((hand) => ({ ...hand, cards: [...hand.cards, { ...cards[next++] }] })),
            }
          : box,
      );
      const shoe = { ...state.shoe, next };
      const allBusted = boxes.every((b) => b.hands.every((h) => handValue(h.cards) > 21));
      if (allBusted) {
        return settle({ ...state, boxes, shoe }, false);
      }
      return { ok: true, state: { ...state, boxes, shoe } };
    }
    case "nextRound": {
      if (state.phase !== "settled") return { ok: false, error: "the next Round follows a settled one" };
      // Kept Bets stay composed on their Boxes — recommitted from the Bankroll now that the
      // previous Round's Hands have settled. A kept Bet the Bankroll can no longer cover auto-clears.
      const notices: string[] = [];
      let bankroll = state.bankroll;
      const boxes = state.boxes.map((box, i) => {
        if (box.bet <= 0) return { ...box, hands: [] };
        if (box.bet <= bankroll) {
          bankroll -= box.bet;
          return { ...box, hands: [] };
        }
        notices.push(`The kept Bet on Box ${i + 1} was auto-cleared — the Bankroll can no longer cover it`);
        return { ...box, bet: 0, hands: [] };
      });
      return {
        ok: true,
        state: { ...state, phase: "betting", boxes, dealer: { cards: [] }, bankroll },
        ...(notices.length > 0 ? { notices } : {}),
      };
    }
    case "rebuy": {
      if (state.phase !== "betting") return { ok: false, error: "Rebuy happens during the betting phase" };
      if (state.bankroll >= MINIMUM_BET_CENTS) {
        return { ok: false, error: "Rebuy is offered only when the Bankroll can't cover the Minimum bet" };
      }
      return {
        ok: true,
        state: {
          ...state,
          bankroll: BUY_IN_CENTS,
          boxes: state.boxes.map((box) => ({ ...box, bet: 0 })),
        },
        notices: [`Rebuy — the Bankroll is reset to a fresh Buy-in of $${BUY_IN_CENTS / 100}`],
      };
    }
  }
}

/** Best value: aces count as 11 and downgrade to 1 while the hand is over 21. */
export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      total += 11;
    } else if (card.rank === "K" || card.rank === "Q" || card.rank === "J" || card.rank === "10") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function settle(state: GameState, dealerPlays: boolean): Result {
  let next = state.shoe.next;
  const dealerCards = state.dealer.cards.map((card) => ({ ...card, faceUp: true })); // Reveal
  if (dealerPlays) {
    while (handValue(dealerCards) < 17) {
      dealerCards.push({ ...state.shoe.cards[next++] });
    }
  }
  const dealerTotal = handValue(dealerCards);
  let bankroll = state.bankroll;
  const boxes = state.boxes.map((box) => ({
    ...box,
    hands: box.hands.map((hand) => {
      const playerTotal = handValue(hand.cards);
      const outcome: "win" | "lose" | "push" =
        playerTotal > 21
          ? "lose"
          : dealerTotal > 21 || playerTotal > dealerTotal
            ? "win"
            : playerTotal < dealerTotal
              ? "lose"
              : "push";
      if (outcome === "win") bankroll += hand.bet * 2;
      if (outcome === "push") bankroll += hand.bet;
      return { ...hand, outcome };
    }),
  }));
  return {
    ok: true,
    state: {
      ...state,
      phase: "settled",
      boxes,
      dealer: { cards: dealerCards },
      shoe: { ...state.shoe, next },
      bankroll,
    },
  };
}