# Codex follow-up: cold-only approach cues and startup

The owner deleted `codex/early-build-playtest`; the branch was restored from its
local commit without resetting or removing other work. Changes in this revision:

- Both creature footstep envelopes fade from 1.8 m to silence at 2.4 m (6–8 ft).
  Local player/teammate footsteps retain their ordinary mix.
- Freezing is the sole automatic Helium Voice approach warning. Distance no
  longer changes breathing, heartbeat, ambience, wind, drone, tremor, flicker,
  sky behavior, stingers or hallucinations. Cold temperature, frost and breath
  condensation remain. Signature/vocals require a visible encounter; ordinary
  vocalizations are additionally restricted to close range. Artificial warning
  snaps/chase stingers are disabled. Real damage and opt-in voice mimicry remain.
- Player breathing uses UncleSigmund's CC0 `breath.wav`, Freesound 30709, obtained
  from a credited public source archive. Only that recording was extracted.
  `assets/audio/PLAYER_BREATH_LICENSE.md` gives provenance and checksum-verified
  reproduction. Synthetic player breaths were removed; creature vocals retained.
- Breath gain is 0.003 at rest and at most 0.018 including exertion/downed states;
  fear/proximity has no influence. Heartbeat gain is 0.006 at rest and below 0.03
  even with exertion/injury. Volume perception still needs desktop listening.
- Default startup tries 8080–8089 and prints the actual URL. Explicit `PORT` or
  `--port` choices are honored, with a readable failure if busy. It never kills
  the service using that port. The Windows launcher keeps the terminal visible.

`EADDRINUSE` means an occupied port, often an already-running game server.
Current builds support `node server/server.js --port 8081`. Older builds support
`set PORT=8081&& node server/server.js` in Windows Command Prompt.

Checks: startup regressions exercise occupied default/explicit ports against
real servers, preserving the first service. Audio regressions use the shipped
PCM, actual runtime phrase/mix helpers, all cue distances and explicit silence.
The browser playthrough verifies the recording decodes and runs the actual game.
The previous managed-browser WebRTC restriction remains; no networking policy
was bypassed and no new claim about remote voice is made.
