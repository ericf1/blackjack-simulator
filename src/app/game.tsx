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
const moneyWhole = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

const GLYPH = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" } as const;

const SHOE_TOTAL = 260; // five decks (docs/rules.md)

const CHIPS = [
  { value: 10_00, tone: "blue" },
  { value: 25_00, tone: "green" },
  { value: 100_00, tone: "black" },
  { value: 500_00, tone: "purple" },
] as const;

/* Classic pip layouts: [column, row, inverted] — columns 22% / 50% / 78%. */
const PIPS: Record<string, Array<[number, number, boolean?]>> = {
  "2": [[1, 0.1], [1, 0.9, true]],
  "3": [[1, 0.1], [1, 0.5], [1, 0.9, true]],
  "4": [[0, 0.1], [2, 0.1], [0, 0.9, true], [2, 0.9, true]],
  "5": [[0, 0.1], [2, 0.1], [1, 0.5], [0, 0.9, true], [2, 0.9, true]],
  "6": [[0, 0.1], [2, 0.1], [0, 0.5], [2, 0.5], [0, 0.9, true], [2, 0.9, true]],
  "7": [[0, 0.1], [2, 0.1], [1, 0.3], [0, 0.5], [2, 0.5], [0, 0.9, true], [2, 0.9, true]],
  "8": [[0, 0.1], [2, 0.1], [1, 0.3], [0, 0.5], [2, 0.5], [1, 0.7, true], [0, 0.9, true], [2, 0.9, true]],
  "9": [
    [0, 0.1], [2, 0.1], [0, 0.37], [2, 0.37], [1, 0.5],
    [0, 0.63, true], [2, 0.63, true], [0, 0.9, true], [2, 0.9, true],
  ],
  "10": [
    [0, 0.1], [2, 0.1], [1, 0.24], [0, 0.41], [2, 0.41],
    [0, 0.59, true], [2, 0.59, true], [1, 0.76, true], [0, 0.9, true], [2, 0.9, true],
  ],
  A: [[1, 0.5]],
};

const RESULT_LABEL: Record<string, string> = {
  blackjack: "Blackjack 3:2",
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

function useCountUp(target: number, ms = 700): number {
  const [shown, setShown] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setShown(Math.round(from + (target - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown;
}

function PlayingCard({
  card,
  faceDown,
  flip,
  index,
  style: extraStyle,
}: {
  card?: Card;
  faceDown?: boolean;
  flip?: boolean;
  index?: number;
  style?: React.CSSProperties;
}) {
  const style = {
    ...(index !== undefined ? { "--i": index } : {}),
    ...extraStyle,
  } as React.CSSProperties;
  if (faceDown || !card) {
    return <div className="card back deal" style={style} aria-label="Face-down card" />;
  }
  const red = card.suit === "H" || card.suit === "D";
  const label = `${card.rank === "A" ? "Ace" : card.rank} of ${SUIT_NAME[card.suit]}`;
  const pips = PIPS[card.rank];
  return (
    <div className={`card deal${flip ? " flip" : ""}`} style={style} role="img" aria-label={label}>
      <span className="idx">
        <span>{card.rank}</span>
        <span>{GLYPH[card.suit]}</span>
      </span>
      <span className="idx idx-bottom" aria-hidden="true">
        <span>{card.rank}</span>
        <span>{GLYPH[card.suit]}</span>
      </span>
      <span className="pip-area">
        {pips
          ? pips.map(([x, y, inv], i) => (
              <span
                key={i}
                className={`pip${card.rank === "A" ? " ace" : ""}${inv ? " inv" : ""}`}
                style={{ left: `${[22, 50, 78][x]}%`, top: `${y * 100}%` }}
              >
                {GLYPH[card.suit]}
              </span>
            ))
          : (
              <span className="court">
                <span className="court-letter">{card.rank}</span>
                <span className="court-suit">{GLYPH[card.suit]}</span>
              </span>
            )}
      </span>
    </div>
  );
}

const CARD_GAP = 6; // matches the .cards flex gap

/**
 * Fan pitch for a hand of `count` cards in `width` px: natural spacing while it
 * fits, then cards overlap just enough that the row never overflows.
 */
function fanPitch(width: number, count: number, cardW: number): number {
  const natural = cardW + CARD_GAP;
  if (count <= 1 || cardW <= 0) return natural;
  return Math.max(0, Math.min(natural, (width - cardW) / (count - 1)));
}

/** A hand's cards, fanned to fit the hand: no card is ever clipped. */
function HandRow({ cards }: { cards: Card[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, cardW: 0 });

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () =>
      setBox({ width: el.clientWidth, cardW: el.firstElementChild?.clientWidth ?? 0 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const overlap =
    box.cardW > 0 && cards.length > 1
      ? fanPitch(box.width, cards.length, box.cardW) - (box.cardW + CARD_GAP)
      : 0;

  return (
    <div className="cards" ref={rowRef}>
      {cards.map((card, ci) => (
        <PlayingCard
          key={`${card.rank}${card.suit}-${ci}`}
          card={card}
          index={ci}
          style={ci > 0 ? { marginLeft: overlap } : undefined}
        />
      ))}
    </div>
  );
}

function HandTotal({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  const { total, soft } = handValue(cards);
  return <span className="total">{soft && total < 21 ? `${total - 10}/${total}` : total}</span>;
}

const VERBS = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "double", label: "Double" },
  { action: "split", label: "Split" },
  { action: "surrender", label: "Surrender" },
] as const;

export default function Game() {
  const tableRef = useRef<ReturnType<typeof createTable> | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [bet, setBet] = useState("10");
  const roundStartRef = useRef<number | null>(null);

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

  const bankrollShown = useCountUp(state?.bankroll ?? 0);

  if (!state) return <main className="page" />;

  const betValue = Number(bet);
  const betCents = Number.isInteger(betValue) && betValue >= 0 ? Math.round(betValue) * 100 : -1;
  const betTooLow = betCents >= 0 && betCents < TABLE_MIN;
  const betTooHigh = betCents > TABLE_MAX;
  const betFunds = betCents >= 0 && state.bankroll < betCents;
  const betValid = betCents >= TABLE_MIN && betCents <= TABLE_MAX;
  const canClaim = state.phase === "betting" && betValid && betCents <= state.bankroll && state.spots.length < MAX_SPOTS;

  const shoeRemaining = state.shoeRemaining;
  const shoePct = Math.max(0, Math.min(100, (shoeRemaining / SHOE_TOTAL) * 100));

  const roundDelta =
    state.phase === "settled" && roundStartRef.current !== null
      ? state.bankroll - roundStartRef.current
      : null;

  return (
    <main className="page">
      <header className="strip">
        <span className="wordmark">Blackjack</span>
        <span className="strip-spacer" />
        <div className="bankroll" aria-live="polite">
          <span className="bankroll-label">Bankroll</span>
          <span className="bankroll-amount">{money(bankrollShown)}</span>
        </div>
      </header>

      <section className="table" aria-label="Blackjack table">
        <div className="dealer-row">
          <span className="table-label">Dealer</span>
          <div className="cards">
            {state.dealer.cards.map((card, i) => (
              <PlayingCard
                key={`${card.rank}${card.suit}-${i}`}
                card={card}
                index={i}
                flip={state.dealer.holeRevealed && i === 1}
              />
            ))}
            {!state.dealer.holeRevealed && <div className="card back deal" style={{ "--i": 1 } as React.CSSProperties} aria-label="Face-down card" />}
          </div>
          {state.dealer.holeRevealed && state.dealer.cards.length > 0 && (
            <span className="dealer-total">
              {(() => {
                const { total, soft } = handValue(state.dealer.cards);
                return soft && total < 21 ? `soft ${total}` : total;
              })()}
            </span>
          )}
          <div className="shoe">
            <span className={`shoe-label${state.needsShuffle ? " cut" : ""}`}>
              {state.needsShuffle ? "Cut card · fresh shoe next round" : `Shoe ${shoeRemaining} cards`}
            </span>
            <div className="shoe-bar" role="img" aria-label={`Shoe: ${shoeRemaining} of ${SHOE_TOTAL} cards remain`}>
              <div className="shoe-fill" style={{ width: `${shoePct}%` }} />
              <div className="shoe-tick" />
            </div>
          </div>
        </div>

        <div className="spots">
          {state.spots.map((spot, si) => {
            const isActiveSpot = state.active?.spot === spot.id;
            return (
              <div className="plate" key={spot.id}>
                <div className="plate-head">
                  <span className="plate-tag">Spot {si + 1}</span>
                  {state.phase === "betting" ? (
                    <>
                      <span className="plate-bet">{moneyWhole(spot.bet)}</span>
                      <button
                        className="release"
                        aria-label={`Release spot, returns ${money(spot.bet)}`}
                        onClick={() => act(() => tableRef.current!.release(spot.id))}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="plate-bet">{moneyWhole(spot.bet)}</span>
                  )}
                </div>
                <div className="hands">
                  {spot.hands.map((hand, hi) => {
                    const activeHand =
                      state.active && state.active.spot === spot.id && state.active.hand === hi;
                    return (
                      <div className={`hand${activeHand ? " active" : ""}`} key={hi}>
                        <HandRow cards={hand.cards} />
                        <div className="hand-meta">
                          <HandTotal cards={hand.cards} />
                          <span className="hand-bet">{moneyWhole(hand.bet)}</span>
                          {hand.result && (
                            <span key={hand.result} className={`result stamp ${hand.result}`}>
                              {RESULT_LABEL[hand.result]}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {state.phase === "betting" &&
            Array.from({ length: MAX_SPOTS - state.spots.length }, (_, gi) => (
              <button
                key={`ghost-${gi}`}
                className="plate plate-ghost"
                disabled={!canClaim}
                aria-label={`Claim spot for ${moneyWhole(betCents > 0 ? betCents : 0)}`}
                onClick={() => act(() => tableRef.current!.claim(betCents))}
              >
                <span className="plate-tag">Spot {state.spots.length + gi + 1}</span>
                <span className="claim-hint">Claim · {betCents > 0 ? moneyWhole(betCents) : "—"}</span>
              </button>
            ))}

          {state.phase !== "betting" &&
            Array.from({ length: MAX_SPOTS - state.spots.length }, (_, gi) => (
              <div className="plate plate-dormant" key={`dormant-${gi}`} aria-hidden="true" />
            ))}
        </div>

        <div className="tray">
          {state.phase === "betting" && (
            <div className="tray-content" key="betting">
              {state.bankroll < TABLE_MIN ? (
                <>
                  <span className="tray-note">The bankroll can&apos;t cover the table minimum.</span>
                  <span className="tray-spacer" />
                  <button className="btn primary" onClick={() => act(() => tableRef.current!.topUp())}>
                    Top up {moneyWhole(TOP_UP)}
                  </button>
                </>
              ) : (
                <>
                  <div className="bet-builder">
                    <label className="bet-label" htmlFor="bet">
                      Bet
                    </label>
                    <input
                      id="bet"
                      className={`bet-input${!betValid || betFunds ? " invalid" : ""}`}
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={2000}
                      step={1}
                      value={bet}
                      onChange={(e) => setBet(e.target.value)}
                      aria-invalid={!betValid || betFunds}
                    />
                    <div className="chips">
                      {CHIPS.map((chip) => (
                        <button
                          key={chip.value}
                          className={`chip-btn ${chip.tone}`}
                          aria-label={`Add ${moneyWhole(chip.value)} to bet`}
                          onClick={() => setBet(String(Math.min(TABLE_MAX / 100, Math.max(0, Number(bet) || 0) + chip.value / 100)))}
                        >
                          {chip.value / 100}
                        </button>
                      ))}
                      <button className="chip-clear" onClick={() => setBet("10")}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <span className="tray-spacer" />
                  <button className="btn primary" disabled={state.spots.length === 0} onClick={() => {
                    roundStartRef.current = state.bankroll;
                    act(() => tableRef.current!.deal());
                  }}>
                    Deal
                  </button>
                </>
              )}
            </div>
          )}

          {state.phase === "betting" && state.bankroll >= TABLE_MIN && (betCents < 0 || betTooLow || betTooHigh || betFunds) && (
            <p className={`tray-note${betFunds ? " invalid" : ""}`} style={{ margin: "6px 0 0" }}>
              {betCents < 0 && "Bets are whole dollars. "}
              {betCents >= 0 && betTooLow && `Table minimum is ${moneyWhole(TABLE_MIN)}. `}
              {betTooHigh && `Table maximum is ${moneyWhole(TABLE_MAX)}. `}
              {betFunds && `The bankroll holds ${money(state.bankroll)}.`}
            </p>
          )}

          {state.phase === "insurance" && (
            <div className="tray-content" key="insurance">
              <span className="tray-note">
                Dealer shows an ace. Insurance costs {money(state.insuranceCost)} and pays 2 to 1.
              </span>
              <span className="tray-spacer" />
              <button
                className="btn"
                disabled={state.bankroll < state.insuranceCost}
                onClick={() => act(() => tableRef.current!.insure())}
              >
                Insure
              </button>
              <button className="btn primary" onClick={() => act(() => tableRef.current!.decline())}>
                No insurance
              </button>
            </div>
          )}

          {state.phase === "playing" && (
            <div className="tray-content" key="playing">
              {state.active && (
                <span className="tray-note">
                  Spot {state.active.spot + 1}
                  {state.spots[state.active.spot].hands.length > 1
                    ? ` · hand ${state.active.hand + 1}`
                    : ""}
                </span>
              )}
              <span className="tray-spacer" />
              {VERBS.map((verb) => {
                const legal = state.legal.includes(verb.action);
                return (
                  <button
                    key={verb.action}
                    className={`btn${verb.action === "hit" ? " primary" : ""}`}
                    disabled={!legal}
                    onClick={() => act(() => tableRef.current![verb.action]())}
                  >
                    {verb.label}
                  </button>
                );
              })}
            </div>
          )}

          {state.phase === "settled" && (
            <div className="tray-content" key="settled">
              {roundDelta !== null &&
                (() => {
                  const cls =
                    roundDelta > 0 ? "win" : roundDelta < 0 ? "lose" : "push";
                  const text =
                    roundDelta === 0
                      ? `${money(0)} — even`
                      : `${roundDelta > 0 ? "+" : "−"}${money(Math.abs(roundDelta)).slice(1)}`;
                  return (
                    <span className={`result stamp ${cls}`} style={{ fontSize: "13px" }}>
                      {text}
                    </span>
                  );
                })()}
              <span className="tray-spacer" />
              <button className="btn primary" onClick={() => {
                roundStartRef.current = null;
                act(() => tableRef.current!.nextRound());
              }}>
                Next round
              </button>
            </div>
          )}
        </div>
      </section>

      <footer className="placard">
        <span>Blackjack pays 3 to 2 · Dealer hits soft 17 · Insurance pays 2 to 1</span>
        <span>Table {moneyWhole(TABLE_MIN)}–{moneyWhole(TABLE_MAX)} · Five-deck shoe · Cut card at 75%</span>
      </footer>
    </main>
  );
}