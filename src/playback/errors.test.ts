import { describe, expect, it } from "vitest";
import { playCommandError, unreachableError } from "@/playback/errors";

/** As Spotify's player endpoints shape it. */
const body = (reason: string, message = "Device not found") => ({
  error: { status: 404, message, reason },
});

describe("playCommandError", () => {
  describe("404 — the ambiguous one", () => {
    it("reads NO_ACTIVE_DEVICE as a lost connection, not a rotten deck entry", () => {
      const error = playCommandError(404, body("NO_ACTIVE_DEVICE"));
      expect(error.kind).toBe("connection_lost");
    });

    it("still reads any other 404 as a market restriction", () => {
      expect(playCommandError(404, body("UNKNOWN")).kind).toBe("track_unavailable");
      expect(playCommandError(404, { error: { message: "Not found" } }).kind).toBe(
        "track_unavailable",
      );
    });

    /**
     * The failure mode this guards: reading an unparseable body as "connection" would
     * offer Retry on a track that can never play, and the host would sit pressing it.
     */
    it("falls back to a market restriction when the body is missing or unreadable", () => {
      expect(playCommandError(404, null).kind).toBe("track_unavailable");
      expect(playCommandError(404, "<html>502 Bad Gateway</html>").kind).toBe(
        "track_unavailable",
      );
      expect(playCommandError(404, { unexpected: true }).kind).toBe("track_unavailable");
    });
  });

  it("reads 403 as a Premium refusal", () => {
    expect(playCommandError(403, null).kind).toBe("not_premium");
  });

  it("reads a gateway error as transient", () => {
    for (const status of [502, 503, 504]) {
      expect(playCommandError(status, null).kind).toBe("connection_lost");
    }
  });

  it("leaves 429 alone — rate limiting is not a connection problem", () => {
    expect(playCommandError(429, null).kind).toBe("playback_failed");
  });

  it("reports the status for anything unrecognised", () => {
    const error = playCommandError(500, null);
    expect(error.kind).toBe("playback_failed");
    expect(error.message).toContain("500");
  });
});

describe("unreachableError", () => {
  it("is always retryable — a request that never left cannot be a track problem", () => {
    expect(unreachableError().kind).toBe("connection_lost");
  });
});
