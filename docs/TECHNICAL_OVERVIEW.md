# Technical Overview

Last updated: 2026-05-09

## Stack

- Vite
- TypeScript
- Three.js
- camera-controls
- three-mesh-bvh

Rendering reference:

- `docs/THREE_RENDERING_NOTES.md`: Mossu-specific Three.js, WebGPU, TSL, and postprocessing guidance.
- `docs/MODEL_INVENTORY.md`: complete procedural model/archetype list for characters, trees, props, water, terrain, and atmosphere.

Useful scripts:

```bash
npm run dev
npm run lint
npm run qa
npm run test:e2e:smoke
npm run art:review
npm run art:compare
npm run preview
```

## Entry Points

- `src/main.ts`: selects the game/model-viewer/island-viewer route and creates the active app.
- `src/runtimeBridge.ts`: attaches automation/debug globals only for test/debug/perf query params, then starts the app.
- `src/render/app/GameApp.ts`: top-level app coordinator for renderer, scene, camera, input, HUD, and view modes.
- `src/render/app/IslandViewerApp.ts`: debug-only full-island terrain atlas for orbit/top/profile inspection, route lines, landmark pins, water ribbons, shell cliffs, and ocean-below composition checks.
- `src/simulation/gameState.ts`: top-level simulation coordinator.
- `src/simulation/world.ts`: public terrain/water/world sampler contract.
- `src/simulation/worldTypes.ts`: public world/domain type definitions re-exported by `world.ts`.
- `src/simulation/worldContent.ts`: stable world catalog builders for landmarks, map markers, forageables, scenic pockets, shadow pockets, and biome thresholds.
- `src/render/world/WorldRenderer.ts`: composes the 3D scene.
- `src/styles.css`: ordered DOM style entrypoint.

## Core Runtime Contract

`src/simulation/world.ts` is the central runtime world contract. Keep stable data and type ownership in neighboring modules when possible, but preserve the public sampler/value exports because many systems depend on:

- `sampleTerrainHeight(x, z)`
- `sampleBaseTerrainHeight(x, z)`
- `sampleTerrainNormal(x, z)`
- `sampleBiomeZone(x, z, height)`
- `sampleWaterState(x, z)`
- `sampleRiverSurfaceMask(x, z)`
- `sampleRiverWetness(x, z)`
- `sampleRiverDampBankMask(x, z)`
- `sampleStartingWaterWetness(x, z)`
- `sampleRiverEdgeState(x, z)`
- `worldLandmarks`
- `worldForageables`
- `scenicPockets`

Do not change these casually. Terrain, water, grass, collectibles, character state, map labels, and decoration placement all depend on them.

## Simulation Modules

- `gameState.ts`: frame state, save state, update order, character screen data access.
- `input.ts`: keyboard input mapping.
- `worldTypes.ts`: shared domain types for biome zones, water samples, landmarks, forageables, map markers, scenic pockets, and world regions.
- `worldContent.ts`: static world catalog construction around the samplers from `world.ts`.
- `progressionObjectives.ts`: objective copy and trail-progression summaries used by gameplay HUD and character/profile screens.
- `movementPhysics.ts`: walk/roll/jump/float movement.
- `waterTraversal.ts`: swim state and water contact resolution.
- `staminaAbilities.ts`: stamina and ability timing.
- `respawnSystem.ts`: void fall and respawn.
- `landmarkProgress.ts`: cataloging and nearby interaction targets.
- `forageableProgress.ts`: gathered goods.
- `characterScreenData.ts`: inventory/profile view model.
- `playerSimulationConstants.ts`: traversal constants.
- `playerSimulationRuntime.ts`: transient simulation timers and smoothed input.

## Render Modules

- `WorldRenderer.ts`: scene composition and per-frame orchestration.
- `worldSetPieces.ts`: authored bridges, POIs, route landmarks, and decorative scene groups.
- `worldForageables.ts`: forageable pickup meshes and visual state helpers.
- `worldMapMarkers.ts`: world-space map marker meshes.
- `worldCoopVisuals.ts`: co-op stress-test remote Mossu helpers.
- `FollowCamera.ts`: Journey-like third-person camera and map camera mode.
- `MossuAvatar.ts`: player character rig and animation.
- `grassSystem.ts`: instanced grass geometry/shader.
- `waterSystem.ts`: water geometry, shaders, controllers, and underfill.
- `waterProfiles.ts`: shared water color/motion profile data.
- `terrainDecorations.ts`: high-level terrain accent orchestration, forest placement, biome thresholds, and landmark tree composition.
- `terrainSmallProps.ts`: small prop primitives, prop batches, rocks, bushes, moss, ferns, reeds, waterfalls, and cave/ruin prop groups.
- `terrainDecorationMath.ts`: shared deterministic terrain-decoration hash/tint helpers.
- `ambientBlobs.ts`: Karu fauna visuals, ambient behavior, and recruited follow behavior.
- `atmosphereSystem.ts`: sky, clouds, mountain haze.
- `sceneHelpers.ts`: shared renderer helpers.

## UI Modules

- `HudShell.ts`: HUD state orchestration and owned DOM node lifecycle.
- `hudSurfaceBuilders.ts`: pure DOM builders for status metrics, pause/map rows, field-guide sections, and inventory/forageable cards.
- `CharacterPreview.ts`: profile-screen Mossu preview renderer.
- `debugSavePresets.ts`: named QA save presets used by `window.mossuDebug.applySavePreset()`.
- `worldMap.ts`: map projection and route helper logic.
- `IslandViewerApp.ts`: debug atlas route for full floating-island composition and terrain planning.
- `styles.css`: ordered import entrypoint.
- `styles/base.css`, `title.css`, `hud.css`, `pause.css`, `handbook.css`, `map.css`: first-pass semantic UI chunks.
- `styles/theme-overrides.css`: ordered theme-layer entrypoint.
- `styles/theme/*.css`: preserved late-cascade theme layers split by ownership so future UI cleanup can fold them back deliberately.

## Current Terrain Implementation

Vertex colors mix grass, painted clearings, **route dirt** (`sampleRouteDirtPathMask()` along the same polyline as route terraces), banks, rock, and snow. Dirt thins grass density where the mask is strong.

The terrain mesh is currently a generated `PlaneGeometry` in `WorldRenderer.ts`, with each vertex height taken from `sampleTerrainHeight()`. The sampler uses:

- low-frequency FBM-style rolling terrain
- ridged peak noise
- domain warping
- authored route shelves, basins, and mountain masses
- island-edge falloff

Terrain color is vertex-colored by height and slope:

- lower/flatter land blends through grass colors
- steeper slopes blend toward rock
- high areas blend toward snow

This preserves gameplay consistency because the rendered mesh and physics sampler use the same source.

## Forest Implementation

Visual forest fill is orchestrated in `terrainDecorations.ts`, with reusable small prop primitives and batches in `terrainSmallProps.ts`.

Current approach:

- deterministic Bridson-style Poisson disk candidates
- biome-density filtering
- water and slope avoidance
- merged low-poly tree geometry
- one `InstancedMesh` for round forest trees
- one `InstancedMesh` for pine forest trees
- one `SmallPropInstancer` path for repeated flowers, clover, reeds, pebbles, bushes, moss, and grass clumps
- shader canopy wind through a custom `windWeight` vertex attribute

Authored landmark trees and clusters still exist separately for composition and camera collision.

## Debug And QA Hooks

Normal player URLs should not expose automation globals.

- `?e2e=1`: attaches `advanceTime`, `render_game_to_text`, and `__MOSSU_E2E__` for lightweight browser tests.
- `?qaDebug=1`: exposes `window.mossuDebug` for opening skip, route jumps, teleport, reset, direct save payloads, and named save presets.
- `window.mossuDebug.listSavePresets()`: returns preset ids/labels/summaries.
- `window.mossuDebug.applySavePreset(id)`: applies common QA states such as fresh start, recruited Karu, populated handbook, water route, and summit-ready.
- `npm run art:review`: builds production and captures named headed route screenshots/JSON in `output/art-review-route/` through `?qaDebug=1&visualProbe=1`; use `node scripts/artReviewRoute.mjs --headless --browser=chromium --deterministic-step` as the artifact fallback when local Chrome screenshot capture stalls.
- `npm run art:compare`: validates those route artifacts and optionally compares against a saved summary baseline.

## Camera

`FollowCamera.ts` is the active camera system.

Current direction:

- camera-relative `W/A/S/D`
- smoothed movement input
- slower, more scenic recentering
- farther Journey-like follow distance
- wider upward look range for mountains
- map mode on `M` (overhead lookdown; mouse wheel zooms in/out with a clamped factor)

Do not swap to a physics controller unless the movement architecture is intentionally redesigned.

## Water

Water is split between:

- sampling and gameplay water state in `world.ts`
- swimming behavior in `waterTraversal.ts`
- rendered water surfaces in `waterSystem.ts`

Keep visible water surfaces aligned with `sampleWaterState()` so swimming and visuals agree. Use the river edge masks deliberately:

- `sampleRiverSurfaceMask()` is the rendered river footprint.
- `sampleWaterState()` is player-enterable water inside that footprint, still filtered by depth.
- `sampleRiverWetness()` is broader damp-bank clearing for grass, trees, wind, and banks.
- `sampleRiverDampBankMask()` is wet bank outside the visible/player water.
- `STARTING_WATER_POOLS` and `sampleStartingWaterWetness()` cover the opening lake and shallow meadow pools with matching basin dips.
- `sampleRiverNookMask()` is dry grassy space between main channels and braids.

The water shader uses the same broad profile for the valley river and starting pools. The current readability target is darker damp bank, milky illustrated shoreline rim, lighter green shallow splash water, deeper blue-teal swim water, and directional ripples that follow river flow.

River surfaces use a procedural flow-map-lite approach. `waterSystem.ts` derives curl from river ribbon geometry, then uses that attribute in the shader so straights get long flow bands, bends get eddies, and braids get split-current motion without painted flow textures. Mossu and recruited Karu feed a small fixed-size ripple source array into the same water controllers for cheap local rings/wakes.

## Performance Notes

Current performance strategies:

- use `InstancedMesh` for grass and forest fill
- keep shadows disabled
- dynamic pixel ratio adjustment in `GameApp`
- `?perfDebug=1` panel for FPS, frame time, pixel ratio, draw calls, triangles, memory, and world counts (re-check after terrain, grass, or water changes)
- hide heavy world grass during map lookdown
- bounded world, no LOD yet

Future performance tuning should inspect:

- draw calls and shader cost
- grass count and alpha overdraw
- water shader complexity
- DOM overlay cost
- culling bounds for instanced meshes

## Karu

The small recruitable fauna are named Karu. They are currently render-side actors in `ambientBlobs.ts`.

Current behavior:

- unrecruited Karu keep ambient rest/wander/curious/shy behavior
- holding `E` near the closest recruitable Karu invites **one Karu at a time**; the invite radius is intentionally tighter than the ambient watch radius so Mossu has to walk up to each one
- recruited Karu use boids-style separation, alignment, cohesion, and leader-follow slots; non-brave moods **bank-wait** beside deep water instead of following the slot into the channel, with a dry-bank search that prefers shallower water / firmer ground
- recruitment is persisted through local save state

Design decision: use **held individual recruitment** rather than cluster pickup, so Karu feel like small companions the player deliberately approaches and invites.

Keep this render-side until persistence, collision, or quest logic needs them in the simulation layer.

## Verification

Minimum verification after shippable code changes:

```bash
npm run lint
npm run qa
npm run test:e2e:smoke
git diff --check
```

For rendering, lighting, UI, water, terrain, camera, or interaction changes, add:

```bash
npm run test:e2e:visual
npm run perf:guard
npm run art:review
npm run art:compare
```

**Canonical QA path:** use a **real browser** (Chrome, Dia, Safari) for visual and interaction checks. Automated route screenshots and state comparisons catch drift, but final art judgement still needs a human pass in a desktop browser.
