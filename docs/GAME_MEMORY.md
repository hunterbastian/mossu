# Mossu Game Memory

Last updated: 2026-05-13

This file is the durable project memory for Mossu. It captures the game we are making, the current design direction, and the decisions that should guide future implementation.

## Core Vision

Mossu is a soft, cozy, exploration-first creature game about moving through a lush floating island from a safe burrow meadow up toward a mountain shrine.

The game should feel:

- gentle, playful, and tactile
- cinematic like Journey in movement/camera feel
- lush and painterly in the world, with Studio Ghibli / BotW valley atmosphere and light anime-like color separation
- readable and charming in UI, closer to cozy life-sim / handheld RPG menus than generic debug panels
- desktop gameplay HUD can lean Windows 7 / Frutiger Aero when kept lightweight: translucent aqua glass, rounded glossy edges, blue depth, gold actionable accents, and bubble-like highlights
- desktop HUD hierarchy should stay compact and centered: the current objective is the main chip, while secondary stats should not compete with the playfield
- mobile gameplay UI should stay especially low-chrome: teach controls briefly, then collapse to one objective chip plus contextual pouch/roll/stamina feedback
- the first-paint loading and main title menu should lean into a soft green meadow-hill presentation: layered fresh greens, cream/cyan sky haze, drifting cloud bands, broad warm sun glow, floating-island accents, and a quiet sprout/dew loading bar before gameplay starts
- opening presentation should be shareable: start with a calm aerial route reveal, keep water/valley readable, use only a concise Karu-first prompt, then hand off smoothly to playable camera without feeling like a debug teleport
- the world must keep a clear floating-island read: ridge, rim, and overlook views should reveal open air and blue ocean below instead of enclosing the route inside an interior cliff wall
- Burrow Hollow's starting nest should feel creature-made and cozy, closer to a clean Spore-like living cradle than a realistic animal den: rounded moss/pod forms, warm lining petals, soft seed glows, seed/dew details, and a readable path out
- controller feel should be immediate but soft: quick walking startup, decisive stopping, stronger turn correction, roll release that carries into walking instead of snapping, forgiving Breeze Float handoff near jump apex, swim-bank entry that preserves motion, and a camera that follows Mossu's intent without feeling glued on
- durable concept art references live under `docs/concept-art/`; use the floating-island board there for silhouette, cloud, cliff, waterfall, and ocean-below direction before making broad island-shape changes
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
- Quality/settings menu with Soft / Anime / Crisp / Nordic visual presets, pixel-ratio cap, bloom, fog strength, and camera distance controls
- Local save persistence with pause-menu save status
- Fresh-start reset from pause or `window.mossuDebug.resetProgress()`
- Route/progression summary used by the handbook and pause menu
- Karu fauna wandering around the world
- Held-`E` individual recruitment for nearby Karu
- Karu join feedback: one small `Karu joined Mossu's trail` prompt, briefly softened HUD, a lightweight hop/glow pulse on the recruited Karu, and a companion profile card that points back to the field guide
- Boids-style Karu follow behavior
- Karu route follow stabilizers: damped per-follower heading, short-lived water-bank hold targets, lost-follower catch-up placement, and debug follower snapshots for route probes
- Recruited Karu persistence in local save state, plus an always-visible right-side Karu friends HUD rail and saved Karu friend cards in the field guide
- Debug route jumps for focused route inspection
- Debug `?islandViewer=1` atlas for orbiting or flying around the full floating island, checking overview/aerial/top/profile/under composition, inspecting named Terrain/Water/Forests/Meadows/Rocks/Landmarks/Lighting/Debug folders, toggling terrain/biomes/rocks/ocean/water/guides/landmarks/falls layers, planning cliffs/waterfalls/ocean visibility away from Mossu's gameplay camera, and using `?referenceAerial=1` for no-UI concept-art comparison captures
- Debug save presets for fresh start, recruited Karu, populated handbook, water route, and summit-ready QA states
- Isolated `?modelViewer=karu` neutral debug-tool route for Karu/Mossu rig inspection, with compact viewer chrome, Geist typography, playful creature controls, pose/lighting previews, timeline playback, and drag-to-orbit camera inspection
- Debug viewer UI direction now favors Vercel/Linear-inspired tooling surfaces for the atlas and model viewer: neutral white panels, compact controls, fine borders, mono metadata, and restrained active states.
- `npm run art:review` for named real-browser route screenshots using debug startup, real-time visual stepping, debug route jumps, and stale-artifact protection
- `npm run art:compare` for route artifact/state validation after art review captures, including screenshot byte-size, contrast, chroma, detail, and distinct-frame checks so stale sky-only captures cannot pass as route review
- `npm run karu:route` for a recruited-Karu route regression check from Burrow-side terrain through water banks, highland slopes, narrow ridge turns, and Moss Crown
- `npm run agent:review` for an optional Swarms-ready five-lane review packet across art, performance, Karu follow quality, docs/wiki drift, and next-pass planning
- Weekly wiki sync automation that compares repo docs/progress against local Mossu wiki pages after big passes
- Premium instanced grass wind and Mossu push interaction
- Shader-driven grassland pollen, life-signal points, and tiny leaf/water glints should stay GPU-uniform based rather than rewriting point positions on the CPU every frame.
- Mossu pressed-grass/path trace stamps tuned for readable route bands and shoulders without increasing the 34-stamp budget
- 3D world-space orbiting sun with a real scene-lighting envelope and subtle god-ray/haze read
- `?perfDebug=1` performance panel

## Desired Near-Term Mechanics

Herd AI:

- Recruited Karu should remain cute and blob-like, not robotic.
- Followers now have route-level lost-follow protection; future companion work should preserve cute motion while improving celebration, visibility, and personality.
- Recruitment is now individual and held, so each Karu should feel like a small deliberate invitation rather than a cluster pickup.
- Karu recruitment now persists in save state; the saved companion state is visible through the join profile card, the always-visible right-side Karu friends HUD rail, and the field guide's Karu friends sleeve.

Inventory:

- `Tab` opens inventory/profile.
- Inventory collectibles should move toward a holographic card look inspired by:
  - https://poke-holo.simey.me/
  - https://codepen.io/scythianwizard/pen/oNVrGoy

## World Art Direction

Terrain:

- Layered heightmap feel: low-frequency rolling hills, ridged peaks, domain-warped organic shapes.
- Color by height and slope: flat grass, steep rock, high snow, with smooth blending.
- The playable route sits on a floating island. Cliff shell, underside haze, rim bands, thin ledge-like cliff strata, waterfall source lips, faint lower mist, tiny perched groves on selected cliff lips, and frequent edge waterfalls should frame the exterior silhouette while preserving sea/sky glimpses below the island from highland and overlook cameras.
- At island-overview scale, the world should read like the reference spec sheet and floating-island concept art: a central 2-3 peak mountain spine with sharper needle peaks, an alpine source cleft feeding stepped waterfall terraces and a main river, a visible west-side lake basin, a cleaner south/front meadow plateau with an intentional walking loop, meadow lowlands, evergreen bands along the climb and cliff lips, alpine/snow caps, authored headlands/coves that break the oval/board read, warm tan cliff strata and sheer cliff-wall faces, wider front hero falls, white/cyan surf contact around the ocean base, and a strong cliff-edge silhouette floating over blue ocean.
- The west lowland lake should read as a true great lake, not a small pond: keep it broad, visibly fed by the silver river braid, and framed by warm shore shelves plus boulder clusters while protecting the Burrow start and route movement lane from wetness/river-nook terrain influence.
- Great-lake and still-pool water should get "hero water" treatment through reusable water-profile knobs, not one-off lake shader forks: shoreline definition, shallow/deep depth-band strength, current-stroke strength, hero specular strength, and wake/ripple life should be tuned per water type while preserving swim/depth contracts.
- Use the `?qaDebug=1` water probe before changing bank visuals or swim feel. The trusted signals are depth, bank mask, swim/wade state, rendered surface Y, gameplay water Y, and profile; opening pools, great lake shore, Silver Bend, highland creek, and shrine approach were captured under `output/water-bank-closeup-pass/`.
- Water runtime ownership is intentionally split: `waterSystem.ts` facade, `waterBodies.ts` placement/group construction, `waterSurfaceFactory.ts` shader-backed materials/controllers, `waterSurfaceGeometry.ts` mesh attributes/underfill, `waterProfiles.ts` tuning knobs, `waterRipples.ts` actor disturbance signals, `waterWaterfalls.ts` decorative cascade accents, and `waterTypes.ts` shared interfaces. Keep future passes inside the narrow owner when possible.
- Current concept-art reverify notes: the strongest improvements are the mountain/cascade spine, asymmetric rim, wider front falls, smooth underside taper, clearer ocean/air gap, and the layered front/south terrace pass. The front cliff should use warm broken strata and inset face slabs, not continuous dark rim bars; atlas Rocks/Biomes overlays can exaggerate a dark jagged profile line, so judge the final terrain read from clean atlas captures plus route/art-review frames.
- Current reference-aerial notes: `?islandViewer=1&referenceAerial=1&e2e=1` is the stable no-UI full-island composition preset. Use it to judge whether the island reads like the provided image: open sky and ocean, full mountain peak visible, visible route loop over a clean meadow shelf, sheer warm cliff walls, front waterfall drop, and surf foam at the ocean contact.
- The clean atlas view can use debug-only visual helpers such as terrain edge clipping when they improve whole-island captures, but do not put that cost into the normal gameplay terrain path unless perf is reprofiled.
- Prefer concept-art translation through terrain massing, material color, atlas blockouts, and a few high-signal shell accents before adding many separate edge meshes. Burrow/Amber/Skyward route budgets are sensitive to global shell call count, so preserve the concept read with coarse forms first.
- Keep the broad south/front meadow more open than the mid-slope forest bands. Thin tree density across that front shelf so the terraced cliff face, waterfall mouth, and cove cuts stay visible in `?islandViewer=1` and high route-overlook frames.
- From below/profile views, preserve an obvious band of air between the island underside and the sea. Avoid dark rounded belly or saucer-like underside pieces; the bottom should feel like a smooth terrain-derived taper that grows out of the cliff mass, with strata, mist, and falling-water silhouettes around it.
- Mountains should be visible enough that the player can look up and admire them.
- Moss Crown should feel like a real destination before arrival: far highland layers and the shrine crown silhouette should be readable from earlier climb checkpoints without becoming noisy props.
- Route paths and clearings should stay readable without looking like hard roads: use warm dirt bands, sparse pale half-buried stepping stones, soft edge strokes, and painted grass/brush clumps to imply travel.
- Mossu/Karu habitat props should stay biological and cute, using rounded moss cushions, pod rims, bedding leaves, warm glow discs, seed pearls, comfort seeds, and subtle glints without body-horror, clutter, or oversized landmark treatment.

Anime / painterly finish:

- Push the world through warm-paper highlights, cooler green-blue shadows, and modest cel-like value bands.
- Current shader direction leans more deliberately Ghibli/anime: saturated clean blue-to-cream skies, peach horizon haze, cooler teal shadow separation, warm cream sun glints, watercolor terrain patching, richer turquoise water, and restrained bloom/reflection energy inspired by Sildur-style warmth without turning Mossu into a high-gloss shader showcase.
- Keep terrain materials semantically separated in the palette and final mesh blend: grass can stay lush, but shore shelves should read warmer/sandier, damp banks cooler/teal, rocks cooler/tanner, snow brighter/cooler, and dry lips warmer. Do not let broad atlas views collapse back into one green/yellow wash.
- Use soft outlines selectively on Mossu, Karu, and major readable silhouettes; avoid thick black comic outlines.
- Keep grade and posterization subtle enough that route depth, swimming cues, HUD contrast, and dusk/sun reads still work.
- Prefer material/shader tuning over adding heavy image filters or expensive post effects.
- Keep close pine silhouettes dark green instead of true black; automated visual guards treat huge near-black foreground canopies as blank, and the route should read like shaded needles rather than a black cutout.

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
- Tree leaf-wind visuals can be distance/camera culled for route performance, but avoid obvious pop on the critical path.

Water:

- Stylized/cartoon water with soft edges, depth tint, bank foam/milkiness, sparkles, and flow.
- Still-water lakes should have enough scale and opacity to register from atlas and route-overlook views, especially the west great lake; rock shelves and reeds should frame the edge without turning the route into an obstacle field.
- Anime/cel-shaded water now leans on simplified blue-green depth ramps, hand-drawn foam strokes, tiny restrained sparkle strokes, and soft shoreline milk. Close camera views should show readable bank milk and depth bands without making swimming or route guidance less clear.
- Water movement should read as downstream travel, not just surface shimmer: use moving current threads, lens-current ribbons, bend eddies, soft bank laps, traveling caustics, and longer Mossu/Karu ripple rings while keeping the shared surface/underfill displacement aligned.
- The far ocean should grade by distance: rich blue near the camera, turquoise-blue through the middle distance, pale cyan toward the far plane, then cream/peach haze at the horizon so the floating island sits in humid open air. The current open-ocean target is brighter tropical adventure water with a Sea-of-Thieves-like motion read: broad rolling Gerstner swells, steeper crest/trough contrast, slope-aware sun glints, and long broken white foam tears tied to wave energy rather than static noise.

Atmosphere:

- Misty valleys, exponential fog, soft mountain haze.
- Default lighting should read as Nordic filmic: lifted ACES exposure, cool pearl fog, clean highlights, restrained bloom, and matte midtones rather than heavy glow.
- BotW-style readable depth, not dense horror fog.
- The visible sun should feel like part of the world: it orbits around the route, drives the directional-light mood to a degree, and stays subtle enough that Mossu and the route remain readable.
- Sky softness should come from warm sun haze, layered cream-blue cloud puffs, high watercolor veils, and very light slow-moving cloud-shadow patches across grass. Keep them broad and quiet so they make the island feel alive without adding visual clutter.
- Keep fog and glow away from camera-critical gameplay reads; softness should mostly live in the far range and horizon layers.

## UI Direction

The UI is moving toward an Aero creature interface:

- cool Windows 7-style glass chrome without expensive runtime glass effects
- crisp handheld RPG / Pokemon-like menu grouping, tabs, action rows, and readable keycap controls
- small Spore-like organism accents for Karu, pouch samples, route signals, and specimen slots
- profile/inventory that treats landmarks and gathered goods as keepsakes
- map that is readable as an illustrated route board inside a clear glass route window
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

1. Do a real desktop-browser manual Karu route spot-check after any companion-feel change; keep `npm run karu:route` as the automated drift/lost-follow guard.
2. Walk close water banks in desktop Chrome after water shader changes so prettier motion still agrees with swim and exit readability.
3. Revisit the opening cinematic only after a share clip or manual playtest shows a specific issue with first-frame occlusion, timing, or the Karu prompt.
4. Review `npm run art:review` screenshots after destination-silhouette, water, or terrain changes, then tune only the viewpoints that still look hazy, cluttered, or hard to read.
5. Playtest the populated handbook: landmarks, forageables, and Karu friend cards should feel like a compact collectible field guide.
6. Add shrine arrival reward flavor and only deepen Karu personality if it makes recruited companions feel more alive without turning the slice into a checklist-heavy game.
7. Keep route performance healthy with `npm run perf:guard:baseline` before and candidate route guards after visual-density changes.
