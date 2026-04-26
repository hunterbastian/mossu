# Redesign Roadmap

Last updated: 2026-04-25

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

Status: water readability pass landed; bank-entry `sampleWaterState()` + surface-mask agreement is covered in contracts (main + all braids) and listed in the playtest checklist; ongoing browser spot-checks still welcome.

Tasks:

- [x] Audit river and branch channel positions.
- [x] Remove/merge the most awkward overlap cases.
- [x] Broaden the main channel.
- [x] Shape grassy nooks between main river and braids.
- [x] Keep opening lake readable from the start camera.
- [x] Walk the full river route in Chrome from meadow to shrine.
- [x] Check swimming/readability around wider banks.
- [x] First-pass tune sections that looked obstructed or visually unclear.
- [x] Name the river edge contract in code: visible surface, damp bank, grassy nook, and player-enterable water.
- [x] Add starting-area water pools with matching basin dips and wet-bank clearing.
- [x] Tune water shader for darker damp banks, lighter shallow water, deeper swim water, illustrated shoreline milk/foam, and stronger directional ripples.
- [x] Add flow-map-lite motion from river geometry: bend curl, braid split-current motion, and stronger eddies near banks.
- [x] Add cheap Mossu/Karu water interaction ripples without adding a full water simulation.
- [x] Chrome-check water visuals and `sampleWaterState()` agreement at bank entry points. (Covered: `tests/contracts/waterContracts.ts` main-river + braid mid-segment bank ladder; `npm run test:contracts`.)

Latest route QA note:

- Captured the route from opening lake through shrine approach and sampled channel widths/depths along the same checkpoints.
- Main river and braids now read as broad separated channels in the sampler, with grassy nook masks between active branches.
- The biggest visual issue was bank obstruction near the fir-gate braid, so river/lake tree clearance and wet-bank forest fade are the right tuning direction.
- River edge masks are now explicit: `sampleRiverSurfaceMask()` tracks rendered-water footprint, `sampleRiverWetness()` remains broad damp-bank clearing, `sampleRiverDampBankMask()` isolates bank dampness, and `sampleWaterState()` uses the rendered-water footprint for player-enterable water.
- Starting-area water is now a small pool system, not a one-off lake: `STARTING_WATER_POOLS` feeds terrain basin cuts, water surfaces, shallow/swim state, grass clearing, and forest avoidance.
- The main water profile now separates dry bank, damp bank, shallow splash water, and deeper swim water more clearly through terrain tint plus water depth color.
- River ribbon geometry now carries a procedural curl value, giving straights longer flow streaks, bends more eddy motion, and braids stronger split-current shimmer.
- Mossu and recruited Karu now feed a fixed-size ripple uniform array, so movement in shallow/swim water creates local rings/wakes while keeping the shader cost bounded.
- Browser sampler probe after the pass reports `9` water surfaces, `6,307` water vertices, and `11,128` water triangles; full visual/fps Chrome QA is still the next check.

Acceptance:

- Rivers read clearly from third-person view.
- No obvious overlapping water strips.
- Player can identify swim-safe water.
- Build passes and a browser screenshot looks coherent.

## Phase 3: Inventory / Collectible UI Redesign

Goal: turn inventory/profile into a collectible card-style interface.

Status: first holo-card binder pass landed; needs collected-state playtest after route QA.

References:

- https://poke-holo.simey.me/
- https://codepen.io/scythianwizard/pen/oNVrGoy

Tasks:

- [x] Keep `Tab` as inventory/profile.
- [x] Represent landmark keepsakes and gathered goods as collectible cards.
- [x] Add holo sheen, depth, and subtle pointer/hover movement.
- [x] Keep card text readable.
- [x] Preserve character stats/upgrades.
- [x] Make empty/undiscovered slots feel intentional.
- [x] Add binder shell, spine, section tabs, and album-page slot treatment.
- [x] Check laptop and narrower desktop viewport behavior.
- [ ] Playtest with discovered landmark cards and gathered goods populated.

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

Status: next world pass after water-edge contract verification.

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
- Before the starting-pool readability pass, water showed `6` surfaces, `5,126` vertices, and `8,968` triangles. The updated browser sampler reports `9` surfaces, `6,307` vertices, and `11,128` triangles.

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

## Phase 9: Map Lookdown Polish

Goal: make the overhead map easier to read without adding new systems.

Status: scroll-to-zoom on map lookdown landed (wheel adjusts `FollowCamera` map height with clamped zoom factor; HUD footer hints “Scroll to zoom the island”).

Tasks:

- [x] Wheel zoom in `map_lookdown` (window listener, `preventDefault` while map open).
- [x] Trampled **route dirt** pass: `sampleRouteDirtPathMask` + terrain tint + reduced grass; route contracts for segment samples vs river/pools.
- [x] Starting-pool edge/opacity nudge (opening lake, burrow shoal, sun-mirror, reed cove) for softer/readable banks.
- [x] Light inventory/profile tab focus and smooth scroll on character screen content.
- [ ] Optional: map pan or recenter if playtest asks for it.
- [ ] Optional: perf check on map open with bloom (`?perfDebug=1`).

## Current Next Priorities

1. Chrome bank-entry water QA:
   Walk the key river banks and verify visible water, shallow water, swim water, and damp bank read correctly from gameplay camera.
2. Terrain/forest composition polish:
   Improve mountain silhouettes, high rock/snow transitions, route overlooks, and biome-specific forest density.
3. Grass visual QA:
   Play with the premium wind/push pass after terrain/forest changes and tune strength if motion is too busy or too subtle.
4. Inventory holo-card binder pass:
   Playtest populated cards after collecting landmarks and goods, then tune copy/card density if needed.
5. Performance tuning:
   Use `?perfDebug=1` after grass/water/world changes before adding chunking or culling.
6. Repo cleanup/push:
   Add a Git remote, push the commits, and delete ignored local artifacts once approved.
