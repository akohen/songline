import type { PlacedCard, PlacementOutcome } from "@/engine";

type Props = {
  cards: PlacedCard[];
  /** The slot the player is considering. Reversible, and never engine state. */
  selected: number | null;
  onSelect: (slot: number) => void;
  /** Set once the placement has resolved; slots stop being offered. */
  outcome: PlacementOutcome | null;
  /** The card just placed. Only ever non-null at the reveal. */
  revealed: { year: number; title: string; artist: string } | null;
};

/**
 * The current team's timeline, and the placement interaction.
 *
 * Vertical, not horizontal. A horizontal strip either scrolls the page sideways —
 * which docs/product/mobile-ui.md forbids — or shrinks the slots below a thumb once the
 * timeline passes about four cards. Years run down the left against a spine; the gaps
 * between cards are the slots, and they are the primary action while a card is in
 * play.
 */
export function TeamTimeline({ cards, selected, onSelect, outcome, revealed }: Props) {
  const rows = [];

  for (let slot = 0; slot <= cards.length; slot++) {
    const placedHere = outcome !== null && revealed !== null && slot === outcome.slot;

    if (placedHere && revealed && outcome) {
      rows.push(
        <PlacedRow key={`placed-${slot}`} card={revealed} correct={outcome.correct} />,
      );
    } else if (outcome?.correctSlots.includes(slot)) {
      // One marker per slot the card could have gone in. With a tie there are two, and
      // showing both is the point — the feedback must not invent a single right answer.
      rows.push(<HintRow key={`hint-${slot}`} />);
    } else if (!outcome) {
      rows.push(
        <SlotRow
          key={`slot-${slot}`}
          label={slotLabel(cards, slot)}
          selected={selected === slot}
          onSelect={() => onSelect(slot)}
        />,
      );
    }

    const card = cards[slot];
    // A correct card was inserted at `outcome.slot`, so the row above already *is*
    // this card. Rendering it again would show it twice.
    const shownAbove = placedHere && outcome?.correct === true;
    if (card && !shownAbove) rows.push(<CardRow key={`card-${slot}`} card={card} />);
  }

  return <div className="timeline">{rows}</div>;
}

/** "Before 1965", "1965 – 1979", "After 2010" — the bounds, stated plainly. */
function slotLabel(cards: PlacedCard[], slot: number): string {
  const before = cards[slot - 1];
  const after = cards[slot];
  if (!before) return after ? `Before ${after.year}` : "Anywhere — the first card";
  if (!after) return `After ${before.year}`;
  return `${before.year} – ${after.year}`;
}

function CardRow({ card }: { card: PlacedCard }) {
  return (
    <div className="timeline__card">
      <div className="timeline__year">{card.year}</div>
      <div className="timeline__body">
        <div className="timeline__title">{card.title}</div>
        <div className="timeline__artist">{card.artist}</div>
      </div>
    </div>
  );
}

function SlotRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="timeline__slot"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="timeline__rail" />
      <span className="timeline__target">{selected ? "This song goes here" : label}</span>
    </button>
  );
}

/** Marks a gap the missed card would have fitted. There may be two of these. */
function HintRow() {
  return (
    <div className="timeline__hint">
      <span className="timeline__rail" />
      <span className="timeline__hint-label">It fitted here</span>
    </div>
  );
}

/** The card that was just placed, resolved in place. */
function PlacedRow({
  card,
  correct,
}: {
  card: { year: number; title: string; artist: string };
  correct: boolean;
}) {
  return (
    <div className={`timeline__placed ${correct ? "" : "timeline__placed--wrong"}`}>
      <div className="timeline__body">
        <div className="timeline__result">
          <span className="timeline__verdict">{correct ? "Correct" : "Not here"}</span>
          <span className="timeline__revealed-year">{card.year}</span>
        </div>
        <div className="timeline__title">{card.title}</div>
        <div className="timeline__artist">{card.artist}</div>
      </div>
    </div>
  );
}
