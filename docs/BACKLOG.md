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
| 11 | `browser_ground_contacts.py` failed on Claude's machine at its final `page.screenshot` (Playwright default 30 s timeout; software rendering + concurrent load). Assertions before it ran. Suggest `page.screenshot(..., timeout=300000)` / `page.set_default_timeout` | `tests/browser_ground_contacts.py` (Codex's file) | — |
| 4 | Pickup-glint fixture repeatability (from Codex's handoffs) | new `tests/browser_pickup_glints.py`, existing fixture/glint files if needed | Codex |
| 5 | Performance budget per quality preset: draw calls/triangles/programs at fixed views, recorded as a regression test so changes can't silently double the cost | new `tests/browser_perf_budget.py` + `docs/PERFORMANCE.md` | Claude |
| 6 | Visibility vs rendered silhouette: AI concealment uses sampled LOS; check against what the player actually sees (leaf gaps) | AI files (Codex) | — |
| 7 | (owner) Blind fleeing: should never-looking-back players stay safe from Helium Voice? See `PACING_REPORT.md` | AI (Codex) | owner |
| 8 | (owner) Long quiet middle (8–15 min with no threat event) | director (Codex) | owner |
| 9 | (owner) First sighting arrives seconds after the first cold | director (Codex) | owner |
| 10 | Real WebRTC voice between different networks untested (cloud UDP policy); add an optional TURN relay config | `server/server.js` (welcome msg), `client/net/transport.js`, `client/audio/voice.js`, README | Claude |

## Done

| # | Item | Commit / evidence |
|---|---|---|
| — | First-sighting chase abort fix (Codex), reviewed by Claude | `32c9407`; attacks tests 4 fail before / 9 pass after |
| — | Retreat silhouette search budget (Codex) | `6fb65d8`; worst tick 136–150 → 45 ms |
| — | Pacing timeline + report (Claude) | `03b1dc6`, corrected `102160d` |
| — | Hosted page from shared branch (Claude) | built from `608918f` |
| 1 | Extraction cruiser visibility: **not a bug**. The cruiser is placed on the ground 5 m from the extraction point (−444, −636), visible with flare and a 55-intensity strobe once extraction opens; the earlier render was a bad camera angle into bushes | in-page state check at `2843b71` (Claude) |
| 2 | Station placement: **not a bug**. All 7 station variants over 40 seeds have 62–96 standable spots within 2 m, all with clear line of sight, none inside a building collider; the earlier render was a test camera placed inside the shed | Node check at `2843b71` (Claude) |

| 11 | Compact pause panels no longer cover navigation; actual UI layout checks pass five viewports | Codex; browser_menu_layout.py |
| 12 | Restart/quit cancel unsent chat and release movement focus; failing-before actual multiplayer fixture now passes | Codex; browser_sessions.py |
