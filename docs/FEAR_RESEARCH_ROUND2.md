# Fear research, round two: pursuit, uncertainty and co-op

October 25, 2026. This pass covers mechanisms not developed in the earlier
research: threat-imminence stages, predictable versus uncertain threat,
controllability, peripheral vision, change blindness, social buffering, motion
camouflage and vocal roughness. The proposals are design inferences from the
research, not claims that a single mechanic will frighten every player.

## Research findings

### Defensive behavior changes in stages

The predatory-imminence model distinguishes three broad defensive modes:

- **Pre-encounter:** danger is possible but not identified; the animal explores
  cautiously and increases vigilance.
- **Post-encounter:** a threat has been detected but has not attacked; freezing,
  focused attention and risk assessment dominate.
- **Circa-strike:** contact is imminent; explosive escape or defensive action
  replaces information gathering.

Fear and anxiety are therefore not just high and low settings of one meter.
They produce different behavior. Helium Voice should likewise change strategy
across these stages: ambiguous evidence, then an unnaturally legible watcher,
then a brief decisive physical attack.

Sources: Fanselow and Lester, “A Functional Behavioristic Approach to Aversively
Motivated Behavior” (1988); Perusini and Fanselow, “Neurobehavioral Perspectives
on the Distinction Between Fear and Anxiety,” *Learning & Memory* (2015),
[DOI 10.1101/lm.039180.115](https://doi.org/10.1101/lm.039180.115).

### Uncertain threat sustains anxiety, but ambiguity needs limits

Uncertainty about a negative event recruits anticipatory systems and encourages
vigilance. Uncertainty about *when* and *where* can be more anxiety-provoking
than a fully predictable event. But uncertainty also taxes attention and can
become aversive rather than enjoyable when it never resolves.

Source: Grupe and Nitschke, “Uncertainty and Anticipation in Anxiety,” *Nature
Reviews Neuroscience* (2013),
[DOI 10.1038/nrn3524](https://doi.org/10.1038/nrn3524).

Design implication: an approach should have a bounded period of ambiguity and
then resolve into a sighting, withdrawal, attack, or genuine relaxation. Never
leave the player in a permanent “maybe” state with a continuous warning layer.

### Control changes whether stress feels challenging or helpless

Perceived control over an aversive event changes later stress responses. Games
need danger, but a consistent action that sometimes saves the player makes
failure attributable and invites another attempt. Arbitrary unavoidable
attacks teach disengagement instead.

Source: Maier and Seligman, “Learned Helplessness at Fifty,” *Psychological
Review* (2016), [DOI 10.1037/rev0000033](https://doi.org/10.1037/rev0000033).

Design implication: the close flashlight counter, cover, physical collision
and readable recovery windows are part of the horror system. Making Helium
Voice scarier should place those decisions under pressure rather than silently
disable them.

### Peripheral vision detects motion but resolves poor detail

Peripheral vision is well suited to noticing changes and motion but has lower
spatial detail and suffers crowding. A human-shaped movement near the edge of
the screen can be detected before it can be confidently identified. Players
then turn the high-detail center of vision toward it—creating an authored
attention shift without taking camera control.

Source: Strasburger, Rentschler and Jüttner, “Peripheral Vision and Pattern
Recognition: A Review,” *Journal of Vision* (2011),
[DOI 10.1167/11.5.13](https://doi.org/10.1167/11.5.13).

Design implication: a fleeting edge crossing should use a real silhouette and
world occlusion. Screen-space ghosts, post-process figures and repeated corner
flashes would train the player to dismiss the effect as UI noise.

### Visual attention does not preserve a complete scene

Change-blindness research shows that even large changes can go unnoticed when
they occur across a visual interruption or while attention is elsewhere. Horror
can use this without cheating: let the player see a real configuration, allow a
normal occlusion or look-away, then physically change the configuration while
it is unseen.

Source: Simons and Levin, “Change Blindness,” *Trends in Cognitive Sciences*
(1997), [DOI 10.1016/S1364-6613(97)01080-2](https://doi.org/10.1016/S1364-6613(97)01080-2).

Design implication: X2 “moves only when unwatched” should use actual visibility
from every player and preserve the before/after spatial logic. The player should
realize that something changed, not watch a teleport effect.

### Real predators can hide movement, not just appearance

In motion camouflage, a pursuer follows a path that keeps its bearing relative
to a fixed landmark or distant background. To the target, the pursuer has very
little lateral retinal motion and can resemble a stationary object while its
image slowly expands. Dragonflies have been observed using related pursuit
geometry.

Sources: Srinivasan and Davey, “Strategies for Active Camouflage of Motion,”
*Proceedings of the Royal Society B* (1995),
[DOI 10.1098/rspb.1995.0004](https://doi.org/10.1098/rspb.1995.0004); Mizutani,
Chahl and Srinivasan, “Motion Camouflage in Dragonflies,” *Nature* (2003),
[DOI 10.1038/423604a](https://doi.org/10.1038/423604a).

Design implication: a special watcher approach can keep Helium Voice near one
screen bearing while he closes slowly. The visual fact that “the person-shaped
tree is getting larger” is stronger than another invisible speed increase.

### Another person can buffer threat

Social support can reduce neural threat responses; even holding a partner's
hand has been associated with reduced threat-related activation in laboratory
work. Co-op players also distribute attention and verify ambiguous cues for one
another. The answer is not to punish friendship. Helium Voice should make the
team uncertain about where to look and whom he selected.

Source: Coan, Schaefer and Davidson, “Lending a Hand: Social Regulation of the
Neural Response to Threat,” *Psychological Science* (2006),
[DOI 10.1111/j.1467-9280.2006.01832.x](https://doi.org/10.1111/j.1467-9280.2006.01832.x).

Design implication: visible teammate reactions, target-specific gaze and
physical positioning between players can weaken social certainty while leaving
voice chat and cooperation valuable.

### Roughness has a useful range

Human screams concentrate modulation energy in a roughness range uncommon in
ordinary speech, and that roughness is associated with greater aversiveness and
amygdala response. This supports Claude's close nonlinear voice work, but also
sets a limit: if every line uses maximal roughness, it stops contrasting with
speech and becomes a constant alarm texture.

Source: Arnal et al., “Human Screams Occupy a Privileged Niche in the
Communication Soundscape,” *Current Biology* (2015),
[DOI 10.1016/j.cub.2015.06.043](https://doi.org/10.1016/j.cub.2015.06.043).

## New mechanics ranked by value and feasibility

### R1 — Motion-camouflaged watcher approach

For a rare watcher plan, choose a player-visible background anchor such as a
large trunk. While the player moves, Helium Voice adjusts his slow route so his
bearing from that player changes very little. He remains a real world object,
gets physically larger in the image and stays outside contact range. End the
behavior if another player sees his lateral movement, if the route becomes
blocked, or after 4–8 seconds.

Expected experience: “I thought that was a person standing still. It was closer
every time I looked.”

Safety and fairness:
- Never use it during the opening dread.
- It does not bypass navigation, spawn exclusion or the 12 m relocation margin.
- The approach ends before attack range and hands control to the ordinary hunt
  decision.
- Use a strict duration and frequency cap; geometric perfection would look like
  a bug.

### R2 — Occlusion prediction trap

Let a planned crossing visibly enter behind a real wide trunk. Most of the time
he exits as expected. Rarely, after every player loses sight, he stops behind
the trunk or takes a concealed route away. The player turns toward the expected
exit and finds nothing. After a delay, a later physical trace, voice fragment or
appearance can resolve the uncertainty elsewhere.

This combines change blindness with an interrupted prediction. It is stronger
than a random disappearance because the player personally formed the wrong
expectation.

Guardrails:
- Validate actual continuous occlusion for all players.
- Do not relocate immediately to the player's back; reuse existing cooldown and
  safe unseen relocation rules if relocation happens later.
- Sometimes complete the ordinary crossing so the tree is not a guaranteed
  disappearance trigger.

### R3 — Peripheral crossing with perceptual proof

Create an appearance lane through the outer 60–85% of one player's horizontal
view, lasting about 0.35–0.8 seconds. Helium Voice crosses physically between
two cover points. If the player turns quickly enough, the last portion of the
real body remains available to see. If nobody could have detected enough of the
silhouette, do not count it as an encounter.

This uses peripheral motion sensitivity while preserving proof. A player who
reacts should be rewarded with a coherent world, not an effect that disappears
because it was only a screen overlay.

### R4 — Defensive-cascade encounter structure

Give each substantial Helium Voice encounter an explicit internal stage:

1. **Possible:** one ambiguous, honest sign at most; he is not yet committed.
2. **Detected:** stillness, gaze, partial cover or a bounded search; the player
   can choose light, movement or retreat.
3. **Imminent:** a short decisive chase, strike or physical escape.
4. **Resolved:** real silence and director recovery.

This is a design constraint rather than a new effect. It prevents systems such
as hush, hum, cold, voice, footsteps and visuals from all activating together
for minutes.

### R5 — Selected witness

During a watcher appearance with multiple players, select one witness. Helium
Voice tracks that person's face and ignores the nearer teammate for 1–3 seconds.
If the selected player looks away, he may switch attention once, but repeated
rapid switching is forbidden.

The selected gaze punctures social buffering without disabling cooperation.
Other players see the interaction and become the “reaction shot”; X1 teammate
flinches strengthen this effect.

### R6 — Physical group split

When two players are separated by 8–25 m, Helium Voice may choose cover that
places his route between them without spawning or teleporting between them. He
does not receive a damage bonus. His presence simply makes reunion require a
decision: illuminate him, take a longer route, or wait together.

This uses co-op geometry instead of muting voice chat or applying invisible
isolation penalties. It should be rare and only occur when both players retain
at least one collision-clear retreat route.

### R7 — Bounded uncertainty clock

When a hush or committed approach begins, start a hidden resolution window.
Within roughly 8–25 seconds, one of four outcomes must occur: a glimpse, a hunt,
a physical withdrawal, or a clean cancellation followed by recovery. The player
cannot predict which outcome, but the system cannot maintain unresolved tension
forever.

This is compatible with the owner's desire for frequent Helium Voice presence:
more approaches can occur because each one ends cleanly rather than occupying
the director indefinitely.

### R8 — Roughness as a state transition

Keep recorded speech mostly human. Add the 30–150 Hz modulation/rough layer only
on a small subset of vocal onsets during a transition from detected to imminent
threat. Fade or break the rough layer rather than sustaining it through a whole
line. A clean word that momentarily fails is more disturbing than a permanent
monster filter.

This refines C3 and the voice-direction document; it is not a new proximity
curve.

### R9 — Counterplay under perceptual load

Make the existing flashlight decision harder through attention, not hidden rule
changes. Examples: Helium Voice remains partly covered, selects one teammate,
or begins a physical lateral move while the player is repairing equipment. The
close flashlight still works exactly as documented when correctly aimed.

This preserves control while increasing the cost of noticing and acting.

## Ideas considered and rejected

- **Random control delay or false input:** it attacks agency and reads as lag.
- **Turning off the flashlight without an in-world cause:** it silently removes
  the player's established counter.
- **Fake network teammates or fake chat messages:** this violates the project
  brief and trust required for real co-op.
- **Screen-space peripheral ghosts:** they cannot be verified by turning and
  quickly become ignorable post-processing.
- **Perfect motion camouflage during a sprint:** maintaining the geometry would
  require implausible sliding and would expose the system.
- **Punishing grouped players with extra damage:** companionship should remain
  useful; uncertainty about attention is enough.
- **Maximal roughness on every close line:** it becomes an alarm and destroys
  the recognizable real voice.
- **An indefinite suspense state:** sustained arousal reduces enjoyment and
  makes each cue feel inconsequential.

## Recommended ownership and order

1. **Codex X1:** finish teammate visual reaction. This enables selected-witness
   social fear without changing AI balance.
2. **Codex X2:** combine moves-while-unwatched with R2 occlusion prediction and
   R3 peripheral proof. Prototype each as a fixed browser fixture first.
3. **Claude C2/C3:** use R8 to constrain nonlinear voice and expose learned
   counters through behavior rather than a meter.
4. **Joint review:** define R4/R7 encounter-stage invariants before changing the
   director. These touch both agents' current systems.
5. **Later prototype:** R1 motion camouflage is high-value but geometrically
   novel; prove it at one generated-world location before generalizing.
6. **After co-op validation:** R5 selected witness and R6 physical group split.

## Measurements

- Log time in possible/detected/imminent/resolved stages and reject approaches
  that never resolve inside the configured window.
- For peripheral crossings, record screen-space entry/exit, visible duration
  and whether a fast turn retains physical visual contact.
- For motion camouflage, measure angular-bearing drift, distance closed and
  lateral world speed; reject paths that require visible sliding.
- For co-op, compare encounter and damage distributions by team spacing without
  increasing damage rules.
- After voice processing, measure modulation spectra and line intelligibility;
  rough treatments must remain a minority of vocal events.
- Preserve current opening, spawn, relocation, collision, recovery and close-
  flashlight regressions throughout.

