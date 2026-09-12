# Blackjack

An interactive blackjack game where one Player claims Spots and plays Hands against a Dealer, with a locally managed Bankroll. Shaped so automated simulation can drive the same rules later.

## Language

**Player**:
The single human playing at the table. Owns the Bankroll.
_Avoid_: user, gambler, bettor

**Dealer**:
The house position that plays by fixed rules and settles every hand.
_Avoid_: house, casino, bank

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

**Cut card**:
The point in the Shoe that ends dealing; reaching it reshuffles a fresh Shoe before the old one runs out.
_Avoid_: penetration, reshuffle point

**Top-up**:
Free money the Player adds when the Bankroll can no longer cover the table minimum. It's a game — money is free.
_Avoid_: rebuy, deposit

**Shoe**:
The device holding the cards in play — sized in decks (currently five) and refilled when exhausted.
_Avoid_: deck (that is one 52-card unit), pack