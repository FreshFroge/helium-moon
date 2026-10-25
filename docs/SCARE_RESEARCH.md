# What actually scares people, and what that means for Helium Moon

Research by Claude, Oct 25, 2026, at the owner's request ("deep research of
psychology and the best way to scare the player"). ChatGPT's coding agent is
adding game case studies in `docs/SCARE_RESEARCH_CODEX.md`.

These findings have to fit inside rules the owner already set (PROJECT_BRIEF §12
and Codex's audio notes):
- No cheap jump scares every 30 s.
- No loud or obvious warning sounds: the owner removed stingers, branch-snap
  warnings, the proximity heartbeat and the drone.
- Cold is the approach warning.
- Silence is a major tool.
- The fear should come from uncertainty, realism and intelligent creatures.

## 1. Findings

### Dread beats startle
- **Fear vs. anxiety.** Fear is the response to an identified threat. Anxiety is
  "an ineffable and unpleasant feeling of foreboding". It peaks when you *know*
  a threat exists but not when, where or what it will do. The Slender analysis
  finds that anxiety from withheld information is the main engine, and that
  "surprise alone yields a startle, not a full scare." ([Game Studies, Dudek](https://gamestudies.org/2102/articles/dudek))
- **Anticipation amplifies startle.** Anxiety increases the startle reflex, and
  a busy mind (high mental workload) makes a jump scare feel stronger. The one
  clear misdirection in the eye-tracking sample was the late *Hereditary* scene:
  a noise drew attention one way while the threat sat in a dark corner, and it
  produced a bigger startle. ([Recreational Fear Lab, "BOO → AAAH"](https://cc.au.dk/recreational-fear-lab/blog/view/artikel/boo-aaah-an-investigation-of-where-our-attention-is-guided-during-a-jump-scare-sequence-1))
- **Emotional contagion.** The most common film technique is showing a
  character's *frightened face before* the threat. Viewers mirror that fear and
  startle harder. (Same source.) In co-op, **your teammate is that character.**

### The sweet spot: fun is an inverted U
- In a haunted attraction (n = 110, heart-rate monitors and video), enjoyment
  peaked at *moderate* fear. Too little was boring, too much was unpleasant.
  People whose heart rate rose and *stayed high* enjoyed it less than people
  with short, moderate spikes. ([APS Observer](https://www.psychologicalscience.org/observer/playing-with-fear), [The Psychologist](https://bps.org.uk/psychologist/sweet-spot-fear))
- **Predictive processing.** We enjoy reducing prediction error *faster than
  expected*: "consumable errors". Horror builds uncertainty and then resolves
  it. Unresolvable uncertainty is overwhelming, and none is boring. (Same
  sources.)
- **Design meaning:** spikes, then real recovery. Don't hold players at maximum
  for long.

### Pacing systems that work
- **Left 4 Dead's AI Director** tracks an "intensity" value per survivor. It
  rises with damage, incapacitation and nearby kills, and decays over time. The
  Director runs **Build Up → Sustain Peak (3–5 s) → Peak Fade → Relax
  (30–45 s)**, with no new threats during Relax. It also punishes isolation
  "harshly but transparently", with no invisible leashes or teleporting
  stragglers. ([Valve GDC 2009](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf))
- **Alien: Isolation** has two brains:
  - **Director:** knows where you are, but only nudges the alien toward your
    *area*. The alien still has to find you with its own senses.
  - **Menace gauge:** rises with proximity and with seeing or hearing it. At a
    threshold the alien withdraws to the vents.
  - **The illusion of learning:** the alien unlocks behaviors after you escape
    the same way repeatedly (searching lockers, vent ambushes, flanking after
    flamethrower hits).
  - **Fairness:** detection builds gradually, the alien forgets over time, and
    its sounds are positioned in the world so you can tell where it is.

  ([Game Developer, "Revisiting the AI of Alien: Isolation"](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation))
- **Thomas Grip (Amnesia):** leave room for imagination, never let players see
  how the system is built, keep monsters unpredictable, and make the protagonist
  vulnerable. ([AV Club interview](https://avclub.com/amnesias-creative-director-on-what-makes-a-scary-video-1845392257))

### Sound
- **Nonlinear sounds.** Screams, roughness, subharmonics and sudden pitch jumps
  imitate animal alarm calls. Horror scores use them more than other genres
  (102 films analyzed). These sounds signal "a body pushed past its limits".
  ([NBC News, Blumstein & Kaye](https://www.nbcnews.com/id/wbna40383410))
- **Infrasound.** An 18 Hz tone at 75–78 dB that participants couldn't detect
  raised cortisol and irritation (n = 35, 2026). It came from room subwoofers,
  though, and headphones or laptop speakers can't reproduce it. Our hunt hum
  (31/33 Hz) is "felt bass" on good headphones, not true infrasound, and that's
  fine. ([PsyPost](https://www.psypost.org/new-research-indicates-sounds-you-cant-hear-can-spike-your-cortisol-levels-offering-a-biological-reason-for-sudden-creepy-feelings/))
- **Silence is a signal.** The owner's own example encounter: *"The player stops
  moving. The insects go quiet."* Absence of sound reads as threat (prey
  animals freeze) without being a warning sound.

### The uncanny
- A familiar human face that is *slightly wrong* (Mori's uncanny valley) is more
  disturbing than an obvious monster. Helium Voice already has the owner's
  face. Small, *rare* wrongnesses do more than gore: a locked head, a too-long
  stare, stillness while being lit, moving only when unwatched.
  ([Emory review of the uncanny valley](https://www.psychology.emory.edu/cognition/rochat/lab/The%20uncanny%20valley%20-%20existence%20and%20explanations.pdf))

## 2. Where Helium Moon already stands

| Principle | Already in the game |
|---|---|
| Build/peak/relax pacing | `director.js` phases, intensity decay, and relax after attacks (the Left 4 Dead model) |
| Withheld information, unseen presence | Cold-only approach cue, unseen closing-in, unseen relocation |
| Escalation over the night | `escalation()`, owner decision 2 |
| Felt bass during hunts | Hunt hum (31/33 Hz beating, only within 50 m) |
| Only one way to stop him | Flashlight within 7 ft |
| The uncanny | The owner's face, the locked head, the dead arms (animator) |

**Gaps:**
- He never learns.
- The forest never goes quiet before he strikes.
- His close vocals are clean, with no "past the limit" roughness.
- Teammates don't react visibly, so there's no contagion.
- He never exploits the player's busy moments (objectives).
- There are no rare false alarms, so the pattern becomes learnable.

## 3. Proposals (ranked by expected scare per unit of risk)

Each one keeps the owner's rules: no new loud warnings and no HUD.

| # | Change | Why (research) | Owner |
|---|---|---|---|
| **C1** | **The forest holds its breath.** When he commits to closing in on you (about 50 m), the insects and night ambience around *you* fade to near silence over ~2 s. They come back 10–25 s after the threat passes. It's skipped at random about 1 time in 4, so silence never becomes a guaranteed tell | Owner's own example encounter; silence as a threat signal; withheld certainty | **Claude** |
| **C2** | **He learns your escapes** (an illusion of learning, as in Alien: Isolation). He remembers how *each player* escaped: flashed him off, sprinted, hid in brush, stood by a teammate. Repeated tactics unlock counters: approaching from behind/beside after flash-offs, cutting off sprinters, lingering at brush. It's per player and decays over time | Unpredictability; "don't let players see how it's built" | **Claude** |
| **C3** | **Nonlinear voice.** Close-range Helium Voice vocals get subtle roughness and subharmonics, like a voice past its limits. Distant calls stay clean, so they stay humanlike and luring | Nonlinear sound research (Blumstein) | **Claude** |
| **X1** | **Teammate contagion.** When a teammate sees him, their avatar flinches: the head snaps, the flashlight whips toward him and stays there, and they take a step back. A hit teammate drops their light | Reaction shots → emotional contagion | **Codex** (avatars/views) |
| **X2** | **Moves only when unwatched.** Some watcher reveals hold perfectly still while lit, then he's gone (or a few meters closer) when you look back | The uncanny; Slender and weeping-angel dread | **Codex** (planned appearances are yours) |
| **X3** | **Busy hands.** Hunts and closing-in are more likely to start while a player holds an objective interaction (the progress ring). That's the high-workload moment | Mental workload amplifies startle | **Codex** (director) |
| **X4** | **Rare honest false alarms.** A deer bolts from brush, or an owl lifts off nearby: real animals, rare, never more than one per 5 min. This breaks "every noise is him" pattern-learning | Prediction error and "consumable errors" | **Ask the owner first** (they removed artificial snaps) |

## 4. How we'll verify

- `tests/hunt_playtests.mjs` and `tests/pacing.test.mjs`: hunts and threats per
  window shouldn't spike, because of the sweet spot. Relax windows must remain.
- New Node tests for C1 (hush only for players near a committed approach,
  restored later, and sometimes skipped) and C2 (memory is per player, decays,
  and changes the approach side).
- Audio check for C3 in a real AudioContext: roughness only within ~15 m.

## Status (Oct 25, ~16:15 UTC)

| # | Status |
|---|---|
| C1 forest holds its breath | ✅ `769e7ae`, `tests/hush.test.mjs` |
| C2 he learns your escapes | ✅ `dd1e1f7`, `tests/learn.test.mjs`. Repeat flashers aren't hunted while they face him; sprinters get cut off sooner; he sometimes says "Again." |
| C3 nonlinear voice up close | ✅ Inside 15 m, most lines get dry, rough and doubled; some stay clean |
| X4 false alarms | ✅ `3f6dacb`. Deer at 18–30 m, owl nearby |
| His voice | ✅ 8 real lines plus 18 cloned lines (`assets/audio/hv_voice/`), chosen server-side (`voiceLines.js`) |
| Attack camera lock (owner) | ✅ `d5496ae`. Within 4 ft, only on the actual hit |
| X1–X3, attack lines | Codex |
