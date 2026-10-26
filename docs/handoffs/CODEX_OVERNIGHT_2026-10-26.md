# Codex active gameplay pass — October 26, 2026

Owner request: work through repeated playtests, improve the trailhead/spawn,
then objectives. First priority: each hunt has 15–20 s of distant stalking,
30–40 s of searching, then stops. A player discovered during search may be
attacked; hiding must offer real counterplay without omniscient tracking.

Branch: `codex/early-build-playtest` (shared). Latest Claude commits read and
integrated: `74a4fbb` and `38f1896`. Retain the 30–45 m concealed opening stalk,
lighter, quiet sound mix, no dialogue/strings/stop-motion, and crouched hiding.

Codex claims this sequential batch:

1. `shared/sim/heliumVoice.js`, hunt config in `shared/config.js`, focused
   hunt/encounter tests: bounded search phase and regression reproduction.
2. New scripted browser playtest/report files; baseline screenshots outside Git.
3. Trailhead-specific renderer/world dressing and spawn checks.
4. `shared/sim/objectives.js`, objective interaction/UI/views, tests: improvements
   selected from the baseline playtests. Preserve the three-stage rescue goal.

Claude/Kimi: please avoid overlapping production edits during this pass. Review
the published increments or take independent tests/audio/performance work. This
note is the GitHub task record because `gh issue list` returned Forbidden.
No background scheduling or automatic agent wake-up is configured. Results
below will distinguish browser checks, staged fixtures and simulated sessions.

## Results

Hunt sequence implemented: 15–20 s distant stalk → 30–40 s evidence-based search.
Sight can trigger a rush/grab; fresh sound gives an approximate search position.
No live-coordinate reacquisition, close slip or cutoff teleport during search.
One deadline survives repeated start requests and cancels pending grabs safely.
Settling into hiding prevents discovery throughout the search; its deadline,
rather than six seconds of crouching during the opener, ends a survived hunt.

Checks so far:

- Baseline `npm test`: exit 0 on `38f1896`.
- New `node tests/hunt_search.test.mjs`: fails before (missing deadline and
  reacquisition through blocked LOS); all six regressions pass after.
- `npm test`: exit 0, including updated pursuit/hiding expectations. Legacy
  direct-damage tests explicitly stage discovered contact after the opening.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 -u tests/browser_playthrough.py`:
  exit 0. Keyboard movement, lighter/audio, memo, supplies, three repairs,
  extraction/victory, death/restart, real enemy attacks, six-minute live-AI walk.
  Corrected an old death fixture that still used two damage calls for three HP.
- `HUNT_SESSIONS=12 HUNT_MINUTES=25 HUNT_JSON=/tmp/helium-overnight/sessions-search.json
  node tests/hunt_playtests.mjs`: 12 scripted full-simulation sessions, 63 hunts,
  longest 57.15 s; five escapes, four losses, three time-outs. These bots know
  item positions and do not evaluate how a new human finds small supplies.
- New `tests/browser_overnight.py`: three seeded, staged keyboard objective
  playthroughs (211–213) all reach extraction; threats disabled for interaction
  coverage. Baseline spawn/kiosk screenshots visually inspected separately.

Observed objective fault: required supplies can randomize onto isolated ground
with no location clue (three browser seeds exposed no supply hints). Next:
recognizable landmark supplies, in-world navigation and interruption-safe repairs.

Trailhead pass: warm sheltered kiosk lamp (one unshadowed light), framed and
landmarked map, entry waypost, real-collision seating, irregular gravel edges
and batched stone/leaf dressing. Six spawn slots and the initial five metres
still clear; `spawn.test.mjs`, `objectives.test.mjs`, `zones.test.mjs` pass.
Three more staged browser objective/extraction runs (211–213) pass after the
world changes. Spawn/kiosk screenshots inspected; reduced the initial lamp
intensity and increased map roughness to avoid washing the map out.
