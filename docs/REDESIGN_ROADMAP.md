# Redesign Roadmap

Last updated: 2026-04-23

This roadmap turns the current full-redesign direction into controlled passes. The goal is to redesign the whole game feel and presentation without breaking the existing playable slice.

For the system-by-system current-state audit, see [Systems Audit](SYSTEMS_AUDIT.md).

## Guiding Rule

Every pass should keep the game playable. Avoid rewrites that leave terrain, movement, UI, or water half-connected.

## Phase 1: Preserve The Baseline

Status: in progress

- Keep Journey-like camera and camera-relative controls.
- Keep the current route from Burrow Hollow to Moss Crown Shrine.
- Keep `sampleTerrainHeight()` as the gameplay/rendering source of truth.
- Keep `Tab`, `M`, `E`, and `Esc` responsibilities stable.
- Keep build passing after each pass.

Done recently:

- Smoothed Journey-like controls/camera.
- Terrain noise and height/slope coloring pass.
- Exponential fog and valley mist pass.
- Instanced forest with Poisson-style placement and canopy wind.

## Phase 2: River And Water Redesign

Goal: make water read like broad natural rivers across the map instead of overlapping ribbons.

Tasks:

- Audit all river and branch channel positions.
- Remove or merge awkward overlaps.
- Broaden the main channel.
- Shape grassy nooks between main river and braids.
- Ensure water visuals and `sampleWaterState()` agree.
- Add better shoreline readability around banks and swimming areas.
- Keep opening lake readable from the start camera.

Acceptance:

- Rivers read clearly from third-person view.
- No obvious overlapping water strips.
- Player can identify swim-safe water.
- Build passes and a browser screenshot looks coherent.

## Phase 3: Inventory / Collectible UI Redesign

Goal: turn inventory/profile into a collectible card-style interface.

References:

- https://poke-holo.simey.me/
- https://codepen.io/scythianwizard/pen/oNVrGoy

Tasks:

- Keep `Tab` as inventory/profile.
- Represent landmark keepsakes and gathered goods as collectible cards.
- Add holo sheen, depth, and subtle pointer/hover movement.
- Keep card text readable.
- Preserve character stats/upgrades.
- Make empty/undiscovered slots feel intentional.

Acceptance:

- Inventory looks like a collectible binder, not a debug list.
- Cards do not overflow on laptop or smaller desktop widths.
- `Tab`, `Esc`, `M`, and `E` flows still work.

## Phase 4: Fauna Recruitment And Herd AI

Goal: let Mossu recruit small fauna and have them follow naturally.

Tasks:

- Add recruitable state for ambient fauna.
- Press `E` near fauna to recruit.
- Keep `E` landmark interaction working.
- Add boids behavior:
  - separation
  - alignment
  - cohesion
  - follow leader
- Add soft idle and catch-up behavior.
- Prevent followers from crowding Mossu.

Acceptance:

- Player can recruit at least one fauna cluster.
- Followers stay visible and cute.
- Followers do not jitter, stack, or block the player.
- Herd behavior works across grass, slopes, and shallow water edges.

## Phase 5: Premium Grass Pass

Goal: make grass feel alive and reactive.

Tasks:

- Layer wind into slow global sway, medium gust fronts, fast per-blade flutter.
- Add breathing envelope modulation.
- Add Mossu push interaction using player position/velocity uniforms.
- Tune opening meadow colors toward saturated cozy green with brighter tips.
- Keep alpine grass distinct and lighter.
- Monitor alpha overdraw and frame rate.

Acceptance:

- Grass visibly reacts around Mossu.
- Wind reads organic instead of synchronized.
- Opening meadow feels dense without hiding Mossu.
- Build passes and browser frame rate remains acceptable.

## Phase 6: Terrain / Forest Polish

Goal: make the world composition feel intentional from meadow to shrine.

Tasks:

- Tune mountain silhouette visibility.
- Improve peak/snow/rock transitions.
- Add more route-readable landforms and overlooks.
- Tune forest density by biome.
- Add canopy wind variation by tree type.
- Consider a proper `FastNoiseLite` dependency only if it improves maintainability without breaking the sampler.
- Treat `THREE.Terrain` as optional until package compatibility is proven.

Acceptance:

- Looking up shows mountains and route context.
- Forest spacing feels natural, not grid-like.
- High areas read as rock/snow while playable route stays clear.

## Phase 7: Performance Pass

Goal: keep the redesigned world smooth.

Tasks:

- Inspect draw calls.
- Profile grass and water shader cost.
- Tune `InstancedMesh` counts.
- Check dynamic pixel ratio behavior.
- Add lightweight debug stats if useful.
- Consider chunking/frustum culling for grass only if needed.

Acceptance:

- Game remains playable in Chrome.
- No obvious stutter from forest/grass/water.
- Map and inventory overlays do not cause major hitches.

## Phase 8: Cleanup And Documentation

Goal: keep the project maintainable.

Tasks:

- Keep docs updated after major changes.
- Collapse stale notes from `progress.md` into current docs when needed.
- Clean debug artifacts only when safe.
- Avoid reverting unrelated dirty work.
- Add test/playtest hooks where automation has been unreliable.

Acceptance:

- New work has a clear place in docs.
- A future agent can understand game direction in under 10 minutes.
