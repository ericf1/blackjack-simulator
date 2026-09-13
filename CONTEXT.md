# Blackjack

An interactive blackjack game where one Player claims Spots and plays Hands against a Dealer, with a locally managed Bankroll — played by hand or watched on Autopilot. Shaped so automated simulation can drive the same rules later.

## Language

**Player**:
The single human playing at the table. Owns the Bankroll.
_Avoid_: user, gambler, bettor

**Dealer**:
The house position that plays by fixed rules and settles every hand.
_Avoid_: house, casino, bank

**Autopilot**:
The mode in which the Player's decisions are made automatically by Basic strategy — betting, dealing, playing, and settling all happen on their own while the human watches. The human can always stop it; Top-up stays the human's job.
_Avoid_: autoplay, bot, demo mode, AI

**Lineup**:
The set of Spots — their count and bets — that Autopilot plays. The human sets it before starting; Autopilot re-claims it unchanged at the start of every Round until the human sets up a new one.
_Avoid_: setup, configuration, preset, bet spread

**Basic strategy**:
The fixed chart of playing decisions — hit, stand, double, split, surrender, never insurance — that is optimal for this table's rules. Autopilot plays it exactly.
_Avoid_: optimal play, the book, AI

**Bankroll**:
The pool of money the Player bets from and wins into. It funds all hands.
_Avoid_: balance, wallet, funds, chips

**Spot**:
A betting position the Player claims before the deal. Each Spot holds one bet from the Bankroll and plays out its own Hand(s).
_Avoid_: box, seat, position, hand

**Hand**:
The cards in play on one Spot — dealt as two cards; a split turns one Hand into two on the same Spot.
_Avoid_: spot (that is the betting position), box

**Round**:
One cycle of betting, dealing, playing, and settlement across all Spots.
_Avoid_: game, turn, hand (ambiguous)

**Table rules**:
The settings the Player can change between Rounds — whether Surrender is offered and the Blackjack payout (3:2 or 6:5). They persist across Sessions; every other rule of the table is fixed.
_Avoid_: settings, house rules, preferences

**Cut card**:
The point in the Shoe that ends dealing; reaching it reshuffles a fresh Shoe before the old one runs out.
_Avoid_: penetration, reshuffle point

**Top-up**:
Free money the Player adds when the Bankroll can no longer cover the table minimum. It's a game — money is free.
_Avoid_: rebuy, deposit

**Session**:
One visit at the table — from loading the game until reloading it or pressing Reset Session. The charted Bankroll history covers exactly one Session.
_Avoid_: run, sitting, visit

**Shoe**:
The device holding the cards in play — sized in decks (currently five) and refilled when exhausted.
_Avoid_: deck (that is one 52-card unit), pack