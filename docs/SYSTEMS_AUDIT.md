# Systems Audit

Last updated: 2026-04-24

This audit covers the current state of the full redesign targets: terrain, rivers/water, inventory cards, grass, fauna herd AI, and performance. It is meant to guide implementation order without changing the core way the game works.

## Verdict

Yes, the full redesign direction is feasible in the current Three.js codebase. The project already has the right foundations:

- shared terrain and water sampling in `src/simulation/world.ts`
- Journey-like third-person camera and camera-relative movement
- instanced grass with shader wind hooks
- stylized water surfaces with shader profiles
- DOM inventory/profile UI with early holo-card styling
- Karu fauna with recruitable boids follow behavior
- dynamic pixel ratio and mostly instanced world rendering

The main risk is not missing technology. The risk is letting visual passes drift away from gameplay contracts. Rivers, terrain, swimming, grass density, forest placement, route landmarks, and map readability all still depend on the same shared samplers.

## Recommended Order

1. Inventory holo-card UI polish
2. River route QA and bank/swim tuning
3. Grass visual QA and performance tuning
4. Final terrain/forest composition polish
5. Repo cleanup, remote, and push

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

- Playtest river cuts before broad terrain changes.
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
- Main river width is now broad enough to read as a central valley river across the map.
- Three braided branch segments are active: meadow, fir gate, and alpine.
- Rendered water is built in `waterSystem.ts` as water ribbons over those channels.
- The opening lake is separate and readable.
- Highland creeks are currently muted.
- Grass density now favors dry river nooks and clears wet river/lake edges more aggressively.

Remaining checks:

- Walk the full route in Chrome and confirm branch/main separation from gameplay camera height.
- Check bank readability and swimming transitions around wider water.
- Tune any channel that still feels too thin, too thick, or overlapped.
- Confirm rendered river width and gameplay active width agree at the places players enter/exit water.

Target:

- A broader, cleaner main river crossing the map.
- Fewer awkward braids, each with clear start/end feathering.
- Wider grassy nooks and small island-like banks between main and side channels.
- Water visuals, swimming state, river wetness, and grass clearing should agree.

Implementation notes:

- Continue in `world.ts` for sampler changes: `RIVER_BRANCH_SEGMENTS`, `sampleRiverWidth()`, `sampleRiverWetness()`, and `sampleRiverNookMask()`.
- Update `waterSystem.ts` only when rendered width or segment density needs visual correction.
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
- The shader now has slow global sway, medium gust fronts, fast flutter, and a breathing envelope.
- Mossu push now uses wider player radius, velocity wake, and stronger tip-heavy bending.
- Meadow colors are more saturated, and dry river nooks get extra density/brightness.

Remaining target:

- Tune wind/push strength in a real Chrome playtest.
- Keep Mossu visible in dense near grass.
- Avoid alpha overdraw spikes after the shader became more expressive.

Implementation notes:

- This remains an enhancement, not a rewrite.
- Use the existing `GrassOptions` knobs before changing instance counts.
- Tune grass density through `sampleGrassDensity()` because river wetness and nooks affect placement.

Files:

- `src/render/world/grassSystem.ts`
- `src/render/world/WorldRenderer.ts`
- `src/simulation/world.ts`

## Fauna Herd AI

Current state:

- Karu live in `ambientBlobs.ts`.
- They have herd IDs, homes, targets, velocity, rest/wander/curious/shy modes, separation, and group-center pull.
- Recruited Karu use boids-style separation, alignment, cohesion, and leader-follow slots.
- `E` recruits nearby Karu in gameplay mode.
- The state is still render-side and intentionally not saved yet.

Remaining target:

- Playtest recruited Karu across slopes, river banks, and shallow water edges.
- Decide whether long-term recruitment should stay cluster-based or become one-by-one.
- Decide if recruited Karu should persist in save state later.

Implementation notes:

- Keep landmark/forageable interaction working; Karu recruitment should only take priority when a Karu is clearly in range.
- Keep leader slots around/behind Mossu so the herd has a soft formation target.
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
- `GameApp.ts` has dynamic pixel ratio adjustment with min/max pixel ratio bounds.
- `?cameraDebug=1` exposes camera state.
- `?perfDebug=1` exposes FPS, frame time, pixel ratio, renderer calls, triangles, memory, grass, forest, water, and shader counts.
- First Chrome tuning snapshot after the premium grass/water pass: about `1007` renderer calls, `1.78M` triangles, `13,792` grass instances, `8,968` water triangles, and pixel ratio downshifted to `0.78`.

Targets:

- Keep Chrome gameplay smooth after the river, grass, and fauna passes.
- Make performance visible during tuning.
- Tune before adding chunking or LOD.

Implementation notes:

- Tune grass counts, water segment counts, decoration counts, and shader complexity based on the debug readout.
- Consider grass chunk culling only if debug numbers show it is needed.

Files:

- `src/render/app/GameApp.ts`
- `src/render/world/WorldRenderer.ts`
- `src/render/world/grassSystem.ts`
- `src/render/world/waterSystem.ts`
- `src/render/world/terrainDecorations.ts`

## Next Code Pass

Best next implementation pass: inventory holo-card binder polish.

Why:

- Rivers, Karu, performance instrumentation, and grass all have first implementations now.
- Inventory is still the largest visible redesign item that has not received its full pass.
- The existing DOM/CSS foundation already has `inventory-holo-card` classes, so this is likely a controlled UI polish pass rather than a risky systems rewrite.

Parallel/secondary follow-up:

1. River route QA in Chrome.
2. Grass wind/push visual tuning.
3. Terrain/forest composition polish.
4. Performance tuning based on `?perfDebug=1`.

This gives the rest of the redesign a cleaner world foundation.
