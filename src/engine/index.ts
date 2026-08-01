/**
 * The engine's public surface. UI code imports from here and nowhere else, so the
 * reachable API is an explicit choice rather than whatever happens to be exported.
 *
 * Note what is absent: there is no way to reach a Card except through
 * `selectRevealedCard`, which returns null until the reveal.
 */
export { createGame } from "@/engine/createGame";
export { deserialize, serialize } from "@/engine/persistence";
export { reduce } from "@/engine/reduce";
export {
  type RoundDisplay,
  selectRevealedCard,
  selectRoundDisplay,
  selectStartOffsetMs,
  selectTrackIdForPlayback,
} from "@/engine/selectors";
export { clearGame, loadGame, saveGame } from "@/engine/storage";
export {
  ALL_PHASES,
  type GameEvent,
  type GameState,
  type Phase,
} from "@/engine/types";
