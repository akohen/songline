import { useState } from "react";
import type { HistoryDisplay } from "@/engine";
import type { PlaybackState } from "@/playback/types";

type Props = {
  entries: HistoryDisplay[];
  playbackState: PlaybackState | null;
  onPlay: (index: number) => void;
  onTogglePlayPause: () => void;
  onBack: () => void;
};

/**
 * Every song revealed this game, in play order, from the finished screen.
 *
 * `entries` already has no track ID — it comes straight from `selectHistory` — so
 * playback is driven purely by index: `onPlay(index)` is the only route back to a
 * track ID, and it goes straight to the adapter without ever passing through here.
 */
export function SongHistoryScreen({
  entries,
  playbackState,
  onPlay,
  onTogglePlayPause,
  onBack,
}: Props) {
  // Which row last asked to play. Reversible, UI-only — the engine has no concept of
  // "currently displayed as playing".
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const isPlaying = playbackState?.isPlaying ?? false;

  return (
    <main className="screen">
      <h1 className="screen__title">Songs played</h1>

      {entries.length === 0 ? (
        <p className="screen__body">No songs were revealed this game.</p>
      ) : (
        <ul className="history-list">
          {entries.map((entry, index) => {
            const loaded = playingIndex === index;
            return (
              <li
                key={`${entry.year}-${entry.title}-${entry.artist}`}
                className="history-row"
              >
                <button
                  type="button"
                  className="history-row__play"
                  aria-label={loaded && isPlaying ? "Pause" : "Play"}
                  onClick={() => {
                    if (loaded) {
                      onTogglePlayPause();
                    } else {
                      setPlayingIndex(index);
                      onPlay(index);
                    }
                  }}
                >
                  <span aria-hidden="true">{loaded && isPlaying ? "❚❚" : "▶"}</span>
                </button>
                <div className="history-row__body">
                  <div className="history-row__title">{entry.title}</div>
                  <div className="history-row__artist">{entry.artist}</div>
                </div>
                <div className="history-row__meta">
                  {entry.team !== null && (
                    <span
                      className={`history-row__result ${
                        entry.correct ? "" : "history-row__result--wrong"
                      }`}
                    >
                      Team {entry.team + 1} {entry.correct ? "✓" : "✗"}
                    </span>
                  )}
                  <span className="history-row__year">{entry.year}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="footer">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </main>
  );
}
