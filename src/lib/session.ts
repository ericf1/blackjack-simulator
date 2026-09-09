// Session persistence: one localStorage key holding the Bankroll and settings.
// Written whenever the engine reaches a settled or betting phase — never mid-Round.
// The Table always loads at a fresh betting phase, which implicitly refunds any
// abandoned Round's committed Bets (a deliberate, forgiving choice — see issue #1).

import { createInitialState, type GameState } from "@/engine/engine";

const STORAGE_KEY = "blackjack-table-v1";

type PersistedSession = {
  bankroll: number;
  settings: { deckCount: number; autoShuffle: boolean };
};

export function saveSession(state: GameState): void {
  try {
    const session: PersistedSession = { bankroll: state.bankroll, settings: state.settings };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode, quota): the session simply won't persist.
  }
}

/** Restore Bankroll + settings, or null when nothing valid is stored. */
export function loadSession(): GameState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<PersistedSession>;
    if (
      typeof saved.bankroll !== "number" ||
      saved.bankroll < 0 ||
      !Number.isInteger(saved.bankroll) ||
      typeof saved.settings?.deckCount !== "number" ||
      saved.settings.deckCount < 1 ||
      saved.settings.deckCount > 8 ||
      typeof saved.settings.autoShuffle !== "boolean"
    ) {
      return null;
    }
    const state = createInitialState({
      deckCount: saved.settings.deckCount,
      autoShuffle: saved.settings.autoShuffle,
    });
    return { ...state, bankroll: saved.bankroll };
  } catch {
    return null;
  }
}