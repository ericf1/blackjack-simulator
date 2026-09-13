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
import { autopilotCommand, type Command } from "@/blackjack/strategy";

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
    <div className={`card deal${flip ? " flip" : ""}${red ? " red" : ""}`} style={style} role="img" aria-label={label}>
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

/**
 * A hand's cards, fanned to fit the row: no card is ever clipped. Also serves
 * the Dealer row — `extraFaceDown` appends the hidden hole card, `flipIndex`
 * marks the card that flips on reveal.
 */
function HandRow({
  cards,
  extraFaceDown = 0,
  flipIndex,
}: {
  cards: Card[];
  extraFaceDown?: number;
  flipIndex?: number;
}) {
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

  const total = cards.length + extraFaceDown;
  const overlap =
    box.cardW > 0 && total > 1
      ? fanPitch(box.width, total, box.cardW) - (box.cardW + CARD_GAP)
      : 0;
  const marginFor = (i: number) => (i > 0 ? { marginLeft: overlap } : undefined);

  return (
    <div className="cards" ref={rowRef}>
      {cards.map((card, ci) => (
        <PlayingCard
          key={`${card.rank}${card.suit}-${ci}`}
          card={card}
          index={ci}
          flip={flipIndex === ci}
          style={marginFor(ci)}
        />
      ))}
      {Array.from({ length: extraFaceDown }, (_, i) => (
        <div
          key={`back-${i}`}
          className="card back deal"
          style={{ "--i": cards.length + i, ...marginFor(cards.length + i) } as React.CSSProperties}
          aria-label="Face-down card"
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

const STEP_MS = 600; // Autopilot: think delay before the click
const PRESS_MS = 220; // Autopilot: how long the pressed state shows

export default function Game() {
  const tableRef = useRef<ReturnType<typeof createTable> | null>(null);
  const spotsRef = useRef<HTMLDivElement | null>(null);
  const activePlateRef = useRef<HTMLDivElement | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [bet, setBet] = useState("10");
  const roundStartRef = useRef<number | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [lineup, setLineup] = useState<number[]>([]);
  const [botPress, setBotPress] = useState<Command | null>(null);

  // Follow the active hand on the mobile plate carousel (no-op on desktop grid).
  useEffect(() => {
    const el = activePlateRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "start",
    });
  }, [state?.active?.spot, state?.active?.hand]);

  // When a settled round rolls into betting, bring the carousel back to Spot 1.
  useEffect(() => {
    if (!state) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (prev === "settled" && state.phase === "betting") {
      spotsRef.current?.scrollTo({
        left: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
  }, [state?.phase]);

  useEffect(() => {
    const table = createTable({ bankroll: loadBankroll(window.localStorage) });
    tableRef.current = table;
    setState(table.state);
  }, []);

  useEffect(() => {
    if (state) saveBankroll(window.localStorage, state.bankroll);
  }, [state?.bankroll]); // eslint-disable-line react-hooks/exhaustive-deps

  // One claim path for human and bot: the round's P/L baseline is the bankroll
  // before the first claim of the Round (the stake is deducted at claim time).
  const runClaim = (bet: number) => {
    const table = tableRef.current!;
    if (table.state.spots.length === 0) roundStartRef.current = table.state.bankroll;
    table.claim(bet);
    setState(table.state);
  };

  // Autopilot: one command per tick — think, press the real control, dispatch.
  const dispatch = (cmd: Command) => {
    const table = tableRef.current!;
    if (typeof cmd === "string") {
      if (cmd === "deal") {
        table.deal();
      } else if (cmd === "nextRound") {
        roundStartRef.current = null;
        table.nextRound();
      } else if (cmd === "decline") {
        table.decline();
      } else {
        table[cmd]();
      }
    } else {
      runClaim(cmd.claim);
    }
    setState(table.state);
  };

  const startAutopilot = () => {
    const table = tableRef.current!;
    // Claimed Spots become the Lineup; an empty table reuses the remembered one.
    if (table.state.spots.length > 0) {
      setLineup(table.state.spots.map((spot) => spot.bet));
    }
    setAutopilot(true);
  };

  const stopAutopilot = () => {
    setAutopilot(false);
    setBotPress(null);
  };

  useEffect(() => {
    if (!autopilot || !state) return;
    if (!botPress) {
      const cmd = autopilotCommand(state, lineup);
      if (!cmd) {
        setAutopilot(false); // bankroll cannot cover the Lineup — the human's move
        return;
      }
      const t = setTimeout(() => setBotPress(cmd), STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setBotPress(null);
      dispatch(botPress);
    }, PRESS_MS);
    return () => clearTimeout(t);
  }, [state, autopilot, botPress, lineup]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Autopilot runs the Lineup: claimed Spots now, or the remembered one.
  const pendingLineup = state.spots.length > 0 ? state.spots.map((spot) => spot.bet) : lineup;
  const lineupTotal = pendingLineup.reduce((sum, bet) => sum + bet, 0);
  const canAutopilot = pendingLineup.length > 0 && state.bankroll >= lineupTotal;

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

      <section className={`table${autopilot ? " autopilot" : ""}`} aria-label="Blackjack table">
        <div className="dealer-row">
          <span className="table-label">Dealer</span>
          <HandRow
            cards={state.dealer.cards}
            extraFaceDown={state.dealer.holeRevealed ? 0 : 1}
            flipIndex={state.dealer.holeRevealed ? 1 : undefined}
          />
          {state.dealer.holeRevealed && state.dealer.cards.length > 0 && (
            <span className="dealer-total">
              {(() => {
                const { total, soft } = handValue(state.dealer.cards);
                return soft && total < 21 ? `soft ${total}` : total;
              })()}
            </span>
          )}
        </div>
        <div className="shoe-ruler" role="img" aria-label={`Shoe: ${shoeRemaining} of ${SHOE_TOTAL} cards remain`}>
          <div className="shoe-ruler-head">
            <span className={`shoe-label${state.needsShuffle ? " cut" : ""}`}>
              {state.needsShuffle ? "Cut card · fresh shoe next round" : `Shoe ${shoeRemaining} cards`}
            </span>
            <span className="table-label">Cut card at 75%</span>
          </div>
          <div className="shoe-ruler-bar">
            <div className="shoe-ruler-fill" style={{ width: `${shoePct}%` }} />
            <div className="shoe-ruler-tick" />
          </div>
        </div>
        <div className="spots spots-stretch" ref={spotsRef}>
          {state.spots.map((spot, si) => {
            const isActiveSpot = state.active?.spot === spot.id;
            return (
              <div className="plate" key={spot.id} ref={isActiveSpot ? activePlateRef : undefined}>
                <div className="plate-head">
                  <span className="plate-tag">Spot {si + 1}</span>
                  {state.phase === "betting" ? (
                    <>
                      <span className="plate-bet">{moneyWhole(spot.bet)}</span>
                      <button
                        className="release"
                        aria-label={`Release spot, returns ${money(spot.bet)}`}
                        disabled={autopilot}
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
            Array.from({ length: MAX_SPOTS - state.spots.length }, (_, gi) => {
              const claimAmount = autopilot ? (lineup[state.spots.length] ?? 0) : betCents;
              const botPressingClaim =
                botPress !== null && typeof botPress !== "string" && gi === state.spots.length;
              return (
                <button
                  key={`ghost-${gi}`}
                  className={`plate plate-ghost plate-engraved${botPressingClaim ? " bot-press" : ""}`}
                  disabled={autopilot || !canClaim}
                  aria-label={`Claim spot for ${moneyWhole(claimAmount > 0 ? claimAmount : 0)}`}
                  onClick={() => runClaim(betCents)}
                >
                  <span className="plate-tag">Spot {state.spots.length + gi + 1}</span>
                  <span className="plate-num" aria-hidden="true">{state.spots.length + gi + 1}</span>
                  <span className="plate-slot" aria-hidden="true" />
                  <span className="claim-hint">Claim · {claimAmount > 0 ? moneyWhole(claimAmount) : "—"}</span>
                </button>
              );
            })}

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
                      disabled={autopilot}
                      onChange={(e) => setBet(e.target.value)}
                      aria-invalid={!betValid || betFunds}
                    />
                    <div className="chips">
                      {CHIPS.map((chip) => (
                        <button
                          key={chip.value}
                          className={`chip-btn ${chip.tone}`}
                          aria-label={`Add ${moneyWhole(chip.value)} to bet`}
                          disabled={autopilot}
                          onClick={() => setBet(String(Math.min(TABLE_MAX / 100, Math.max(0, Number(bet) || 0) + chip.value / 100)))}
                        >
                          {chip.value / 100}
                        </button>
                      ))}
                      <button className="chip-clear" disabled={autopilot} onClick={() => setBet("10")}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <span className="tray-spacer" />
                  <button
                    className="btn"
                    disabled={!canAutopilot}
                    title={
                      pendingLineup.length === 0
                        ? "Claim at least one Spot first"
                        : `Lineup ${moneyWhole(lineupTotal)}`
                    }
                    onClick={startAutopilot}
                  >
                    Autopilot
                  </button>
                  <button
                    className={`btn primary${botPress === "deal" ? " bot-press" : ""}`}
                    disabled={state.spots.length === 0 || autopilot}
                    onClick={() => act(() => tableRef.current!.deal())}
                  >
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

          {!autopilot && state.phase === "betting" && state.spots.length === 0 && lineup.length > 0 && state.bankroll < lineupTotal && (
            <p className="tray-note" style={{ margin: "6px 0 0" }}>
              The bankroll can&apos;t cover the Autopilot lineup ({moneyWhole(lineupTotal)}).
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
                disabled={autopilot || state.bankroll < state.insuranceCost}
                onClick={() => act(() => tableRef.current!.insure())}
              >
                Insure
              </button>
              <button
                className={`btn primary${botPress === "decline" ? " bot-press" : ""}`}
                disabled={autopilot}
                onClick={() => act(() => tableRef.current!.decline())}
              >
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
                    className={`btn${verb.action === "hit" ? " primary" : ""}${botPress === verb.action ? " bot-press" : ""}`}
                    disabled={!legal || autopilot}
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
              <button
                className={`btn primary${botPress === "nextRound" ? " bot-press" : ""}`}
                disabled={autopilot}
                onClick={() => {
                  roundStartRef.current = null;
                  act(() => tableRef.current!.nextRound());
                }}
              >
                Next round
              </button>
            </div>
          )}

          {autopilot && (
            <div className="tray-content autopilot-bar">
              <span className="autopilot-dot" aria-hidden="true" />
              <span className="autopilot-label">Autopilot</span>
              <span className="tray-spacer" />
              <button className="btn stop" onClick={stopAutopilot}>
                Stop
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