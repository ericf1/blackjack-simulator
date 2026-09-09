// Pure reads over the engine's public state — the UI stays dumb and the engine seam
// stays the single source of truth for what is legal right now.

import { MINIMUM_BET_CENTS, type GameState } from "./engine";

/** Rebuy is offered exactly when the Bankroll can't cover the Minimum bet, at the betting phase. */
export function rebuyAvailable(state: GameState): boolean {
  return state.phase === "betting" && state.bankroll < MINIMUM_BET_CENTS;
}

/** Deal is legal only from the betting phase, with at least one funded Box and no illegal Bet. */
export function canDeal(state: GameState): boolean {
  return (
    state.phase === "betting" &&
    state.boxes.some((box) => box.bet >= MINIMUM_BET_CENTS) &&
    state.boxes.every((box) => box.bet === 0 || box.bet >= MINIMUM_BET_CENTS)
  );
}

/**
 * The Box whose Hand the Player acts on next, in Box order — null when there is
 * nothing to act on. (Hands within a Box stay single until Double and Split land.)
 */
export function activeBox(state: GameState): number | null {
  if (state.phase !== "player") return null;
  const box = state.boxes.findIndex((b) => b.hands.some((hand) => !hand.done));
  return box === -1 ? null : box;
}

/** Money committed to the Table right now: composed Bets while betting, committed Hands once dealt. */
export function inPlay(state: GameState): number {
  return state.phase === "betting"
    ? state.boxes.reduce((sum, box) => sum + box.bet, 0)
    : state.boxes.reduce((sum, box) => sum + box.hands.reduce((s, hand) => s + hand.bet, 0), 0);
}

/** The Round's net in cents once settled — null while the Round is unsettled. */
export function roundNet(state: GameState): number | null {
  if (state.phase !== "settled") return null;
  return state.boxes.reduce(
    (net, box) =>
      net +
      box.hands.reduce(
        (s, hand) => s + (hand.outcome === "win" ? hand.bet : hand.outcome === "lose" ? -hand.bet : 0),
        0,
      ),
    0,
  );
}