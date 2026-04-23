# Systems Audit

Last updated: 2026-04-23

This audit covers the current state of the full redesign targets: terrain, rivers/water, inventory cards, grass, fauna herd AI, and performance. It is meant to guide implementation order without changing the core way the game works.

## Verdict

Yes, the full redesign direction is feasible in the current Three.js codebase. The project already has the right foundations:

- shared terrain and water sampling in `src/simulation/world.ts`
- Journey-like third-person camera and camera-relative movement
- instanced grass with shader wind hooks
- stylized water surfaces with shader profiles
- DOM inventory/profile UI with early holo-card styling
- ambient fauna with herd-ish idle/wander behavior
- dynamic pixel ratio and mostly instanced world rendering

The main risk is not missing technology. The risk is changing systems in the wrong order. Rivers and terrain should come first because they affect water visuals, swimming, grass density, forest placement, route landmarks, and map readability.

## Recommended Order

1. River and terrain contract cleanup
2. Inventory holo-card UI polish
3. Fauna recruitment and boids follow behavior
4. Premium grass wind and Mossu push pass
5. Performance instrumentation and tuning
6. Final terrain/forest composition polish

## Terrain

Current state:

- `sampleTerrainHeight()` is the source of truth for gameplay and rendering.
- The terrain sampler already uses local deterministic layered noise: FBM-style rolling hills, ridged peak noise, and domain warping.
- The rendered terrain mesh in `WorldRenderer.ts` is vertex-colored by height and slope.
- The island edge, route shelves, basins, mountain masses, and shrine approach are authored on top of the noise.
- Forest fill uses deterministic Poisson-style placement and instanced merged tree geometry.

Keep:

- Keep `sampleTerrainHeight()` as the shared contract.
- Keep the current local sampler for now instead of swapping to `THREE.Terrain` or a new dependency mid-pass.
- Keep route shelves and authored landmarks so the current slice remains playable.

Change next:

- Tune river cuts before broad terrain changes.
- Improve visible mountain silhouettes after river layout is stable.
- Refine snow/rock/grass slope transitions where high terrain currently reads too evenly.
- Use terrain nooks and banks to make the river feel like it belongs in the valley.

Files:

- `src/simulation/world.ts`
- `src/render/world/WorldRenderer.ts`
- `src/render/world/terrainDecorations.ts`

## Rivers And Water

Current state:

- River gameplay is sampled in `world.ts` through `sampleRiverChannels()`, `sampleWaterState()`, `sampleRiverWetness()`, and `sampleRiverNookMask()`.
- Main river width is roughly 27-40 world units depending on `z`.
- Four braided branch segments are active: meadow, silver, fir gate, and alpine.
- Rendered water is built in `waterSystem.ts` as water ribbons over those channels.
- The opening lake is separate and readable.
- Highland creeks are currently muted.

Problems:

- Branches are close enough to the main channel that water can read like overlapping strips.
- Rendered river width and gameplay active width are not easy to reason about at a glance.
- Nooks exist mathematically, but they need stronger bank shaping and grass readability.
- The main river is split around the opening lake, which is okay, but the transition needs cleaner composition.

Target:

- A broader, cleaner main river crossing the map.
- Fewer awkward braids, each with clear start/end feathering.
- Wider grassy nooks and small island-like banks between main and side channels.
- Water visuals, swimming state, river wetness, and grass clearing should agree.

Implementation notes:

- Start in `world.ts`: adjust `RIVER_BRANCH_SEGMENTS`, `sampleRiverWidth()`, `sampleRiverWetness()`, and `sampleRiverNookMask()`.
- Then update `waterSystem.ts` only after the channel contract reads correctly.
- Prefer fewer, wider, cleaner channels over many thin decorative ribbons.
- Keep the opening lake as a start-area feature.
- Leave highland creeks muted until the main valley river reads well.

Files:

- `src/simulation/world.ts`
- `src/render/world/waterSystem.ts`
- `src/simulation/waterTraversal.ts`
- `src/render/world/grassSystem.ts`

## Inventory Holo Cards

Current state:

- `Tab` opens the inventory/profile screen.
- `HudShell.ts` already renders collection and gathered-good entries as `inventory-holo-card` elements.
- `styles.css` already has foil, sheen, tone variants, hover states, locked states, and holo keyframes.

Target:

- Push the existing treatment toward collectible cards, closer to the holo/card references.
- Make the screen feel like a binder of discoveries, not a list of text rows.
- Keep stats, upgrades, discovery progress, and forageables readable.

Implementation notes:

- This is mostly a DOM/CSS pass.
- Strengthen card proportions, rarity/tone variation, card art badges, foil depth, and hover tilt.
- Avoid pointer-heavy effects that hurt readability or mobile/laptop layout.
- Keep locked cards intentionally mysterious but not washed out.

Files:

- `src/render/app/HudShell.ts`
- `src/styles.css`
- `src/simulation/characterScreenData.ts`

## Grass Premium Pass

Current state:

- Grass is already instanced.
- There are near, mid, far, and alpine grass groups.
- The shader already receives `uPlayerPosition`, `uPlayerVelocity`, and `uPlayerPush`.
- The shader already has macro wind, micro wind, a wind lane, distance fading, and some player push.

Target:

- Make the wind explicitly layered:
  - slow global field sway
  - medium gust fronts
  - fast per-blade flutter
  - slow breathing envelope over all layers
- Make Mossu push grass outward with stronger root-to-tip falloff.
- Keep the meadow saturated and cozy with brighter tips.
- Avoid alpha overdraw spikes.

Implementation notes:

- This is an enhancement, not a rewrite.
- Rename/tune shader math so the three wind layers are clear and controllable.
- Use player velocity to shape push direction and recovery.
- Tune grass density after river banks are cleaner, since river wetness and nooks affect placement.

Files:

- `src/render/world/grassSystem.ts`
- `src/render/world/WorldRenderer.ts`
- `src/simulation/world.ts`

## Fauna Herd AI

Current state:

- Ambient fauna live in `ambientBlobs.ts`.
- They already have herd IDs, homes, targets, velocity, rest/wander/curious/shy modes, separation, and group-center pull.
- They are currently render-side ambient actors, not player-recruitable simulation actors.
- `E` is already the interaction key.

Target:

- Press `E` near fauna to recruit them.
- Recruited fauna follow Mossu using boids rules:
  - separation
  - alignment
  - cohesion
  - follow leader
- Followers should stay visible, avoid stacking, and not block traversal.

Implementation notes:

- Add explicit recruited state to fauna instead of treating all fauna as purely ambient.
- Keep landmark/forageable interaction working; decide `E` priority as nearby fauna first only when a fauna is clearly in range, otherwise preserve current interact behavior.
- Add leader slots around/behind Mossu so the herd has a soft formation target.
- Let unrecruited fauna keep the existing shy/curious ambient behavior.

Files:

- `src/render/world/ambientBlobs.ts`
- `src/render/world/WorldRenderer.ts`
- `src/simulation/input.ts`
- `src/simulation/gameState.ts`
- `src/render/app/HudShell.ts`

## Performance

Current state:

- Renderer shadows are disabled.
- Forest fill is two instanced draw calls for generated forest trees.
- Grass is instanced, split into near/mid/far/alpine groups.
- Grass is hidden during map lookdown.
- `GameApp.ts` has dynamic pixel ratio adjustment between 1 and device pixel ratio capped at 1.75.
- Camera debug exists, but renderer stats are not exposed yet.

Targets:

- Keep Chrome gameplay smooth after the river, grass, and fauna passes.
- Make performance visible during tuning.
- Tune before adding chunking or LOD.

Implementation notes:

- Add a lightweight `?perfDebug=1` panel or extend debug output with:
  - pixel ratio
  - frame average
  - renderer draw calls
  - triangle count
  - geometries/textures
  - grass/forest instance counts
- Tune grass counts, water segment counts, and shader complexity based on the debug readout.
- Consider grass chunk culling only if debug numbers show it is needed.

Files:

- `src/render/app/GameApp.ts`
- `src/render/world/WorldRenderer.ts`
- `src/render/world/grassSystem.ts`
- `src/render/world/waterSystem.ts`
- `src/render/world/terrainDecorations.ts`

## Next Code Pass

Start with rivers and terrain together:

1. Simplify and widen the river channel plan in `world.ts`.
2. Make branches fewer, cleaner, and more separated from the main river.
3. Strengthen grassy nook masks and bank clearing.
4. Align `sampleWaterState()` and rendered water width.
5. Verify movement, swimming, grass placement, map readability, and Chrome frame feel.

This gives the rest of the redesign a cleaner world foundation.
