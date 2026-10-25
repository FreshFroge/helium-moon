# Codex: visible teammate fear reactions

Owner-facing result: co-op players can now read a teammate's moment of fear.
When the server reports that remote teammate looking at Helium Voice, cutting his
strings, being grabbed, hit, downed, or killed, that avatar briefly turns its
head and rendered flashlight toward the threat and uses a restrained arm recoil.

This is a client-only visual response. It does not change snapshot yaw, player
position, input, collision, voice, or any server decision. It therefore cannot
aim a teammate's authoritative flashlight at Helium Voice or grant counterplay
they did not earn.

Files: `client/entities/views.js`, `client/game/game.js`.

Validation: `node --check client/entities/views.js`, `node --check
client/game/game.js`, and `node --check client/entities/animators.js` passed.

`tests/browser_encounters.py` passed its first four real attack cases, then
stopped at its pre-existing control-cut assertion: the test keeps simulating
after observing collapse, then checks a later snapshot after the short collapse
has already become `still` (`flags` 17 rather than 256). This task does not edit
Kimi's claimed browser suite. A rendered two-client check remains pending.
