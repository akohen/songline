import { useState } from "react";

type Props = {
  /** Teams in the current game; 0 is the paper ruleset. */
  teamCount: number;
  onConfirm: (teamCount: number) => void;
  onCancel: () => void;
};

const MIN_TEAMS = 1;
const MAX_TEAMS = 6;

/**
 * Game mode and team count — the only two things there are to choose.
 *
 * Reachable only before the first draw, because the ruleset is fixed for the life of
 * a game: turning the timeline on at round 40 would deal empty timelines into a
 * half-played deck. Changing it afterwards means going back to deck select, which
 * already clears the save.
 *
 * Teams are numbered rather than named. A name is a text input, a keyboard over the
 * screen and a per-team row, for something everyone in the room already knows.
 */
export function CustomiseGameScreen({ teamCount, onConfirm, onCancel }: Props) {
  const [timeline, setTimeline] = useState(teamCount > 0);
  // Remembered while the paper ruleset is selected, so toggling back and forth does
  // not silently reset a choice the host already made.
  const [teams, setTeams] = useState(Math.max(teamCount, 2));

  return (
    <main className="screen">
      <h1 className="screen__title">Customise game</h1>

      <ul className="deck-list">
        <li>
          <button
            type="button"
            className="deck-card"
            aria-pressed={!timeline}
            onClick={() => setTimeline(false)}
          >
            <div className="deck-card__name">Songs only</div>
            <div className="deck-card__meta">
              You keep the timeline on paper. No teams, no score.
            </div>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="deck-card"
            aria-pressed={timeline}
            onClick={() => setTimeline(true)}
          >
            <div className="deck-card__name">Timeline in the app</div>
            <div className="deck-card__meta">
              Place each song on your team's timeline. First to 10 cards wins.
            </div>
          </button>
        </li>
      </ul>

      {timeline && (
        <div className="stepper">
          <span className="stepper__label" id="team-count">
            Teams
          </span>
          <div className="stepper__controls">
            <button
              type="button"
              className="stepper__button"
              aria-label="One fewer team"
              disabled={teams <= MIN_TEAMS}
              onClick={() => setTeams((n) => Math.max(MIN_TEAMS, n - 1))}
            >
              −
            </button>
            <output className="stepper__value" aria-labelledby="team-count">
              {teams}
            </output>
            <button
              type="button"
              className="stepper__button"
              aria-label="One more team"
              disabled={teams >= MAX_TEAMS}
              onClick={() => setTeams((n) => Math.min(MAX_TEAMS, n + 1))}
            >
              +
            </button>
          </div>
        </div>
      )}

      {timeline && teams === 1 && (
        <p className="screen__body">
          One team is a fine game on its own — you are building a single timeline
          together.
        </p>
      )}

      <div className="spacer" />

      <div className="footer">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onConfirm(timeline ? teams : 0)}
        >
          Start a new game
        </button>
        <button type="button" className="btn btn--tertiary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </main>
  );
}
