# Owner decisions: October 25, 2026 (~02:09 UTC), relayed by Claude

The owner answered the three open pacing questions (backlog #7–#9) in chat with
Claude. Their words, lightly cleaned up:

1. **"I don't only want him to attack when he's on the screen. He can attack at
   any point. I just want him to stay out of sight if he's on your screen."**
   - The on-screen rule is about **concealment**, not about when attacks are
     allowed. When a player has him on screen, he works to get out of sight
     (hide, break line of sight, retreat or reposition). That's the behaviour
     the owner wants preserved.
   - He **may attack unseen**, e.g. from behind a player who never looks back.
     The earlier gate that an attack requires `closeCommitted` (a close
     on-screen sighting) no longer reflects the owner's intent. The unseen
     creep at 6–8 ft can stay as a build-up, but it must be able to end in an
     attack.
2. **"Yes, I kind of want him to be more aggressive as the game goes on."**
   Aggression should **escalate over the session**: more frequent and more
   committed pursuit later, shorter rests, closer stalking. The long quiet
   middle measured in `docs/PACING_REPORT.md` should shrink as time passes.
3. **"Dread builds longer."** His **first appearance should come later**, with
   the cold and other restrained cues building first. Also: **"prevent him
   from being able to go into the spawn area."** Helium Voice must never enter
   the trailhead/spawn area (kiosk, gate, parking lot). This presumably applies
   to the skunk too; confirm with the owner if unsure.

These supersede the related behaviour descriptions in earlier handoffs
(`CODEX_CLOSE_ENCOUNTERS.md`, `CODEX_REPLY_TO_CLAUDE.md`) and close backlog
#7–#9 as decided.

## Proposed split (Claude → Codex; avoids overlapping files)

| Task | Files | Who |
|---|---|---|
| A. Unseen attacks allowed; on-screen → seek concealment (decision 1) | `shared/sim/heliumVoice.js`, `tests/attacks.test.mjs`, `tests/encounters.test.mjs` | **Codex** (owns these) |
| B. Spawn-area exclusion for both creatures (decision 3b) | new `shared/sim/zones.js` (exclusion geometry + `inSpawnZone`/path cost helper, written by Claude), wired into `heliumVoice.js` / `skunk.js` planning and placement by **Codex** | Claude: `zones.js` + `tests/zones.test.mjs`; Codex: the wiring |
| C. Escalating aggression over session time (decision 2) and later first appearance (decision 3a) | `shared/sim/director.js`, `shared/config.js` (new `DIRECTOR` keys only), `tests/pacing.test.mjs`, `docs/PACING_REPORT.md` | **Claude** |

Interface for B, so we can work in parallel:
```js
// shared/sim/zones.js
export function spawnZone(world)            // {x, z, r} cached per world (trailhead/kiosk/lot), radius CONFIG.ZONES.SPAWN_RADIUS
export function inSpawnZone(world, x, z, margin = 0)   // boolean
export function spawnZoneCost(world, x, z)  // 0 outside; large (blocking) inside, ramps over the margin, for findPath costFn
```
Claude will also make `director` stop requesting reveals/chases whose target
or spot is inside the zone. Codex wires `inSpawnZone` into roam/observation-spot
selection, `planTo` cost functions, retreat/cover choice and the skunk's lurk
spots, so neither creature can path into or stand in it.

Codex: if you'd rather take C as well, or split differently, say so in your
next handoff. Until then I'll start C and the `zones.js` helper only, and
won't touch `heliumVoice.js` or `skunk.js`.
