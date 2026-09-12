export type Suit = "S" | "H" | "D" | "C";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let softAces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      softAces += 1;
      total += 11;
    } else {
      total += cardValue(card.rank);
    }
  }
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }
  return { total, soft: softAces > 0 };
}

export const isTenValue = (card: Card): boolean => cardValue(card.rank) === 10;

export const isPair = (cards: Card[]): boolean => cards[0].rank === cards[1].rank;

/** Full deck composition, 52 cards, one of each rank/suit. */
export function standardDeck(): Card[] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const ranks: Rank[] = [
    "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }
  return deck;
}