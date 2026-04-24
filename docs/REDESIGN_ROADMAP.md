# Redesign Roadmap

Last updated: 2026-04-24

This roadmap turns the current full-redesign direction into controlled passes. The goal is to redesign the whole game feel and presentation without breaking the existing playable slice.

For the system-by-system current-state audit, see [Systems Audit](SYSTEMS_AUDIT.md).

## Guiding Rule

Every pass should keep the game playable. Avoid rewrites that leave terrain, movement, UI, or water half-connected.

## Phase 1: Preserve The Baseline

Status: stable baseline preserved

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
- `?perfDebug=1` renderer/world stats panel.
- Wider river foundation with cleaner braids and grassy nook masks.
- Karu recruitment/follow behavior.
- Premium grass wind and Mossu push shader pass.

## Phase 2: River And Water Redesign

Goal: make water read like broad natural rivers across the map instead of overlapping ribbons.

Status: foundation landed; needs full gameplay route review and tuning.

Tasks:

- [x] Audit river and branch channel positions.
- [x] Remove/merge the most awkward overlap cases.
- [x] Broaden the main channel.
- [x] Shape grassy nooks between main river and braids.
- [x] Keep opening lake readable from the start camera.
- [ ] Walk the full river route in Chrome from meadow to shrine.
- [ ] Check swimming/readability around wider banks.
- [ ] Tune any sections that still feel too thin, too thick, or visually overlapped.
- [ ] Confirm water visuals and `sampleWaterState()` agree at banks.

Acceptance:

- Rivers read clearly from third-person view.
- No obvious overlapping water strips.
- Player can identify swim-safe water.
- Build passes and a browser screenshot looks coherent.

## Phase 3: Inventory / Collectible UI Redesign

Goal: turn inventory/profile into a collectible card-style interface.

Status: next major feature pass.

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

Status: first implementation landed; needs route playtest and naming polish pass.

Creature name: Karu.

Tasks:

- [x] Add recruitable state for ambient fauna.
- [x] Press `E` near fauna to recruit.
- [x] Keep `E` landmark interaction working in normal gameplay.
- [x] Add boids behavior:
  - separation
  - alignment
  - cohesion
  - follow leader
- [x] Add soft catch-up behavior with leader slots.
- [x] Prevent followers from crowding Mossu.
- [ ] Playtest followers across slopes, banks, and water edges.
- [ ] Decide whether Karu should be recruitable one-by-one or by small cluster long-term.

Acceptance:

- Player can recruit at least one fauna cluster.
- Followers stay visible and cute.
- Followers do not jitter, stack, or block the player.
- Herd behavior works across grass, slopes, and shallow water edges.

## Phase 5: Premium Grass Pass

Goal: make grass feel alive and reactive.

Status: first premium pass landed; needs visual tuning in real play.

Tasks:

- [x] Layer wind into slow global sway, medium gust fronts, fast per-blade flutter.
- [x] Add breathing envelope modulation.
- [x] Add stronger Mossu push interaction using player position/velocity uniforms.
- [x] Tune opening meadow colors toward saturated cozy green with brighter tips.
- [x] Bias grass density toward dry river nooks while clearing wet edges.
- [x] Keep alpine grass distinct and lighter.
- [x] Visual-tune wind strength and push strength in Chrome.
- [x] Monitor alpha overdraw and frame rate after the shader pass.

Latest Chrome QA note:

- Near-camera grass now fades in after the camera clears it, avoiding oversized foreground blades across Mossu.
- Mossu push radius/strength was nudged up on the near grass pass so the immediate wake reads better.
- Perf stayed in the tuned range during movement, with the debug panel around `790-830` calls and `1.76M` triangles from the tested meadow view.

Acceptance:

- Grass visibly reacts around Mossu.
- Wind reads organic instead of synchronized.
- Opening meadow feels dense without hiding Mossu.
- Build passes and browser frame rate remains acceptable.

## Phase 6: Terrain / Forest Polish

Goal: make the world composition feel intentional from meadow to shrine.

Status: upcoming after inventory or river QA, depending on whether we want UI or world polish next.

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

Status: instrumentation and first count-tuning pass landed.

Tasks:

- [x] Add `?perfDebug=1` lightweight debug stats.
- [x] Inspect draw calls, triangles, grass, forest, and water counts.
- [x] Check dynamic pixel ratio behavior.
- [x] Profile grass and water shader cost after the premium grass pass.
- [x] Tune grass, water, and decoration counts before adding chunking/culling.
- Consider chunking/frustum culling for grass only if needed.

Latest Chrome snapshot on `?perfDebug=1`:

- Pixel ratio settled at `0.78` inside the tuned `0.78-1.55` range.
- Renderer showed about `1007` calls and `1.78M` triangles from the starting view.
- Grass showed `4` meshes, `13,792` instances, and about `775,680` estimated triangles.
- Water showed `6` surfaces, `5,126` vertices, and `8,968` triangles.

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

## Current Next Priorities

1. Inventory holo-card binder pass:
   Make the `Tab` inventory feel like a collectible card binder using the existing `inventory-holo-card` DOM/CSS foundation.
2. River route QA and tuning:
   Walk the route in Chrome, check swimming and bank readability, then tune any remaining overlap/thickness problems.
3. Grass visual QA:
   Play with the premium wind/push pass in Chrome and tune strength if motion is too busy or too subtle.
4. Terrain/forest composition polish:
   Improve mountain silhouettes, high rock/snow transitions, route overlooks, and biome-specific forest density.
5. Performance tuning:
   Use `?perfDebug=1` after grass/water/world changes before adding chunking or culling.
6. Repo cleanup/push:
   Add a Git remote, push the commits, and delete ignored local artifacts once approved.
