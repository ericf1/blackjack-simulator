import type { Card } from "./cards";
import { handValue, isPair, isTenValue } from "./cards";
import { Shoe } from "./shoe";

// ---- Money ----------------------------------------------------------------
export const START_BANKROLL = 100_00; // $100 in cents
export const TABLE_MIN = 10_00;
export const TABLE_MAX = 200_000;
export const MAX_SPOTS = 5;
export const TOP_UP = 100_00;

// ---- Types ----------------------------------------------------------------
export type Phase = "betting" | "insurance" | "playing" | "settled";
export type Result = "blackjack" | "win" | "push" | "lose" | "bust" | "surrender";
export type Action = "hit" | "stand" | "double" | "split" | "surrender";

/** One bankroll sample in the Session history: a settled Round or a Top-up. */
export type HistoryEvent =
  | { kind: "settle"; round: number; bankroll: number }
  | { kind: "topUp"; round: number; bankroll: number };

export interface HandView {
  cards: Card[];
  bet: number; // cents staked on this hand (a double-down doubles it here)
  done: boolean;
  surrendered: boolean;
  splitAces: boolean;
  fromSplit: boolean;
  result?: Result;
}

export interface SpotView {
  id: number;
  bet: number;
  hands: HandView[];
}

export interface State {
  phase: Phase;
  bankroll: number;
  spots: SpotView[];
  active: { spot: number; hand: number } | null;
  legal: Action[];
  dealer: { cards: Card[]; holeRevealed: boolean };
  shoeRemaining: number;
  needsShuffle: boolean;
  /** Total insurance premium for the current peek (nonzero only during the insurance phase). */
  insuranceCost: number;
  /** Bankroll at the start of the current Session — the chart's baseline. */
  sessionStart: number;
  /** Append-only Session history (CONTEXT.md: Session): one settle per Round, plus Top-ups. */
  history: HistoryEvent[];
}

export interface TableOptions {
  decks?: number;
  rng?: () => number;
  /** Rigged draw order (tests / simulator). Overrides shuffle entirely. */
  deck?: Card[];
  /** Injected starting bankroll (persistence adapter). Defaults to $100. */
  bankroll?: number;
}

// ---- Table ----------------------------------------------------------------
export function createTable(options: TableOptions = {}) {
  const shoe = new Shoe(options.deck ?? null, options.decks ?? 5, options.rng);
  let bankroll = options.bankroll ?? START_BANKROLL;
  let sessionStart = bankroll;
  let round = 0; // increments as each Round is dealt
  let history: HistoryEvent[] = [];
  let spots: Spot[] = [];
  let phase: Phase = "betting";
  let active: { spot: number; hand: number } | null = null;
  let insuranceBet = 0;
  let dealerHole: Card | null = null;
  let dealerCards: Card[] = [];

  interface Spot {
    id: number;
    bet: number;
    hands: Hand[];
  }
  interface Hand extends HandView {}

  function state(): State {
    return {
      phase,
      bankroll,
      spots: spots.map((spot) => ({
        id: spot.id,
        bet: spot.bet,
        hands: spot.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })),
      })),
      active: active ? { ...active } : null,
      legal: active ? legalActions(active) : [],
      dealer: { cards: [...dealerCards], holeRevealed: dealerCards.length > 1 },
      shoeRemaining: shoe.remaining,
      needsShuffle: shoe.pastCut,
      insuranceCost: phase === "insurance" ? insuranceCost() : 0,
      sessionStart,
      history: [...history],
    };
  }

  /** Half of every claimed bet — the price of insuring them all. */
  function insuranceCost(): number {
    return spots.reduce((sum, spot) => sum + Math.floor(spot.bet / 2), 0);
  }

  function legalActions({ spot, hand }: { spot: number; hand: number }): Action[] {
    const h = spots[spot].hands[hand];
    if (h.done) return [];
    const actions: Action[] = ["hit", "stand"];
    const firstTwo = h.cards.length === 2;
    if (firstTwo && bankroll >= h.bet) actions.push("double");
    if (
      firstTwo &&
      isPair(h.cards) &&
      spots[spot].hands.length < 4 &&
      !h.splitAces &&
      bankroll >= h.bet
    ) {
      actions.push("split");
    }
    if (firstTwo && !h.fromSplit) actions.push("surrender");
    return actions;
  }

  function claim(bet: number): void {
    assertPhase("betting");
    if (spots.length >= MAX_SPOTS) throw new Error(`at most ${MAX_SPOTS} spots`);
    if (bet < TABLE_MIN || bet > TABLE_MAX) throw new Error(`bet must be $10–$2000`);
    if (bet % 100 !== 0) throw new Error("bets are whole dollars");
    if (bankroll < bet) throw new Error("insufficient bankroll");
    bankroll -= bet;
    spots.push({ id: spots.length, bet, hands: [] });
  }

  function newHand(bet: number, first: Card): Hand {
    return {
      cards: [first],
      bet,
      done: false,
      surrendered: false,
      splitAces: false,
      fromSplit: false,
    };
  }

  function deal(): void {
    assertPhase("betting");
    if (spots.length === 0) throw new Error("claim at least one spot");
    if (shoe.pastCut) shoe.refresh();
    round += 1;

    // one card per spot in order, dealer up, second card per spot, dealer hole
    for (const spot of spots) spot.hands.push(newHand(spot.bet, shoe.draw()));
    dealerCards = [shoe.draw()];
    for (const spot of spots) spot.hands[0].cards.push(shoe.draw());
    dealerHole = shoe.draw();

    for (const spot of spots) {
      for (const hand of spot.hands) {
        if (isNatural(hand.cards)) hand.done = true;
      }
    }

    if (dealerCards[0].rank === "A") {
      phase = "insurance";
      return;
    }
    resolvePeek();
  }

  function insure(): void {
    assertPhase("insurance");
    const cost = insuranceCost();
    if (bankroll < cost) throw new Error("insufficient bankroll for insurance");
    bankroll -= cost;
    insuranceBet = cost;
    resolvePeek();
  }

  function decline(): void {
    assertPhase("insurance");
    insuranceBet = 0;
    resolvePeek();
  }

  function resolvePeek(): void {
    const up = dealerCards[0];
    const dealerBJ = (isTenValue(up) || up.rank === "A") && isNatural([up, dealerHole!]);
    if (dealerBJ) dealerCards.push(dealerHole!);
    settleInsurance(dealerBJ); // settled immediately after the peek (docs/rules.md)
    if (dealerBJ) {
      settleAll({ dealerNatural: true });
      return;
    }
    phase = "playing";
    advance();
  }

  /** Insurance pays 2:1 (stake + 2×) on a dealer natural; the premium is forfeited otherwise. */
  function settleInsurance(dealerBJ: boolean): void {
    if (insuranceBet === 0) return;
    if (dealerBJ) bankroll += insuranceBet * 3;
    insuranceBet = 0;
  }

  function advance(): void {
    for (let s = 0; s < spots.length; s++) {
      const h = spots[s].hands.findIndex((hand) => !hand.done);
      if (h !== -1) {
        active = { spot: s, hand: h };
        return;
      }
    }
    active = null;
    playDealer();
  }

  function playDealer(): void {
    dealerCards.push(dealerHole!);
    if (spots.some((spot) => spot.hands.some((hand) => !isBust(hand) && !hand.surrendered))) {
      drawDealer();
    }
    settleAll({ dealerNatural: false });
  }

  function drawDealer(): void {
    const { total, soft } = handValue(dealerCards);
    // H17: dealer hits soft 17
    if (total < 17 || (total === 17 && soft)) {
      dealerCards.push(shoe.draw());
      drawDealer();
    }
  }

  function settleAll({ dealerNatural }: { dealerNatural: boolean }): void {
    phase = "settled";
    active = null;
    const dealerTotal = handValue(dealerCards).total;
    const dealerBJ = dealerNatural || isNatural(dealerCards);

    for (const spot of spots) {
      for (const hand of spot.hands) {
        const { total } = handValue(hand.cards);
        const natural = isNatural(hand.cards) && !hand.fromSplit;
        if (hand.surrendered) {
          hand.result = "surrender";
          bankroll += Math.floor(hand.bet / 2);
        } else if (dealerBJ && natural) {
          hand.result = "push";
          bankroll += hand.bet;
        } else if (dealerBJ) {
          hand.result = "lose";
        } else if (natural) {
          hand.result = "blackjack";
          bankroll += hand.bet + Math.floor((hand.bet * 3) / 2);
        } else if (total > 21) {
          hand.result = "bust";
        } else if (dealerTotal > 21 || total > dealerTotal) {
          hand.result = "win";
          bankroll += hand.bet * 2;
        } else if (total === dealerTotal) {
          hand.result = "push";
          bankroll += hand.bet;
        } else {
          hand.result = "lose";
        }
      }
    }

    // one sample per settled Round, taken after every payout
    history.push({ kind: "settle", round, bankroll });
  }

  function hit(): void {
    const h = requireActive();
    h.cards.push(shoe.draw());
    if (handValue(h.cards).total >= 21) h.done = true;
    advance();
  }

  function stand(): void {
    requireActive().done = true;
    advance();
  }

  function double(): void {
    const h = requireActive();
    if (h.cards.length !== 2) throw new Error("double on two cards only");
    if (bankroll < h.bet) throw new Error("insufficient bankroll to double");
    bankroll -= h.bet;
    h.bet *= 2;
    h.cards.push(shoe.draw());
    h.done = true;
    advance();
  }

  function split(): void {
    const h = requireActive();
    const spot = spots[active!.spot];
    if (h.cards.length !== 2 || !isPair(h.cards)) throw new Error("split pairs only");
    if (h.splitAces) throw new Error("split aces cannot be resplit");
    if (spot.hands.length >= 4) throw new Error("at most 4 hands per spot");
    if (bankroll < h.bet) throw new Error("insufficient bankroll to split");

    bankroll -= h.bet;
    const aces = h.cards[0].rank === "A";
    const second = h.cards.pop()!;
    const twin = newHand(h.bet, second);
    twin.splitAces = aces;
    twin.fromSplit = true;
    h.splitAces = aces;
    h.fromSplit = true;
    spot.hands.splice(active!.hand + 1, 0, twin);

    // each split hand immediately receives its second card
    h.cards.push(shoe.draw());
    twin.cards.push(shoe.draw());
    for (const hand of [h, twin]) {
      if (aces || handValue(hand.cards).total >= 21) hand.done = true;
    }
    advance();
  }

  function surrender(): void {
    const h = requireActive();
    if (h.cards.length !== 2 || h.fromSplit) {
      throw new Error("surrender on the first two cards only, before splitting");
    }
    h.surrendered = true;
    h.done = true;
    advance();
  }

  function nextRound(): void {
    assertPhase("settled");
    spots = [];
    phase = "betting";
  }

  function release(id: number): void {
    assertPhase("betting");
    const index = spots.findIndex((spot) => spot.id === id);
    if (index === -1) throw new Error("no such spot");
    bankroll += spots[index].bet;
    spots.splice(index, 1);
  }

  function topUp(): void {
    if (bankroll >= TABLE_MIN) throw new Error("top-up only when the bankroll cannot cover the table minimum");
    bankroll += TOP_UP;
    // anchored to the Round it enables: the spike plots at that Round's x, ahead of its settle
    history.push({ kind: "topUp", round: round + 1, bankroll });
  }

  /** Fresh Session: $100 bankroll, empty history, fresh shoe, back to betting. */
  function resetSession(): void {
    assertPhase("betting");
    bankroll = START_BANKROLL;
    sessionStart = START_BANKROLL;
    round = 0;
    history = [];
    spots = [];
    active = null;
    insuranceBet = 0;
    dealerHole = null;
    dealerCards = [];
    shoe.refresh();
  }

  function requireActive(): Hand {
    assertPhase("playing");
    if (!active) throw new Error("no active hand");
    return spots[active.spot].hands[active.hand];
  }

  function assertPhase(expected: Phase): void {
    if (phase !== expected) throw new Error(`expected phase ${expected}, got ${phase}`);
  }

  return {
    claim,
    deal,
    insure,
    decline,
    hit,
    stand,
    double,
    split,
    surrender,
    nextRound,
    release,
    topUp,
    resetSession,
    get state(): State {
      return state();
    },
  };
}

export type Table = ReturnType<typeof createTable>;

function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

function isBust(hand: HandView): boolean {
  return handValue(hand.cards).total > 21;
}