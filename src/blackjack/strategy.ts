import type { Card, Rank } from "./cards";
import { handValue, isPair, isTenValue } from "./cards";
import type { Action, State } from "./table";

/**
 * Basic strategy for one active hand, matched to docs/rules.md (multi-deck,
 * H17, DAS, late surrender). Chart source: Wizard of Odds 4-8 deck strategy
 * text, including its H17 modifications (11 doubles vs A, soft 18 doubles vs 2,
 * soft 19 doubles vs 6, 15/17/8-8 surrender vs A).
 *
 * Each situation resolves to an ordered list of preferences — e.g. soft 18 vs 2
 * is double-else-stand — and the first entry that is legal wins. The last entry
 * of every list is always hit or stand, which the engine always offers.
 *
 * Rules awareness comes through State: the surrender preferences carry their
 * correct no-surrender fallbacks (16/15 vs 9-T-A → hit, 17 vs A → stand,
 * 8,8 vs A → split), so when the table's surrender rule is off the engine
 * simply stops offering it and the first legal preference is the right play.
 * The payout (3:2 vs 6:5) changes no playing decisions — settlement only.
 */

// dealer upcard index: 2..9, T (any ten-value), A
const upIndex = (card: Card): number =>
  card.rank === "A" ? 9 : isTenValue(card) ? 8 : Number(card.rank) - 2;

function hardPrefs(total: number, up: number): Action[] {
  if (total <= 8) return ["hit"];
  if (total === 9) return up >= 1 && up <= 4 ? ["double", "hit"] : ["hit"];
  if (total === 10) return up <= 7 ? ["double", "hit"] : ["hit"];
  if (total === 11) return ["double", "hit"]; // H17: doubles vs A too
  if (total === 12) return up >= 2 && up <= 4 ? ["stand"] : ["hit"];
  if (total <= 16) {
    if (up <= 4) return ["stand"]; // vs 2-6
    if (up <= 6) return ["hit"]; // vs 7-8
    // vs 9, T, A: late surrender (H17) — 16 vs 9/T/A, 15 vs T/A
    const surrender = (total === 16 && up >= 7) || (total === 15 && up >= 8);
    return surrender ? ["surrender", "hit"] : ["hit"];
  }
  if (total === 17) return up === 9 ? ["surrender", "stand"] : ["stand"]; // H17: 17 vs A
  return ["stand"];
}

function softPrefs(total: number, up: number): Action[] {
  if (total >= 20) return ["stand"]; // soft 20, 21
  if (total === 19) return up === 4 ? ["double", "stand"] : ["stand"]; // H17: doubles vs 6
  if (total === 18) {
    if (up <= 4) return ["double", "stand"]; // vs 2-6
    if (up <= 6) return ["stand"]; // vs 7-8
    return ["hit"]; // vs 9, T, A
  }
  if (total === 17) return up >= 1 && up <= 4 ? ["double", "hit"] : ["hit"]; // vs 3-6
  if (total >= 15) return up >= 2 && up <= 4 ? ["double", "hit"] : ["hit"]; // soft 15-16 vs 4-6
  return up >= 3 && up <= 4 ? ["double", "hit"] : ["hit"]; // soft 13-14 vs 5-6
}

function pairPrefs(rank: Rank, up: number): Action[] {
  switch (rank) {
    case "A":
      return ["split"];
    case "8":
      return up === 9 ? ["surrender", "split"] : ["split"]; // H17: 8,8 vs A surrenders
    case "9":
      return up <= 4 || up === 6 || up === 7 ? ["split"] : ["stand"]; // 2-6, 8-9; stand 7/T/A
    case "10":
    case "5":
      return []; // never split tens or fives → hard total
    case "7":
      return up <= 5 ? ["split"] : []; // vs 2-7
    case "6":
      return up <= 4 ? ["split"] : []; // DAS: vs 2-6
    case "4":
      return up === 3 || up === 4 ? ["split"] : []; // DAS: vs 5-6
    case "3":
    case "2":
      return up <= 5 ? ["split"] : []; // DAS: vs 2-7
    default:
      return [];
  }
}

export function basicStrategy(state: State): Action {
  const { spot, hand } = state.active!;
  const cards = state.spots[spot].hands[hand].cards;
  const up = upIndex(state.dealer.cards[0]);

  const prefs: Action[] = [];
  if (cards.length === 2 && isPair(cards)) {
    prefs.push(...pairPrefs(cards[0].rank, up));
  }
  const { total, soft } = handValue(cards);
  prefs.push(...(soft ? softPrefs(total, up) : hardPrefs(total, up)));

  for (const action of prefs) {
    if (state.legal.includes(action)) return action;
  }
  throw new Error(`basic strategy: no legal action for total ${total} vs upcard index ${up}`);
}
// ---- Autopilot round flow ----------------------------------------------------

export type Command = Action | "deal" | "decline" | "nextRound" | { claim: number };

/**
 * The next Autopilot command given the table state and the Lineup (the Spots —
 * count and bets — to re-claim each Round). Returns null when Autopilot must
 * stop: empty Lineup, or a Bankroll that cannot cover the full Lineup (Top-up
 * stays the human's job).
 */
export function autopilotCommand(state: State, lineup: number[]): Command | null {
  switch (state.phase) {
    case "betting": {
      if (lineup.length === 0) return null;
      const remaining = lineup.slice(state.spots.length).reduce((sum, bet) => sum + bet, 0);
      if (state.bankroll < remaining) return null; // full Lineup or stop
      if (state.spots.length < lineup.length) return { claim: lineup[state.spots.length] };
      return "deal";
    }
    case "insurance":
      return "decline"; // basic strategy: never take insurance
    case "playing":
      return state.legal.length > 0 ? basicStrategy(state) : null;
    case "settled":
      return "nextRound";
  }
}

/**
 * Whether Autopilot may run at all — the same coverage rule autopilotCommand
 * uses to stop (empty Lineup, or a Bankroll that cannot cover it). The UI
 * gates its button on this instead of re-deriving the rule.
 */
export function autopilotCanRun(state: State, lineup: number[]): boolean {
  return autopilotCommand(state, lineup) !== null;
}
