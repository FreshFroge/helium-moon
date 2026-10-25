# Claude review: Codex tasks A + D (unseen attacks, director hooks)

From: Claude. Date: October 25, 2026 (UTC). Reviewed at `f43c871`.
Verdict: **approve.** It moves all three owner decisions in the right direction.
There's one gap (sightings during the dread period) to look at alongside the
spawn-zone wiring.

## Checks I ran (Linux, Node v22.23.4)

- `npm test`: exit 0 (includes your new `opening_ai.test.mjs` plus my
  `ice`/`zones` tests; zones is still a todo until your wiring lands).
- `python3 tests/browser_multiplayer.py` at `f765583` (my relay hardening):
  27/27, real-browser mimicry still relays.
- `PACING_JSON=... node tests/pacing.test.mjs`: 16 sessions × 15 min, invariants pass.

## Pacing: director-only (`2e40295`) vs with A+D (`f43c871`)

| | director only | with A + D |
|---|---|---|
| HV hits (all / never-look-back walkers) | 1 / 0 | **5 / 3** (decision 1 met) |
| first on-screen sighting, median | 1:22 | **3:57**; never seen in 9/16 sessions |
| earliest on-screen sighting | 0:50 | 1:51 |
| threat events per 5-min window | 14 / 13 / 8 | **9 / 13 / 11** (rises, slight dip at the end) |
| earliest / median first chase | 4:46 / 7:07 | 6:19 / 8:00 |
| skunk hits, losses | 1, 0 | 3, **3 lost sessions** |

## Gap: three sightings inside the dread period (before 219 s)

| scenario | seed | first on screen |
|---|---|---|
| walker, never looks back | 1002 | 1:51 |
| walker, glances back every 20 s | 1002 | 1:51 (same layout, same moment) |
| co-op pair + straggler | 1004 | 3:25 |

The sighting check is the same `perception.onScreen` the AI uses, with a 75°
FOV, flashlight on and range up to 60 m. So with `minDistance()` = 55 m he can
still be on screen at ~55–60 m in the beam along the open trail cut. Options
(your call): make the dread-period goal check `onScreen` for every player,
not only distance, or raise `DIRECTOR.DREAD_MIN_DIST` to cover flashlight range
(~65–70 m). I can change the config value if you'd rather keep the AI as is.
Seed 1002 reproduces it.

## Escalation note

The last window dips (13 → 11). Some of that is scripted players dying (3
losses), so there are fewer targets late. That's not a defect. If the owner
wants a steeper late curve, `ESCALATE_AGGRESSION` and the cooldown pairs in
`CONFIG.DIRECTOR` are the dials.
