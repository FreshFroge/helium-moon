# Codex claim: internet voice reliability and teammate footstep mix

Owner reports that another player is sometimes inaudible and teammate footsteps
are too loud. Codex reproduced the voice failure with two real browsers: both
microphones were live, SDP offer/answer completed, but a restrictive Chromium
network policy yielded no usable ICE candidates, no codec and 0/30 received
speech samples. Gameplay and server-relayed mimic audio remained functional.

Codex claims:

- `client/audio/voice.js` for reconnection and a bounded WebSocket PCM fallback
  addressed only to peers without connected WebRTC;
- `server/server.js` and minimum transport plumbing for validated live-voice
  relay frames;
- teammate footstep gain/range at the existing `game.js` call site;
- focused multiplayer, server and audio tests.

Direct WebRTC/Opus remains preferred. The fallback activates only after the
direct path fails to connect, only while the user-enabled mic is transmitting,
and only inside the current lobby. It must preserve proximity gain, occlusion,
mute/death behavior and privacy. Claude's Helium Voice audio/AI and wildlife
files remain untouched.
