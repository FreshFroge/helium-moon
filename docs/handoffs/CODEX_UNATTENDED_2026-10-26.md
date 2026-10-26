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
pass (3 tests). It is running locally, started at 06:39:57 UTC, every 30 minutes
until 13:00 UTC / 8 a.m. America/Chicago. State/logs are in
`/tmp/helium-checks-66e961dfeee7`. First batch at `f7322b2` passes the full
`npm test` (96 seconds), 12 scripted hunt sessions (20 seconds) and two real
browser clients. Browser ground contacts additionally pass: 3,791 Helium
hand/foot samples and 6,192 skunk paw samples on three real slopes and the
slough bridge; maximum skunk support error 0.0054 m. This does not establish
hardware FPS or owner acceptance of the animation style.

Animation/scheduler source published at `f7322b2`; animation files are released
unless subsequent crossing integration needs them. Main-river crossing and
objective/UI/world file reservations remain active for the next increment.

Main-river crossing increment: a 32 m timber maintenance span plus two 6 m
ramps joins both existing banks near Fishing Bank, with a cleared service path
and return signs. Kiosk and Tab maps show the service route and both new
landmarks. This is a fictional gameplay addition; it does not claim that this
bridge exists in the real refuge. The reference river/trail geometry is retained.

Seven bridge regressions pass, including real player-cylinder traversal of the
complete service path and creature-cylinder traversal of the planned river
route, both directions. Two real browser clients cross and return with W input
and agree with server positions. First broad run exposed an RNG perturbation:
clearing new structures during vegetation generation reshuffled other trees and
failed the integrated hush check. Clearing is now a final local filter instead;
46,194 retained tree records compare exactly with the prior world, only 23
trees removed for access; hush and bridge checks pass. Broad recheck passes.
Crossing source published at `548c2a0`.

Next #33 increment: a recoverable handwheel at the far-bank service landing and
a manually aligned rescue antenna, required before the existing mast call. This
adds an exploration goal and a compass/dial interaction rather than another
hold-E repair. Codex reserves `client/entities/views.js` and `shared/sim/sim.js`
again for its interaction/replication and antenna animation, alongside the
existing objective/UI reservations. Preserve the completed player/enemy poses.

## River objective expansion complete

The far-bank landing now contains an orange antenna handwheel and a directional
rescue aerial. The handwheel is a shared pickup. With it recovered, each press
of E turns the aerial clockwise one compass point; holding E does not repeat.
The mast bearing appears in the memo and the controls. Alignment locks and
lights green. Incorrect settings persist through hiding, and any teammate can
take over. The existing mast call requires generator, relay and aligned aerial.
Four station objectives now exist, plus the explicit handwheel recovery goal.

Both server and client reject blocked/held/covered/remote actions. A shared
350 ms turn interval prevents simultaneous teammates from skipping settings.
Snapshots carry the authoritative compass setting; the rendered dish and fitted
handwheel turn smoothly. The initial compass position varies by seed without
consuming the AI RNG stream. The world, hunt timers and quiet mix are preserved.

Validation on final production source:

- `npm test`: passes (`/tmp/helium-overnight/river-final-node.log`).
- `node tests/bridge.test.mjs`: eight pass, including both actual creature route
  followers crossing both directions with grounded movement and no relocation.
- `tests/browser_overnight.py`: seeds 211–213 all complete pickup/dial/repair/
  extraction with actual keyboard input; threats disabled and approaches staged.
  Saved repair step, accurate memo/register, map and scrolling also pass.
- `HM_TEST=1 tests/browser_objectives_coop.py`: two real clients pass Q/R/crouch,
  shared fuel and durable coop repair, W traversal across/return over the main
  river, shared handwheel and discrete/persistent/locked aerial state; no page
  errors. Staged approach fixtures are explicit, not unassisted survival play.
- `HUNT_SESSIONS=12 HUNT_MINUTES=25 ... tests/hunt_playtests.mjs`: 63 hunts,
  maximum 57.4 seconds; 3 escapes / 6 all-dead / 3 timeouts. Seven sessions align
  the aerial; completed station mean 2.58 of four. Scripted agents, not humans.
- `tests/browser_perf_budget.py`: all 16 preset/view counts remain within the
  existing +25% budget. Software Chromium counts do not establish GPU FPS.

Logs/screenshots and session JSON are under `/tmp/helium-overnight/`; they are
not committed. The local scheduled checker remains active every 30 minutes
through 13:00 UTC while the environment stays alive; its next batches exercise
the updated objective-aware bots and expanded two-client crossing/antenna suite.
It does not edit code or start AI sessions.

All file reservations in this handoff are released after this increment is
published. #32 still needs broader attack/transition/first-person/environmental
animation review, and #33 can grow beyond this first objective expansion. Human
playtesting should assess the far-bank trip, compass clue clarity, hunt pressure
and visual quality before treating these areas as finished.

## Published revisions and recurring operation

`aac74b3` publishes the handwheel/aerial objective expansion and its checks.
The second actual scheduled batch ran at 07:09:57–07:13:25 UTC on that clean,
unchanging commit: full Node suite, 12 hunt sessions and expanded two-client
suite all pass. This confirms recurrence beyond the initial launch.

Scheduler follow-up: its status previously retained the last completed batch's
`checkout_after`/`stable_revision` while a new batch ran. A failing-before
two-batch regression reproduces this. The fix clears those fields until the
current batch ends; all four runner lifecycle checks now pass. Each runner
process also archives logs in a distinct run directory to preserve prior runs
when restarting. The old runner is stopped between batches and restarted with
this fix, the same 30-minute interval and the same 13:00 UTC deadline. It still
performs tests only and requires the cloud environment to stay running.

A second Codex connectivity probe, with daemon sharing disabled and state/log
directories redirected to writable `/tmp` paths, still fails during app-server
initialization with the same read-only-filesystem error. No AI coding schedule
or automatic activation of another agent has been configured.
