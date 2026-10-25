# Codex → Claude: two-AI multiplayer playthrough video

Owner request: “is there any way you and Claude could do a multiplayer
playthrough of the game and both voice over it and record it”, followed by the
clarification that the agents should converse through the in-game voice chat.
Yes. Our cloud agents cannot directly perceive a continuous microphone stream,
so turns will be slower than human conversation, but the audio itself can travel
through the game's real WebRTC proximity voice channel.

Each turn follows this honest bridge:

1. An agent authors a line from its current game state and the prior transcript.
2. A distinct generic text-to-speech voice renders the line.
3. The rendered audio is injected into that player's live `MediaStreamTrack` as
   its microphone source.
4. The other browser receives it through the actual peer connection, positional
   proximity gain and obstruction filter.
5. The exact text is also appended to a private machine-readable transcript so
   the receiving cloud agent can understand and answer; the transcript does not
   appear to the player or bypass game audio in the recording.

This is a genuine in-game voice-chat transport with agent-authored turns. It is
not a claim that either model has biological ears or that sub-second overlapping
conversation is possible.

## Production split

### Codex

- Build `tools/record_multiplayer_playthrough.py` from the existing real-server,
  two-browser harness and replay/video tooling.
- Record both 16:9 viewpoints, authoritative snapshots/events, player actions,
  UI state, and a synchronized timeline.
- Build the virtual-microphone bridge so generated Claude/Codex speech uses the
  same WebRTC route and proximity mix as player speech.
- Log every voice turn and its send/receive timestamps, while keeping the
  transcript out of the rendered game view.
- Use distinct roles: Codex prioritizes objectives/navigation; Claude prioritizes
  lookout, flashlight defense and teammate support.
- The publishable run must use ordinary networking, collision, objectives and
  AI. No debug teleport, enemy freeze, forced hit, or staged encounter.
- Produce a split-screen review cut and, if useful, a single-camera edited cut.
- Preserve the voice chat already captured inside each client's game-audio mix.
  Use post commentary only for brief retrospective remarks that were not part of
  the live turn-taking.

### Claude request

- Review this plan and provide a way to author Claude's next voice-chat turn from
  a compact state packet and transcript. If the two active cloud sessions cannot
  share a live public server reliably, author a bounded response policy and
  phrase bank before the run, then review the transcript afterward. The video
  disclosure will distinguish that fallback from live agent-authored turns.
- If your ZipVoice/TTS environment permits, render two clearly different,
  generic synthetic narrator voices: one for Claude's authored comments and one
  for Codex's authored comments. **Do not use the consented Helium Voice clone
  for either narrator**; that voice is a character asset and would confuse the
  recording.
- Return WAV or OGG live-turn/narration clips plus a JSON cue sheet:
  `{start, end, speaker, text, file}`.
- Keep each comment brief so game audio and scares have silence around them.

## Proposed finished video

- 6–10 minutes, 1280×720 or 1920×1080.
- Opening card for a fully bridged run: “Real Helium Moon multiplayer session.
  Two automated AI players. Agent-authored speech is carried through in-game
  proximity voice; a text transcript provides model access to each turn.” If a
  pre-authored fallback is used, state that instead.
- Mostly one POV full-screen; split screen when the players separate or witness
  different information.
- On-screen speaker labels for commentary; optional subtitles generated from
  the exact cue sheet.
- No claim that either agent physically heard a microphone or that an automated
  route is a human playtest. Do claim real WebRTC voice only if the receiving
  peer's track and Opus statistics confirm it during that run.

## Technical basis already present

- `tests/browser_multiplayer.py`: two real browser clients, lobby, authoritative
  server, synchronized avatars, chat, proximity WebRTC and revival.
- `tests/hunt_playtests.mjs`: records server snapshots and events.
- `tools/render_hunt_replay.py`: captures rendered frames and encodes MP4 with
  FFmpeg.
- `/usr/bin/chromium` and `/usr/bin/ffmpeg` are available in Codex's environment.
- Claude has already rendered hunt videos and currently has the ZipVoice voice
  generation pipeline.

## Risks to solve

- Playwright's standard video capture does not include Web Audio. Codex will
  route each client's Web Audio master to a `MediaStreamAudioDestinationNode`
  and save the audio separately, then mux it.
- Two SwiftShader clients plus capture may exceed cloud memory. Start at
  960×540 Low, capture one POV at a time from a recorded authoritative timeline
  if simultaneous video is unstable, and preserve identical snapshots for both.
- Cross-browser WebRTC can be blocked by managed Chromium policy. If it is
  blocked, do not present locally mixed speech as in-game conversation. Run on
  a machine/network where the peer track connects or configure TURN, then verify
  received Opus packets and audible output before recording.
- A full unassisted objective route needs robust navigation policies. Failed
  runs remain evidence, not footage to misrepresent as a successful live run.

Codex has claimed only the new recorder and video artifacts. Existing Claude
voice, wildlife, AI-learning and renderer files remain yours.
