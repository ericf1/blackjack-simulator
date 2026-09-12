"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/blackjack/cards";
import { handValue } from "@/blackjack/cards";
import {
  createTable,
  MAX_SPOTS,
  TABLE_MAX,
  TABLE_MIN,
  TOP_UP,
  type State,
  type Table,
} from "@/blackjack/table";
import { loadBankroll, saveBankroll } from "./lib/bankroll-store";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const GLYPH = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;

function PlayingCard({ card, faceDown }: { card?: Card; faceDown?: boolean }) {
  if (faceDown || !card) return <div className="card face-down" aria-label="face-down card" />;
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div className={`card${red ? " red" : ""}`}>
      <span className="rank">{card.rank}</span>
      <span className="suit">{GLYPH[card.suit]}</span>
    </div>
  );
}

function HandTotal({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  const { total, soft } = handValue(cards);
  return <span className="total">{soft && total < 21 ? `${total - 10}/${total}` : total}</span>;
}

const RESULT_LABEL: Record<string, string> = {
  blackjack: "Blackjack 3:2",
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

export default function Game() {
  const tableRef = useRef<ReturnType<typeof createTable> | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [bet, setBet] = useState("10");

  useEffect(() => {
    const table = createTable({ bankroll: loadBankroll(window.localStorage) });
    tableRef.current = table;
    setState(table.state);
  }, []);

  useEffect(() => {
    if (state) saveBankroll(window.localStorage, state.bankroll);
  }, [state?.bankroll]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => void) => {
    fn();
    setState(tableRef.current!.state);
  };

  if (!state) return <main className="page" />;

  const betValue = Number(bet);
  const betCents = Number.isInteger(betValue) ? betValue * 100 : -1;
  const canClaim =
    state.phase === "betting" &&
    state.spots.length < MAX_SPOTS &&
    betCents >= TABLE_MIN &&
    betCents <= TABLE_MAX &&
    state.bankroll >= betCents;

  return (
    <main className="page">
      <header className="bar">
        <span className="brand">Blackjack</span>
        <span className="bankroll">{money(state.bankroll)}</span>
        {state.bankroll < TABLE_MIN && (
          <button className="btn" onClick={() => act(() => tableRef.current!.topUp())}>
            Top up {money(TOP_UP)}
          </button>
        )}
      </header>

      <section className="table">
        <div className="dealer">
          <span className="label">Dealer</span>
          <div className="cards">
            {state.dealer.cards.map((card, i) => (
              <PlayingCard key={i} card={card} />
            ))}
            {!state.dealer.holeRevealed && <PlayingCard faceDown />}
          </div>
        </div>

        {state.phase === "betting" && (
          <div className="betting">
            <label className="bet-input">
              Bet
              <input
                type="number"
                min={10}
                max={2000}
                step={1}
                value={bet}
                onChange={(e) => setBet(e.target.value)}
              />
            </label>
            <button className="btn" disabled={!canClaim} onClick={() => act(() => tableRef.current!.claim(betCents))}>
              Add spot
            </button>
            <button
              className="btn primary"
              disabled={state.spots.length === 0}
              onClick={() => act(() => tableRef.current!.deal())}
            >
              Deal
            </button>
          </div>
        )}

        {state.phase === "insurance" && (
          <div className="actions">
            <span className="label">Insurance {money(state.insuranceCost)}?</span>
            <button
              className="btn"
              disabled={state.bankroll < state.insuranceCost}
              onClick={() => act(() => tableRef.current!.insure())}
            >
              Insure
            </button>
            <button className="btn" onClick={() => act(() => tableRef.current!.decline())}>
              No insurance
            </button>
          </div>
        )}

        {state.phase === "playing" && (
          <div className="actions">
            {state.legal.includes("hit") && (
              <button className="btn primary" onClick={() => act(() => tableRef.current!.hit())}>
                Hit
              </button>
            )}
            <button className="btn primary" onClick={() => act(() => tableRef.current!.stand())}>
              Stand
            </button>
            {state.legal.includes("double") && (
              <button className="btn" onClick={() => act(() => tableRef.current!.double())}>
                Double
              </button>
            )}
            {state.legal.includes("split") && (
              <button className="btn" onClick={() => act(() => tableRef.current!.split())}>
                Split
              </button>
            )}
            {state.legal.includes("surrender") && (
              <button className="btn danger" onClick={() => act(() => tableRef.current!.surrender())}>
                Surrender
              </button>
            )}
          </div>
        )}

        {state.phase === "settled" && (
          <div className="actions">
            <button className="btn primary" onClick={() => act(() => tableRef.current!.nextRound())}>
              Next round
            </button>
          </div>
        )}

        <div className="spots">
          {state.spots.map((spot) => (
            <div className="spot" key={spot.id}>
              <span className="label">{money(spot.bet)}</span>
              {state.phase === "betting" && (
                <button className="btn small" onClick={() => act(() => tableRef.current!.release(spot.id))}>
                  ×
                </button>
              )}
              <div className="hands">
                {spot.hands.map((hand, hi) => (
                  <div
                    className={`hand${
                      state.active && state.active.spot === spot.id && state.active.hand === hi ? " active" : ""
                    }`}
                    key={hi}
                  >
                    <div className="cards">
                      {hand.cards.map((card, ci) => (
                        <PlayingCard key={ci} card={card} />
                      ))}
                    </div>
                    <div className="hand-meta">
                      <HandTotal cards={hand.cards} />
                      {hand.result && (
                        <span className={`result ${hand.result}`}>{RESULT_LABEL[hand.result]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="bar muted">
        <span>Shoe: {state.shoeRemaining} cards</span>
        {state.needsShuffle && <span>· cut card reached</span>}
      </footer>
    </main>
  );
}