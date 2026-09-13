---
name: Blackjack
description: A single-screen blackjack table as a precision instrument — bone stage, ink type, one cobalt accent.
colors:
  stage: "#f1efe9"
  plate: "#fbfaf6"
  card-face: "#fefdfb"
  ink: "#17181b"
  ink-2: "#5d5f63"
  line: "#dcd9d0"
  line-2: "#c2beb3"
  accent: "#1e3fc0"
  accent-press: "#1732a0"
  accent-tint: "#e9ecf9"
  red: "#c13b2a"
  win: "#1e7a46"
  chip-blue: "#2b4fa8"
  chip-green: "#1e7a46"
  chip-black: "#23252b"
  chip-purple: "#6c3fa4"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Archivo, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.16em"
  money:
    fontFamily: "Bricolage Grotesque, Archivo, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: '"tnum"'
  verdict:
    fontFamily: "Archivo, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1em"
    fontFeature: '"tnum"'
  label:
    fontFamily: "Archivo, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  card: "7px"
  hand: "8px"
  control: "9px"
  plate: "10px"
  pill: "999px"
  hairline: "2px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "26px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  button:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  button-topup:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  chip:
    backgroundColor: "{colors.chip-blue}"
    textColor: "#ffffff"
    typography: "{typography.verdict}"
    rounded: "{rounded.pill}"
    size: "36px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
  plate-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.plate}"
  card:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    width: "64px"
  dealer-total:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.verdict}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
---

# Design System: Blackjack

## Overview

**Creative North Star: "The Swiss Table"** — the blackjack table as a precision instrument. The classic table's ritual (betting arc, placard fine print, chip color-coding, card craft) rebuilt in modern-minimal materials where all energy lives in typography, geometry, and motion.

The game plays on a cool **bone stage** (`#f1efe9`) — a paper-like ground, never felt, never dark. **Ink** (`#17181b`) is the only full-strength type color; **Cobalt** (`#1e3fc0`) is the single accent, spent only on what is live, primary, or waiting for the Player. Every surface is separated by **1px hairlines**, not shadows; depth is reserved for physical objects (playing cards, chips). Money is always tabular, always `$`-formatted, always legible at a glance. The screen is recognizable with all content removed: a baseline strip, a ruled dealer row, a row of five plates, a verb bar, a fine-print placard.

**Key Characteristics:**
- Bone stage + ink type + hairline rules; zero gradients, zero felt.
- One cobalt accent for active/primary; chip colors exist only as denomination data.
- True card craft: corner indices, real pip layouts, lattice card back.
- Uppercase letterspaced micro-labels (10–13px) as the instrument's engraving.
- Tabular numerals wherever money or count moves.

## Colors

The palette is one neutral family (bone→ink), one cobalt voice, and a fixed set of functional colors that carry game meaning — never decoration.

### Primary
- **Cobalt** (`#1e3fc0`): the only accent. Live-hand rail and border, primary buttons, claim hints, cut-card tick, selection. Pressed state deepens to `#1732a0`; tint washes are `#e9ecf9`.
- **Cobalt Press** (`#1732a0`): hover/press of primary surfaces only.

### Secondary
- **Vermilion** (`#c13b2a`): red suits, bust/lose verdicts, release hover, invalid bet input.
- **Table Green** (`#1e7a46`): win/blackjack verdicts (also the 25-chip green).

### Neutral
- **Bone** (`#f1efe9`): page stage; mobile tray face.
- **Plate** (`#fbfaf6`): spot plates, pill badges, secondary buttons.
- **Card Face** (`#fefdfb`): playing-card stock only.
- **Ink** (`#17181b`): primary type, shoe fill, black chip.
- **Ink 2** (`#5d5f63`): secondary labels, fine print, inactive numerals.
- **Line** (`#dcd9d0`) / **Line 2** (`#c2beb3`): hairline borders (inner/outer weight).

### Data
- **Chip Blue** (`#2b4fa8`), **Chip Green** (`#1e7a46`), **Chip Black** (`#23252b`), **Chip Purple** (`#6c3fa4`): chip denominations 10 / 25 / 100 / 500. These four are data, not palette.

**The One Cobalt Rule.** Cobalt marks what is live or primary — the active hand, the next action, the cut card. If a screen needs more than one cobalt moment per state, the state model is wrong.

**The Chip Colors Are Data Rule.** The four chip hues encode denomination. They may appear on chips and nowhere else.

**The Verdicts Are Earned Rule.** Table Green and Vermilion appear only on outcomes (win/lose/bust) and suit color. They never decorate controls.

## Typography

**Display Font:** Bricolage Grotesque (fallback Archivo) — wordmark, bankroll numeral, bet input, court-card letters.
**Body Font:** Archivo (fallback system-ui) — everything else.

**Character:** A characterful grotesk shouts the identity and counts the money; a workhorse UI face does the quiet work. The pairing reads engraved, not decorative.

### Hierarchy
- **Display** (700, 21px, +0.16em, uppercase): the BLACKJACK wordmark only.
- **Money** (600, 26px/20px/13px by weight of position, −0.01em, tabular): bankroll hero, bet input, plate bets, hand totals.
- **Verdict** (600, 10px, +0.1em, uppercase, tabular): result stamps (Win/Bust/…), round delta.
- **Label** (600, 10.5–12.5px, +0.08–0.14em, uppercase): table labels, buttons, placard fine print, shoe readout.
- **Body** (400, 15px, 1.45): tray notes and anything sentence-length.

**The Tabular Money Rule.** Every numeral that moves — bankroll, bet, totals, shoe count — sets `font-variant-numeric: tabular-nums`. A shifting digit column is a bug, not a style.

## Layout

One column, max-width 1080px, centered; page padding `18px clamp(16px, 4vw, 40px) 0`. Vertical ritual top-to-bottom: baseline **strip** (wordmark left, bankroll right) → hairline-ruled **dealer row** (cards + total only) → full-width **shoe ruler** → **five Spot plates** in a 1fr grid (`12px` gap) → **verb tray** → fine-print **placard**. The table reads as one compact group anchored under the header: sections ride close together on a tight vertical cadence, nothing stretches to fill the viewport, the tray follows the spots in normal flow, and only the placard closes the page as the footer.

Under 900px the plate row becomes a horizontal scroll-snap carousel (196px plates, hidden scrollbar; dormant plates are not snap destinations) and the tray sticks to the viewport bottom with a lift shadow; the carousel follows play — the active Spot scrolls into view when the action moves, and settles back to Spot 1 when a round rolls into betting. Under 520px cards drop to 46px and type compresses one step; the verb tray reads as a note row plus an even 3+2 button grid. Nothing reflows to a second screen — the whole game stays one view.

## Elevation & Depth

**The Props Carry Depth Rule.** Shadows belong to physical objects — cards and chips. Plates, controls, and the stage are flat; hairlines (`--line`, `--line-2`) do all separating, and the active state is expressed as a 2px cobalt rail plus a 5% cobalt wash, never a glow.

### Shadow Vocabulary
- **Playing card** (`0 1px 2px rgb(23 24 27 / 0.14), 0 14px 32px -14px rgb(23 24 27 / 0.28)`): lifts the card off the stage; the only large shadow in the system.
- **Chip** (inset `0 0 0 2px rgb(255 255 255 / 0.5)`, inset `0 0 0 3.5px rgb(0 0 0 / 0.08)`, drop `0 1px 3px rgb(23 24 27 / 0.3)`): the denomination disc's edge ring.
- **Mobile tray lift** (`0 -12px 24px -18px rgb(23 24 27 / 0.35)`): sticky tray only, ≤900px.

## Shapes

Two radius families only: **objects** (cards 7px, hands 8px, controls 9px, plates 10px) and **discs/pills** (999px — chips, top-up, dealer total, release). Separation is always a 1px hairline, never a filled border block. Cards keep a fixed 5:7 aspect with a 7px radius; the shoe gauge is a 3px hairline bar with a 2px cobalt cut-card tick. The card back carries a 45°/135° lattice inside a 5px inset.

## Components

### Buttons (verb bar / tray)
- **Shape:** 9px radius, 1px border, `13px 20px` padding, label typography (uppercase, 600).
- **Primary:** Cobalt fill, white text; hover presses to `#1732a0`; disabled at 35% opacity — while Autopilot holds the table, disabled buttons keep 65% (ghost plates 55%) so the control it is about to press stays readable.
- **Secondary:** Plate fill, `--line-2` border; hover darkens the border to Ink; active nudges down 1px.
- **Top-up:** transparent pill, 1px cobalt border, cobalt text; hover fills cobalt.

### Chips (bet builder)
36px denomination discs in the four data colors, white inline label, inset edge ring + drop shadow; hover lifts 2px and brightens. Always accompanied by the uppercase Clear ghost and the 20px tabular bet input.

### Spot Plates
10px-radius plates on `--plate` with a ruled head (tag left, bet + release right) and a hand area below; claimed plates and empty ones hold a fixed min-height (240px desktop, 178px under 900px, 150px under 520px) so the row stays even without stretching to the viewport. **Ghost** plates are transparent claim targets engraved with a large display-face spot numeral (56px, `--line-2`, tabular, `aria-hidden`) and a hairline pill **bet slot** above the cobalt "Claim · $X" hint, hover tinting `#e9ecf9` and lifting 2px; **dormant** plates are transparent ghosts at 35% opacity. The active hand inside gets the 2px cobalt rail (slides in) and 5% cobalt wash.

### Playing Cards
`--card-w` (64px/46px mobile), 5:7, card-face stock, 7px radius. True corner index (rank over suit glyph, mirrored bottom-right rotated 180°), real pip layouts on the 22/50/78% columns, court cards as display-face letter + suit. Red suits take Vermilion. The back is a blue lattice. Card internals (indices, pips, court letters, lattice) are drawn in container-query units so the craft scales with the stock from 64px to 46px. Hands and the Dealer row fan with measured overlap — no card is ever clipped, at any width. Deal-in drops with a staggered spring (`translateY(-22px) rotate(-6deg)`); the hole card flips on reveal.

### Shoe Ruler
A full-width instrument strip between the dealer row and the Spots: a 12px hairline-ruled bar with faint 20% tick marks, ink fill counting remaining cards from the right, and the cobalt cut-card tick at 75%. Labels sit on both ends — "Shoe N cards" (turns cobalt "Cut card · fresh shoe next round" past the tick) and "Cut card at 75%".

### Placard (fine print)
One uppercase 10px line of rules canon along the bottom edge, split left/right, `--ink-2`.

## Do's and Don'ts

### Do:
- **Do** set `font-variant-numeric: tabular-nums` on every moving number.
- **Do** keep micro-labels uppercase, tracked (+0.08em minimum), 10–13px.
- **Do** separate surfaces with 1px `--line`/`--line-2` hairlines.
- **Do** spend Cobalt only on live/primary state; press to `#1732a0` on hover.
- **Do** keep card craft true: real pip layouts, mirrored corner indices, lattice back.

### Don't:
- **Don't** go online-casino: no green felt, no gold chrome, no neon glow.
- **Don't** use the dark-stage + neon "AI default", or the cream + serif editorial look.
- **Don't** put shadows on plates, controls, or the stage — depth lives in cards and chips only.
- **Don't** introduce new accent hues; the four chip colors are already the whole data palette.
- **Don't** fabricate imagery, testimonials, or casino branding — the type and geometry are the identity.