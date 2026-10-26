# HELIUM MOON

Co-op survival horror on the East Trail of Stinchcomb Wildlife Refuge, Oklahoma City, 10:00 PM under a waxing-gibbous "Helium Moon". Restore emergency comms (generator, trail relay, far-bank aerial, then the repeater mast), then reach the county cruiser at the highway bridge, while Helium Voice stalks you through the trees and Sulfur Hexafluoride waits in the brush.

This is a **work-in-progress build**: the full game loop is playable in single player and co-op; see "Status" below for what is tested and what is not.

## Updated playtest build

Collaboration update: Claude independently reviewed the attack fix and identified
expensive retreat searches. Those searches now fully test fewer candidate
destinations while retaining strict hiding checks. Helium Voice's walking and
reverse crawl also follow the actual terrain and bridge surfaces. See
[the active collaboration handoff](docs/handoffs/CODEX_COLLABORATION_ACTIVE.md).

Latest attack fix: a first-sighting chase now uses its newly selected target
immediately, instead of aborting into retreat. Interrupted chases also release
the director's chase flag. Regression coverage now starts encounters without a
preassigned target or awareness; see
[the attack-fix handoff](docs/handoffs/CODEX_FIRST_SIGHTING_ATTACK.md).

**Claude returning to the project:** read the
[Codex collaboration message](docs/handoffs/CODEX_TO_CLAUDE.md) before integrating
your next version. It records the owner's shared horror-design goal and current
playable branch, and provides a reply location for coordination with Codex/Kimi.

**Kimi joining the active build:** read the current
[Codex-to-Kimi handoff](docs/handoffs/CODEX_TO_KIMI.md). It assigns an independent
rendered Puppet playtest that avoids Claude's AI/animation files and Codex's
audio work, with `KIMI_TO_TEAM.md` as the reply location.

Latest behavior follows the owner's clarified instructions: Helium Voice can
attack unseen, including from behind. A committed pursuit no longer waits for
a close on-screen sighting. Spotting him outside contact range sends him toward
cover in a fast **reverse bear crawl**; an already committed contact strike can
still land. Hiding spots require full silhouette occlusion from teammates.
Opening dread keeps him farther away before his first appearance, and pursuit
becomes stronger as the session progresses. Both creatures are excluded from
the protected spawn area, including direct movement shortcuts.
See `docs/handoffs/OWNER_DECISIONS_2026-10-25.md` for the current design;
earlier encounter handoffs describe previous builds.

Cover-seeking path detours, the skunk's bite-range lunge, removal of the train
horn and the slightly stronger steady ambient wind remain in this build.

This revision starts from the editable source in the original `v0.1` release.
It keeps the terror rings at **80 / 50 / 25 / 10 metres**, with **freezing as the
only automatic approach warning**. Both creatures' footsteps fade between
**1.8–2.4 m (about 6–8 feet)** and are silent beyond that. No proximity heartbeat,
panting, insect silence, drone, stinger, tremor or flashlight glitch reveals him.
The skunk remains **40% smaller**. Player breathing now uses an attributed CC0
recording instead of synthesis; breathing and heartbeat are much quieter and
follow exertion/injury, never creature distance.

Helium Voice has revised foot placement, heel/toe roll, weight shifts and
head/torso turns. The wood bridge now spans a wet channel with supported ramps.
Players start beside the kiosk facing the trail. Repairs, item feedback, local
footsteps, solo pause and switching between multiplayer and single player also
received fixes. See `docs/handoffs/CODEX_PLAYTEST.md` for evidence and limitations.

Download the updated branch ZIP from GitHub, unzip it, and run the command below
**inside the extracted folder containing `package.json`**. The original `v0.1`
release ZIP and Claude's separately hosted page do not update automatically.

## Play

**Single player (no install):** open the hosted page and click *Single Player*.

**Local / multiplayer (2–6 players, proximity voice):**

```
node server/server.js          # Node 18+; no npm install needed
```

Open `http://localhost:8080` (friends on your network use `http://<your-LAN-IP>:8080`). One player chooses *Multiplayer → Create lobby* and shares the 5-letter code; others *Join*. The host starts the game. Over the internet you need a port-forward or a tunnel to port 8080. Voice tries direct WebRTC first and automatically uses the same authenticated game connection when a firewall or strict NAT blocks the direct route.

For lower-latency direct voice across strict NATs, you can optionally start the server with a TURN service, e.g.
`TURN_URL=turn:turn.example.com:3478 TURN_USERNAME=user TURN_CREDENTIAL=pass node server/server.js`
(or `HM_ICE_SERVERS='[{"urls":"turn:...","username":"...","credential":"..."}]'`). The server passes the list to every
client in its welcome message; TURN credentials therefore reach players' browsers, so prefer short-lived ones.

**Windows:** double-click `start-game.cmd`, keep its window open, and open the
address it prints. If 8080 is busy, an unconfigured start tries 8081 through 8089.
Use the printed address and its port for all players and any port-forward.
No existing program is stopped or replaced. To choose a port explicitly:

```sh
node server/server.js --port 8081
```

In an older build without `--port`, Command Prompt also supports
`set PORT=8081&& node server/server.js`. Stop a game server with Ctrl+C in its own
terminal before launching another copy. An explicitly selected busy port exits
with instructions rather than silently moving to another port.

Headphones strongly recommended. Chrome, Edge or Firefox with hardware acceleration; WebGL 2 required.

## Controls

WASD move · Shift sprint · C / Ctrl crouch · Space jump · E interact (hold to repair / revive) · F lighter · Q / R lean · X camouflage blanket (hold while crouched and still, if carried) · Tab field map, supply register, objectives & notes (hold) · V push-to-talk · Enter text chat · Esc pause · F3 performance overlay. All keys can be rebound in Settings → Controls.

Read the kiosk memo for this session's gas-can and fuse-kit locations. The field
map marks the trail, landmarks and your position. Repairs have three steps;
completed steps stay saved if you leave to hide, and nearby teammates can help.
Take the marked river service path near Fishing Bank to cross the main river.
Recover the handwheel at the far-bank landing and press E to turn the aerial
clockwise toward the mast bearing printed in the memo and on the controls.
Its green light confirms alignment; it stays locked when you leave. The mast
call requires the generator, relay and aerial. The river maintenance crossing
is a fictional gameplay addition to the traced map.
Hunts begin with 15–20 seconds of concealed stalking, followed by a 30–40 second
search. He can rush you if he actually finds you; surviving that search ends the
hunt. Crouch in cover, switch off the lighter and stay quiet to avoid discovery.

Local unattended playtest scheduling and its cloud-session limitations are
documented in [docs/UNATTENDED_CHECKS.md](docs/UNATTENDED_CHECKS.md).

## Microphone, voice chat and mimicry (privacy)

- The microphone is only requested when you press **Enable microphone** in Settings → Voice & Mic. Nothing is transmitted unless you are holding push-to-talk (default) or the open-mic gate is open. Mute = turn the microphone off.
- Voice chat prefers peer-to-peer WebRTC (Opus). If a peer has no direct route after four seconds, live 16 kHz audio is addressed only to that peer through the authenticated lobby WebSocket; it is not stored. Both paths use the same proximity mix: clear within 5 m, quieter 10–20 m, muffled beyond, silent past 46 m, and low-passed when trees or terrain are in the way. The creatures react to how loud you are, never to what you say (no speech recognition).
- **Voice mimicry is a separate opt-in.** When on, 0.9–4 s phrases you say while transmitting are kept in browser memory only (max 6, 2-minute expiry). The server only ever sees a phrase id and duration. When the sim picks one, your own browser pitch-shifts and distorts it, plays it from a concealed spot, shares that processed clip with your lobby once, and deletes the original. During selected hunts, Helium Voice can use an opted-in teammate's phrase 16–30 m away and broadly opposite his real approach; he never uses the hunted player's own phrase for this distraction. Nothing is saved, uploaded to any speech service, or used for training. Turning mimicry or the microphone off, or leaving the session, deletes everything immediately. Capture is suspended while mimicry or the signature line is playing, so the game cannot record its own output. Echo cancellation is requested; use headphones.

## Status and validation

Developer checks (Node 22+ is needed for the protocol test's built-in WebSocket;
this revision was checked with Node 24):

```sh
npm test
python3 tests/browser_playthrough.py
python3 tests/browser_sessions.py
python3 tests/browser_multiplayer.py
```

The browser checks additionally need Python Playwright and Chromium. The
multiplayer audio check needs FFmpeg. Set `CHROMIUM_EXECUTABLE_PATH` if using an
existing browser instead of Playwright's downloaded Chromium, for example:

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_playthrough.py
```

- Simulation/protocol checks cover deterministic world generation, whole-trail
  collision, five objective layouts, events, creature pacing, lobby lifecycle,
  chat, revives, and snapshots. Additional regressions cover cue envelopes,
  breathing signals, actual rig poses, six spawn slots, bridge traversal, and
  all eight generator/relay combinations, including collision-clear repairs.
- The scripted browser progression uses positioning fixtures and frozen threats
  to isolate memo/pickup/repair/extraction/victory/death/restart behavior. It also
  checks real keyboard movement, pause, actual Web Audio range cutoffs and cold
  condensation. A separate accelerated trail traversal keeps AI on for up to
  six simulated minutes, stopping if the player dies.
  These checks do not replace a human survival playtest or a listening session.
- Session regressions exercise actual socket closure and host migration when
  changing modes, rejected joins, retries and leaving.
- Two actual browser clients verify player synchronization, text chat, revive,
  microphone gating, phrase capture/opt-out and processed mimic clip relay. The
  managed cloud Chromium cannot create a direct UDP route; that case now verifies
  the automatic lobby relay, audible remote activity, proximity filtering and
  push-to-talk/open-mic behavior with no page errors.

Remaining limitations:

- Real-GPU frame rate and subjective balance, sound quality and animation feel
  still need desktop playtesting. Breathing is now a sourced CC0 recording.
- Direct WebRTC and TURN still need unrestricted cross-network desktop testing;
  the authenticated lobby fallback passed under the managed browser restriction.
- The original hosted page cannot use multiplayer/microphone; use this source
  build on the Node server. Microphone access on non-localhost addresses normally
  requires HTTPS; a LAN address served over plain HTTP may play co-op without mic.
- Reload after changing quality presets to apply forest density and all shadows.
- Original face/trail/environment reference images are not included here, so
  this revision makes no new claim of exact visual/geographic matching.
- The existing overlook bench itself sits near submerged terrain; its relay and
  possible critical pickup have been moved to the nearby dry bank. Scenery
  placement at that landmark remains a follow-up.

## Project layout

`client/` browser game (rendering, audio, voice, UI) · `shared/` world generation and the authoritative simulation (runs in the browser for single player and in Node for multiplayer) · `server/` zero-dependency HTTP + WebSocket server · `assets/` textures, characters, the signature recording · `tools/` asset build scripts (Python) · `tests/` automated tests.

See `CREDITS.md` for third-party licenses.
