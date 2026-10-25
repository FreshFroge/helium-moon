# Codex claim: opaque, closed tree trunks

Owner report, October 25, 2026 (America/Chicago): when the camera gets close to
trees, the player can see inside them. Codex claims the focused tree geometry
and material fix in `client/render/treegen.js`, `client/render/trees.js`, plus a
small regression fixture if needed. The reproduction also found that the extra
sapling lean can move bark past the centered collision cylinder, so the focused
collision-radius alignment in `shared/world.js` is included.
The camera-only collision selection in `shared/physics.js` and
`client/game/player.js` keeps that wider eye-height clearance from changing
creature navigation.

The pass will reproduce the problem in the real browser, close trunk and branch
geometry where the generator currently exposes an interior, verify correct
front/back material rendering at close range, and avoid changing Claude's
reserved Helium Voice rework files.

## Result

The reported appearance had two concrete causes:

- instance X/Z scale came from the procedural archetype's total crown height,
  while collision came from the world's randomized trunk radius; reachable
  trunks could render more than twice as wide as their collider;
- every procedural bark tube ended in an open ring, exposing a hollow shell at
  branch tips and broken snags.

Tree instances now scale horizontally from the same authoritative `trunkR` used
by the world. Each tube gets a tangent-normal cap with its own planar UVs. A
camera-only collision allowance covers the trunk's lean through standing eye
height without widening creature collision or changing AI navigation.

Validation:

- `tests/browser_trees.py`: 16,150 reachable trees checked; worst visible bark
  remains 17.0 cm inside player collision clearance; all 81 generated
  archetype/LOD geometries have one open buried/joined boundary per tube and no
  second hollow tip.
- `tests/browser_perf_budget.py`: all four presets and 16 reference views stay
  within the existing +25% workload budget; quality tiers remain ordered.
- `npm test`: full suite passes, including deterministic world generation,
  end-to-end trail/objective reachability and both creature stuck regressions.

