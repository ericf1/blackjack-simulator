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
  | { type: "deal" }
  | { type: "hit"; box: number }
  | { type: "stand"; box: number };

export type Result =
  | { ok: true; state: GameState }
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
const BUY_IN_CENTS = 10000; // the Buy-in: $100

function freshShoe(config: InitialConfig): GameState["shoe"] {
  const cards: Card[] =
    config.stackedShoe ??
    (() => {
      const suits: Suit[] = ["S", "H", "D", "C"];
      const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
      const rng = config.rng ?? Math.random;
      const raw: Card[] = [];
      for (let d = 0; d < config.deckCount; d++) {
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
      return raw;
    })();
  return {
    cards,
    next: 0,
    cutCard: Math.floor(cards.length * CUT_CARD_PENETRATION),
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

export function applyCommand(state: GameState, command: Command): Result {
  switch (command.type) {
    case "setBoxes": {
      if (command.count < 1 || command.count > 5) {
        return { ok: false, error: "a Table holds one to five Boxes" };
      }
      const boxes = Array.from({ length: command.count }, () => ({ bet: 0, hands: [] }));
      return { ok: true, state: { ...state, boxes } };
    }
    case "bet": {
      const boxes = state.boxes.map((box, i) =>
        i === command.box ? { ...box, bet: box.bet + command.amount } : box,
      );
      return { ok: true, state: { ...state, boxes, bankroll: state.bankroll - command.amount } };
    }
    case "deal": {
      let next = state.shoe.next;
      const cards = state.shoe.cards;
      const boxes = state.boxes.map((box) => ({
        bet: box.bet,
        hands: [{ cards: [] as Card[], bet: box.bet, done: false }],
      }));
      // Dealing order: one card to each Box, dealer upcard, second card to each Box, hole card.
      for (const box of boxes) box.hands[0].cards.push({ ...cards[next++] });
      const upcard = { ...cards[next++] };
      for (const box of boxes) box.hands[0].cards.push({ ...cards[next++] });
      const holeCard = { ...cards[next++], faceUp: false };
      return {
        ok: true,
        state: {
          ...state,
          phase: "player",
          boxes,
          dealer: { cards: [upcard, holeCard] },
          shoe: { ...state.shoe, next },
        },
      };
    }
    case "stand": {
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
  }
}

/** Best value: aces count as 11 and downgrade to 1 while the hand is over 21. */
function handValue(cards: Card[]): number {
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