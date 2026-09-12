import type { Card } from "./cards";
import { standardDeck } from "./cards";

/**
 * The Shoe: an ordered pile of cards drawn from the top.
 * Injection rules (per tests + future simulator):
 * - `deck` given: the Shoe plays out that exact order (deterministic tests).
 * - otherwise: `decks` full decks shuffled with the injected rng.
 */
export class Shoe {
  private cards: Card[];
  private drawn = 0;
  readonly total: number;
  readonly cutIndex: number;

  constructor(
    cards: Card[] | null,
    private readonly decks: number,
    private readonly rng: () => number = Math.random,
  ) {
    this.cards = cards ?? shuffleN(standardDeck(), decks, rng);
    this.total = this.cards.length;
    this.cutIndex = Math.floor(this.total * 0.75);
  }

  draw(): Card {
    if (this.drawn >= this.cards.length) {
      throw new Error("shoe exhausted mid-round; cut card should have triggered a reshuffle");
    }
    return this.cards[this.drawn++];
  }

  get remaining(): number {
    return this.cards.length - this.drawn;
  }

  /** Cut card reached: the Shoe must be refreshed before the next Round. */
  get pastCut(): boolean {
    return this.drawn >= this.cutIndex;
  }

  refresh(): void {
    this.cards = shuffleN(standardDeck(), this.decks, this.rng);
    this.drawn = 0;
  }
}

/** Fisher–Yates, driven by the injected rng. */
function shuffleN(base: Card[], decks: number, rng: () => number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < decks; i++) cards.push(...base);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}