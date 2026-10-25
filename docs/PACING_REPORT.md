# Pacing report: session timeline measurements

Author: Claude. Measured at commit `655c05d` on `codex/early-build-playtest`
(includes Codex's first-sighting fix, retreat-search budget and terrain contacts).
Command: `PACING_JSON=/tmp/pacing.json node tests/pacing.test.mjs`
(4 scripted behaviours × 4 seeds × 15 simulated minutes = 4 h of play, ~150 s
wall time). Linux cloud container, Node v22.23.4.

These are **measurements of the real authoritative simulation with scripted
players**, not a human playtest. The players only walk, look and hide. They don't
do objectives (whose noisy repairs draw him in), sprint, talk or react. Read the
numbers as "what the AI does to a predictable player", and judge feel by playing.

"On screen" uses `perception.onScreen`, the same camera-frustum + line-of-sight
check the AI uses (75° FOV, 16:9), not a GPU pixel test. "Quiet" means no chase,
hit, signature line, twig snap, mimicry, gas, reveal, and Helium Voice not
within the critical ring (10 m). Cold, distant vocals and ambience don't
interrupt quiet.

## Results (per session, player 1)

| Behaviour | First cold (80 m) | First on screen | Chases | HV hits | Skunk hits | Longest quiet |
|---|---|---|---|---|---|---|
| Walker, never looks back | 1:03–2:27 | 1:08–2:38 | 0, 1, 0, 4 | **0** in all 4 | 0 | 3:57–13:46 |
| Walker, glances back every 20 s | 1:03–2:27 | 1:08–2:38 | 0, 1, 1, 0 | 0, **1, 1**, 0 | 0 | 7:11–13:35 |
| Crouched in brush, light off | 0:36–1:18 | never | 0 | 0 | 0, 1, 1, 0 | 9:41–14:51 |
| Co-op pair + straggler 30 m back | 0:41–2:46 | 1:03–2:50 | 1, 0, 1, 0 | **0** | 0, 0, 0, 1 | 3:31–14:51 |

Across all 16 sessions:
- **Helium Voice landed 2 hits in 4 hours of play**, both on the player who
  glances back. 7 chases against players who never look back produced no hit.
  The longest he stayed within creep distance of anyone was 1.8 s. He doesn't
  park behind them; the chase brakes into the creep and the walker leaves.
- The skunk bit 4 times (brush hider ×2, co-op ×1, and 0 for walkers on the
  trail). The skunk is currently the more dangerous creature.
- The **signature line played in 11 of 16 sessions**, usually within the first
  2–3 minutes. Helium Voice vocals: 6–17 per 15-minute session.
- He first appears **on screen about 5–15 s after the cold first arrives**. The
  cold works as a warning, but the first sighting follows it almost immediately.
- The **longest quiet stretch is usually 8–15 minutes**, so in most sessions
  nothing perceptible happens for most of the session, after an early sighting.
- Reveals seen: watcher ×5, crossing ×1, skunk ×2. Many sessions had none.
- Invariants held: no NaN positions, ordered events, no chase/hit during the
  intro, and he is never inside the outer ring before the intro ends.

## What this suggests (decisions for the owner and Codex, not implemented)

1. **Never looking back is a safe strategy against Helium Voice.** This follows
   from the owner's "slow down until he's on screen, then attack" rule. If that's
   the intended rule, it's working. If the owner wants him to still be lethal
   to someone fleeing blindly, it needs an owner-approved change (Codex has the
   AI files).
2. **The middle of the session is very quiet.** Long quiet stretches build
   dread, but 10+ minutes with no threat event may read as "nothing happens".
   This should be checked against the brief's 15–25 minute arc in a human
   playtest with objectives, which add noise and stops that these scripts lack.
3. **First contact comes early and all at once.** Cold, then an on-screen
   sighting seconds later, then often the signature line. If the owner wants
   longer dread before the first sighting, the director's early-session
   behaviour is where to look.

## Re-running

`node tests/pacing.test.mjs` takes about 2.5 minutes. `PACING_SEEDS` and
`PACING_MINUTES` shorten it, and `PACING_JSON=path` writes raw per-session data
(state durations, every reveal, per-player ring entry times). It isn't part of
`npm test` (runtime). Hard assertions cover invariants only.
