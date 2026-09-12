# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The developer plays it themselves — fun/personal, single human Player at the table. No other audiences confirmed.

## Product Purpose

An interactive blackjack game: the Player claims Spots, plays Hands against a Dealer, and manages a local Bankroll. Money is free (a Top-up exists) — it is a game, not a bank.

Near-term: a polished human-playable game. Later, in parallel: a headless automated simulator drives the same pure rules engine for basic-strategy verification as practice. No simulator work is scheduled now; the current focus is the UI.

## Positioning

One rules engine, two fronts: the polished table you play, and the headless simulator that will later verify strategy against the exact same rules — identical by construction, not by reimplementation (ADR 0001).

## Operating Context

- Runs entirely in the browser; dev server via `next dev`.
- Bankroll persists in `localStorage` per browser; no server, no accounts, no leaderboards, no persistence beyond the browser.
- Played locally for fun in short sessions.

## Capabilities and Constraints

- Up to 5 Spots per Round; table minimum $10, maximum $2,000 per Spot; starting Bankroll $100; Top-up is a free $100 whenever the Bankroll cannot cover the table minimum.
- Rules canon lives in `docs/rules.md` and is the spec the engine and tests implement: 5-deck Shoe, cut card at 75% reshuffle, US hole card with dealer peek, 3:2 naturals, insurance 2:1, dealer hits soft 17, double on any two cards (allowed after split), split pairs (split aces take one card and may not resplit; other pairs resplit up to 4 Hands per Spot), late surrender forfeiting half.
- Whole dollars; tracked in cents internally (surrender halves can produce cents).
- The rules engine is a pure module — no React, no DOM — and the UI drives it (ADR 0001).
- **Deliberately undecided:** simulator scope and scale (rounds to run, statistics to report). Open, not scheduled.

## Brand Commitments

- Title: "Blackjack" — confirmed as the product name.
- No other voice, logo, or asset commitments exist.

## Evidence on Hand

- `docs/rules.md` — rules canon, cited by tests as the spec.
- `CONTEXT.md` — canonical domain language (Player, Dealer, Bankroll, Spot, Hand, Round, Cut card, Top-up, Shoe).
- `src/blackjack/` — engine (`table.ts`, `shoe.ts`, `cards.ts`) with Vitest coverage; `src/app/` — Next.js UI with bankroll store + tests.
- Absences: no imagery, logos, testimonials, or press. Future work must not fabricate any.

## Product Principles

1. **Human play first, simulator-ready** — features land in the pure engine so the simulator inherits them unchanged.
2. **Rules canon is law** — `docs/rules.md` is the spec; tests cite it, the UI never improvises rules.
3. **Money is a toy** — the Bankroll is fun money; nothing server-side to protect.
4. **Speak the table's language** — use `CONTEXT.md` terms (Spot, Hand, Round, Bankroll, Top-up) in UI copy, code, and docs.
5. **Fun is the point** — polish the play, not an accounting tool.