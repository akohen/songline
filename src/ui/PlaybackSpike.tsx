import { useCallback, useEffect, useRef, useState } from "react";
import { isMediaSessionSupported, suppressAll } from "@/playback/mediaSession";
import { PlaybackError, type PlaybackState } from "@/playback/types";
import { WebPlaybackSdkAdapter } from "@/playback/webPlaybackSdkAdapter";

/**
 * Temporary screen for the two de-risking spikes in docs/06-iteration-1-plan.md.
 *
 * S0.1 — does OS-level metadata suppression hold? Only a human looking at macOS
 *        Control Centre can answer that, so this screen exists to make it easy.
 * S0.2 — how long from tap to audible audio, and is startOffsetMs honoured?
 *
 * Deleted once the real round screen exists.
 */

const SPIKE_TRACKS = [
  { id: "2JiDi0qAXsPwhPqA2qaKGt", answer: "Bohemian Rhapsody — Queen (1975)" },
  { id: "7J1uxwnxfQLu4APicE5Rnj", answer: "Billie Jean — Michael Jackson (1982)" },
  { id: "4CeeEOM32jQcH3eN9Q2dGj", answer: "Smells Like Teen Spirit — Nirvana (1991)" },
];

type Props = {
  getAccessToken: () => string | null;
};

export function PlaybackSpike({ getAccessToken }: Props) {
  const adapterRef = useRef<WebPlaybackSdkAdapter | null>(null);
  const [status, setStatus] = useState("Not initialised");
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    return () => {
      adapterRef.current?.disconnect();
      adapterRef.current = null;
    };
  }, []);

  const report = useCallback((err: unknown) => {
    setError(
      err instanceof PlaybackError || err instanceof Error
        ? err.message
        : "Unexpected error",
    );
  }, []);

  const initialize = useCallback(async () => {
    setError(null);
    setStatus("Loading SDK and connecting…");
    try {
      const adapter = new WebPlaybackSdkAdapter(getAccessToken);
      await adapter.initialize();
      adapter.onStateChange(setPlayback);
      adapterRef.current = adapter;
      setStatus("Player ready");
    } catch (err) {
      setStatus("Initialisation failed");
      report(err);
    }
  }, [getAccessToken, report]);

  const play = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter) return;

    setError(null);
    setShowAnswer(false);
    // S0.2: measure tap -> first reported playback.
    const startedAt = performance.now();
    setLatencyMs(null);

    try {
      const track = SPIKE_TRACKS[trackIndex];
      if (!track) return;
      await adapter.playTrack(track.id, offsetMs);
      setLatencyMs(Math.round(performance.now() - startedAt));
      setStatus("Playing");
    } catch (err) {
      report(err);
    }
  }, [trackIndex, offsetMs, report]);

  const ready = adapterRef.current !== null;

  return (
    <section>
      <h1>Playback spike</h1>

      <p>
        <strong>Status:</strong> {status}
        {error && (
          <>
            <br />
            <strong>Error:</strong> {error}
          </>
        )}
      </p>

      {!ready && (
        <button type="button" onClick={() => void initialize()}>
          Initialise player
        </button>
      )}

      {ready && (
        <>
          <h2>S0.2 — playback</h2>
          <p>
            <label>
              Track:{" "}
              <select
                value={trackIndex}
                onChange={(e) => setTrackIndex(Number(e.target.value))}
              >
                {SPIKE_TRACKS.map((t, i) => (
                  <option key={t.id} value={i}>
                    Track {i + 1}
                  </option>
                ))}
              </select>
            </label>{" "}
            <label>
              Start offset (ms):{" "}
              <input
                type="number"
                step={5000}
                min={0}
                value={offsetMs}
                onChange={(e) => setOffsetMs(Number(e.target.value))}
              />
            </label>
          </p>
          <p>
            <button type="button" onClick={() => void play()}>
              Play
            </button>{" "}
            <button type="button" onClick={() => void adapterRef.current?.pause()}>
              Pause
            </button>{" "}
            <button type="button" onClick={() => void adapterRef.current?.resume()}>
              Resume
            </button>
          </p>

          {latencyMs !== null && (
            <p>
              Tap → play request accepted: <strong>{latencyMs} ms</strong>
            </p>
          )}

          {playback && (
            <p>
              {playback.isPlaying ? "▶ playing" : "❚❚ paused"} ·{" "}
              {Math.floor(playback.positionMs / 1000)}s of{" "}
              {Math.floor(playback.durationMs / 1000)}s
              {offsetMs > 0 && (
                <>
                  {" "}
                  · offset requested {Math.floor(offsetMs / 1000)}s (position should start
                  there)
                </>
              )}
            </p>
          )}

          <h2>S0.1 — metadata suppression</h2>
          <p>
            Media Session API supported:{" "}
            <strong>{isMediaSessionSupported() ? "yes" : "no"}</strong>
          </p>
          <p>
            While a track is playing, check these <em>outside the browser window</em>:
          </p>
          <ol>
            <li>macOS Control Centre → Now Playing</li>
            <li>The media controls in the browser toolbar</li>
            <li>Any notification or lock screen</li>
          </ol>
          <p>
            They should read <strong>"Song Timeline / Guess the year"</strong>. If any
            shows the real title, artist or album art, suppression has failed.
          </p>
          <p>
            <button type="button" onClick={() => suppressAll()}>
              Re-apply suppression manually
            </button>{" "}
            <button type="button" onClick={() => setShowAnswer(true)}>
              What is actually playing?
            </button>
          </p>
          {showAnswer && (
            <p>
              <strong>{SPIKE_TRACKS[trackIndex]?.answer}</strong>
            </p>
          )}
        </>
      )}
    </section>
  );
}
