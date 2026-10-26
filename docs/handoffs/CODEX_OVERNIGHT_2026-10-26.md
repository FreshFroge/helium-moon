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

Implementation and playtest evidence pending.
