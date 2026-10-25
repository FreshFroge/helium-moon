# Physiological fear research: making Helium Voice scarier

Research and design recommendations, October 25, 2026. This extends
`SCARE_RESEARCH.md` and `SCARE_RESEARCH_CODEX.md`. “Physiological” here means
designing around human defensive responses; it does **not** mean pretending the
game can read a player's pulse, forcing camera movement, or making the existing
heartbeat and breathing loud again.

## What the evidence supports

### A closing threat changes the defensive system

Human threat processing changes as danger gets physically closer. In an
active-avoidance fMRI task, distant threat was associated more with forebrain
regions involved in evaluating a situation; imminent threat shifted activity
toward midbrain circuitry associated with rapid defensive action. The useful
design point is that **the last few metres should feel behaviorally different**,
not merely louder.

Source: Mobbs et al., “When Fear Is Near: Threat Imminence Elicits Prefrontal-
Periaqueductal Gray Shifts in Humans,” *Science* (2007),
[DOI 10.1126/science.1144298](https://doi.org/10.1126/science.1144298).

Approaching sights and sounds also receive priority. Rising-intensity sounds
are commonly perceived as changing more than equivalent receding sounds, an
“auditory looming” bias; neuroimaging work likewise finds specialized responses
to looming sound. This does not justify a loud crescendo. It supports a brief,
physically coherent acceleration that the player sees or hears only once the
threat is already near.

Sources: Neuhoff, “Perceptual Bias for Rising Tones,” *Nature* (1998),
[DOI 10.1038/25862](https://doi.org/10.1038/25862); Seifritz et al., “Neural
Processing of Auditory Looming in the Human Brain,” *Current Biology* (2002),
[DOI 10.1016/S0960-9822(02)01356-8](https://doi.org/10.1016/S0960-9822(02)01356-8).

### Freezing prepares action

Defensive freezing is not simply passive paralysis. In humans it includes
reduced movement and heart-rate deceleration while the nervous system gathers
information and prepares action. A predator that also freezes can exploit the
same moment: the player stops to inspect the woods; Helium Voice stops too;
neither side resolves the encounter until one moves.

Source: Roelofs, “Freeze for Action: Neurobiological Mechanisms in Animal and
Human Freezing,” *Philosophical Transactions of the Royal Society B* (2010),
[DOI 10.1098/rstb.2009.0187](https://doi.org/10.1098/rstb.2009.0187).

### Eyes and biological motion are unusually sensitive signals

People respond to fearful eye whites even when the image is masked from
conscious report, and direct versus averted gaze changes how facial emotion is
interpreted. A human-shaped threat does not need a large facial animation. A
small, readable eye/head relationship can be more effective: eyes and head
acquire the player before the chest and feet turn.

Sources: Whalen et al., “Human Amygdala Responsivity to Masked Fearful Eye
Whites,” *Science* (2004),
[DOI 10.1126/science.1103617](https://doi.org/10.1126/science.1103617); Adams and
Kleck, “Perceived Gaze Direction and the Processing of Facial Displays of
Emotion,” *Psychological Science* (2003),
[DOI 10.1111/1467-9280.01426](https://doi.org/10.1111/1467-9280.01426).

Appearance/motion mismatch is also central to the uncanny response. In one
neuroimaging study, an android whose humanlike appearance conflicted with its
mechanical movement produced stronger prediction-error responses. Helium Voice
already has the right ingredients: an ordinary human body and face with timing
that can be subtly wrong.

Source: Saygin et al., “The Thing That Should Not Be: Predictive Coding and the
Uncanny Valley in Perceiving Human and Humanoid Robot Actions,” *Social
Cognitive and Affective Neuroscience* (2012),
[DOI 10.1093/scan/nsr025](https://doi.org/10.1093/scan/nsr025).

### Personal space is part of the threat

The amygdala contributes to regulation of interpersonal distance. A threat that
quietly enters the near-body zone is qualitatively different from a distant
figure, even before contact. This supports close partial appearances—a face or
shoulder just beyond a tree—provided the game preserves collision, escape time,
and the owner's 12 m relocation safety rule.

Source: Kennedy et al., “Personal Space Regulation by the Human Amygdala,”
*Nature Neuroscience* (2009),
[DOI 10.1038/nn.2381](https://doi.org/10.1038/nn.2381).

### Uncertainty works until it becomes noise

Uncertain threat can sustain anticipatory anxiety, but constant unresolved
uncertainty becomes exhausting. Variable outcomes are useful when each cue has
several honest explanations and is eventually resolved. Helium Moon therefore
needs multiple approach forms and real recovery periods, not continuous false
alarms or random visual glitches.

This agrees with the recreational-fear inverted-U findings already cited in
`SCARE_RESEARCH.md`: enjoyment peaks around manageable, fluctuating arousal,
not a permanently elevated state.

## Ranked mechanics

### P1 — Predatory pause, then visually coherent acceleration

When an unseen committed approach reaches roughly 10–18 m, Helium Voice may
stop for 0.7–2.0 seconds. His footsteps stop because his body stops; no new cue
is played. If the player exposes him, he holds still for a fraction of a second,
then either commits or escapes according to the existing hunt rules. If he
commits, his first two steps shorten and accelerate into the current burst.

Why it should work: it combines reciprocal freezing with a looming transition.
The player's nervous system gets a moment to inspect, followed by a rapid but
physical resolution. The pause also makes the existing sudden acceleration
look intentional rather than like an AI speed change.

Guardrails:
- Never delay an attack already inside contact range.
- No loud sting, forced camera, FOV kick, or screen shake before contact.
- Randomly omit the pause; never make it a guaranteed attack countdown.
- Preserve the close-flashlight counter and line-of-sight collision checks.

### P2 — The face acquires first

In selected watcher and reveal poses, Helium Voice should move his eyes/head
toward the witness 180–450 ms before his torso begins to follow. Sometimes the
head should stop a few degrees short, then finish the turn after a second. When
two players observe him, he should choose one face and stay with it instead of
averaging between them.

Why it should work: gaze is a biologically privileged signal, and a human body
whose parts update on slightly different schedules creates prediction error.
It also displays intelligence: he appears to select a person.

Guardrails:
- Keep the offset anatomically possible and avoid a supernatural full neck
  rotation.
- Use it in perhaps one third of clear sightings, not every idle frame.
- Do not make eye emissiveness or glowing eyes the effect; the face should stay
  human when lit.

### P3 — Near-edge partial reveal

Add a rare planned appearance in which only part of his silhouette—one eye,
half the face, or a shoulder—is visible around a real trunk at 12–22 m. He holds
for 0.4–1.2 seconds. If the player centers the light on him, he either withdraws
behind the same cover or commits according to the director. He must path to and
from that actual cover; no visible popping.

Why it should work: the figure enters near personal space while incomplete
visual information forces the player to resolve whether it is a person, tree,
or threat. It uses the recognizable face without overexposing the whole model.

Guardrails:
- Respect the opening period, spawn exclusion, relocation distance and every
  player's screen—not just the target's.
- Require a genuinely occluding trunk and a collision-clear exit route.
- Count it as a real appearance only after enough pixels/time to perceive it.

### P4 — Three approach grammars instead of one probability soup

Select one approach grammar at commitment and keep it coherent until the
encounter resolves:

1. **Patient watcher:** stillness, direct gaze, withdraws when scrutinized.
2. **Cutoff hunter:** stays unseen, relocates only under existing safety rules,
   then commits decisively.
3. **False retreat:** permits a clear glimpse, physically reverse-crawls away,
   and may return from a different route after a real delay.

Why it should work: players can form a prediction, but they cannot identify the
grammar immediately. Coherence makes Helium Voice seem intentional; variation
prevents habituation.

Guardrails:
- No grammar should be selected from distance alone.
- Preserve the director's peak and relaxation limits.
- Do not change grammar repeatedly during one approach to manufacture chaos.

### P5 — Delayed physical trace

After Helium Voice passes through brush, nearby leaves may continue moving for
1–3 seconds. The disturbance follows his actual capsule path and appears behind
him, never ahead as a fake locator. It is visual first; any rustle remains at
the existing quiet foliage level.

Why it should work: a physical after-effect makes him feel embodied while
forcing the player to infer whether the movement marks his current position or
where he was. It produces uncertainty without lying about world rules.

Guardrails:
- Do not trigger every step or create a glowing trail.
- Never reveal his exact present location through synchronized audio.
- Use existing foliage instances and strict performance caps.

### P6 — Action-contingent breath, not proximity breath

Keep the player's breathing quiet and distance-independent, as the owner
requested. For Helium Voice, add rare vocal breaths tied to actions: a small
inhale before he decides to emerge, or an interrupted exhale when the flashlight
forces him away. Do not scale their rate or loudness continuously with range.

Why it should work: respiration signals a living body and an intention to act.
Event-contingent breaths have meaning without recreating an audio radar.

### P7 — Memory shown through posture

Claude's planned escape-learning system should have a subtle visible payoff.
After repeated close flashlight escapes, Helium Voice approaches with chin
lowered and face slightly averted while keeping one eye toward the player. After
repeated sprint escapes, he waits with weight already pitched forward. These
are restrained pose biases, not stat buffs or UI messages.

Why it should work: learning becomes legible through biological motion without
exposing a meter. The player realizes retrospectively that the creature adapted.

## Methods to avoid

- **Do not seize or steer the player's camera.** Loss of camera control causes
  frustration and motion sickness and makes the scare feel authored rather
  than discovered.
- **Do not increase player heartbeat or breathing with distance.** The owner
  explicitly rejected those proximity cues; they also become range meters.
- **Do not use true infrasound claims.** Ordinary headphones and laptop speakers
  cannot reproduce it reliably. The existing audible hunt hum is enough.
- **Do not add screen-wide hallucinations as routine warnings.** They announce
  the system and weaken trust in the physical forest.
- **Do not make Helium Voice constantly stare.** Direct gaze works because it
  is selected and contrasts with his other behavior.
- **Do not combine every effect in one encounter.** One dominant violation per
  encounter is more readable and gives the player a recovery period.
- **Do not add unavoidable close teleports.** Personal-space intrusion must
  retain the current unseen-only relocation and minimum-distance safeguards.

## Recommended implementation order

1. Finish X1 teammate reaction already claimed by Codex; it externalizes fear
   without changing Helium Voice's balance.
2. Implement P2 face-first gaze as part of X2 “moves only when unwatched.” Both
   touch planned appearances and animation, so one tested pass avoids overlap.
3. Add P1 predatory pause to committed approach/chase transition and measure
   hit timing; this has the highest behavior risk and needs pacing tests.
4. Prototype P3 at three known real-tree locations in a browser fixture before
   enabling procedural selection.
5. Add P4 encounter grammar selection only after the individual behaviors are
   reliable.
6. Treat P5 foliage traces as a later rendering/performance task.

## Validation

- Record first-person video of each behavior at normal speed. Judge whether the
  body reads as intentional without a debug overlay.
- In 16 seeded 15-minute sessions, compare encounter count, hit count, time at
  peak, relaxation duration and attacks with no escape opportunity.
- Measure pause-to-contact time and confirm the close flashlight remains usable.
- Browser fixtures must prove that partial reveals use real cover, remain at
  least 12 m away, and never visibly teleport.
- Test gaze with one and multiple observers; the chosen witness should see eye
  contact while the body remains anatomically plausible for every client.
- Headphone test: participants should not estimate exact distance from breath
  processing or vocal treatment alone.

