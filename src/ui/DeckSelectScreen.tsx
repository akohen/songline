import type { Deck } from "@/decks/types";

type Props = {
  decks: Deck[];
  onSelect: (deck: Deck) => void;
};

function yearRange(deck: Deck): string {
  const years = deck.cards.map((card) => card.year).sort((a, b) => a - b);
  return years.length === 0 ? "—" : `${years[0]}–${years[years.length - 1]}`;
}

export function DeckSelectScreen({ decks, onSelect }: Props) {
  return (
    <main className="screen">
      <h1 className="screen__title">Choose a deck</h1>
      <ul className="deck-list">
        {decks.map((deck) => (
          <li key={deck.id}>
            <button type="button" className="deck-card" onClick={() => onSelect(deck)}>
              <div className="deck-card__name">{deck.name}</div>
              <div className="deck-card__meta">
                {deck.cards.length} songs · {yearRange(deck)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
