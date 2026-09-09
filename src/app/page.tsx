"use client";

// The Table: one client page — dealer up top, Boxes below, chip rack and actions at the
// bottom. It renders engine state and dispatches commands; every rule (and every legality
// question) lives in the engine. Plain styling for now; the casino look is a later pass.

import { useState, useSyncExternalStore } from "react";
import {
  BUY_IN_CENTS,
  MINIMUM_BET_CENTS,
  handValue,
  type Card,
} from "@/engine/engine";
import { activeBox, canDeal, inPlay, rebuyAvailable, roundNet } from "@/engine/selectors";
import { dispatch, getServerSnapshot, getSnapshot, subscribe } from "@/lib/table-store";

const CHIPS = [
  { value: 100, label: "$1" },
  { value: 500, label: "$5" },
  { value: 2500, label: "$25" },
  { value: 10000, label: "$100" },
];

const SUIT_GLYPH: Record<Card["suit"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const dollars = (cents: number): string => `$${cents / 100}`;

/** Signed dollars for a round's net: −$10, $0, +$15. */
const signedDollars = (cents: number): string =>
  `${cents < 0 ? "−" : cents > 0 ? "+" : ""}$${Math.abs(cents) / 100}`;

function CardFace({ card }: { card: Card }) {
  if (!card.faceUp) {
    return (
      <div
        className="flex h-16 w-11 items-center justify-center rounded-md border border-zinc-400 bg-zinc-300 text-xs text-zinc-500"
        aria-label="Hole card"
      >
        ?
      </div>
    );
  }
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div className="flex h-16 w-11 flex-col items-center justify-center gap-0.5 rounded-md border border-zinc-300 bg-white font-semibold text-zinc-900">
      <span className="text-sm leading-none">{card.rank}</span>
      <span className={`text-base leading-none ${red ? "text-red-600" : "text-zinc-900"}`}>
        {SUIT_GLYPH[card.suit]}
      </span>
    </div>
  );
}

export default function TablePage() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Which Box the chips compose onto — pure UI preference, so plain React state.
  const [selectedBox, setSelectedBox] = useState(0);

  if (!snapshot) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-zinc-500">Taking a seat…</p>
      </main>
    );
  }

  const { state, notices } = snapshot;
  const betting = state.phase === "betting";
  const settled = state.phase === "settled";
  const acting = activeBox(state);
  const target = Math.min(selectedBox, state.boxes.length - 1);
  const net = roundNet(state);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Blackjack</h1>
        <p className="font-mono text-sm">
          Bankroll <span className="font-bold">{dollars(state.bankroll)}</span>
          <span className="text-zinc-500"> · in play {dollars(inPlay(state))}</span>
        </p>
      </header>

      {rebuyAvailable(state) && (
        <section className="flex items-center justify-between gap-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950">
          <p>Your Bankroll can&apos;t cover the ${MINIMUM_BET_CENTS / 100} minimum bet.</p>
          <button
            onClick={() => dispatch({ type: "rebuy" })}
            className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
          >
            Rebuy — fresh {dollars(BUY_IN_CENTS)}
          </button>
        </section>
      )}

      {notices.length > 0 && (
        <section aria-live="polite" className="rounded-md border border-zinc-300 bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Notices</h2>
          <ul className="list-inside list-disc space-y-0.5 text-zinc-700 dark:text-zinc-300">
            {notices.map((notice, i) => (
              <li key={`${notice}-${i}`}>{notice}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-300 bg-emerald-800 p-4 text-emerald-50 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Dealer</h2>
          {settled && (
            <span className="font-mono text-sm text-emerald-100">{handValue(state.dealer.cards)}</span>
          )}
        </div>
        <div className="flex min-h-16 items-center gap-2">
          {state.dealer.cards.length > 0 ? (
            state.dealer.cards.map((card) => <CardFace key={card.id} card={card} />)
          ) : (
            <span className="text-sm text-emerald-300/70">
              {betting ? "Compose a Bet and Deal to begin" : ""}
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
          {state.boxes.map((box, i) => {
            const underMinimum = box.bet > 0 && box.bet < MINIMUM_BET_CENTS;
            return (
              <div
                key={i}
                onClick={betting ? () => setSelectedBox(i) : undefined}
                className={`flex flex-col gap-2 rounded-lg bg-emerald-900/60 p-3 ring-1 ${
                  betting && i === target ? "ring-2 ring-emerald-300" : "ring-emerald-700"
                } ${betting ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    Box {i + 1}
                  </h3>
                  <span className="font-mono text-xs text-emerald-100">Bet {dollars(box.bet)}</span>
                </div>

                {box.hands.length > 0 ? (
                  box.hands.map((hand, h) => (
                    <div key={h} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {hand.cards.map((card) => (
                            <CardFace key={card.id} card={card} />
                          ))}
                        </div>
                        <span className="font-mono text-sm text-emerald-100">{handValue(hand.cards)}</span>
                      </div>
                      {settled && hand.outcome && (
                        <span
                          className={`w-fit rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
                            hand.outcome === "win"
                              ? "bg-emerald-600 text-white"
                              : hand.outcome === "lose"
                                ? "bg-zinc-700 text-zinc-300"
                                : "bg-zinc-500 text-white"
                          }`}
                        >
                          {hand.outcome}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-emerald-300/80">
                    {betting ? (box.bet > 0 ? "composed — Deal when ready" : "no bet — sits out") : "sits out"}
                  </p>
                )}

                {betting && box.bet > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => dispatch({ type: "clearBet", box: i })}
                      className="rounded border border-emerald-400 px-2 py-0.5 text-xs font-medium text-emerald-200 hover:bg-emerald-800"
                    >
                      Clear bet
                    </button>
                    {underMinimum && (
                      <span className="text-xs text-amber-300">
                        under the ${MINIMUM_BET_CENTS / 100} minimum
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {betting && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chips</span>
              <div className="flex gap-2">
                {CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    disabled={state.bankroll < chip.value}
                    onClick={() => dispatch({ type: "bet", box: target, amount: chip.value })}
                    className="rounded-full border-2 border-zinc-400 bg-white px-3 py-1.5 font-mono text-sm font-semibold text-zinc-900 shadow-sm enabled:hover:border-emerald-600 disabled:opacity-40 dark:bg-zinc-100"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={!canDeal(state)}
                onClick={() => dispatch({ type: "deal" })}
                className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                Deal
              </button>
              <span className="text-sm text-zinc-500">
                {canDeal(state)
                  ? `Dealing Box${state.boxes.length > 1 ? "es" : ""} with a Bet`
                  : `Compose at least $${MINIMUM_BET_CENTS / 100} on a Box`}
              </span>
            </div>
          </>
        )}

        {state.phase === "player" && (
          <div className="flex items-center gap-3">
            <button
              disabled={acting === null}
              onClick={() => acting !== null && dispatch({ type: "hit", box: acting })}
              className="rounded-md bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
            >
              Hit
            </button>
            <button
              disabled={acting === null}
              onClick={() => acting !== null && dispatch({ type: "stand", box: acting })}
              className="rounded-md bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
            >
              Stand
            </button>
            <span className="text-sm text-zinc-500">
              {acting !== null ? `Box ${acting + 1} to act` : "Round in progress"}
            </span>
          </div>
        )}

        {settled && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => dispatch({ type: "nextRound" })}
              className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
            >
              Next round
            </button>
            <span className="text-sm text-zinc-500">
              {net !== null && <>Round net <span className="font-mono">{signedDollars(net)}</span> · </>}
              Bets stay on their Boxes for a one-click replay
            </span>
          </div>
        )}
      </section>
    </main>
  );
}