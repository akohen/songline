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
    <section>
      <h1>Choose a deck</h1>
      <ul>
        {decks.map((deck) => (
          <li key={deck.id} style={{ marginBottom: "1rem" }}>
            <button type="button" onClick={() => onSelect(deck)}>
              {deck.name}
            </button>
            <div>
              <small>
                {deck.description} · {deck.cards.length} songs · {yearRange(deck)}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
