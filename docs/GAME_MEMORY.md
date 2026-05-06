# Mossu Game Memory

Last updated: 2026-05-05

This file is the durable project memory for Mossu. It captures the game we are making, the current design direction, and the decisions that should guide future implementation.

## Core Vision

Mossu is a soft, cozy, exploration-first creature game about moving through a lush floating island from a safe burrow meadow up toward a mountain shrine.

The game should feel:

- gentle, playful, and tactile
- cinematic like Journey in movement/camera feel
- lush and painterly in the world, with Studio Ghibli / BotW valley atmosphere and light anime-like color separation
- readable and charming in UI, closer to cozy life-sim / handheld RPG menus than generic debug panels
- mechanically simple at first, with no combat in the current slice

The current goal is one polished biome route, not a giant unfinished open world.

## Non-Negotiables

- Preserve current traversal behavior unless a change is explicitly requested.
- Keep `W/A/S/D` camera-relative movement, not tank steering.
- Keep `Tab` as inventory/profile, `M` as map, tap `E` as interact, hold `E` as Karu invite/call, and `Esc` as pause.
- Do not replace core systems casually. The terrain sampler, water sampling, movement physics, and renderer all share contracts.
- Favor visual and feel improvements that keep the game playable after every pass.
- Build-verify after code changes.

## Current Playable Slice

Route:

1. Burrow Hollow
2. Amber Tree Knoll
3. Silver Bend
4. Fir Gate
5. Whisper Pass
6. Highland Basin
7. Windstep Shelf
8. Cloudback Ridge
9. Ridge Saddle
10. Moss Crown Shrine

The route starts in a meadow, follows river features, climbs through firs and foothills, crosses alpine shelves, and ends near a shrine.

## Player Character

Mossu is a fluffy, round, snowy-white creature with big readable eyes and a soft rolling/walking silhouette.

Mossu should read as cute without becoming too plastic or mascot-like. Motion should feel soft, weighty, and responsive: squash/stretch, rolling readability, small feet when walking, and buoyant float/swim behavior.

## Current Mechanics

- Walk and roll movement
- Camera-relative traversal
- Jump / Breeze Float
- Dedicated `Q` Breeze Float / underwater dive input
- Swimming in sufficiently deep water
- Movement-state smoothing for roll release, wade entry/exit, float exit, swim entry, airborne roll release, and slope landing carry
- Void fall and respawn
- Landmark cataloging / keepsakes
- Forageable gathering
- Inventory/profile screen
- Region map
- Pause menu
- Quality/settings menu with Soft / Anime / Crisp visual presets, pixel-ratio cap, bloom, fog strength, and camera distance controls
- Local save persistence with pause-menu save status
- Fresh-start reset from pause or `window.mossuDebug.resetProgress()`
- Route/progression summary used by the handbook and pause menu
- Karu fauna wandering around the world
- Held-`E` individual recruitment for nearby Karu
- Karu join feedback: one small `Karu joined Mossu's trail` prompt, briefly softened HUD, and a lightweight hop/glow pulse on the recruited Karu
- Boids-style Karu follow behavior
- Recruited Karu persistence in local save state
- Debug route jumps for focused route inspection
- Debug save presets for fresh start, recruited Karu, populated handbook, water route, and summit-ready QA states
- `npm run art:review` for named real-browser route screenshots using those debug jumps
- `npm run art:compare` for route artifact/state validation after art review captures
- Weekly wiki sync automation that compares repo docs/progress against local Mossu wiki pages after big passes
- Premium instanced grass wind and Mossu push interaction
- Mossu pressed-grass/path trace stamps tuned for readable route bands and shoulders without increasing the 34-stamp budget
- 3D world-space orbiting sun with a real scene-lighting envelope and subtle god-ray/haze read
- `?perfDebug=1` performance panel

## Desired Near-Term Mechanics

Herd AI:

- Recruited Karu should remain cute and blob-like, not robotic.
- Followers should be playtested across slopes, banks, narrow clearings, and shallow water edges.
- Recruitment is now individual and held, so each Karu should feel like a small deliberate invitation rather than a cluster pickup.
- Karu recruitment now persists in save state; next work should make the saved companion state more visible and rewarding.

Inventory:

- `Tab` opens inventory/profile.
- Inventory collectibles should move toward a holographic card look inspired by:
  - https://poke-holo.simey.me/
  - https://codepen.io/scythianwizard/pen/oNVrGoy

## World Art Direction

Terrain:

- Layered heightmap feel: low-frequency rolling hills, ridged peaks, domain-warped organic shapes.
- Color by height and slope: flat grass, steep rock, high snow, with smooth blending.
- Mountains should be visible enough that the player can look up and admire them.
- Route paths and clearings should stay readable without looking like hard roads: use warm dirt bands, soft edge strokes, and painted grass/brush clumps to imply travel.

Anime / painterly finish:

- Push the world through warm-paper highlights, cooler green-blue shadows, and modest cel-like value bands.
- Use soft outlines selectively on Mossu, Karu, and major readable silhouettes; avoid thick black comic outlines.
- Keep grade and posterization subtle enough that route depth, swimming cues, HUD contrast, and dusk/sun reads still work.
- Prefer material/shader tuning over adding heavy image filters or expensive post effects.

Rivers:

- Rivers should feel larger and more natural, closer to The Isle-style dinosaur game references.
- Avoid overlapping/awkward water ribbons.
- Use broad channels across the map with grassy nooks and small islands between braids.
- Main water should feel like a river, not a pipe.

Grass:

- Premium feel path is instanced grass with layered wind.
- Wind uses 3 frequency layers: slow global sway, medium gust waves, fast per-blade flutter.
- A slow breathing envelope keeps the field from looking like a single sine wave.
- Mossu pushes grass outward as it moves through it.
- Color direction: saturated cozy greens, brighter tips, soft bloom/highlights.

Forest:

- Cute low-poly trees, no external model dependency required for now.
- Natural spacing using Poisson/blue-noise placement.
- Render repeated trees with `InstancedMesh`.
- Canopy wind should be subtle and shader-driven.
- Tree silhouettes should read crisply from gameplay distance, with broadleaf cap highlights/shadows and pine tips that feel storybook-sharp rather than blurry.
- Skip LOD for the current bounded prototype unless performance demands it.

Water:

- Stylized/cartoon water with soft edges, depth tint, bank foam/milkiness, sparkles, and flow.
- Anime/cel-shaded water now leans on simplified turquoise depth ramps, hand-drawn foam strokes, tiny stylized sparkle strokes, and soft shoreline milk. Close camera views should show readable bank milk and depth bands without making swimming or route guidance less clear.

Atmosphere:

- Misty valleys, exponential fog, soft mountain haze.
- BotW-style readable depth, not dense horror fog.
- The visible sun should feel like part of the world: it orbits around the route, drives the directional-light mood to a degree, and stays subtle enough that Mossu and the route remain readable.
- Sky softness should come from warm sun haze, layered cream-blue cloud puffs, high watercolor veils, and very light moving cloud-shadow patches across grass.
- Keep fog and glow away from camera-critical gameplay reads; softness should mostly live in the far range and horizon layers.

## UI Direction

The UI is moving toward a cozy collectible handbook:

- clear keycap controls
- frosted-glass / handheld RPG surface language
- profile/inventory that treats landmarks and gathered goods as keepsakes
- map that is readable as an illustrated route board, not only raw 3D overhead terrain
- future collectible cards with holographic treatment

Avoid visible tutorial prose that explains implementation. Keep copy in-world and concise.

## Current Implementation Decisions

- Keep the existing `FollowCamera` and `camera-controls` setup. Do not replace with `ecctrl` right now.
- Keep the current `sampleTerrainHeight()` contract as the gameplay source of truth.
- Terrain visuals can become more advanced, but movement, water, grass, collectibles, and route placement depend on the same sampler.
- `THREE.Terrain` remains a reference direction, not a drop-in dependency yet. Current npm terrain packages are old relative to the current Three.js version.
- Local deterministic noise and Poisson placement are acceptable when they avoid dependency risk.
- Forest fill is visual-only for now. Authored tree clusters still provide landmark/collider presence.
- Mossback Titan is parked, not active. The preserved prototype lives in `src/simulation/unused/giantMossCreature.ts` and `src/render/objects/unused/MossbackTitanAvatar.ts`; do not re-enable it casually.
- `.deepsec/` exists as local security-scanning workspace. Regex scan is safe and local; AI processing requires explicit approval because it exports private source to an external model backend.
- Keep `docs/CURRENT_STATE.md` and `docs/NEXT_PASSES.md` short enough that a future agent can orient before opening `progress.md`.

## Open Risks

- Visual browser verification can be inconsistent in headless Chromium because WebGL screenshots may hang or render differently.
- `progress.md` has many historical notes and should not be treated as a clean current spec.
- WebGPU remains diagnostic-only until custom shader/material paths are deliberately made compatible with it.
- Local `.env.local` should stay ignored and out of DeepSec scan records; treat it as sensitive local state.

## Current Next Priorities

1. Checkpoint the current water, Karu join, art-review, DeepSec, and documentation baseline before adding another big visual/system pass.
2. Playtest the populated handbook: landmarks, forageables, and Karu notes should feel like a compact collectible field guide.
3. Playtest recruited Karu across slopes, banks, shallow water, and dense grass.
4. Review the generated `npm run art:review` route screenshots, then tune only the spots that still look hazy, cluttered, or hard to read.
5. Polish terrain/forest composition: mountain silhouettes, route overlooks, snow/rock/grass transitions, and biome-specific forest density.
6. Expand progression deliberately with shrine reward flavor, route memory moments, and companion presentation without turning the slice into a checklist-heavy game.
7. Keep route performance healthy with `npm run perf:guard:baseline` before and candidate route guards after visual-density changes.
