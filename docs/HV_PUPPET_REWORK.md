# Helium Voice rework: "The Puppet" (DRAFT, owner chose this direction Oct 25 2026)

Status: **implemented on `codex/early-build-playtest` (Oct 25 2026 afternoon)** - see "As built" at the end.

Owner decisions (Oct 25, 13:57, 14:17, 15:02 and 15:07 CT):
- Looking back during a hunt **freezes him for a beat**.
- The all-fours movement is **only glimpsed**.
- **No swing.** Grabs, with variations. You **survive two grabs; the third kills** (MAX_HEALTH 3, no auto-heal).
- Full replacement of the old behaviour (relayed via ChatGPT's agent), but **keep** spawn safety, the cold
  warning and Developer mode. The 7-ft flashlight rule goes: **"find a more creative way to end a hunt"**.
  First built as *cut the strings*; the owner then had the strings removed and chose **hiding** (below).

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

## As built

**Hiding ends a hunt** (owner, 15:02-15:07 CT: the strings and the control above him were removed;
"yes" to hiding). The hunted player has to be out of his sight (sightOf ~0: beyond his dark sight
range, crouched or in thick brush, or behind cover), flashlight off, nearly still (< 0.6 m/s) and quiet
(noise radius <= 6 m) for 6 s, more than 2.5 m from him. While they hide he does not track them: he goes
to where he last saw or heard them and searches round it upright at a walk, head sweeping. If he sees or
hears them again the count drains. At 6 s he has lost them: a long exhale, he goes limp, and he is gone
the moment nobody is looking (reappears 35-70 m off, concealed). A player who has hidden from him before
needs 1.5x longer. After a successful hide there is no new hunt on that player for 45 s solo / 25 s in a
team. The ranger's log note hints at it ("Dale got down in the brush, killed his light and didn't
breathe. It walked right past him..."). Config: `CONFIG.HV.HIDE_*`.

**Flashlight** (owner, 15:07): in his grab your light clicks off and stays off until you turn it back on
(it can't be toggled during the grab); when he runs at you (hunt, > 3 m/s, closing, within 35 m) it
flickers and browns out, harder the closer he is.

**Watched / unwatched.** Outside hunts, watched he freezes mid-pose (4-7 s; lit 2.5-4.5; close 2-3.5),
peeking from cover at the wrong height, then backs away upright facing you. Unwatched: low, on all
fours, 1.3x faster (snapshot flag 16). In a hunt each fresh look back freezes him for 0.55-0.85 s (at
most every 1.8 s after the last beat, never inside 3 m); unwatched he runs low, watched upright with
dead arms. The prowl (ChatGPT's 12-15 ft, ~30 s circle) keeps going up to 6 s more while you watch him:
the final rush comes when you look away.

**The grab.** Reach 0.45 s (scream), then hold: shoulders 1.7 s, throat 2.0 (lifts you), face 1.4
(hand over your eyes, screen goes dark), turn 1.6 (from behind: spins you to face him), drag 1.5 (from
behind: yanks you 2 m to him), final 3.2 (the third grab: pulled in, zoom, fade). Damage lands on
release. From the front he picks shoulders/throat/face, from behind turn/drag, never the same twice in
a row. Pinned behind a trunk next to you and unwatched, he is on your side of it (`slip`); still pinned,
his arms reach round it (GRAB_AROUND 3.1 m).

**In the grass.** While closing in on someone walking the trail (30% of approaches, 240 s cooldown) he
may lie flat beside the trail 55-75 m ahead, placed unseen, preferring grass. Within 4.5 m (or lit
inside 9 m) he does the plank rise (1.1 s) and hunts; if they pass by he slips off.

**Sounds** (all procedural, `client/audio/synth.js`): joint pops (the mark when he starts closing in,
quiet, up to 40 m; one crack when a look back freezes him), crawl patter in leaves and knuckles on the
boardwalk when he moves low (audible to 8-11 m only), his exhale when he loses you, the body drop, the cloth grab, your choke (throat/face/final), and his breath in
time with yours when he is within 7 m and not hunting you.

**Animation** (`client/entities/animators.js`, `views.js`): hanging idle on his toes,
mid-stride freeze, owl head (2.75 rad), dead-arm upright run with over-long strides, backing away with the
gait in reverse, forward operated crawl, peek lean / low peek, six grab arm poses + reach, limp collapse
(whole-body fall about the feet), prone and the plank rise, stop-motion stutter within 5 m (7 fps).
