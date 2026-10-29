# Watching on another phone

In the timeline ruleset only one screen shows the game, which caps the group size it
works for. Watching lifts that for **reading**: any phone in the room can follow the
scores and timelines live — no Spotify account, no sign-in, no network. Placing is
still done on the host's phone.

How it works underneath — ultrasonic packets, the byte layout, why it needs no backend
— is in [../tech/sound-sync.md](../tech/sound-sync.md).

## Host: "Let others join"

A toggle on the game start screen, under Teams.

- **Shown only in timeline mode.** A songs-only game has nothing for a viewer to show.
- **Off by default.** It puts an ultrasonic signal into the room on every turn; that
  should be a choice.
- **Applies to Start and Resume alike.**
- **Can be changed mid-game** from the menu (timeline games only). Switching it on sends
  the current game at once, so phones already listening catch up without waiting for
  the next turn. Switching it off stops broadcasting immediately.
- **A session setting, not game state.** It is kept while the app is open — going back
  to choose another deck keeps it — but it is not in `GameState` and not in the save.

With it on, the host phone sends a short burst at 15–19.5 kHz (1–2.5 s) after every
draw and every reveal. Nothing is sent otherwise. How audible that is depends on the
listener — younger ears can catch the bottom of that band — and has not been checked
in a room.

## Viewer: "Join a game"

A secondary button on the sign-in screen, under "Sign in with Spotify". The tap opens
the watch screen and asks for the microphone in one go; Back returns to sign-in.

The watch screen shows:

| State | Shown |
|---|---|
| Not HTTPS | "Watching needs a secure connection" — open the app's https address |
| Mic denied | Why the mic is needed, and a Try again button |
| Listening, nothing yet | "Waiting for the host…" — until the first valid packet |
| Incompatible packet | "Update the app" — the host runs a different version or deck |
| Live | Scores, "Team N", the current team's timeline, the reveal when it happens |
| Finished | Final scores |

Plus a small "Updated N s ago" line, so a viewer can tell a quiet room from a lost
signal. The screen keeps itself awake.

**Read-only.** The viewer timeline has no slots and nothing to tap. It shows the same
timeline the host shows: the placing team's during the reveal, the next team's
otherwise.

**No spoilers.** A viewer cannot learn anything the host's screen does not already show:
an in-play packet carries no trace of the song, and a viewer can only reach the reveal
because the host revealed.

**Late joiners** catch up on the next draw or reveal — each packet is the whole picture.

## Not built

- A host "resend" for late joiners — they wait one turn.
- Browsing other teams' timelines — the viewer shows what the host shows.
- Viewers placing cards or sending anything back.
- Watching a songs-only game.
