# Shared backlog: Claude + Codex

**Owner instruction (October 25, 2026, ~02:03 UTC):** keep working continuously:
find issues and keep improving, without stopping between tasks. To make that
possible without waiting on each other:

- Take the **top unclaimed item** that doesn't overlap the other agent's claimed
  files. Write your name and the files in the "Claimed" column **in the same
  commit you start with** (pull first, push quickly), then work.
- When done: move it to **Done** with the commit and test evidence, and take the
  next item. Add any new issue you find to **Open** immediately, even if you
  can't fix it yet.
- Items marked **(owner)** need an owner decision first. Don't implement them,
  but keep them listed. Respect the owner's direction in the handoffs (quiet mix,
  concealment, unseen creep, visible attack).
- Shared branch rules from `AGENTS.md` apply: rebase before push, never force-push.

## Open

| # | Issue / improvement | Area / likely files | Claimed |
|---|---|---|---|
| 3 | Run every existing browser suite (`browser_playthrough.py`, `browser_encounters.py`, `browser_ground_contacts.py`, `browser_menu_layout.py`, `browser_multiplayer.py`, `browser_sessions.py`) on a second machine and log failures/flakes here | tests only | Claude |
| 15 | (Claude; part 1 done: terrain chunks 64→128 m cut 150–190 draws on every preset; next: tree LOD/caps and tree shadow casting on Low) Low preset still draws ~1.0–1.7 M triangles and 510–600 draw calls per frame at trail views (medium ~2.2 M): likely too heavy for integrated GPUs. Investigate tree/foliage caps and LOD distances for Low | `shared/config.js` presets, `client/render/trees.js`, `foliage.js` | — |
| 6 | Visibility vs rendered silhouette: AI concealment uses sampled LOS; check against what the player actually sees (leaf gaps) | AI files + new browser silhouette probe | Codex |
| 7 | **Owner decided:** he can attack at any time (including unseen); when on a player's screen he seeks concealment. See `docs/handoffs/OWNER_DECISIONS_2026-10-25.md` (task A) | `shared/sim/heliumVoice.js`, attack/encounter tests | Codex (proposed) |
| 8b | Wire `director.minDistance()` / `director.escalation()` into Helium Voice movement (task D): first sighting ≥ ~4 min, pressure rising over the session | `shared/sim/heliumVoice.js` | Codex (proposed) |
| 9 | **Owner decided:** creatures must never enter the spawn area (task B). `shared/sim/zones.js` is **ready** (zone r 40 m + 12 m margin around kiosk/gate/lot/cars/6 spawns, centre (554, 574)); Codex: wire `spawnZoneCost` into `planTo` costFns, reject goals/spots/lurk spots with `inSpawnZone(w,x,z,margin)`, use `pushOutOfSpawn` for chase targets inside the zone, then run `HM_ZONES_WIRED=1 node tests/zones.test.mjs` (currently fails: HV spent 3.7 s inside in a 10-min run) and drop the todo flag | `heliumVoice.js`, `skunk.js` | Codex |
| 10 | Real WebRTC voice between different networks untested (cloud UDP policy); add an optional TURN relay config | `server/server.js` (welcome msg), `client/net/transport.js`, `client/audio/voice.js`, README | Claude |

## Done

| # | Item | Commit / evidence |
|---|---|---|
| — | First-sighting chase abort fix (Codex), reviewed by Claude | `32c9407`; attacks tests 4 fail before / 9 pass after |
| — | Retreat silhouette search budget (Codex) | `6fb65d8`; worst tick 136–150 → 45 ms |
| — | Pacing timeline + report (Claude) | `03b1dc6`, corrected `102160d` |
| — | Hosted page from shared branch (Claude) | built from `608918f` |
| 1 | Extraction cruiser visibility: **not a bug**. The cruiser is placed on the ground 5 m from the extraction point (−444, −636), visible with flare and a 55-intensity strobe once extraction opens; the earlier render was a bad camera angle into bushes | in-page state check at `2843b71` (Claude) |
| 5 | Performance budget test + baseline (`tests/browser_perf_budget.py`, `tests/perf_budget.json`, `docs/PERFORMANCE.md`) | 16 preset/view measurements at `abbe980` (Claude) |
| 14 | Server hardening: mimic audio is relayed only when it answers a server-issued mimic event to that same sender (≤15 s, once, ≤320 KB); per-connection rate limits (chat 6/5 s, inputs 80/s, actions 30/s, sig 300/10 s, binary 4/10 s, lobby ops 20/10 s) | `server.test.mjs` new checks: forged/non-owner audio blocked, relayed once, chat flood 5/30 (Claude) |
| 8 | Director dread period + escalation (task C) | this commit; `npm test` exit 0; pacing before/after in `PACING_REPORT.md` (Claude) |
| 10 | Optional TURN relay for voice | `9705ad7`; `tests/ice.test.mjs` 3/3 (Claude) |
| 2 | Station placement: **not a bug**. All 7 station variants over 40 seeds have 62–96 standable spots within 2 m, all with clear line of sight, none inside a building collider; the earlier render was a test camera placed inside the shed | Node check at `2843b71` (Claude) |
| 11 | Compact pause panels no longer cover navigation; actual UI layout checks pass five viewports | Codex; browser_menu_layout.py |
| 12 | Restart/quit cancel unsent chat and release movement focus; failing-before actual multiplayer fixture now passes | Codex; browser_sessions.py |
| 13 | Ground-contact screenshot receives a separate 120 s artifact timeout; contact assertions unchanged, local browser pass; second-machine confirmation pending | Codex; browser_ground_contacts.py |
| 4 | Pickup fixture stability: collision settling prevented a transient prompt from being mistaken for a stable approach; 12 seeds / 24 pickups pass, full gameplay passes | Codex; browser_pickup_glints.py and browser_playthrough.py |
