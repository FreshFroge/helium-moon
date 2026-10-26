# Spawn redesign and searchable pebble distraction — Codex implementation

Owner request, October 26, 2026 (America/Chicago): completely redesign spawn
to look better, and add unlimited pebbles with a roughly 20-second cooldown;
the distraction works only during Helium Voice's search phase.

Baseline `91bb058`. Shared/Claude branch fetch found no newer changes. Preserve
the traced refuge trail, six-player spawn safety, memo/objective access,
main-river crossing, latest lean/audio fixes and post-hunt recovery rules.

Reservations for this coordinated pass:

- Spawn: `shared/world.js`, `client/render/props.js`, spawn-specific terrain/
  textures/foliage if needed, `tests/spawn.test.mjs`, focused new spawn browser
  evidence. One editor owns map placement and geometry. Coordinate spawnPoint
  changes rather than editing `shared/sim/sim.js` concurrently.
- Pebble simulation: `shared/sim/sim.js`, `shared/sim/heliumVoice.js`,
  pebble config in `shared/config.js`, new `shared/pebble.js`, focused tests.
- Root client/integration: input binding/settings, `client/game/game.js`, new
  pebble view module, audio cue/UI/help/README, multiplayer browser validation,
  npm test integration and this handoff/backlog. `server/server.js` is reserved
  only for a guarded `HM_TEST=1` pebble-phase fixture used by two real clients;
  ordinary server gameplay/transport handling is retained.

Design: a cohesive sheltered timber trailhead with readable signs and paths,
warm restrained lighting, grounded props/planting and a clear dark forest exit.
This is an art/gameplay redesign, not a claim of matching missing real-world
reference photographs. Inspect actual screenshots and collision routes.

Pebbles: G throws by default; unlimited inventory, server-owned per-player
20-second cooldown. Validate life/held state, aiming and trajectory. Only
search permits a useful distraction; impact must also occur while searching.
Helium investigates the impact location rather than the thrower's live position.
Retain normal sight/noise discovery and every post-hunt withdrawal/cooldown gate.
Use visible flight/impact, a quiet positional impact sound and clear cooldown UI.

Git issue/comment ownership remains pending because previous API access was
unavailable. Published Git handoffs coordinate this pass; receipt by Claude or
Kimi is not assumed. Results and release of reservations follow after checks.

## Implemented

Spawn is now an open timber visitor shelter with braced beams, corrugated
pitched canopy, hanging physical signage, a framed map/memo board, benches,
warm lanterns, a grounded gravel court with stone/wood edging and native-style
planting. A continuous gravel approach leads to the signed East Trail portal.
The vehicle gate moved to the parking side. The player begins farther outside
the map board so the first view shows the space; the memo is a short walk away.
All six spawn slots retain dry safe footing, spacing and a clear initial route.

Final refinements include collision clearance, physical sign supports and
reduced lantern-bulb brightness while retaining useful warm illumination.
The right forecourt rail initially overlapped slot 1; moving it outboard resolved
the collision. The old first view cropped the board/header; moving the spawn
outside the shelter improved the composition. Labels have physical backings/
hangers, and lights are unshadowed/local to keep the rendering cost restrained.

The traced trail is identical to the baseline. Comparison against the saved
pre-redesign world confirms all 46,194 existing trees are unchanged: zero
added, removed or modified records. New dressing uses independent randomness.
No source reference photographs were available for a likeness comparison.

G now throws a pebble by default (rebindable). Inventory is unlimited; each
player has a separate authoritative 20-gameplay-second cooldown. Throws are
refused outside search and while held, covered, paused, incapacitated or in an
active attack rush, without spending the cooldown. The server computes a
swept ballistic flight from the player's eye/aim, stopping on actual ground,
water, decks or solid obstacles. Time/range expiry cannot invent a landing.

Both throw and impact recheck search eligibility. A nearby valid impact
redirects search for up to 12 seconds without overwriting real-player memory,
extending the hunt or changing withdrawal/recovery deadlines. Fresh sight or
real player noise overrides it. Clients draw the shared flight, play a quiet
positional stone tap/water splash, and show readiness/countdown in the HUD and
field notebook. Wall contacts/range expiry do not leave floating stones.
Active flights and cooldowns are included in snapshots for join/resync; restart
and leaving clear local visuals. No consumption or pickup loop is required.

## Validation

- `node tests/pebble.test.mjs`: 17 passes, including terrain/deck/water landing,
  thin-wall/trunk collision, finite/range/time limits, independent co-op cooldown,
  phase/life/held/covered/pause restrictions, actual impact redirection, discovery
  overriding decoys, and unchanged hunt/player-evidence clocks.
- `node tests/spawn.test.mjs`: all six collision/spawn sweeps and the full
  forest approach pass; short on-foot memo approach and server/client spawn
  agreement pass. Initial obsolete close-memo expectation was updated.
- `HM_TEST=1 CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_pebbles.py`:
  PASS real G input, visible shared arc, actual Web Audio impact, effective
  search distraction, 20-second reusable cooldown and cleared restart state.
  Two real network clients receive identical two throws/impacts, play impact
  audio, have separate cooldowns, and reject stalking/raw-packet cooldown bypass.
  The guarded server test fixture freezes enemy movement and sets search/stalk;
  action validation, flight, impact and cooldown run through the real server.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_spawn.py`:
  PASS actual W movement 5.118 m and on-foot E memo reading. High-preset first
  view: 436 draw calls / 2,700,924 triangles at 1280×720. Captures inspected at
  `/workspace/artifacts/helium-spawn/` (first view, briefing shelter, overview).
  Extra art viewpoints are staged; this is not a human/GPU performance result.

The changed spawn exposed one older attack fixture that teleported its target
hundreds of metres without resetting movement history. That invented a first
movement direction and changed the hidden stalk route/timing. Setting lastX/Z
to the staged stationary position restores the intended fixture (actual living
target acquisition and damage); all 25 attack checks pass without weakening
the assertions or changing production attack behavior.

Final `npm test`: PASS on Node 24.19.0, including the new pebble regressions,
existing hunt/recovery, lean/perception, animation, world/navigation, objectives,
server/ICE and spawn protection checks. Log:
`/tmp/helium-spawn-pebble-final.log`. No build step is configured; the browser
checks load the real client from the Node server. `git diff --check` passes.

All reservations are released with this final commit. No receipt/activation by
Claude, Kimi or another AI is assumed. Owner review of the playable art/game
feel remains the subjective acceptance check; a preview is included outside Git.
