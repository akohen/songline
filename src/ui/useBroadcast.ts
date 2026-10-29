import { useEffect, useRef } from "react";
import { DECKS } from "@/decks/loadDeck";
import type { GameState } from "@/engine";
import { encodeSnapshot } from "@/sync/codec";
import { createTransmitter, type Transmitter } from "@/sync/ggwaveTransport";

/**
 * Broadcast every new game state to nearby phones, while `context` is set.
 *
 * `game` only changes on DRAW and REVEAL, so that is exactly when a packet goes out —
 * including the first draw, made in the Start click before this mounted. The context
 * itself must come from that click (see `createBroadcastContext`); this hook only ever
 * plays into one that is already running.
 *
 * No heartbeat: a snapshot repeats the whole game, so a viewer who missed one is
 * repaired by the next turn. See docs/tech/sound-sync.md.
 */
export function useBroadcast(game: GameState, context: AudioContext | null): void {
  const transmitter = useRef<Transmitter | null>(null);

  useEffect(() => {
    if (context === null) return;
    const created = createTransmitter(context);
    transmitter.current = created;
    return () => {
      created.stop();
      transmitter.current = null;
    };
  }, [context]);

  // Declared after the effect above, so on mount the transmitter already exists.
  useEffect(() => {
    if (context === null) return;
    const bytes = encodeSnapshot(game, DECKS);
    if (bytes !== null) transmitter.current?.transmit(bytes);
  }, [game, context]);
}
