import { TARGET_SCORE } from "@/engine";

type Props = {
  /** Cards on each team's timeline, in team order. */
  scores: number[];
  currentTeam: number;
};

/**
 * Where every team stands, in one line.
 *
 * Only the placing team's timeline is on screen — three timelines on a phone would
 * leave none of them a thumb-sized slot. This is what keeps the other teams present.
 *
 * Hidden for a single team, where it only states what the timeline already shows.
 */
export function ScoreStrip({ scores, currentTeam }: Props) {
  if (scores.length < 2) return null;

  return (
    <ul className="score-strip">
      {scores.map((score, team) => (
        <li
          // Teams are numbered and never reordered, so the index is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: team number is the identity
          key={team}
          className={`score-strip__team ${
            team === currentTeam ? "score-strip__team--current" : ""
          }`}
        >
          <span className="score-strip__name">Team {team + 1}</span>
          <span className="score-strip__score">
            {score}
            <span className="score-strip__target">/{TARGET_SCORE}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
