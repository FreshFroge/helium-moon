# Helium Voice rework: "The Puppet" (DRAFT, owner chose this direction Oct 25 2026)

Status: **design draft, being settled with the owner.** Nothing here is implemented yet.
Open owner decisions are marked **[OWNER?]**.

## Core idea

Something is wearing a man and doesn't quite know how to work the body.

- **Watched, he is worn:** upright, almost human, stiff. One joint moves at a time.
  His head stays locked on you. Light freezes him mid-stride.
- **Unwatched, he is operated:** low, fast, on all fours, limbs lagging behind
  the torso. Players almost never see this clearly. They hear it (fast rustle,
  knuckles on boardwalk) and catch it at the edge of the screen.
- **Between the two:** the *unfold* (flat on the ground to standing in one smooth
  motion) and the *collapse* (strings cut: he drops limp).

"Watched" = inside any player's view and line of sight (existing observer code),
weighted up when lit. Co-op teammates watching him count, so a group that keeps
eyes on him is safer (pairs with X1 teammate contagion).

His face stays a match for the reference photo. Anything wrong about the face is
subtle: a held stare, slow blinks, the jaw a little out of sync with his lines.

## The hunt

Rules kept from the owner: hunts start within 35 m, never in the spawn area; cold is
the approach warning; no loud artificial stingers; a flashlight within 7 ft
(2.13 m) calls the hunt off; current activity level (2-3x) stays.

1. **Strings tighten (mark).** He picks a target (isolated or loud player). Hush,
   then cold. New quiet, diegetic tell: distant joint pops / knuckle cracks.
2. **The peek (approach).** He closes in jumps between cover, moving only while
   unwatched. Each time you look back he is at a different trunk, peeking from the
   wrong height (low, or head sideways at shoulder height). Inside ~5 m his motion
   stutters like stop-motion.
3. **In the grass (rare ambush).** Lying flat in marsh grass near the trail ahead;
   unfolds to standing when you come within a few metres.
4. **Search.** If you break line of sight and hide, he searches upright: stiff
   walk, head swivelling far past human range, stopping to listen, breathing in
   time with you when close. Hiding well survives a hunt.
5. **Pursuit.** When he really has you, he chases. Upright run, arms dead at his
   sides, strides too long. **[OWNER?]** Looking back at him freezes him for a
   beat (costs him ground) but you can't see where you're running.
6. **The grab.** No swing: he grabs your shoulder and pulls you in, face fills the
   screen (existing camera lock within 4 ft). Then he lets go and walks backwards
   into the dark facing you.
7. **Flashlight inside 7 ft.** He collapses limp. Look away, look back: gone.
   That ends the hunt.

## Animation list (procedural, existing MakeHuman rig + IK)

| Pose / motion | Used in |
|---|---|
| Hanging idle: up on his toes, heels lifted, arms limp, head lolled | idle, watched |
| One-joint-at-a-time movement (sequential IK targets, others locked) | watched walk, turns |
| Owl head lock (yaw to about 170 deg, torso catches up late) | everywhere |
| Mid-stride freeze when lit (held impossible balance) | watched |
| Stop-motion stutter within ~5 m (pose sampled at 6-8 fps) | approach, search |
| Low all-fours "operated" crawl, limbs lagging | unwatched movement |
| Unfold from flat / collapse to limp | grass ambush, flashlight ending |
| Peek from trunk at wrong height, head sideways | approach |
| Dead-arm run, over-long stride | pursuit |
| Search walk with long head sweeps, listen pause | search |
| Grab: reach, shoulder grip, pull in | attack |
| Backwards walk away, facing you | after grab |

Owner note: motion-capture quality would need a rigged model with animation clips
(e.g. Mixamo) supplied by the owner; this plan is hand-keyed procedural.

## Kept / replaced

- **Kept:** nav and planner, director pacing (midday values), hush, cold radius,
  tactic learning, voice line system, spawn safety, developer mode, flashlight rule.
- **Replaced:** stalk/chase/reveal behaviour and visuals, stare-then-slow-retreat
  (becomes the watched freeze), reverse bear-crawl retreat (becomes collapse or
  backwards walk), swing attack (becomes grab).
- **Absorbs X2** ("moves when unwatched") from the scare research list.

## Proposed split

- **Claude:** `shared/sim/heliumVoice.js` hunt beats, watched/unwatched rule;
  `client/entities/animators.js` and `views.js` animation set.
- **ChatGPT's coding agent:** new diegetic audio (joint pops, fast rustle,
  knuckles on boardwalk, breathing sync) in `client/audio/`; X1 teammate contagion;
  pacing pass on top of the midday values; reviewing the AI changes.

## Build order (each step playable)

1. Watched/unwatched rule + freeze + owl head + hanging idle.
2. Operated crawl, unfold and collapse; flashlight-collapse ending.
3. Peek-at-wrong-height approach and stop-motion stutter.
4. Search beat with listening; hiding survives.
5. Pursuit (dead-arm run, look-back freeze if approved) and the grab.
6. Grass ambush.
