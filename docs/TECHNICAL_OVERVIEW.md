# Technical Overview

Last updated: 2026-04-24

## Stack

- Vite
- TypeScript
- Three.js
- camera-controls
- three-mesh-bvh

Useful scripts:

```bash
npm run dev
npm run build
npm run preview
```

## Entry Points

- `src/main.ts`: creates `GameApp` and exposes debug/test hooks.
- `src/render/app/GameApp.ts`: top-level app coordinator for renderer, scene, camera, input, HUD, and view modes.
- `src/simulation/gameState.ts`: top-level simulation coordinator.
- `src/simulation/world.ts`: shared world data and sampling functions.
- `src/render/world/WorldRenderer.ts`: composes the 3D scene.
- `src/styles.css`: DOM HUD/menu styling.

## Core Runtime Contract

`src/simulation/world.ts` is the central world contract. Many systems depend on:

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
- `FollowCamera.ts`: Journey-like third-person camera and map camera mode.
- `MossuAvatar.ts`: player character rig and animation.
- `grassSystem.ts`: instanced grass geometry/shader.
- `waterSystem.ts`: stylized water ribbons, starting pool surfaces, water controllers.
- `terrainDecorations.ts`: trees, rocks, flowers, bushes, forest fill.
- `ambientBlobs.ts`: Karu fauna visuals, ambient behavior, and recruited follow behavior.
- `atmosphereSystem.ts`: sky, clouds, mountain haze.
- `sceneHelpers.ts`: shared renderer helpers.

## UI Modules

- `HudShell.ts`: HUD, pause, inventory/profile, and map DOM rendering.
- `CharacterPreview.ts`: profile-screen Mossu preview renderer.
- `worldMap.ts`: map projection and route helper logic.
- `styles.css`: visual language for all DOM UI.

## Current Terrain Implementation

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

Visual forest fill lives in `terrainDecorations.ts`.

Current approach:

- deterministic Bridson-style Poisson disk candidates
- biome-density filtering
- water and slope avoidance
- merged low-poly tree geometry
- one `InstancedMesh` for round forest trees
- one `InstancedMesh` for pine forest trees
- shader canopy wind through a custom `windWeight` vertex attribute

Authored landmark trees and clusters still exist separately for composition and camera collision.

## Camera

`FollowCamera.ts` is the active camera system.

Current direction:

- camera-relative `W/A/S/D`
- smoothed movement input
- slower, more scenic recentering
- farther Journey-like follow distance
- wider upward look range for mountains
- map mode on `M`

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
- `?perfDebug=1` panel for FPS, frame time, pixel ratio, draw calls, triangles, memory, and world counts
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
- pressing `E` near Karu recruits a nearby cluster
- recruited Karu use boids-style separation, alignment, cohesion, and leader-follow slots
- recruitment is not currently saved

Keep this render-side until persistence, collision, or quest logic needs them in the simulation layer.

## Verification

Minimum verification after code changes:

```bash
npm run build
```

Visual/gameplay checks should use a real browser when possible. Headless Chromium can be useful for screenshots and state probes, but this project has had WebGL screenshot reliability issues in this environment.
