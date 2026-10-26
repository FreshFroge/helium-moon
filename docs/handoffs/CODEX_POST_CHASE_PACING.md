# Post-chase withdrawal and brief scares — Codex active claim

Owner addition, October 26, 2026 (America/Chicago): after a chase Helium Voice
must physically travel 200 metres away and cannot chase again for about four
minutes. Reveals should last 1–2 seconds. Between chases he should use alternate
scares, including following behind unseen and fleeing fast when spotted.

Codex reserves `shared/sim/heliumVoice.js`, `shared/sim/director.js`,
`shared/config.js`, affected hunt/attack/reveal tests and focused new withdrawal
coverage. The earlier search-audio changes in these files must be preserved.
No map/model/other-enemy changes are planned.

Implementation: an end-based 240-second hard gate on every chase entry path;
persistent physical withdrawal after every hunt outcome, including concealed
timeout; short sightings and non-attacking shadow-follow encounters during
the cooldown after withdrawal. Keep the immediate fast post-grab escape and
use physical travel without teleporting to satisfy the withdrawal.

Validation/results and release of claims will be recorded after implementation.
This Git handoff is the coordination channel; receipt by other AIs is not assumed.
