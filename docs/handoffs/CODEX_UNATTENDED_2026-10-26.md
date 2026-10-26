# Codex continuation and unattended checks — October 26

Owner request: continue implementation and schedule unattended work through
8 a.m. America/Chicago (13:00 UTC on October 26, 2026).

## File reservations

Codex claims the following for this continuation. Claude/Kimi: please leave
these files to this batch until the completion update releases them.

- `tools/unattended_checks.py`, its instructions and focused harness checks:
  a bounded local schedule, one validation batch at a time, no AI API calls.
- Backlog #31 / first part of #32: `client/entities/animators.js`,
  `client/entities/views.js`, `shared/sim/sim.js`, related animation/network
  and two-client browser checks, to make remote leaning visible and improve
  terrain contact. The completed cover-safe camera/AI leaning is preserved.
- Backlog #34 / crossing-linked part of #33: `shared/world.js`,
  `client/render/props.js`, `shared/sim/objectives.js`, objective presentation
  in `client/game/game.js` / `client/ui/ui.js` if needed, and focused crossing
  and progression checks. Inspect main-river geography before choosing a
  crossing. Do not make inaccessible far-bank tasks mandatory.

## Scheduling capability checked

There is no native automation scheduling tool in this session. The installed
`codex exec` connectivity probe exits before starting an agent: `failed to
initialize in-process app-server client: Read-only file system`. `codex queue`
has no delayed/scheduled option. `gh api` is blocked with `Forbidden`.

The planned local runner can execute timed tests while this cloud environment
stays alive. It cannot wake the AI, activate Claude/Kimi, keep the cloud
environment running, or continue code edits after this active session ends.
Do not report a proposed runner as active until its process/status and first
actual batch are verified. No unattended AI coding schedule is configured.

## Implementation and validation

Animation increment implemented: authoritative optional player lean appended at
snapshot index 11; real hiker torso/pelvis peeks above grounded feet; crouch head
now lowers to the player eye region. Teammate and scaled skunk views sample
actual terrain/bridge support. The skunk pitches/banks with slopes, shortens
overreaching steps and rears around its grounded hindquarters.

Checks so far: actual-model animation checks pass, camera/perception checks pass,
real-server checks pass, and two real browser clients pass Q/R head movement,
low crouch, shared supplies and durable/cooperative repair. The existing
ground-contact browser check passes for Helium; expanded skunk checks are running.
The browser repair fixture now measures the actual completed checkpoint before
waiting for decay; a slow key release on software rendering previously made
the fixed-duration assumption fail at progress 0.473.

The bounded check runner's real child timeout, stop and duplicate-lock checks
pass (3 tests). Scheduled operation has not yet been started. Full suite and
first actual scheduled batch still need verification before publishing the
implementation. Main-river crossing/objective implementation remains in progress.
