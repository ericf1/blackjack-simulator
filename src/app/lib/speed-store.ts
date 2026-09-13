const KEY = "blackjack.speed";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 4;
export const SPEED_STEP = 0.25;
export const DEFAULT_SPEED = 1;

/**
 * Speed persistence adapter (ADR-0001): the engine stays pure;
 * only this adapter knows about localStorage. Same pattern as bankroll-store.
 * A missing, corrupt, or unreadable value falls back to the default Speed;
 * anything outside the range clamps to it, and anything off the 0.25 grid
 * snaps to it.
 */
export function loadSpeed(storage: Pick<Storage, "getItem">): number {
  try {
    const raw = storage.getItem(KEY);
    const parsed = raw === null || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SPEED;
    const snapped = Math.round(parsed / SPEED_STEP) * SPEED_STEP;
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, snapped));
  } catch {
    return DEFAULT_SPEED;
  }
}

export function saveSpeed(storage: Pick<Storage, "setItem">, speed: number): void {
  storage.setItem(KEY, String(speed));
}
