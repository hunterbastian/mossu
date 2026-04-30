# Mossu Game Memory

Last updated: 2026-04-24

This file is the durable project memory for Mossu. It captures the game we are making, the current design direction, and the decisions that should guide future implementation.

## Core Vision

Mossu is a soft, cozy, exploration-first creature game about moving through a lush floating island from a safe burrow meadow up toward a mountain shrine.

The game should feel:

- gentle, playful, and tactile
- cinematic like Journey in movement/camera feel
- lush and painterly in the world, with Studio Ghibli / BotW valley atmosphere
- readable and charming in UI, closer to cozy life-sim / handheld RPG menus than generic debug panels
- mechanically simple at first, with no combat in the current slice

The current goal is one polished biome route, not a giant unfinished open world.

## Non-Negotiables

- Preserve current traversal behavior unless a change is explicitly requested.
- Keep `W/A/S/D` camera-relative movement, not tank steering.
- Keep `Tab` as inventory/profile, `M` as map, `E` as interact/recruit, and `Esc` as pause.
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
- Swimming in sufficiently deep water
- Void fall and respawn
- Landmark cataloging / keepsakes
- Forageable gathering
- Inventory/profile screen
- Region map
- Pause menu
- Karu fauna wandering around the world
- `E` recruitment for nearby Karu
- Boids-style Karu follow behavior
- Premium instanced grass wind and Mossu push interaction
- `?perfDebug=1` performance panel

## Desired Near-Term Mechanics

Herd AI:

- Recruited Karu should remain cute and blob-like, not robotic.
- Followers should be playtested across slopes, banks, and shallow water edges.
- Decide later whether Karu recruitment should persist in save state.

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
- Skip LOD for the current bounded prototype unless performance demands it.

Water:

- Stylized/cartoon water with soft edges, depth tint, bank foam/milkiness, sparkles, and flow.
- Anime/cel-shaded water is a possible later direction, but it should not make the current water less readable for swimming and route guidance.

Atmosphere:

- Misty valleys, exponential fog, soft mountain haze.
- BotW-style readable depth, not dense horror fog.

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

## Open Risks

- Visual browser verification can be inconsistent in headless Chromium because WebGL screenshots may hang or render differently.
- `progress.md` has many historical notes and should not be treated as a clean current spec.
- The repo currently has many dirty/untracked files from rapid prototyping; future cleanup should be careful and avoid reverting user work.

## Current Next Priorities

1. Build the holographic collectible inventory/profile treatment.
2. Playtest and tune river banks/swimming across the full route in Chrome.
3. Playtest premium grass wind/push strength and tune if it is too busy or too subtle.
4. Polish terrain/forest composition: mountain silhouettes, route overlooks, snow/rock/grass transitions.
5. Use `?perfDebug=1` for focused performance tuning before adding culling/chunking.
6. Add a Git remote, push the repo, and delete ignored local artifacts after approval.
