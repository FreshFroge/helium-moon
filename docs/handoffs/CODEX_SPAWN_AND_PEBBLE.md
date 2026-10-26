# Spawn redesign and searchable pebble distraction — Codex active claim

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
  npm test integration and this handoff/backlog.

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
