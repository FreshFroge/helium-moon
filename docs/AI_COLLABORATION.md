# Claude, Codex, and Kimi collaboration

## Current state

The owner has asked Claude to create the initial game and upload its source,
assets, and notes to `FreshFroge/helium-moon`. At the time this guide was created,
the repository contained only `readme`; no implementation, engine, or test
commands had been verified. This document establishes a proposed workflow; it
does not indicate that other agents have accepted tasks or received messages.

`PROJECT_BRIEF.md` preserves the owner's supplied text. Its references to
uploaded photos do not mean those photos are present in this repository. The
face reference, green-highlighted trail map, and environment photographs still
need to be made available through an agreed repository or asset location.

## How communication works

GitHub is the shared record. Each agent reads and writes through the GitHub/Git
access available in its own active session. Agents cannot automatically see one
another's private chats. A mention does not start another AI unless a real
integration has been configured. Continuous monitoring and automatic handoffs
are not configured by this document.

- **Issues:** bugs, feature requests, task ownership, acceptance criteria, and
  decisions. Link related work rather than starting duplicate tasks.
- **Branches and pull requests:** proposed code and asset changes, evidence,
  review feedback, and fixes. Reference the issue in the PR.
- **Repository documentation:** build/run instructions, architecture decisions,
  asset provenance, known problems, and handoffs that must survive chat resets.
- **Releases or agreed artifact storage:** identifiable playable builds for the
  owner and testers. Do not commit generated dependency/build caches. Choose
  Git LFS or other storage deliberately for large binary assets.

An agent with read-only access can inspect and prepare local changes, but must
say that posting or pushing is pending. Never put tokens in chat or documentation.

## Suggested initial responsibilities

These are proposals, not assignments already accepted by the other agents:

| Contributor | Initial focus |
| --- | --- |
| Claude | Deliver the initial playable project, architecture notes, and known limitations. |
| Codex | Reproduce setup, review the implementation, fix scoped issues, and verify regression checks. |
| Kimi | Independently review requirements and assigned changes, investigate bugs, and propose or implement scoped improvements. |
| Owner | Set priorities, approve major creative decisions, and playtest visual fidelity, horror pacing, and enjoyment. |

Roles can rotate. Any agent may implement a claimed task; another should review
substantial changes where its tools support meaningful inspection.

## One change from start to finish

1. Read the latest source and handoff. Open or select an issue with a specific
   problem, expected behavior, and acceptance criteria.
2. Record the active agent, branch, touched systems, and dependencies. Before
   parallel work, resolve overlapping files, networking contracts, and asset edits.
3. Implement a focused change on a branch such as `codex/42-terror-radius`.
   Keep unrelated refactors and engine migrations out of that change.
4. Open a PR with the problem, change, test evidence, and remaining limitations.
   Identify the implementation agent in the description, regardless of which
   GitHub account supplies access. Never impersonate a different contributor.
5. A second available agent reviews against the issue and brief. Run relevant
   checks again after fixes and integration. The owner handles final acceptance
   until a different merge policy is explicitly established.
6. Leave the handoff below and update the issue status. The next agent reads it
   when its session starts; do not assume that it received a live notification.

### Handoff template

```text
Task / issue:
Agent:
Branch / commit / PR:
What changed and why:
Systems or files touched:
Exact build/run/test commands and results:
Manual checks performed, including client count where relevant:
Known defects / missing assets / checks not run:
Decisions needing owner input:
Next recommended task:
```

## What the initial upload should include

- Complete editable source, engine/tool versions, locked dependencies where
  applicable, and exact clean-machine build and launch instructions.
- Required assets or reproducible retrieval instructions, provenance/licenses,
  and clear locations for the owner's visual references.
- A feature-status list distinguishing implemented, tested, incomplete, and
  blocked features; existing bugs and temporary placeholders.
- Architecture and multiplayer notes: authority model, state ownership,
  configuration, startup steps, and any services or credentials required.
- Tests and a short playtest checklist; a playable build or build instructions
  tied to a commit. Never upload credentials, private chat dumps, or caches.

## Acceptance priorities after upload

First reproduce launch and establish what actually works. Then prioritize scoped
improvements using the owner's stated order, without claiming the game is done
because it compiles:

- Compare Stinchcomb's trail and Helium Voice's appearance against the actual
  supplied references. Track missing references as blockers to likeness claims.
- Verify the complete loop: movement and collision, flashlight, three objectives,
  extraction and victory, attack/death, revival where implemented, and restart.
- Check smooth per-player terror effects at configurable 120/80/40/15 meter
  boundaries, especially cold in the outer ring, including entering and leaving.
- Check distinct monster behavior, detection and escape, simultaneous entities,
  navigation around obstacles, and periods of quiet between threats.
- Exercise real multiplayer with separate clients: consistent enemies and
  objectives, independent terror effects, joining, disconnects, and restarts.
  Validate the eventual 2–6 player target rather than extrapolating from one client.
- Profile named hardware and graphics settings, then playtest visibility, audio
  direction, fairness, and the intended 15–25 minute session pacing. Report
  measurements and player feedback instead of declaring the game perfect.

The original phase order and quality priorities remain in `PROJECT_BRIEF.md`.
Substantial departures need an explicit design decision from the owner.
