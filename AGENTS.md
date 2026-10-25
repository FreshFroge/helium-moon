# Helium Moon: shared agent instructions

These instructions apply to Claude, Codex, Kimi, and other contributors.

## Start here

- Read `docs/PROJECT_BRIEF.md` for the owner's creative requirements and
  `docs/AI_COLLABORATION.md` for coordination and review practices.
- Inspect the current source, repository status, open task, and latest handoff
  before changing anything. Preserve other contributors' work.
- The owner requests automatic checks for Claude's messages. At the start of
  each active work session, at natural breaks in longer tasks, and before
  publishing changes, fetch all remote branches with
  `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`. Inspect new handoff
  commits on other branches, especially `claude/*`; do not check only `main` or
  the current branch. Read new `CLAUDE_TO_CODEX.md` notes and other relevant
  handoffs with `git show <remote-ref>:<path>` without switching or overwriting
  the working checkout. Inspect relevant PR/issue discussions when access is
  available. Record the exact message commit addressed in replies so later
  sessions can distinguish new messages. These checks run during active work;
  no background monitoring or automatic AI wake-up is configured.
- Use the existing checkout. Cloud tasks are already isolated; do not create a
  Git worktree unless the owner explicitly requests one.
- Discover the actual engine, tool versions, launch commands, and tests from the
  uploaded project. Do not assume Unreal or a browser stack has been selected.

## Coordinate changes

- Use a GitHub issue as the task record and a focused pull request as the change
  and review record. Claim ownership in the issue before starting, if GitHub
  write access is available. Otherwise report the claim as pending.
- Avoid concurrent edits to the same systems. Agree on interfaces before
  parallel work; treat maps, models, and other binary assets as one-editor work.
- Keep `main` playable. Do not force-push, overwrite another agent's work, or
  merge conflicting implementations without resolving and validating them.
- End each task with a handoff: commit or branch, changes, exact checks and
  results, known limitations, and the next useful task.
- Never claim an issue, comment, push, review, or merge happened unless the
  operation succeeded. Local notes are not GitHub communication.

## Protect the creative intent

- Preserve the owner's priority order and reference-image precedence in the
  project brief. Record any proposed scope or design change explicitly.
- Do not fabricate missing reference images or claim a matching face or trail
  without comparing the actual references. Track temporary substitutes clearly.
- Do not describe placeholder art, simulated co-op, or untested behavior as
  finished. Maintain working, incomplete, and blocked feature status separately.
- Prefer measurable improvements and small playable increments over rewrites.
- Keep credentials out of code, issues, logs, and handoff documents.

## Validate

- Run the build and relevant existing tests for the changed systems. Record
  commands, environment, and outcomes; distinguish tests not run from passes.
- Use real separate clients for multiplayer checks. A successful build does not
  establish visual fidelity, enjoyable pacing, or multiplayer correctness.
- Ask the owner to evaluate visual likeness and game feel on playable builds;
  automated checks complement these playtests.
