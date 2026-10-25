# Codex playtest handoff

- **Branch:** `codex/early-build-playtest`
- **Base:** editable source from release `v0.1`, imported in commit `459eb57`.
- **Asset SHA256:** `bc26b9f24d593064ad6a737aca3f10ee29587dc0b2f10f5465f4d42f5abc0b4b`.

The owner requested playthroughs and code changes, then reported overly obvious
creatures, excessive/loud warning sounds, an oversized skunk, stiff Helium Voice
animation, a bridge floating above dirt, loud unnatural breathing, and a confusing
spawn. This branch addresses those reports. It does not update Claude's separately
hosted artifact or replace the original release asset.

## Changes for players

- Terror rings are **80 / 50 / 25 / 10 m**, measured in 3D. Cold stays the first
  subtle cue; insects retain some natural ambience. Stronger drone, heartbeat,
  tremor, flicker, peripheral apparitions and sighting stingers start closer and
  overlap less. Balance remains tunable in `shared/config.js`.
- Helium Voice footsteps fade between **6–22 m**, with stalking quieter than
  chasing. Skunk footsteps fade between **3–12 m**, routine calls between
  **6–18 m**, and imminent danger calls between **12–26 m**. Real gain envelopes
  reach silence; inverse-distance panner settings alone do not mute sounds.
- The skunk model is **0.6 times its original size**. Gait cadence, head/eyeshine
  position, beam bounds, vocal height and flashlight perception follow its size.
  Creature sensing and gas danger were retained.
- Player breathing uses separate soft airflow clips with varied durations and
  envelopes. Rest/fear-only playback is very quiet; substantial panting follows
  exertion. Monster vocals were not replaced. Cold-breath rendering still works.
- Helium Voice gets corrected compound-leg IK, heel/toe roll, asymmetric stalk
  timing, acceleration/braking, turn lean, idle weight shifts and independent
  torso/head turns. Creature-only layers are separated from teammate animations.
- A real wet channel remains beneath the timber bridge. Supports, cross-bearers
  and short ramps meet its banks; visible plank tops match collision. The span
  is slightly wider so the navigation grid can cross it. The trail was not moved.
- Six spawn slots gather beside the existing kiosk and face a clear route into
  the refuge. The first player can turn to read the nearby memo instead of
  starting far away facing backward.

## Additional playthrough fixes

- Event ordering uses `seq` and preserves semantic item/station `id` values.
  Generator/relay/radio feedback now reaches the right object.
- Connected local footsteps and normal-jump landing sounds. Connected the
  existing item glints, generator work light and extraction strobes to updates.
- Solo pause freezes battery, movement and gameplay clocks with the simulation.
  Multiplayer authority continues while a local menu is open.
- Switching transport closes the old socket and voice peers. Rejected joins
  close their connection, preventing ghost lobby members and stale identity.
- Moved the shed generator/item outside solid building collision. Moved the
  overlook relay and possible critical pickup from deep water to the nearby
  dry bank. All eight generator/relay variants have tested accessible repairs.
- Note prompts identify the note being read. Quality-setting guidance explains
  which changes require reload. An inline icon removes the missing favicon error.

## Reproduction and evidence

Run the source from its repository root with `node server/server.js` (Node 18+
for play; Node 22+ for the protocol tests). Dependencies/assets are vendored;
no `npm install` or asset regeneration is required. This work used Node 24 and
system Chromium with a software renderer.

```sh
npm test
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_playthrough.py
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_sessions.py
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_multiplayer.py
```

- Node checks pass for events, real cue envelopes, synthesized breathing samples,
  actual rig poses, bridge traversal, all six spawn slots, objective placement and
  repair, deterministic simulation and server protocol.
- Browser progression passes movement, sprint/crouch/flashlight, local sounds,
  pause/resume, actual audio cutoffs and cold exhale, memo, required pickups,
  repairs, extraction, victory, death and restart. Objective tests position the
  player next to equipment and freeze threats to isolate interactions. They are
  **not an unassisted human survival session**.
- A live-AI trail traversal ran six accelerated minutes; another ended with an
  actual player death after about three minutes. Both exercised stalking/chase,
  vocal/signature and hit events without uncaught browser errors. Audio routing
  is suppressed during this accelerated traversal so minutes of samples do not
  accumulate on a real-time audio clock.
- Browser lifecycle checks pass old-socket closure, host migration, rejected join
  cleanup, retry identity and leaving. Two-client checks pass movement, avatars,
  text chat, revival, microphone controls, phrase capture, opt-out, processed mimic
  relay and phrase deletion.
- **Three voice assertions fail in this cloud environment:** connected WebRTC,
  actual received Opus and remote audible speech. Managed Chromium has
  `WebRtcIPHandling=disable_non_proxied_udp`. Both sides exchange offer/answer and
  reach stable signalling, but ICE yields only unusable TCP wildcard candidates
  and no working pair. An independent minimal peer test shows the same restriction.
  The browser policy and failing assertions remain intact. The suite exits 1;
  voice has not been marked verified. Cross-network testing is also outstanding.
- Visual checks rendered the smaller skunk, Helium Voice stalk/head-turn poses
  and bridge approaches/supports. Software-renderer screenshots are not evidence
  of real-GPU performance, exact reference likeness or polished animation feel.

## Next useful review for Claude and Kimi

Read this branch before changing the original build. Please review specific
diffs and record tested outcomes rather than starting another implementation.
Priority follow-ups are desktop listening/balance feedback, a real-GPU animation
and performance pass, and voice on browsers/networks that permit WebRTC (TURN
may be needed for strict NATs; remote microphones normally require HTTPS).

The original face, trail-map and environment photos are still not present here.
The overlook bench scenery itself remains near submerged terrain; only the
gameplay-critical objects there were relocated in this pass. Small-screen menu
panels can also overlap navigation and need a focused responsive-layout pass.

No acknowledgement or review by Claude/Kimi is assumed merely because this
handoff is committed. The owner must start their sessions or configure a real
notification integration.
