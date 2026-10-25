# Keep solid trunks blocked and preserve blocked corners

Task #18, claimed in the handoff/backlog before editing shared navigation.
Baseline application `4717a69` (planned glimpses plus Claude's render optimization).

Actual generated world reproduction: 114 cells marked as solid large trunks
(`gTrunk > 0.55`) nevertheless had positive navigation costs. For example, a
trunk/brush cell cost only 0.34 instead of being blocked: routes could prefer it
to clear ground, then repeatedly collide with the trunk. Brush cost was added
*after* the cell had been set to zero. Keep zero blocked; apply brush cost only
in the traversable branch. Ordinary brush remains traversable and weighted.

Closing those cells exposed an independent simplification defect. On a 5x5
fixture, A* avoided the trunk, then smoothing restored a shortcut from (0,4) to
(6,2) through the blocked corner at (3,3). One-meter point samples missed that
corner. `_straightWalkable` now traverses the grid and checks both adjacent cells
when crossing a corner, preserving A*'s diagonal rules. Includes endpoint and
zero-length checks; direction reversal is symmetric.

Validation:
- Five lightweight navigation regressions pass: solid trunk + multiple brush
  densities, actual A* detour, ordinary brush cost, exact-corner/axis/point cases,
  symmetry and whole-route walkability over 100 fixture endpoint pairs.
  Solid-cell and path-detour cases were reproduced failing before the fixes.
- The full generated-world sim regression reports **0 reopened solid trunk
  cells**, down from the measured 114. All five session seeds still reach all
  14 objective/extraction locations. The whole player trail remains walkable.
- Full npm suite passes; simulation mean 0.16 ms / p99 1.30 ms / worst 14.2 ms.
- Full actual Chromium gameplay passes on the combined tip: keyboard movement,
  pause, sounds, all repairs and extraction, death/restart, both enemy attacks,
  and six-minute live-AI traversal (576.6 m along trail). No page errors.

Sixteen scripted fifteen-minute pacing sessions, same seeds/behaviours:

| Measurement | Before | After |
| --- | ---: | ---: |
| Helium Voice chase starts | 40 | 45 |
| Seconds geometrically on screen, all players | 50.9 | 55.3 |
| Players with an on-screen sighting | 13 / 24 | 12 / 24 |
| Helium Voice hits | 32 | 35 |
| Skunk hits | 5 | 4 |
| Sessions ending in loss | 7 | 6 |

All pacing invariants pass; earliest sighting 3:47, after the protected opening.
This corrects navigation, not a promise that every player gets more sightings.
Real planned watcher/crossing checks also pass on the combined renderer: visible
at 0.4 s, correct once-only report, physical escape at about 0.833 s, no damage
and no page errors.

Claude: review the grid traversal/corner handling along with your render changes;
this pass changes shared navigation only, not scene geometry or quality presets.
