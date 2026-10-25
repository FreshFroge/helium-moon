# Claude review: spawn exclusion (`e6ca081`), opening/recovery (`047cad5`), eye origins (`8492f1a`)

From: Claude. Date: October 25, 2026 (UTC). Verdict: **approve all three.**

## Spawn exclusion (backlog #9): approved, independently stressed

- `npm test` exit 0 at `6c418b1`. `tests/zones.test.mjs` 5/5, with the
  10-minute camp-at-spawn test now mandatory.
- Harder check (scratch script, not committed). It staged **144 pursuits**:
  6 seeds × 12 approach directions × both creatures, 20 m outside the zone
  edge, with the player 6 m out sprinting into the centre for 40 s (kept
  alive). HV was forced into `startChase`; SF6 was in lurk.
  - **0 entries.**
  - Closest HV: 47.9 m from centre (r = 40).
  - Closest SF6: 41.4 m.
- 8 × 20-minute walk-out / run-back / camp-at-spawn sessions: 0 s inside.

## Dread-period sightings (my `abbe980` note): fixed

Pacing at `cee7d50`, same 16 sessions:
- The earliest **on-screen** sighting is now **4:05** (was 1:51, inside dread).
- No on-screen sighting before 3:30 in any session.
- Earliest chase is 4:18.

## Numbers for your encounter-frequency pass

All figures are 15-min sessions, threat events per 5-min window, summed over
the 16 sessions. The lost walkers stop counting once they die, so this
undercounts the late windows slightly.

| | 0–5 min | 5–10 | 10–15 |
|---|---|---|---|
| threats | 14 | 31 | 27 |

Gaps worth targeting (your files; I'm not touching them):

1. **Some sessions get no Helium Voice at all.**
   - glance-back walker, seed 1002: 0 chases, 0 threats, longest quiet 14:51;
   - co-op seed 1003: the same;
   - crouched hiders: 0 HV chases in all 4 sessions; only the skunk acts.

   The owner asked for more encounters, so a floor seems right (e.g. a
   forced reveal or presence pass if there's been no HV threat for ~4 min
   after dread).
2. **The late window doesn't escalate** (27 vs 31), even though escalation is
   supposed to peak there.
3. **Balance flag, owner call:** the never-look-back walker **loses 4/4**
   (2–4 HV hits each, first chase 4:18–9:25). That matches decision 1
   (unseen attacks allowed). But with more encounters on top, a solo player
   who doesn't look back may die every time. Worth checking that the result
   stays a loss you can survive by looking back. The glance-back walker
   survives 4/4.

## `8492f1a` eye origins

The camera_perception test is sensible; it passes in the full suite. No
comments.

## Me, now

- Backlog #15 part 1 is pushed (`80ee6fe`): 128 m terrain chunks,
  −150–190 draw calls on every preset, baseline refreshed.
- Next: tree LOD/caps and shadow casting on Low. Files:
  - `client/render/trees.js`
  - `client/render/foliage.js`
  - the `shared/config.js` **quality presets only** (not `DIRECTOR`)
- After your encounter pass lands and pacing is validated, I'll refresh the
  hosted page from the tip and record the SHA, as you asked.
