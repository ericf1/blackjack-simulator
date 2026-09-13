"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEvent } from "@/blackjack/table";
import { money, moneyWhole } from "./lib/format";

/* Plot geometry: real pixels, measured from the wrap — the SVG is never scaled. */
const PAD = { top: 10, right: 14, bottom: 20, left: 52 } as const;
const PLOT_H = 118;

/** A pleasant-ish gridline step (1 / 2 / 2.5 / 5 / 10 × 10ⁿ) near `raw`. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

/**
 * The Session chart: the Bankroll at each settled Round, Top-ups marked as
 * their own points, a dashed line where the Session began. Hand-rolled SVG —
 * the project carries no chart dependency. Hover for the nearest point.
 */
export default function BankrollChart({
  history,
  sessionStart,
  canReset,
  onReset,
}: {
  history: HistoryEvent[];
  sessionStart: number;
  canReset: boolean;
  onReset: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null); // index into history

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const values = [sessionStart, ...history.map((p) => p.bankroll)];
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    // at least $5 of range so a flat start still draws a sane frame
    const span = Math.max(vMax - vMin, 500);
    const pad = span * 0.08;
    const dMin = vMin - pad;
    const dMax = vMax + pad;
    const y = (v: number) => PAD.top + (1 - (v - dMin) / (dMax - dMin)) * PLOT_H;
    const rMax = Math.max(1, ...history.map((p) => p.round));
    const x = (r: number) =>
      rMax <= 1 ? PAD.left + plotW / 2 : PAD.left + ((r - 1) / (rMax - 1)) * plotW;
    const pts = history.map((p) => ({ ...p, px: x(p.round), py: y(p.bankroll) }));
    return { plotW, dMin, dMax, y, x, rMax, pts };
  }, [history, sessionStart, width]);

  const grid = useMemo(() => {
    const step = niceStep((geo.dMax - geo.dMin) / 3);
    const ticks: number[] = [];
    for (let v = Math.ceil(geo.dMin / step) * step; v <= geo.dMax; v += step) {
      if (v >= 0) ticks.push(v);
    }
    return ticks;
  }, [geo]);

  const xTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(geo.rMax / 5));
    const ticks: number[] = [];
    for (let r = 1; r <= geo.rMax; r += step) ticks.push(r);
    if (ticks[ticks.length - 1] !== geo.rMax) ticks.push(geo.rMax);
    return ticks;
  }, [geo.rMax]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (geo.pts.length === 0 || geo.plotW <= 0) return;
    const mx = e.clientX - svgRef.current!.getBoundingClientRect().left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < geo.pts.length; i++) {
      const d = Math.abs(geo.pts[i].px - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const settles = history.filter((p) => p.kind === "settle").length;
  const roundsLabel = `${settles} ${settles === 1 ? "round" : "rounds"}`;
  const now = history.length ? history[history.length - 1].bankroll : sessionStart;

  const hoverPt = hover !== null && hover < geo.pts.length ? geo.pts[hover] : null;
  const prevBankroll = hoverPt
    ? hover !== null && hover > 0
      ? geo.pts[hover - 1].bankroll
      : sessionStart
    : 0;
  const delta = hoverPt ? hoverPt.bankroll - prevBankroll : 0;
  const deltaText = delta > 0 ? `+${money(delta)}` : delta < 0 ? `−${money(-delta)}` : "±$0.00";
  const deltaCls = delta > 0 ? "up" : delta < 0 ? "down" : "even";
  const tipLeft = hoverPt ? Math.min(Math.max(hoverPt.px, 64), Math.max(width - 64, 64)) : 0;

  return (
    <section className="chart" aria-label="Session bankroll chart">
      <div className="chart-head">
        <span className="chart-title">Session</span>
        <span className="chart-meta">
          {settles === 0 ? "no rounds yet" : roundsLabel}
        </span>
        <button className="chart-reset" disabled={!canReset} onClick={onReset}>
          Reset session
        </button>
      </div>
      <div className="chart-body" ref={wrapRef}>
        <svg
          ref={svgRef}
          className="chart-svg"
          width={width || undefined}
          height={PAD.top + PLOT_H + PAD.bottom}
          role="img"
          aria-label={`Session bankroll: ${roundsLabel} played, now ${money(now)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {grid.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + geo.plotW}
                y1={geo.y(v)}
                y2={geo.y(v)}
                className="chart-grid"
              />
              <text x={PAD.left - 8} y={geo.y(v) + 3} textAnchor="end" className="chart-tick">
                {moneyWhole(v)}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={PAD.left + geo.plotW}
            y1={geo.y(sessionStart)}
            y2={geo.y(sessionStart)}
            className="chart-baseline"
          />

          {xTicks.map((r) => (
            <text
              key={r}
              x={geo.x(r)}
              y={PAD.top + PLOT_H + 14}
              textAnchor="middle"
              className="chart-tick"
            >
              {r}
            </text>
          ))}

          {geo.pts.length > 1 && (
            <polyline
              points={geo.pts.map((p) => `${p.px},${p.py}`).join(" ")}
              className="chart-line"
            />
          )}

          {geo.pts
            .filter((p) => p.kind === "topUp")
            .map((p, i) => (
              <circle key={`topup-${i}`} cx={p.px} cy={p.py} r={3.5} className="chart-topup" />
            ))}

          {geo.pts.length > 0 && (
            <circle
              cx={geo.pts[geo.pts.length - 1].px}
              cy={geo.pts[geo.pts.length - 1].py}
              r={3.5}
              className="chart-head-dot"
            />
          )}

          {hoverPt && (
            <g>
              <line
                x1={hoverPt.px}
                x2={hoverPt.px}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                className="chart-guide"
              />
              <circle cx={hoverPt.px} cy={hoverPt.py} r={4.5} className="chart-hover-dot" />
            </g>
          )}
        </svg>

        {hoverPt && (
          <div className="chart-tip" style={{ left: tipLeft, top: hoverPt.py - 12 }} aria-hidden="true">
            <span className="chart-tip-label">
              {hoverPt.kind === "settle" ? `Round ${hoverPt.round}` : "Top-up"}
            </span>
            <span className="chart-tip-value">{money(hoverPt.bankroll)}</span>
            <span className={`chart-tip-delta ${deltaCls}`}>{deltaText}</span>
          </div>
        )}
      </div>
    </section>
  );
}
