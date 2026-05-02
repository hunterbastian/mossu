# Asset Parking

Last updated: 2026-05-01

Use this file for assets, rigs, systems, or prototypes that should be preserved but not active in the playable route.

## Rules

- Park inactive code under an `unused` folder near its original ownership boundary.
- Do not import parked files from active runtime, tests, HUD copy, model viewer options, or text-state output.
- Keep parked code compilable only if it is still part of the TypeScript include path. If it is not compiled, note that here.
- Before restoring anything parked, update contracts, E2E coverage, UI copy, model-viewer options, and playtest checklist entries together.

## Mossback Titan

Status: parked.

Reason: the current Mossu slice is returning to cozy exploration and route polish. The hostile Titan prototype should stay available as reference material, but it should not affect gameplay, lighting, water ripples, HUD warnings, model-viewer options, or `render_game_to_text`.

Preserved files:

- `src/simulation/unused/giantMossCreature.ts`
- `src/render/objects/unused/MossbackTitanAvatar.ts`

Current active-runtime expectations:

- No active simulation state for a giant creature.
- No active world-renderer Titan mesh.
- No active water ripple source from the Titan.
- No HUD warning copy for Titan proximity or attacks.
- No model-viewer `model=titan` deep link or keyboard shortcut.
- No Titan fields in the compact E2E text-state payload.

Restore checklist:

1. Decide whether the Titan is hostile, ambient, or only a model-viewer specimen.
2. Move or copy the parked files back into active ownership paths.
3. Reconnect simulation, rendering, water interaction, UI copy, and text-state output deliberately.
4. Add focused contract or E2E coverage for spawn, alert, attack, respawn, and model-viewer fallback behavior.
5. Run `npm run lint`, `npm run qa`, `npm run test:e2e:smoke`, and a real-browser visual pass.
