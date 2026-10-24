# HELIUM MOON

Co-op survival horror on the East Trail of Stinchcomb Wildlife Refuge, Oklahoma City, 10:00 PM under a waxing-gibbous "Helium Moon". Restore emergency comms (generator → trail relay → repeater mast), then reach the county cruiser at the highway bridge, while Helium Voice stalks you through the trees and Sulfur Hexafluoride waits in the brush.

This is a **work-in-progress build**: the full game loop is playable in single player and co-op; see "Status" below for what is tested and what is not.

## Play

**Single player (no install):** open the hosted page and click *Single Player*.

**Local / multiplayer (2–6 players, proximity voice):**

```
node server/server.js          # Node 18+; no npm install needed
```

Open `http://localhost:8080` (friends on your network use `http://<your-LAN-IP>:8080`). One player chooses *Multiplayer → Create lobby* and shares the 5-letter code; others *Join*. The host starts the game. Over the internet you need a port-forward or a tunnel to port 8080 (and for voice chat, players behind strict NATs may need a TURN server; only public STUN is configured).

Headphones strongly recommended. Chrome, Edge or Firefox with hardware acceleration; WebGL 2 required.

## Controls

WASD move · Shift sprint · C / Ctrl crouch · Space jump · E interact (hold to repair / revive) · F flashlight · Tab objectives, notes & temperature · V push-to-talk · Enter text chat · Esc pause · F3 performance overlay. All keys can be rebound in Settings → Controls.

## Microphone, voice chat and mimicry (privacy)

- The microphone is only requested when you press **Enable microphone** in Settings → Voice & Mic. Nothing is transmitted unless you are holding push-to-talk (default) or the open-mic gate is open. Mute = turn the microphone off.
- Voice chat is peer-to-peer WebRTC (Opus), mixed by distance: clear within 5 m, quieter 10–20 m, muffled beyond, silent past 46 m, low-passed when trees or terrain are in the way. The creatures react to how loud you are, never to what you say (no speech recognition).
- **Voice mimicry is a separate opt-in.** When on, 0.9–4 s phrases you say while transmitting are kept in browser memory only (max 6, 2-minute expiry). The server only ever sees a phrase id and duration. When the sim picks one, your own browser pitch-shifts and distorts it, plays it from a concealed spot 15–35 m behind the listener, shares that processed clip with your lobby once, and deletes the original. Nothing is saved, uploaded to any speech service, or used for training. Turning mimicry or the microphone off, or leaving the session, deletes everything immediately. Capture is suspended while mimicry or the signature line is playing, so the game cannot record its own output. Echo cancellation is requested; use headphones.

## Status (honest)

Verified by automated tests in this build (`npm test` for the sim + server, `python3 tests/browser_multiplayer.py` for two browsers, plus headless single-player runs):

- World: traced East Trail (1.84 km), ~46k trees, dense undergrowth; the whole trail is walkable end to end; world generation is deterministic (server and clients agree).
- Full single-player loop in the browser: memo → gas can → generator (10 s hold) → fuse kit → relay → repeater mast → extraction → victory screen → Play Again (fresh randomized layout). All objectives reachable on 5 random layouts.
- Creatures in-game: Helium Voice (your likeness, 6'3", ~220 lb, red shirt, black shorts, green/white sneakers, swim cap, glasses) and SF6 render and animate; AI stalks, watches, freezes when observed, retreats from the light, chases rarely, hits; the signature recording plays on first sighting (75% first time, then 40%, 95 s cooldown); SF6 lurks, prowls, emerges with the foot-stamp warning, gasses. Creatures never teleport.
- Terror radius per player (120/80/40/15 m): temperature drop and breath condensation, insects falling silent, heavier breathing, heartbeat, flashlight flicker, tremor, frost at the screen corners, peripheral apparitions, distortion at the critical ring.
- Multiplayer server (protocol test, 28 checks): lobby codes, join/leave, host-only start, host migration, snapshots, chat, WebRTC signalling relay, mimic event + audio relay, co-op downed → teammate revive, return to lobby, restart.
- Two real browsers through the server (27 checks, `tests/browser_multiplayer.py`): lobby via the menus, teammates' avatars and positions in sync, WebRTC voice (Opus) peer-to-peer with simulated microphones, open-mic gating and push-to-talk, proximity mix (full at 3 m, ~57% at 15 m, muffled to ~4 kHz at 28 m, silent at 60 m), phrases captured in memory only for the player who opted in, a mimicry event played on both clients and the phrase deleted, opt-out wiping all phrases, text chat, revive by holding E, mic off stops transmission.

Implemented but **not yet verified end-to-end**:

- Voice over the internet between different networks (only same-machine WebRTC was tested; strict NATs may need a TURN server).
- Performance on real GPUs. Testing here used a software renderer (very slow, no meaningful frame-rate numbers); quality presets, adaptive resolution and LOD exist but have not been tuned on hardware yet.

Known limitations:

- The hosted single-player page cannot use the microphone or multiplayer (the host blocks WebRTC and outside connections); use the downloadable build for those.
- Lenses on Helium Voice's glasses use a simple tinted material (a mirror-like one crashed software renderers).
- Rare server ticks can take up to ~50 ms when a creature plans a long route (normally ~0.1 ms).

## Project layout

`client/` browser game (rendering, audio, voice, UI) · `shared/` world generation and the authoritative simulation (runs in the browser for single player and in Node for multiplayer) · `server/` zero-dependency HTTP + WebSocket server · `assets/` textures, characters, the signature recording · `tools/` asset build scripts (Python) · `tests/` automated tests.

See `CREDITS.md` for third-party licenses.
