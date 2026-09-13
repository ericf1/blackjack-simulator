# Rules

The canon from the grilling session. The rules engine implements exactly this; tests cite it as the spec.

## Table & stakes

- One human Player; up to **5 Spots** per round.
- Table minimum **$10**, table maximum **$2,000** per Spot.
- Starting Bankroll: **$100**. Money is whole dollars (tracked in cents internally; surrender halves can produce cents).
- **Top-up**: free $100, available whenever the Bankroll cannot cover the table minimum.

## Shoe

- **5 decks** (configurable constant).
- **Cut card** at 75% of the Shoe: when reached, reshuffle a full 5-deck Shoe before the next Round.

## Dealing

- US-style hole card: dealer's upcard plus face-down hole card.
- Dealer **peeks** for blackjack when showing an Ace or any 10-value.
- Player natural blackjack pays **3:2** — the default; the Player can switch the table to **6:5** in the Table rules modal (see below). Either way: two-card 21 on the deal only; a 21 built after splitting is *not* a blackjack.
- Insurance: offered when dealer shows an Ace, pays **2:1**, settled immediately after the peek.

## Dealer play

- Dealer **hits soft 17** (H17), stands on hard 17+.
- Dealer draws only if at least one live Hand remains.

## Player actions

- **Hit / Stand**: always available to a live Hand.
- **Double**: any two cards only (not after hitting); allowed after split; take exactly one card; the Spot's bet doubles.
- **Split**: pairs only. Split aces receive one card each and may not be resplit. Non-ace pairs may resplit, up to **4 Hands per Spot**. Double after split allowed.
- **Surrender**: late — available after the peek only if the dealer does not have blackjack; forfeits half the bet. **On by default**; the Player can turn it off in the Table rules modal.

## Table rules (configurable)

Two rules are the Player's to change between Rounds, in the Table rules modal (the header gear):

- Natural payout: **3:2** (default) or **6:5**.
- Late surrender: **on** (default) or **off**.

Choices persist on the device across reloads; **Reset Session keeps them**. Basic strategy follows the table: with surrender off the chart plays its no-surrender fallbacks (16/15 vs 9-T-A hit, 17 vs A stand, 8-8 vs A split); the payout changes no playing decisions. Everything else in this document is fixed.

## Settlement

- Winning hand pays 1:1, push returns the bet, loss forfeits the bet, surrendered hand returns half.
- Dealer blackjack (natural) beats all non-natural hands; player natural beats dealer non-natural; naturals push.