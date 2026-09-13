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
  type BlackjackPayout,
  type State,
  type Table,
} from "@/blackjack/table";
import { loadBankroll, saveBankroll } from "./lib/bankroll-store";
import { loadRules, saveRules } from "./lib/rules-store";
import {
  loadSpeed,
  saveSpeed,
  DEFAULT_SPEED,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
} from "./lib/speed-store";
import { money, moneyWhole } from "./lib/format";
import { autopilotCanRun, autopilotCommand, type Command } from "@/blackjack/strategy";
import BankrollChart from "./bankroll-chart";

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
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

const PAYOUT_TEXT: Record<BlackjackPayout, string> = { "3:2": "3 to 2", "6:5": "6 to 5" };

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

const BOARD_VISIBLE = 10; // newest entries kept on the board; older ones age out

/**
 * Dealer board (CONTEXT.md): the Dealer's final totals for settled Rounds,
 * newest first — each new result enters at the left and drifts right, fading
 * as it ages, until it drops off the end.
 */
function DealerBoard({ entries }: { entries: State["dealerBoard"] }) {
  if (entries.length === 0) return null;
  const visible = entries.slice(-BOARD_VISIBLE).reverse();
  return (
    <div className="dealer-board" aria-label="Dealer board">
      {visible.map((entry, age) => (
        <span
          key={entries.length - 1 - age}
          className={`dealer-board-entry${entry.natural ? " bj" : entry.total > 21 ? " bust" : ""}${age === 0 ? " newest" : ""}`}
          style={{ "--age": age } as React.CSSProperties}
        >
          {entry.natural ? "BJ" : entry.total > 21 ? "BUST" : entry.total}
        </span>
      ))}
    </div>
  );
}

const VERBS = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "double", label: "Double" },
  { action: "split", label: "Split" },
  { action: "surrender", label: "Surrender" },
] as const;

const STEP_MS = 600; // Autopilot: think delay before the click, at 1× Speed
const PRESS_MS = 220; // Autopilot: how long the pressed state shows, at 1× Speed

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
  const [press, setPress] = useState<Command | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedBootedRef = useRef(false);

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
    const table = createTable({
      bankroll: loadBankroll(window.localStorage),
      rules: loadRules(window.localStorage),
    });
    tableRef.current = table;
    setState(table.state);
    setSpeed(loadSpeed(window.localStorage));
  }, []);

  useEffect(() => {
    if (state) saveBankroll(window.localStorage, state.bankroll);
  }, [state?.bankroll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Table rules persist like the Bankroll (ADR-0001); Reset Session keeps them.
  useEffect(() => {
    if (state) saveRules(window.localStorage, state.rules);
  }, [state?.rules.surrender, state?.rules.blackjackPayout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speed persists like the Bankroll (ADR-0001). The first commit holds the
  // boot default, not the user's value — the save skips that one run.
  useEffect(() => {
    if (!speedBootedRef.current) {
      speedBootedRef.current = true;
      return;
    }
    saveSpeed(window.localStorage, speed);
  }, [speed]);

  // The Speed modal belongs to a running Autopilot: the bar that opens it only
  // exists while Autopilot runs, so a self-stopped Autopilot (Out of money)
  // must not resurrect the modal at the next start.
  useEffect(() => {
    if (!autopilot) setSpeedOpen(false);
  }, [autopilot]);

  // Esc closes the Table rules and Speed modals.
  useEffect(() => {
    if (!rulesOpen && !speedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRulesOpen(false);
        setSpeedOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rulesOpen, speedOpen]);

  // One claim path for human and Autopilot: the round's P/L baseline is the bankroll
  // before the first claim of the Round (the stake is deducted at claim time).
  const runClaim = (bet: number) => {
    const table = tableRef.current!;
    if (table.state.spots.length === 0) roundStartRef.current = table.state.bankroll;
    table.claim(bet);
    setState(table.state);
  };

  // Autopilot: one command per tick — think, press the real control, dispatch.
  // Claims are the exception: they skip the think and press straight away.
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
    setPress(null);
  };

  useEffect(() => {
    if (!autopilot || !state) return;
    if (!press) {
      const cmd = autopilotCommand(state, lineup);
      if (!cmd) {
        setAutopilot(false); // bankroll cannot cover the Lineup — the human's move
        return;
      }
      if (typeof cmd === "object") {
        // Claims skip the think — the Lineup is fixed, nothing to decide —
        // so the Lineup loads as a rapid cascade of presses, one Spot after
        // another. The Deal that follows keeps the normal beat.
        setPress(cmd);
        return;
      }
      const t = setTimeout(() => setPress(cmd), STEP_MS / speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPress(null);
      dispatch(press);
    }, PRESS_MS / speed);
    return () => clearTimeout(t);
  }, [state, autopilot, press, lineup, speed]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // The module owns the coverage rule; the UI only asks it.
  const canAutopilot = autopilotCanRun(state, pendingLineup);

  // The class Autopilot's press adds to the control it is about to fire.
  const pressed = (cmd: Command) => (press === cmd ? " auto-press" : "");

  // Table rules change between Rounds, and Autopilot must not be surprised.
  const rulesEditable = state.phase === "betting" && !autopilot;
  const gearTitle = autopilot
    ? "Stop Autopilot to change rules"
    : state.phase === "betting"
      ? "Table rules"
      : "Rules change between rounds";

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
        <span
          className="rules-chip"
          aria-label={`Table rules: blackjack pays ${PAYOUT_TEXT[state.rules.blackjackPayout]}, ${state.rules.surrender ? "late surrender" : "no surrender"}`}
        >
          {`BJ ${state.rules.blackjackPayout} · ${state.rules.surrender ? "Surrender" : "No surrender"}`}
        </span>
        <span className="strip-spacer" />
        <div className="bankroll" aria-live="polite">
          <span className="bankroll-label">Bankroll</span>
          <span className="bankroll-amount">{money(bankrollShown)}</span>
        </div>
        <button
          className="gear-btn"
          aria-label="Table rules"
          title={gearTitle}
          disabled={!rulesEditable}
          onClick={() => setRulesOpen(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
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
          <DealerBoard entries={state.dealerBoard} />
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
                              {hand.result === "blackjack"
                                ? `Blackjack ${state.rules.blackjackPayout}`
                                : RESULT_LABEL[hand.result]}
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
              const pressingClaim =
                press !== null && typeof press !== "string" && gi === state.spots.length;
              return (
                <button
                  key={`ghost-${gi}`}
                  className={`plate plate-ghost plate-engraved${pressingClaim ? " auto-press" : ""}`}
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
                    className={`btn primary${pressed("deal")}`}
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

          {!autopilot && state.phase === "betting" && state.spots.length === 0 && lineup.length > 0 && !autopilotCanRun(state, lineup) && (
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
                className={`btn primary${pressed("decline")}`}
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
                    className={`btn${verb.action === "hit" ? " primary" : ""}${pressed(verb.action)}`}
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
                className={`btn primary${pressed("nextRound")}`}
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
              <span className="autopilot-label">Autopilot · {speed}×</span>
              <button className="speed-btn" aria-label="Speed" title="Speed" onClick={() => setSpeedOpen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </button>
              <span className="tray-spacer" />
              <button className="btn stop" onClick={stopAutopilot}>
                Stop
              </button>
            </div>
          )}
        </div>
      </section>
      <BankrollChart
        history={state.history}
        sessionStart={state.sessionStart}
        canReset={state.phase === "betting"}
        onReset={() => {
          stopAutopilot();
          act(() => tableRef.current!.resetSession());
        }}
      />
      {rulesOpen && (
        <div className="modal-backdrop" onClick={() => setRulesOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Table rules"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2 className="modal-title">Table rules</h2>
              <button className="modal-close" aria-label="Close table rules" onClick={() => setRulesOpen(false)}>
                ×
              </button>
            </header>
            <p className="modal-note">Changes take effect at the next round and are remembered on this device.</p>
            <div className="modal-row">
              <span className="modal-label">Blackjack pays</span>
              <div className="seg" role="group" aria-label="Blackjack payout">
                {(["3:2", "6:5"] as const).map((p) => (
                  <button
                    key={p}
                    className={`seg-btn${state.rules.blackjackPayout === p ? " on" : ""}`}
                    aria-pressed={state.rules.blackjackPayout === p}
                    disabled={!rulesEditable}
                    onClick={() => act(() => tableRef.current!.setRules({ blackjackPayout: p }))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-row">
              <span className="modal-label">Late surrender</span>
              <button
                className={`switch${state.rules.surrender ? " on" : ""}`}
                role="switch"
                aria-checked={state.rules.surrender}
                aria-label="Late surrender"
                disabled={!rulesEditable}
                onClick={() => act(() => tableRef.current!.setRules({ surrender: !state.rules.surrender }))}
              >
                <span className="knob" />
              </button>
            </div>
            <p className="modal-hint">
              Late surrender forfeits half the bet on the first two cards. 6:5 pays less on naturals — a worse deal for
              the Player. Basic strategy follows the table either way.
            </p>
          </section>
        </div>
      )}
      {autopilot && speedOpen && (
        <div className="modal-backdrop" onClick={() => setSpeedOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Speed"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2 className="modal-title">Speed</h2>
              <button className="modal-close" aria-label="Close speed" onClick={() => setSpeedOpen(false)}>
                ×
              </button>
            </header>
            <p className="modal-note">
              Autopilot&apos;s Speed — it changes how long each action takes, never which action is taken. Remembered on
              this device.
            </p>
            <div className="modal-row">
              <span className="modal-label">Speed</span>
              <input
                className="speed-slider"
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={speed}
                aria-label="Speed"
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span className="speed-readout">{speed}×</span>
            </div>
            <p className="modal-hint">
              About {((STEP_MS + PRESS_MS) / 1000 / speed).toFixed(1)} seconds per action. Drag while Autopilot runs —
              the very next action keeps the new beat.
            </p>
          </section>
        </div>
      )}
      <footer className="placard">
        <span>
          Blackjack pays {PAYOUT_TEXT[state.rules.blackjackPayout]} · Dealer hits soft 17 · Insurance pays 2 to 1
          {!state.rules.surrender && " · No surrender"}
        </span>
        <span>Table {moneyWhole(TABLE_MIN)}–{moneyWhole(TABLE_MAX)} · Five-deck shoe · Cut card at 75%</span>
      </footer>
    </main>
  );
}