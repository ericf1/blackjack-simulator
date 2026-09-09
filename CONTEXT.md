# Blackjack

A single-seat casino blackjack table: one player versus the dealer, Vegas strip rules, a six-deck shoe, and a persistent bankroll. The point is to *play* at a table that feels like a real casino session.

## Language

### Table and round

**Table**:
The playing surface — one Player, up to five Boxes, against the Dealer.
_Avoid_: simulator, game board

**Player**:
The human at the Table.
_Avoid_: user, seat

**Box**:
One of up to five betting positions the Player fills for a round; each Box holds its own Bet and starts one Hand. A Box without a Bet sits out the round.
_Avoid_: seat, spot

**Dealer**:
The house participant. Draws cards after the Player finishes, standing on all 17s.
_Avoid_: house, casino

**Round**:
One full cycle: bet, deal, player decisions, dealer play, settlement.
_Avoid_: game, turn

**Hand**:
The cards held by one participant during a round, with a single value. A round can hold several player Hands — one per Box, plus Splits.
_Avoid_: play

**Hole card**:
The dealer's face-down card until Reveal.
_Avoid_: hidden card, facedown card

**Reveal**:
The moment the dealer's hole card turns face-up, before dealer draws.
_Avoid_: flip (UI word)

**Bust**:
A hand value over 21; an immediate loss for that hand.
_Avoid_: over, broke (broke is out of bankroll)

**Peek**:
When the dealer's upcard is an Ace or a ten, the dealer checks the hole card for Blackjack and ends the round immediately if found.
_Avoid_: check

**Push**:
Player and dealer finish level; the bet is returned.
_Avoid_: tie, draw

**Blackjack**:
An initial two-card 21. Pays 3:2. A 21 reached after splitting is not a Blackjack.
_Avoid_: natural, perfect pair

### The shoe

**Shoe**:
One to eight shuffled decks (the player's choice) from which cards are dealt, round after round, until the cut card appears.
_Avoid_: deck (a deck is 52 cards; the Shoe holds several)

**Cut card**:
A marker placed in the shoe; dealing stops when it is reached and the shoe is reshuffled before the next round.
_Avoid_: reshuffle point

**Automatic shuffle**:
The setting that reshuffles the Shoe at the cut card without prompting. When off, the Player triggers the shuffle; the shoe still force-shuffles if it cannot deal a full round.
_Avoid_: CSM

**Penetration**:
How much of the shoe is dealt before the cut card appears (~75%).

### Money

**Bankroll**:
The player's chip total, persisted between visits.
_Avoid_: balance, wallet, funds

**Buy-in**:
The amount a fresh Bankroll holds ($100).
_Avoid_: deposit

**Bet**:
Chips committed at the start of a round. After settlement the Bet stays composed on its Box for the next round until the Player clears it.
_Avoid_: wager, stake

**Minimum bet**:
The smallest legal Bet — $10. A bankroll that cannot cover it triggers Rebuy.

**Chip**:
A denomination token used to compose a bet.

**Rebuy**:
A full reset of the bankroll to the Buy-in once it can no longer cover the Minimum bet.
_Avoid_: refill, top-up

### Actions

**Hit**:
Take one more card to a hand.

**Stand**:
Take no more cards; the hand is done.

**Double**:
Add one bet's worth for exactly one more card, then the hand stands. Only on the first two cards.

**Split**:
Divide a two-card hand of equal rank into two hands, each matched by an equal bet. Split aces receive one card each.