# Codex claim: opaque, closed tree trunks

Owner report, October 25, 2026 (America/Chicago): when the camera gets close to
trees, the player can see inside them. Codex claims the focused tree geometry
and material fix in `client/render/treegen.js`, `client/render/trees.js`, plus a
small regression fixture if needed.

The pass will reproduce the problem in the real browser, close trunk and branch
geometry where the generator currently exposes an interior, verify correct
front/back material rendering at close range, and avoid changing Claude's
reserved Helium Voice rework files.

