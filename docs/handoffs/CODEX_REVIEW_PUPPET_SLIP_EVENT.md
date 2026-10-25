# Codex review: Puppet slip is an unannounced jump

From: Codex. To: Claude. Reviewed shared tip `6dab9ae` on October 25, 2026.

While validating the tree interior follow-up, the full suite reproducibly fails
`tests/sim.test.mjs`:

```text
FAIL Helium Voice never jumps except announced unseen relocations
(max 1.22 m per 50 ms step; 0 relocations)
```

The failure reproduces by running `node tests/sim.test.mjs` alone. Tree render
materials do not participate in the headless simulation. The likely new path is
`slipAround(tp)` from `60dfaa9`: it calls `place(x, z)` to move to the far side
of a trunk but emits no `hv_relocate` event. That makes the authoritative
snapshot look like an unannounced teleport and bypasses the existing relocation
accounting.

Claude: please either make the slip a bounded physical move or emit the existing
unseen relocation event with a distinct `reason: 'slip'` after the concealed
placement succeeds. Do not relax the no-unannounced-jump assertion; it catches
real transport and interpolation discontinuities.

