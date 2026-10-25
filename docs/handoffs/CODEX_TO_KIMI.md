# Codex to Kimi: initial coordination

## Current status after Kimi's reply

Kimi replied in `docs/handoffs/KIMI_TO_CODEX.md` at commit `0b07824` and accepted
K1 under issue #4. Claude's `b1f30ff` has also announced the tree-slip movement,
so Kimi should verify its rendered continuity rather than reproduce the old
missing-event failure. The remaining presentation questions and current seeds
are below.

## Active three-agent handoff — October 25, 2026

The owner has now explicitly asked Codex to start working with Kimi as well as
Claude. This section supersedes the initial waiting plan below.

As of shared-branch commit `29bc910`, a fetch of every remote branch still finds
no Kimi-authored commit, `KIMI_TO_CODEX.md`, issue or pull request. This states
only what is visible on GitHub; it does not assume Kimi has seen the message.

### Start from here

1. Read root `AGENTS.md`, `docs/PROJECT_BRIEF.md`,
   `docs/HV_PUPPET_REWORK.md`, and
   `docs/handoffs/OWNER_DECISION_PUPPET_FULL_REPLACEMENT.md`.
2. Use the shared branch `codex/early-build-playtest`. Fetch and rebase before
   pushing; never force-push. Claim files in a handoff before editing.
3. Read Claude's latest Puppet commits and Codex's latest review notes before
   selecting a source fix.

Current boundaries:

- **Claude:** Puppet simulation and character animation, especially
  `shared/sim/heliumVoice.js`, `client/entities/animators.js`, and
  `client/entities/views.js`.
- **Codex:** Puppet diegetic audio and teammate-response integration; the tree
  interior fix at `96e7a1c` / `29bc910` is complete and available for review.
- **Kimi:** the independent rendered Puppet playtest below. This begins with a
  new test/report and does not overlap either implementation owner.

### Kimi task K1: rendered Puppet playtest

Claim new files `tests/browser_puppet.py` and `docs/PUPPET_BROWSER_PLAYTEST.md`.
Using the real browser build and Developer Mode, exercise at least these states:

- watched freeze and the transition to unwatched low crawl;
- the 12–15-foot prowl and delayed rush;
- grab start, hold, release and health change;
- the overhead-control flashlight collapse and disappearance;
- close movement around trunks, including snapshot continuity and page errors.

Use rendered screenshots or a short replay for visual review, but keep generated
artifacts out of Git unless they are deliberately small. Record exact commands,
commit, browser, state transitions, and anything that could not be judged
automatically. Do not weaken an assertion to fit current behavior.

The current tip also has a deterministic headless failure documented in
`CODEX_REVIEW_PUPPET_SLIP_EVENT.md`: `slipAround()` can move 1.22 m without an
`hv_relocate` event. Confirm it in the report. Claude owns the implementation;
Kimi should provide an independent diagnosis and only edit that file after an
explicit file claim that does not conflict with newer Claude work.

Publish the result as `docs/handoffs/KIMI_TO_TEAM.md`, including the exact commit
tested and the next scoped fix Kimi proposes. Then continue with that fix if its
files are unclaimed; routine work does not need another owner confirmation.

### Codex 50-playtest evidence for Kimi

Codex completed the owner's 50 back-to-back simulation playtests at current
gameplay commit `e27fe0e`, after a separate baseline run at `6415ccd`. Read
`docs/PLAYTESTS_50.md` before the rendered pass. Start
with seeds 2027 and 2042 and answer three presentation questions that headless
tests cannot settle:

1. Is the overhead Puppet control readable too early or too easy to track?
2. Do the repeated watched freezes look like a continuous performance or a
   jerky state toggle?
3. In hunts where the target never sees him, is there a fair non-directional
   warning before the first close-range audio cue?

Record the answer for each seed in `docs/PUPPET_BROWSER_PLAYTEST.md`; do not
claim a rendered pass based on the simulation report alone.

- **From:** Codex
- **To:** Kimi
- **Date:** October 24, 2026 (America/Chicago)
- **Status:** Awaiting a response; this repository note does not confirm receipt.

Kimi, the owner asked me to review your additions and coordinate with you.

I checked `main` at `9297897925cdf30a900e79f2c7e83ff57080f40c`, the advertised
remote branches, pull-request refs, and public issue/PR lists. I could see the
shared instructions and project brief, but no new pushed work or issue/PR
handoff from you yet. You may have changes in your own workspace that have not
been pushed, or work somewhere else; I have not inspected those.

Please tell me where to find your additions:

- Repository and branch, full commit SHA, and PR or issue link if available.
- Files added or changed and the purpose of the changes.
- Exact checks you ran and their results; mark checks not run explicitly.
- Known limitations and any task you are currently working on.

Please preserve any local changes before syncing with `main`. If the work is
only local, commit and push it on your own branch so I can inspect it. Do not
reset or overwrite your work to match this checkout.

## Coordination while Claude builds

The owner says Claude is still creating the initial game. Let us use this time
for requirements review, acceptance checklists, and upload readiness rather
than building competing versions of the game. Read `../AI_COLLABORATION.md`,
`../PROJECT_BRIEF.md`, and the root `AGENTS.md` first.

Please share what preparation you have already completed before we divide the
remaining tasks. The engine, runtime, and actual test commands are not yet
established by the current repository. The face reference, highlighted trail
map, and environment photos are also not included in the existing brief file.

Once Claude uploads, I plan to reproduce the documented launch, establish what
works, and review focused fixes. We can agree on separate tasks and have another
agent review substantial changes against the brief and actual test evidence.

## Reply location

Please add your reply as `docs/handoffs/KIMI_TO_CODEX.md`, or link an existing
issue/PR containing your handoff. Include the commit containing your additions
and the next task you propose. A GitHub issue or PR is preferable for task
discussion when both agents have API access; the GitHub API endpoint is currently
blocked from my environment, so I am using this tracked note.

The owner will need to ask each agent to read the latest handoff in an active
session unless a separate notification/automation integration is configured.
No reply or task acceptance is assumed.
