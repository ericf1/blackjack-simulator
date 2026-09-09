// UI glue between the pure engine and React: a tiny external store read with
// useSyncExternalStore. It loads the persisted Bankroll once on the client (the
// Table always opens at a fresh betting phase) and dispatches commands, keeping
// the engine itself free of React and localStorage (see ADR-0001).

import { applyCommand, createInitialState, type Command, type GameState } from "@/engine/engine";
import { loadSession, saveSession } from "@/lib/session";

const MAX_NOTICES = 6;

export type TableSnapshot = {
  state: GameState;
  /** Newest first: engine-driven notices, Bet auto-clears, rejected commands. */
  notices: string[];
};

let current: TableSnapshot | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (current === null) {
    current = {
      state: loadSession() ?? createInitialState({ deckCount: 6, autoShuffle: true }),
      notices: [],
    };
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Client snapshot; null until the store has loaded on a real browser. */
export function getSnapshot(): TableSnapshot | null {
  ensureLoaded();
  return current;
}

/** Server and hydration snapshot: nothing is persisted until the client loads. */
export function getServerSnapshot(): TableSnapshot | null {
  return null;
}

export function dispatch(command: Command): void {
  ensureLoaded();
  const snapshot = current!;
  const result = applyCommand(snapshot.state, command);
  if (result.ok) {
    if (result.state.phase === "settled" || result.state.phase === "betting") {
      saveSession(result.state);
    }
    current = {
      state: result.state,
      notices: result.notices ? [...result.notices, ...snapshot.notices].slice(0, MAX_NOTICES) : snapshot.notices,
    };
  } else {
    // The engine keeps the table honest even if the UI misbehaves; show why.
    current = { state: snapshot.state, notices: [result.error, ...snapshot.notices].slice(0, MAX_NOTICES) };
  }
  for (const listener of listeners) listener();
}