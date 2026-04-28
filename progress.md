Original prompt: lets keep improving the UI for the game and interactivlity

Current wrap-up status:

- Perf route guard pass in progress: extending `scripts/perfGuard.mjs` from one saved traversal into a Burrow Hollow -> Moss Crown Shrine route guard with QA route replay, checkpoint screenshots, visual fingerprints, route landmark-stamp checks, and per-checkpoint frame budgets.
- Route guard follow-up: added screenshot-only route camera options so individual checkpoints can frame evidence without changing the replay path, and wired `mossuDebug.faceRouteHeading(heading, cameraOptions)` through `main.ts` / `GameApp` / `FollowCamera`. Verification: `npm run qa` passes, escalated `npm run test:e2e:smoke` passed, and escalated `npm run perf:guard` passed in headed Chrome with 12/12 checkpoints, all required route stamps, 158 fps average, and 10.8ms p95. Later headed/headless reruns flaked before or during Playwright runtime/screenshot work, so keep the latest green `output/perf-guard/latest.json` as the current baseline but do not over-trust screenshot framing in the dense upper-route pockets.
- Perf HUD pass: added `?perfHud=1` as a compact real-browser overlay beside the existing detailed `?perfDebug=1` panel, with `Shift+P` hide/show and `Shift+C` snapshot capture to `window.__MOSSU_PERF_CAPTURE__`/console/clipboard when available. This complements, not replaces, `npm run perf:guard`. Verification: `npm run qa`, escalated `npm run test:e2e:smoke`, and `git diff --check` passed; a custom non-e2e headless HUD probe still hit the known heavy WebGL startup path, so do the final visual read in desktop Chrome at `/?perfHud=1`.
- Latest startup optimization pass: removed the visible "Waking up" loading copy/animation from the instant shell, deferred WebGL bloom/postprocessing initialization until idle, and moved optional world pieces (clouds, mountain atmosphere, valley mist, shadow volumes, highland waterways, forageables, mountain silhouettes, and Karu background life) into staged background slices after the first frame.
- Verification for this pass: `npm run qa` passed, `npm run perf:guard` passed in headed Chrome at 98.6 fps average / 12.9ms p95, and the required web-game client produced `output/startup-optimization/shot-0.png` plus `state-0.json`.
- Follow-up startup note: the first captured opening-frame state still reports an early 100ms frame while background scene work settles, so deeper "zero perceived hitch" work should split grass/tree/decor batch construction into smaller idle jobs or prebuild/cache static geometry data.
- Follow-up pass (same thread): the instant title shell now shows short loading status copy (`[data-loading-status]`) while route chunks import, then fades out via `.instant-title--leaving` instead of a hard `textContent` clear; `GameApp` defers `EffectComposer` + bloom behind `requestIdleCallback` and dynamic `three/examples` imports; `?qaDebug=1` exposes `window.mossuDebug.applySaveState` for position/save replays; `npm run perf:guard` is wired in `package.json` with `scripts/perfGuard.mjs`.
- Latest focus landed: grass spatial-cell LOD, far-grass painterly impostors, no explicit bootstrap loading screen, and gentle idle Karu wander around Mossu.
- Current first-frame policy: `index.html` paints a tiny static Mossu title shell immediately; the real title/game app replaces it when the route chunk starts.
- Current grass policy: near/mid/alpine remain real instanced blades with LOD; far meadow grass is one static patch-impostor mesh and is not part of `windMeshes`.
- Latest verification completed: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, contract runner, production `vite build`, `git diff --check`, and the required web-game client attempt.
- Browser artifact: `output/far-grass-impostors/shot-0.png` and `state-0.json` were captured; the helper still timed out on title-button click stability, but the captured state shows the opening sequence entered.
- Next recommended real-browser check: open the built or dev app in Chrome, confirm the instant title shell feels acceptable, recruit a few Karu and idle near the opening meadow, inspect distant grass patches from the opening meadow/highland views, and watch `?perfDebug=1` for grass LOD/impostor counts while moving.
- Water underfill fix: the cheap underfill mesh reused the same geometry but not the animated vertex displacement, so gaps could show terrain beside/under the wavy surface; underfill now shares the same wave + ripple uniforms as the main water and applies the depth offset in the vertex shader; underfill opacity slightly raised (0.9 → 0.92 for non-still profiles). Verification: `npm run qa` passed.

Karu idle companion wander pass:

- Recruited Karu now gently drift around Mossu in seeded little orbit slots when Mossu is idle, grounded, close by, and not rolling, floating, swimming, regrouping, or calling them.
- The wander target is intentionally slow and local to the player so it reads as cute companion behavior without breaking follow, roll mimic, or regroup behavior.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, contract runner, production `vite build`, and `git diff --check` pass. The required web-game client captured `output/karu-idle-wander/shot-0.png` plus `state-0.json`; it hit the known title-button click stability timeout and did not directly recruit Karu in headless QA.

Grass spatial cell LOD pass:

- Added per-mesh spatial buckets for grass LOD sources so LOD refreshes cull by nearby world cells before touching individual blade source records.
- Tuned grass cell sizes per ring: small cells for near grass, larger cells for mid/far/alpine rings where updates are less frequent and density is lower.
- Added `?perfDebug=1` counters for grass LOD cells and source records visited, so runtime profiling can confirm the scan reduction in real Chrome.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, contract runner, production `vite build`, and `git diff --check` pass using the bundled Node runtime because `npm` is not on the sandbox PATH.

Far grass impostor + no-loading pass:

- Replaced the far meadow blade ring with a single static instanced painterly patch layer, keeping near grass as real blades and mid grass as fewer animated blades.
- Removed the far meadow patch layer from `windMeshes`, so it no longer pays grass wind uniform updates or grass LOD refresh work.
- Added `?perfDebug=1` counters for far grass impostor meshes/patches/estimated triangles alongside the existing blade grass stats.
- Removed the explicit bootstrap loading screen and deleted the unused `.app-loading` CSS so normal gameplay no longer shows an "Opening the meadow" or workshop loading panel before the title/game app starts.
- Added a tiny inline HTML/CSS Mossu title shell in `index.html` so the browser paints a branded first frame immediately while the real app chunk starts.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, contract runner, production `vite build`, `git diff --check`, and the required `develop-web-game` client all ran. The client needed the symlink-preserving local runner to resolve Playwright and captured `output/far-grass-impostors/shot-0.png` plus `state-0.json`; the click helper timed out waiting for the title button to become stable but the captured state shows gameplay entered the opening sequence.

Whole-map redesign pass:

- Added shared in-engine atlas metadata for bridges, POIs, and special spots so the HUD atlas and 3D lookdown can stay aligned with the world sampler.
- Widened the authored route/clearing masks and softened the sampled island outline so the world reads more like a deliberate illustrated island map while preserving the existing Burrow-to-shrine route.
- Added map pan/focus controls: scroll zoom still works, WASD/arrow movement pans while `M` is open, drag pans on the canvas, `F` cycles route-stop focus, and `R`/`Home` resets zoom/pan.
- Rebuilt the map overlay structure so the SVG island atlas is first-class beside a compact parchment guide panel with current area, route steps, legend, progress, and controls.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, production `vite build`, contract runner, and `git diff --check` pass. A targeted `?qaDebug=1` browser probe confirmed intro skip, `M` enters `map_lookdown`, `F` recenters to a route marker, keyboard pan changes the map pan, `Home` resets pan/zoom, and `Esc` returns to third-person.

Pretty waterfall pass:

- Upgraded the highland waterfall system from flat muted panels into layered scenic cascades with blue glass veils, white falling ribbons, pulsing foam shelves, warm spray glints, and animated drifting mist puffs.
- Added larger authored cascade placements around Fir Gate, Mistfall Runoff, Cloudback Rill, and the Mistfall basin so the creek route has more visible waterfall moments.
- Updated the static highland accent waterfall ribbons to match the richer water treatment with foam/spray layers, so close-up scenic props and animated waterway falls share the same art direction.
- Added a `?qaDebug=1`-only `teleportPlayerTo(x, z)` hook for targeted route/screenshot QA without affecting normal play.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, production `vite build`, and the contract runner pass. The required web-game client could not run because the skill script could not resolve its own `playwright` import from `/Users/hunterbastian/.codex/skills`; project-local Playwright reached the page, but both normal screenshot and canvas capture paths hung in headless Chromium during WebGL capture.

Breeze Float controls pass:

- Added `Q` as a dedicated Breeze Float input while preserving the previous Space-hold behavior after jumping.
- Added a short Breeze Float input buffer so a tapped/early `Q` press can still catch the float briefly after release, improving ledge and roll-jump timing.
- Updated HUD/control copy so normal play teaches Space as jump and `Q / Space` as Breeze Float.
- Added movement contracts for Q-only Breeze Float and tapped-Q buffered Breeze Float, alongside the existing Space-held float contract.
- Verification: `tsc --noEmit`, `tsc -p tsconfig.contracts.json`, production `vite build`, and the contract runner pass. A targeted browser-state probe was attempted against the built app, but the headless Three.js runtime hung before returning the final state, matching the current browser QA instability noted in recent visual passes.

Karu remodel + opening vista pass:

- Extracted the reusable Karu visual rig into `src/render/objects/KaruAvatar.ts` so the model viewer no longer imports the full ambient herd simulation just to preview one Karu.
- Updated gameplay Karu and the model viewer to share that rig, with a softer little-spirit silhouette: wider cloud body, larger glossy eyes, cheek blush, tail, four feet, and extra fluff puffs.
- Added a small authored opening nest/vista decoration layer near spawn, including a soft nest floor, leaf clumps, twigs, stones, flowers, and a pebble/leaf lead-out toward the route.
- Verification: `tsc --noEmit`, `vite build`, contract tests, and route-split browser probing pass. The route probe confirmed `/` loads `GameApp` and `?modelViewer=1` loads `ModelViewerApp`; neither route loads the other app chunk.
- Required `develop-web-game` client pass completed and wrote `output/karu-nest-smoke/shot-0.png` plus `state-0.json`.

Dynamic import workshop pass:

- Route-split the main bootstrap so normal gameplay dynamically imports `GameApp` and `?modelViewer=1` dynamically imports `ModelViewerApp`.
- Added a small Mossu-styled loading state while the selected route chunk loads, without changing the title-screen link or QA hooks.
- Kept `window.advanceTime` and `window.render_game_to_text` attached after either route starts.
- Verification: `tsc --noEmit`, `vite build`, contract tests, and `git diff --check` pass. Build output now includes a tiny bootstrap chunk plus separate `GameApp` and `ModelViewerApp` chunks.
- Browser route probe confirmed `/` loads `index`, `GameApp`, and shared world code without `ModelViewerApp`; `?modelViewer=1` loads `index`, `ModelViewerApp`, and shared world code without `GameApp`.
- Required `develop-web-game` client was attempted through the repo symlink path; it reached the page but timed out while taking the screenshot, matching the known headless screenshot issue in this project.

Movement audio pass:

- Added the provided grass-footstep MP3 as a public game asset at `public/audio/footsteps-grass-loop.mp3`.
- Added a small native `MovementAudio` controller that unlocks from the title-screen interaction, fades footsteps in only during grounded third-person movement, scales volume/rate with speed, and gives rolling a slightly faster/stronger texture.
- Stopped the loop immediately when pause, inventory/model card, or map overlays open, and exposed movement-audio state through `render_game_to_text` for QA probes.
- Added the provided menu-click MP3 as `public/audio/menu-ui-click.mp3` and a reusable `InterfaceAudio` helper for short UI button feedback.
- Wired the click sound through delegated pointer/keyboard activation in the main game shell and model viewer, so current and future buttons get the UI sound without one-off listeners.

HUD / overlay UX pass:

Model viewer pass:

- Started a separate `?modelViewer=1` route so Mossu tools can inspect one character at a time without changing normal gameplay startup.
- Exposed the Karu creature rig for reuse outside the ambient herd simulation, keeping the viewer pointed at real in-game model parts.
- Added a Mossu-themed model viewer shell with model selection, pose buttons, lighting presets, play/pause, turntable, and a timeline scrubber.
- Added a secondary `Model Viewer` action to the main title screen so the workshop is reachable from the game menu.
- Reframed the title-screen workshop entry as the intended `Play -> Model Editor -> Map Editor` flow. Play starts the trail, Model Editor opens the active tool, and Map Editor is staged as the next tool.
- Verification:
- `tsc --noEmit`, `vite build`, contract tests, and `git diff --check` pass. Build was run through a local ad-hoc signed `/tmp/mossu-node` because the installed hardened Node rejects Rollup's native package signature in this sandbox.
- Required `develop-web-game` client captured `output/model-viewer-smoke/shot-0.png` and `state-0.json` for `http://127.0.0.1:8006/?modelViewer=1`.
- Targeted Playwright QA clicked Mossu -> Karu, Roll pose, and Forest lighting, then captured `output/model-viewer-qa/mossu-full.png`, `karu-roll-full.png`, and `results.json`.
- Main-menu link follow-up verification: `tsc --noEmit`, `vite build`, contract tests, and `git diff --check` pass. A targeted production-bundle browser pass confirmed the title-screen `Model Viewer` link has `href="?modelViewer=1"` and opens the viewer; screenshots are in `output/title-model-viewer-link/`.
- The required web-game client was rerun for the title-link follow-up, but its fixed `page.goto(..., waitUntil: "domcontentloaded")` timed out on the production Three.js bundle in this environment before it could capture artifacts; the targeted Playwright pass verified the link with a less brittle navigation wait.
- Workshop-flow follow-up verification: `tsc --noEmit`, `vite build`, contract tests, `git diff --check`, and the required `develop-web-game` client pass all ran after changing the title menu to `Play -> Model Editor -> Map Editor`. Targeted browser QA confirmed the visible labels, confirmed `Play` starts gameplay, confirmed `?modelViewer=1` opens the model viewer, and captured `output/title-workshop-play-flow/title-flow.png` plus `play-after-click.png`.
- Next tool direction: build the map builder as a separate workshop route too, with authored controls layered over procedural generation masks rather than replacing the current world sampler.

Water washout + highland creek pass:

- Reduced the water shader's tendency to blow out into pale slabs by lowering river/creek opacity, clamping shoreline milk/foam brightness, tightening alpha, and making the depth bands less aggressively bright.
- Added shared authored highland creek paths in `src/simulation/world.ts` so water-state sampling and rendered highland creek geometry agree instead of leaving `creekPaths` empty.
- Implemented `buildHighlandWaterways()` in `src/render/world/waterSystem.ts` with narrow foothill/alpine runoff ribbons and three small island-style waterfall accents.
- Tapered the rendered main river through the foothill/highland route so the mid-route creek owns the scene more, instead of one broad river surface covering the slope.
- Reduced mid-route valley mist coverage in `WorldRenderer.ts` after screenshot QA showed it was contributing to the “translucent slab” read over the creek corridor.
- Verification: `npm run build` and `npm run test:contracts` passed during the pass; fresh screenshot artifacts are in `output/qa-water-fix/`.

Grass/performance cleanup pass:

- Reduced terrain tessellation from 240 to 192 segments, dropping terrain from 115,200 triangles to 73,728 triangles.
- Simplified grass blade geometry from 4x6 subdivisions to 2x4 subdivisions, then reinvested that budget into denser grass placement.
- Increased total grass instances from roughly 13.3k to roughly 20.7k while dropping estimated grass triangles from roughly 765k to roughly 412k.
- Added noise-thresholded clumpy grass density in `sampleGrassDensity()` so grass gathers into irregular patches with readable gaps instead of a uniform field.
- Verification artifacts: `output/qa-grass-perf/opening-qa-camera.png` and `opening-qa-camera-state.json`.

- Tightened the normal-play HUD in `src/render/app/GameApp.ts` and `src/styles.css` so the large controls panel is now contextual instead of always visible; it appears when camera control is unlocked or when a menu state needs extra guidance.
- Replaced the old sentence-heavy quick-hint copy with compact keycap action pills so the bottom HUD reads faster during play.
- Added clearer progress framing across the `Esc`, `E`, and `M` surfaces: pause now shows gathered-goods counts, the Adventure Card sections show live count badges, and the map now reports both route progress and goods/field-note totals.
- Kept the frosted-glass direction, but shifted this pass toward hierarchy and disclosure instead of adding more decorative chrome.
- `npm run build` passes after the UX cleanup.

Forageable gathering pass:

- Added authored world forageables in `src/simulation/world.ts` so Mossu can now collect small fruits and plants placed along the route from the meadow start up through the ridge climb.
- Added `src/simulation/forageableProgress.ts` plus new `gatheredForageableIds` / `latestGatheredForageableId` state in `src/simulation/gameState.ts` so these goods auto-gather when Mossu wanders close enough.
- Extended the `E` Adventure Card in `src/render/app/GameApp.ts` with a dedicated `Gathered Goods` section on the right and updated the character summary / prompt text to surface recent forage pickups.
- Added visible in-world pickup props in `src/render/world/WorldRenderer.ts` so fruit and plant collectibles now bob lightly in the scene and disappear once gathered.
- Added matching frosted-glass card styling for gathered goods in `src/styles.css`.
- `npm run build` passes after the forageable-gathering implementation.

Character screen layout follow-up:

- Resized the `E`-menu character preview down so Mossu sits in a smaller left-side model card instead of dominating the whole panel.
- Split the character-screen content into two columns in `src/render/app/GameApp.ts`: stats/upgrades stay in the main column, while `Field Dex` now lives in its own dedicated collections column on the right.
- Updated `src/styles.css` so the collections rail gets more vertical room and the responsive layout still collapses back to one column on smaller screens.
- `npm run build` passes after the character-screen layout adjustment.

Frosted-glass material pass:

- Pushed the full HUD, pause menu, Adventure Card, and Region Map surfaces toward a colder frosted-glass look in `src/styles.css`.
- Reduced the remaining paper/plastic feel by replacing warm opaque fills with more translucent blue-white panes, lighter edge rims, and denser backdrop blur.
- Retained the Pokemon-like menu framing and current overlay layout, but made the material language read more like layered glass than painted cards.
- Kept the recent bounce/gloss motion pass, now with highlights and shell fills tuned to feel diffused through glass instead of sitting on top of it.
- Build follow-up:
- `npm run build` passes after the frosted-glass pass.
- While verifying this pass, the build was temporarily blocked by grass-system type/export drift in `WorldRenderer.ts` and `grassSystem.ts`; that compile issue was cleaned up as part of this turn so verification could complete.

Glossy overlay + pause/menu flow pass:

- Added a dedicated `Esc` pause menu in `src/render/app/GameApp.ts`, with direct transitions to resume, the Adventure Card, and the Region Map.
- Reworked overlay flow so the pause menu, character screen, and map are mutually exclusive instead of visually stacking on top of each other.
- Tightened map behavior so `M` now owns the screen as a proper zoomed-out state while normal HUD chrome hides behind it.
- Added a more bouncy/glossy Frutiger Aero-style motion pass in `src/styles.css` across the live HUD, pause shell, map shell, and Adventure Card.
- `render_game_to_text` now reports pause-menu state in addition to the existing map / character-screen state.
- Verification:
- `npm run build` passes after the overlay-flow and glossy-motion changes.
- Computer Use verified the new pause shell visually on the live local page and confirmed the normal HUD renders separately in gameplay.
- A direct local Playwright keyboard probe was attempted again for `M` / `E` / `Esc`, but it stalled in this environment before producing screenshots or JSON, so keyboard-driven runtime verification is still partial.

Old Pokemon-inspired UI pass:

- Reframed the HUD, map, and character screen toward a retro handheld RPG menu style with cream panels, navy borders, red-blue accent tabs, and more rectangular menu framing.
- Updated `src/render/app/GameApp.ts` copy so the interface now reads as a quest log / adventure card / region map / field dex instead of the previous handbook wording.
- Restyled the major UI surfaces in `src/styles.css` so the HUD, profile screen, and map overlay all share the same older Pokemon-like visual language.
- Added a light Frutiger Aero layer on top of the retro menus with brighter sky-blue glass gradients, stronger white gloss, and softer aqua highlights while keeping the Pokemon-style framing.
- Verification follow-up:
- `npm run build` should be rerun after the retro UI restyle.

Original prompt: PLEASE IMPLEMENT THIS PLAN:
# Full-Map Lookdown Mode On `M` + Slight Gameplay Camera Pullback

- Added `ViewMode` runtime state and one-shot `M` / `Esc` input events.
- Added a blended overhead map camera on `M` that releases pointer lock and returns cleanly to third-person.
- Increased gameplay camera distance by roughly 10% and widened wheel zoom range to match.
- Added lightweight world-space map markers for Mossu, the shrine, and key landmarks.
- HUD now switches to a lighter map presentation while the map is open.
- `npm run build` passes.
- Local dev server for this turn is running at `http://127.0.0.1:4175/` because `4173` and `4174` were already in use.
- Bug sweep:
- Fixed the grass instancing shader compile error in `WorldRenderer.ts` by passing `instanceTint` through the vertex shader instead of illegally declaring it as a fragment `attribute`.
- Wrapped pointer-lock requests in `FollowCamera.ts` so failed browser requests do not throw noisy runtime errors.
- Hid live grass meshes during `map_lookdown` to make the overhead map read more cleanly.
- Re-verified with automated screenshots; build still passes.
- Grass visual pass:
- Increased meadow/alpine grass density.
- Rebuilt the grass blade geometry to be wider, softer, and more tuft-like instead of thin needle cards.
- Added width variation, gentler color clustering, softer alpha shaping, and less harsh posterization in the grass shader.
- Meadow/alpine tint ranges were lightened to better match the painterly reference direction.
- HUD visual pass:
- Added a more field-journal / adventure-panel treatment to the HUD with parchment-mint gradients, olive ink, and warm gold accents.
- Objective chip now has stronger hierarchy and a small badge detail.
- Status strip metrics now have cleaner separators and label/value contrast.
- Hint and ability chips were reshaped and recolored to feel softer and less generic.
- Camera pass:
- Raised the default third-person chase angle slightly and opened the pitch clamp upward so the player can view more terrain from above during normal play.
- Character pass:
- Updated `MossuAvatar` only to match the snowy/fluffy character direction.
- Swapped the body toward a faceted fluffy snowball look with softer off-white shading.
- Added larger glossy oval eyes, softer cheeks, and small top tufts to improve silhouette and roll readability.
- Added more squash/stretch and subtle tuft motion so idle, roll, and airtime feel softer and more buoyant.
- Walk / roll mode pass:
- Added `Shift` as a held roll mode in input and gameplay state.
- Mossu now stays in stub-leg walk form normally, and shifts into a rolling snowball form while `Shift` is held.
- Added simple leg animation and updated the HUD hint to teach `Shift` roll controls.
- Walking speed is now slower than rolling speed so the two forms feel mechanically distinct.

Inventory / interact pass:
- Added `E` as a context action and `Tab` as an explicit satchel toggle in `src/simulation/input.ts`.
- Landmarks now carry keepsake metadata in `src/simulation/world.ts`, with per-landmark interaction radii and satchel copy.
- `src/simulation/gameState.ts` now tracks nearby interactables, cataloged landmark ids, the last cataloged keepsake, and exposes `getInventoryEntries()` for the HUD.
- `src/render/app/GameApp.ts` now opens a trail-satchel panel, pauses movement while it is open, releases pointer lock on open, shows a nearby-keepsake prompt, and exports `window.advanceTime` / `window.render_game_to_text` hooks for automation.
- `src/styles.css` now includes satchel/prompt styling that matches the existing field-journal HUD treatment.

Verification:
- `npm run build` passes after the inventory/interact changes.
- Attempted to run the required Playwright web-game client from an in-process static server so it could reach the built app in this sandbox. The client repeatedly hung with no artifacts written, even after removing the canvas click path.
- Follow-up direct Playwright probes also stalled once the built page was live in headless Chromium: navigation completed and WebGL warnings appeared, but the first `page.evaluate(...)` call never returned.
- Because of that runtime issue, this turn only has build verification plus code-path inspection; the next agent should debug the headless Chromium hang before relying on automated gameplay screenshots for `mossu`.

Character screen pass:
- Replaced the old satchel UI with a dedicated character screen opened by `E` or `Tab`, with `Esc` to close and gameplay paused while it is visible.
- Animal Crossing-inspired UI pass:
- Restyled the persistent HUD and resident handbook in `src/styles.css` toward a softer life-sim presentation with rounded paper panels, wood-and-leaf accents, stitched badges, and warmer cozy copy.
- Updated `src/render/app/GameApp.ts` HUD labels and handbook phrasing so the interface reads more like an island resident journal than a generic debug overlay.
- Extended the same guidebook treatment to the full-map overlay with a resident stamp, softer chart copy, a decorative compass rose, and subtle opening / marker pulse motion.
- This pass is presentation-only: gameplay flow, controls, and character-screen behavior remain the same.
- Verification follow-up:
- `npm run build` should be rerun after the UI restyle to catch any layout-adjacent TypeScript/CSS regressions.

- Added a dedicated Three.js preview renderer in `src/render/app/CharacterPreview.ts` so the left side of the menu shows a live Mossu model instead of reusing the world camera.
- Reworked `src/render/app/GameApp.ts` to render profile-oriented HUD copy plus a two-column character screen with `Stats`, `Upgrades`, and `Collections`.
- Reworked `src/simulation/gameState.ts` so collections auto-log when Mossu enters an existing landmark interaction radius, and added a `getCharacterScreenData()` view-model payload for the menu.
- The character screen shows real current traversal stats, `Breeze Float` as the active upgrade, three locked placeholder upgrades, and discovered vs undiscovered keepsakes.

Verification follow-up:
- `npm run build` still passes after the character-screen refactor.
- The required bundled Playwright client now reaches the browser but still exits with `Target page, context or browser has been closed` and produces no artifacts in this environment.
- An escalated direct Playwright pass was attempted to validate `E` / `Tab` / `Esc`, map-to-profile transition, and automatic collection discovery, but it appears to hang before writing screenshots or JSON.
- Treat browser validation for this character-screen turn as incomplete; the implementation is currently verified by successful build and code-path review only.
- Water pass:
- Replaced the tube-based river and creek geometry in `WorldRenderer.ts` with terrain-hugging ribbon surfaces so the waterways read as actual water instead of rounded pipes.
- Added a lightweight animated water shader pass with moving shimmer, center-depth tinting, and softer bank fade.

Mountain-route worldbuilding slice:
- Re-authored the current floating-island slice around a clearer climb: Burrow Hollow -> Silver Bend -> Fir Gate / Whisper Pass -> Mistfall Cascade / Basin -> Windstep Shelf -> Cloudback Ridge -> Moss Crown Shrine.
- Extended `world.ts` with new upper-route scenic pockets and landmarks, rebalanced the 14 orb placements so the first 8 naturally guide the lower climb, and kept the last 6 on the alpine/ridge route after `Breeze Float`.
- Strengthened terrain staging with small authored shelves/rises along the intended mountain route while keeping the overall island footprint intact.
- Warmed plains terrain/light, cooled alpine/ridge terrain, opened the start lane a bit, and pushed the upper route harder through rocks, pines, waterways, moss, and atmosphere.
- Updated ambient plains fauna to berry-blue fuzzy blobs without changing their calm behavior.
- Tightened the opening chase camera and increased grass fade around the player to reduce foreground swallowing.
- `npm run build` passes.
- Fresh dev server for this pass: `http://127.0.0.1:4177/`.
- Live Dia check: the opening frame is improved and shows the climb/river structure more clearly, but there is still room for another small presentation pass if needed.
- Water verification:
- `npm run build` passes after the water refactor.
- Manual Safari screenshot check on the local Vite preview confirmed the main river now reads as a flat flowing surface instead of a rounded tube.
- Water flow direction:
- Added downhill-aware water flow detection so ribbon streams authored in reverse point order still animate downhill instead of scrolling uphill.
- Tsushima-style water stage 1:
- Refactored `WorldRenderer.ts` water creation behind controller/profile seams so river and creek ribbons now share `WaterProfile` presets plus `createWaterSurface(...)` instead of ad hoc animated mesh traversal.
- Extended ribbon geometry with explicit `aChannel`, `aBank`, `aSlope`, and `aFlowT` attributes, then rebuilt the WebGL `MeshStandardMaterial` shader patch to layer broad flow, detail shimmer, slope-scaled motion, bank foam, deeper center-channel tint, and warm grazing-angle highlights.
- Highland waterways now use dedicated presets for foothill creek, alpine runoff, and waterfall outflow so steep descents read faster/brighter than the calmer main river.
- `npm run build` passes after the refactor, and a manual Safari check against `http://127.0.0.1:8000/` confirmed the river still reads as a flat surface while the mountain runoff sections look more disturbed and downhill-oriented.
- Water graphics follow-up:
- Pushed the shader away from clean procedural stripes by adding profile-level reflection/sediment/clarity controls, denser ribbon cross-sections, domain-warped vertex motion, and fragment-side FBM breakup for currents, eddies, sparkle, and shoreline sediment tint.
- The current pass now mixes cooler sky reflection with warm glints, uses muddier shallow banks, and breaks foam/highlights into less uniform ribbons so the water should read less flat and synthetic.
- `npm run build` passes after this graphics-focused pass. A fresh in-session screen capture failed with `could not create image from display`, so this follow-up is build-verified but not archived with a new screenshot artifact.
- Water depth follow-up:
- Added shallow-bed and depth-language controls to each water profile so calmer water can reveal a muted riverbed tint while deeper channels darken more decisively.
- Extended the fragment shader with fake bed visibility, pebble/sediment breakup, moving caustic light in shallows, and stronger depth shadow through the center channel.
- `npm run build` passes after the depth pass. This turn did not produce a fresh screenshot artifact.
- Swim pass:
- Added shared water-volume sampling in `src/simulation/world.ts` for the filled main river plus authored creek/pool checks, with explicit surface heights, current direction, and swimmable-depth gating.
- Reworked `src/simulation/gameState.ts` so deep water no longer behaves like ground: Mossu now enters a `swimming` state, floats near the water surface, gets carried slightly by current, uses `Space` as a swim stroke, and cannot roll while in swimmable water.
- Synced player-facing systems to the new state: `render_game_to_text` now reports `swimming` and `waterDepth`, `FollowCamera.ts` eases into a slightly closer/lower swim framing, `MossuAvatar.ts` uses a swim bob and disables leg visibility while swimming, and `WorldRenderer.ts` now pulls water surface offsets from the shared world constants so the visible river sits high enough to match the swim volume.
- `npm run build` passes after the swim pass.
- Tried the required `develop-web-game` Playwright client against the local dev server after the swim implementation, but it still fails from the skill path with `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright' imported from .../web_game_playwright_client.js`. No automated swim screenshot artifact was produced from this attempt.
- Water Ghibli + sparkle pass:
- Kept the work scoped to the water shader in `WorldRenderer.ts`: softened the main tint/depth blend slightly, reduced some of the harsher depth darkening, and added a restrained `sparkleColor` / `sparkleStrength` profile control across river and creek presets.
- Added a small animated sparkle mask that scatters shallow sun twinkles across the surface instead of broad synthetic stripes, so the water should feel a little more hand-painted and a little less procedural.
- `npm run build` passes after this pass. No fresh screenshot artifact was captured this turn.
- Lighting / meadow paintover pass:
- Regraded `WorldRenderer.ts` toward warmer late-afternoon sunlight with earlier fog falloff, cooler sky bounce, larger cream-tinted cloud masses, and more atmospheric distant mountains.
- Reworked plains / foothill terrain tinting and grass instancing so the meadow reads broader and more painterly: taller/wider blades, directional sweep, brighter straw-cream tips, and less harsh posterization.
- Added a shader-driven sky dome so the opening sky is no longer a flat solid color and carries soft sun bloom plus painterly cloud breakup.
- `npm run build` passes after the lighting pass.

UI interactivity follow-up:

- Converted the pause menu actions from static cards into real clickable/focusable buttons backed by `data-ui-command` handlers in `GameApp`.
- Added focus handoff for title, pause, handbook, map, and gameplay return paths so keyboard/mouse overlay flow feels intentional instead of passive.
- Made handbook section tabs interactive and added smooth scrolling to Profile / Cards / Pouch sections.
- Made keepsake and pouch-good holo cards keyboard focusable with the same glare/tilt language used for pointer hover.
- Verification: `tsc --noEmit`, `vite build`, existing contract runner, and `git diff --check` pass using the bundled Node runtime because `npm` is not on the sandbox PATH.
- Browser QA caveat: the required `develop-web-game` client still cannot resolve `playwright` from the skill path in this checkout, and targeted Playwright against the built app timed out before `window.render_game_to_text` attached, matching the known headless Mossu/WebGL startup issue. Vite preview also cannot start right now because the disk only has about 116 MB free and cannot write its temp config file.
- Headless Playwright screenshots against the local Vite server were not reliable for this scene: Chromium captured an over-washed, faceted WebGL frame that does not appear safe to use as visual truth. A real browser check is still the right next verification step for final tuning.
- Hybrid meadow lighting + grass pass:
- Recentered the opening-plains look toward the second reference without losing the soft Mossu mood: lower warmer sun, later fog falloff, bluer sky separation, and fewer larger cloud masses.
- Added an opening-meadow emphasis mask in `WorldRenderer.ts` so plains/hills terrain and grass get the strongest olive/straw treatment near the start route while alpine/ridge grass stays close to the lighter existing treatment.
- Reworked meadow grass to read more like a field: slimmer/taller blades, stronger left-to-right lean, banded wind, brighter grazing highlights, and distance-aware color compression so the near field stays blade-defined while the mid/far field fills in as a coherent mass.
- Added a small `FollowCamera.ts` framing tweak so the initial spawn view carries a bit more horizon and less immediate downward tilt, which better exposes the opening meadow treatment.
- `npm run build` passes after the hybrid meadow pass.
- Real-browser verification used a local Vite server plus Safari + `screencapture` instead of headless Chromium. The on-screen shot confirms the updated meadow/river framing path is live, though Safari reused an existing localhost tab so the captured URL bar was not a clean proof of the temporary port.
- Starter spirit close-up verification:
- Local dev server for this verification run is on `http://127.0.0.1:4179/`.
- The stock `develop-web-game` Playwright client still fails in this repo flow: direct launch from the skill path cannot resolve the local `playwright` package, and the symlinked repo-path launch hangs with no artifacts in `output/spirit-check`.
- Added a repo-local fallback probe at `.codex-tmp/spirit-closeup-check.mjs`, but headless Chromium needed escalation and still did not yield usable screenshot artifacts in this environment.
- Computer Use + Safari did verify the live build loads and the starter scene still reflects the lighter/paler ambient-spirit pass at a wide shot.
- The current browser-control path did not produce a trustworthy close-up of the fauna cluster, so idle/wander silhouette verification is still incomplete.
- If close-up spirit validation is required next, the most reliable follow-up is a temporary debug spawn/camera hook that places one ambient spirit directly in front of the start view for screenshots.
- Spirit close-up debug hook:
- Added a debug-only `?spiritCloseup=1` URL flag in `src/render/app/GameApp.ts` and `src/render/world/WorldRenderer.ts`.
- In that mode, `WorldRenderer` re-stages the first few ambient spirits near the spawn camera and scales the lead spirit up slightly so the opening frame can show the fauna clearly without changing normal gameplay.
- `npm run build` passes after the hook.
- Safari + Computer Use verification against `http://127.0.0.1:4179/?spiritCloseup=1` now shows the staged spirits in-frame near Mossu; the pale fluffy silhouette and larger dark eyes read correctly in-context.

Map readability pass:
- Reworked `M` map mode in `src/render/app/GameApp.ts` from a mostly-camera-based overview into a dedicated illustrated HUD map board built from real world data.
- Added a stylized floating-island silhouette, river path, climb route line, compass, labeled landmarks, route-step sidebar, live player marker, shrine marker, and discovered/unvisited landmark states.
- Kept the existing `map_lookdown` camera as the background path, but the useful readability now comes from the map overlay rather than from the raw 3D terrain alone.
- `src/styles.css` now includes a full map-board presentation with parchment shell, legend, route-step states, and landmark/marker styling.

Verification:
- `npm run build` passes after the map overlay work.
- Live headless Playwright state check against `http://127.0.0.1:4178/` confirmed `mode` switches from `third_person` to `map_lookdown` after pressing `M`.

Performance responsiveness follow-up:

- Reduced normal gameplay DOM churn by throttling HUD refreshes to 12 Hz unless an overlay, stamina, pickup, landmark, forage, or Karu prompt needs immediate feedback.
- Made adaptive render quality react sooner to slow frames, with a slightly lower minimum pixel ratio for temporary lag recovery.
- Stopped grass LOD from rebuilding instance buffers just because a timer elapsed; it now waits for player movement plus the existing frame cadence after the initial build.
- Reduced live water ripple shader budget from 8 ripple sources to 4, which keeps player/Karu ripples but halves the fixed ripple loop work in the water shader.
- Verification: `npm run test:contracts`, `git diff --check`, and `npm run build` pass.
- Browser smoke note: the bundled `develop-web-game` Playwright client still cannot resolve its own `playwright` import from the skill path. A direct local Playwright probe could reach the page with `waitUntil: "commit"`, but the deterministic `advanceTime` loop hung in this environment and was killed; real Chrome was opened at the fresh Vite URL instead.

Subtle bloom pass:

- Added a lightweight Three.js `EffectComposer` path with `RenderPass` + `UnrealBloomPass` in `src/render/app/GameApp.ts`.
- Bloom is intentionally restrained (`0.14` strength, `0.48` radius, `0.82` threshold) and turns off automatically in map lookdown or when adaptive quality drops pixel ratio below `0.74`.
- Perf debug now reports whether bloom is currently on or off.
- Verification: `npm run test:contracts`, `git diff --check`, and `npm run build` pass.
- Browser smoke note: the page booted with `render_game_to_text` available and two canvases present on `http://127.0.0.1:4192/`; headless screenshot capture still timed out on WebGL readback, so final visual judgment should be from real Chrome.
- Full-page screenshots remain unreliable because the WebGL canvas can hang the capture, but a targeted element screenshot of `.world-map__shell` succeeded and was visually inspected at `/tmp/mossu-map-overlay-panel.png`.
- Green-grass-v3 comparison pass:
- Used Computer Use to inspect `https://green-grass-v3.vercel.app/` directly and translated the strongest traits into `mossu`: cleaner blue sky, lower warmer sun, narrower taller meadow blades, stronger shared blade lean, and more aggressive near-to-far field compression.
- Reworked `WorldRenderer.ts` so the opening plains rely more on coherent meadow massing than painterly breakup: simpler olive/straw terrain underpainting, sparser larger cloud masses, calmer atmospheric veil, meadow-biased placement/orientation, and denser opening-field instancing without forcing the alpine route onto the same look.
- Added another `FollowCamera.ts` adjustment to lower the gameplay rig and carry more horizon into the opening view after the live Safari check still felt too lookdown-heavy.
- `npm run build` passes after the green-grass comparison pass, and Computer Use + Safari verification confirms the opening field is denser and more directional even though the overall game remains more stylized/low-poly than the reference.
- Grass V3 technique-followup:
- Pushed the meadow closer to the reference technique rather than just the color grade by switching opening-field grass to crossed-card blade geometry, reducing alpha cutoff, and thickening the base/far-field fusion in the grass fragment shader.
- Kept alpine/ridge grass on the lighter single-plane path so the extra volume stays concentrated in the start meadow instead of inflating the whole world.
- Fixed a local compile blocker in `src/render/app/CharacterPreview.ts` by filling the newer `PlayerState` water fields used elsewhere in the repo.
- `npm run build` passes after the technique-followup, and a live Safari check on `http://127.0.0.1:4182/` confirms the meadow now reads fuller and less like isolated spikes.
- Meadow LOD + self-shadow pass:
- Split the opening meadow into separate near/mid/far grass passes in `WorldRenderer.ts`, each with its own blade geometry, density bias, size profile, and camera-distance fade band so the field can read differently across depth instead of relying on one shared grass mesh.
- Extended the grass shader with explicit tier fade uniforms plus stronger self-shadowing: darker roots, more body occlusion away from the sun stripe, and heavier distance compression for the far field.
- Alpine/ridge grass stayed on a single lighter pass while the meadow tiers use 3-plane near grass, 2-plane mid grass, and a wider single-plane far field.
- `npm run build` passes after this pass, and a live Safari check on `http://127.0.0.1:4183/` shows the meadow tiers blending without an obvious seam from the opening camera.
- Shoreline milkiness pass:
- Shifted the water art direction toward a softer Studio Ghibli edge treatment by adding per-profile `shorelineMilkColor` and `shorelineMilkStrength` controls in `WorldRenderer.ts`.
- Updated the water fragment shader so shallow banks blend into a pale silty wash before the foam line, with less harsh edge contrast and slightly softer shoreline alpha.
- Fixed adjacent compile drift in `WorldRenderer.ts` and `src/render/app/CharacterPreview.ts` so the shoreline pass lands in a clean state instead of sitting on top of unrelated TypeScript breakage.
- `npm run build` passes after the shoreline pass.
- Opening lake pass:
- Added a small swimmable lake near the starting meadow by carving a dedicated basin and water volume into `src/simulation/world.ts`.
- Added a radial lake water surface in `src/render/world/WorldRenderer.ts` so the opening area now has a calm pond using the same stylized water shading family as the river instead of a flat placeholder mesh.
- Reduced grass density inside the basin so the lake reads as a real opening-area landmark rather than grass clipping through the water.
- `npm run build` passes after the opening lake pass.
- Opening lake enlargement + live verification:
- Increased the opening lake footprint substantially by widening the basin, deepening it, and broadening the rendered radial surface so it reads more like a real lake from the starting camera.
- Re-verified the opening view live in Safari against `http://127.0.0.1:4186/`; the updated lake is now clearly visible in the start area.
- Saved the verification capture to `output/opening-lake-verify-4.png`.
- Systems refactor pass:
- Extracted the full grass mesh/shader pipeline out of `src/render/world/WorldRenderer.ts` into `src/render/world/grassSystem.ts`, then rewired the renderer to use the new module instead of carrying a second inlined grass implementation.
- Extracted map projection/data helpers into `src/render/app/worldMap.ts` so `GameApp.ts` no longer owns the SVG namespace, viewbox math, route-path generation, or label-layout tables.
- Extracted landmark collection/progress helpers into `src/simulation/landmarkProgress.ts` so `GameState.ts` can focus on player simulation while the landmark catalog, nearby-target, and closest-landmark logic live in one place.
- `npm run build` passes after the refactor pass.
- World renderer subsystem split:
- Extracted the remaining scene-heavy renderer subsystems into dedicated modules: `src/render/world/waterSystem.ts`, `src/render/world/atmosphereSystem.ts`, `src/render/world/ambientBlobs.ts`, `src/render/world/terrainDecorations.ts`, and shared helpers in `src/render/world/sceneHelpers.ts`.
- Removed the duplicate inlined water, sky/cloud/atmosphere, ambient blob, and terrain-decoration implementations from `src/render/world/WorldRenderer.ts`, leaving the renderer to compose and orchestrate the systems instead of owning their factory code directly.
- Preserved the current blob blink/idle-pose behavior in the extracted ambient system so the refactor does not regress creature animation while reducing the renderer’s state surface.
- `npm run build` passes after the renderer subsystem split.
- Game state subsystem split:
- Reworked `src/simulation/gameState.ts` into a coordinator over focused player-simulation modules instead of a monolithic traversal file.
- Extracted shared traversal constants into `src/simulation/playerSimulationConstants.ts`, transient timer state into `src/simulation/playerSimulationRuntime.ts`, locomotion into `src/simulation/movementPhysics.ts`, water traversal into `src/simulation/waterTraversal.ts`, stamina/ability handling into `src/simulation/staminaAbilities.ts`, and void fall / respawn logic into `src/simulation/respawnSystem.ts`.
- Kept landmark and forageable progress in the existing extracted modules so `gameState.ts` now mainly wires frame state, character-screen data, and the top-level update order together.
- `npm run build` passes after the game state subsystem split.
- Ongoing coordinator refactor pass:
- Extracted character-screen view shaping out of `src/simulation/gameState.ts` into `src/simulation/characterScreenData.ts`, so the simulation coordinator no longer owns the full Adventure Card presentation model.
- Extracted the DOM-heavy HUD, pause menu, Adventure Card, and region-map shell out of `src/render/app/GameApp.ts` into `src/render/app/HudShell.ts`, leaving `GameApp.ts` focused on app flow, view-mode transitions, input gating, and renderer/camera orchestration.
- `npm run build` passes after the coordinator refactor pass.

Foraging loop pickup pass:
- Reworked the existing forageable scaffold from auto-gathered fruit/plants into explicit pouch pickups: seeds, shells, moss tufts, berries, smooth stones, and feathers.
- `E` now gathers the nearest ungathered forageable instead of collecting it automatically just by walking near it.
- Added a nearby forage prompt, pouch state in `render_game_to_text`, and updated gathered-good binder cards to use the new item kinds.
- Added distinct in-world pickup visuals for each forage kind, with bob/sway behavior and disappear-on-gather state.
- `npm run build` passes after this pass.

Riparian forest-pocket pass:
- Kept this automation run scoped to water-bank / forest-transition composition in `src/render/world/terrainDecorations.ts`.
- Added guarded riparian pockets to the existing water-bank accent layer: soft canopy-shadow washes, moss pads, grass clumps, lip pebbles, and lowland/foothill saplings at selected lake, river, and braid transition anchors.
- The new pockets use wetness, slope, and playable-bound checks before placement, so they should decorate bank edges without changing controls, route checkpoints, or water simulation.
- Verification:
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `npm run test:contracts` passes: camera, controls, water-state-agreement, route-checkpoints.
- `git diff --check` passes.
- Required `develop-web-game` Playwright client was attempted against `http://127.0.0.1:4194/`; direct skill-path launch still could not resolve repo-local `playwright`, while the repo-local symlink with `--preserve-symlinks --preserve-symlinks-main` reached Chromium and failed with the existing macOS sandbox `MachPortRendezvousServer ... Permission denied` error.
- The temporary Vite server for this run is still listening on `127.0.0.1:4194` because sandboxed `kill 9710` returned `Operation not permitted`.
- Next visual check: inspect the opening lake rim, Silver Bend bank, Fir Gate braid, and Windstep / ridge river pockets in Safari or Dia before adding more density.

Water-bank / forest threshold polish:
- Added small sedge, moss, pebble, and wash accents along the meadow, fir-gate, and alpine branch channels so side rivers read with the same bank language as the main river and starting pools.
- Added a few pool-rim sedge patches around the opening lake and starting shoals to soften the water-to-grass transition.
- Added subtle canopy-ground shadow patches at authored biome-transition anchors so forest edges feel more grounded and scaled without changing the playable route.
- Verification:
- `npm run build` passes. Vite still emits the existing large chunk warning for the main JS bundle.
- `npm run test:contracts` passes: camera, controls, water-state-agreement, route-checkpoints.
- `git diff --check` passes.
- The required `develop-web-game` Playwright client was attempted against `http://127.0.0.1:4193/`, but Chromium launch failed under the macOS sandbox with `MachPortRendezvousServer ... Permission denied`.
- The temporary Vite server for this run is still listening on `127.0.0.1:4193` because sandboxed `kill 4264` returned `operation not permitted`.

Pouch HUD pass:
- Added a compact live pouch strip to the gameplay HUD that shows gathered forage counts by kind.
- The pouch stays hidden until Mossu is near a forageable or has just gathered one, then lingers briefly after pickup.
- The strip highlights the nearby forageable category even before the count is nonzero, so the player can read what `E` will add to the pouch.
- `render_game_to_text` now includes `pouchCounts` under `characterScreen.gatheredGoods` for lightweight verification.
- `npm run build` and `git diff --check` pass after this pass.

Interactive pouch follow-up:
- Converted pouch count chips into stable interactive buttons instead of passive rebuilt labels.
- Hovering, focusing, or clicking a pouch category now selects it and opens a small detail tray.
- Nearby forageable categories explain the `Press E` action, while gathered categories summarize stored counts and point to the binder.
- `npm run build` and `git diff --check` pass after this pass.

Overnight world polish shoreline/forest-edge pass:
- Added translucent silty shoreline wash patches around the main river and starting-water pools so bank rims have a clearer dry-to-wet read before reeds/pebbles.
- Added a few forest-edge understory patches using existing moss, bush, and grass primitives to make lowland-to-foothill forest transitions feel less abrupt without changing the playable route.
- Kept the pass scoped to `src/render/world/terrainDecorations.ts`.
- Verification: `npm run build`, `npm run test:contracts`, and `git diff --check` pass. Vite still reports the existing large bundle warning.
- Playwright follow-up: the repo-local symlinked `develop-web-game` client still cannot launch Chromium in this sandbox because `MachPortRendezvousServer` registration is denied. The temporary Vite server on `http://127.0.0.1:4190/` could not be killed from this sandbox (`Operation not permitted`) and was still listening at the end of the run.

Overnight pool-rim / forest-scale follow-up:
- Added a subtle procedural bank-lip lift around starting-water pools in `src/simulation/world.ts`, strongest around the opening lake, so pools have a clearer raised dry rim instead of blending straight into flat grass.
- Added narrow pebble-trail lip markers to the main river, branch channels, and starting pools in `src/render/world/terrainDecorations.ts` to make the water-bank edge easier to read from the gameplay camera.
- Added four authored forest scale ramps at lowland and foothill edges, stepping from saplings into larger trees so the forest boundary reads less abrupt without touching route checkpoints or controls.
- Verification:
- `npm run build` passes. Vite still emits the existing large chunk warning for the main JS bundle.
- `npm run test:contracts` passes: camera, controls, water-state-agreement, route-checkpoints.
- `git diff --check` passes.
- Playwright follow-up: the skill client was retried against `http://127.0.0.1:4191/`. The first run hit the known skill-path `playwright` resolution issue; the repo-local symlink with `--preserve-symlinks` reached Chromium but Chromium still failed with `MachPortRendezvousServer ... Permission denied`. The temporary Vite server was stopped cleanly with Ctrl-C.

Overall QA pass:
- No gameplay/world code changes were made in this pass; this was a verification sweep over the current local worktree.
- Static verification passed: `npm run build`, `npm run test:contracts`, and `git diff --check`.
- Code-search sanity check found no conflict markers, debuggers, TODO/FIXME items, or unexpected source errors in `src`, `tests`, `package.json`, or `index.html`.
- Safari smoke verification on `http://127.0.0.1:4196/` rendered the title screen, entered gameplay, collected the nearby forageable with `E`, opened and closed the map with `M` / `Esc`, and opened the handbook with `Tab`.
- Screenshots captured under `output/qa-overall/`: `safari-smoke-2.png`, `safari-after-enter.png`, `safari-after-e.png`, `safari-after-m.png`, `safari-after-esc.png`, and `safari-after-tab.png`.
- Headless Playwright state capture remains unreliable in this macOS sandbox: direct Vite targets were unreachable from sandboxed Chromium, and an in-process static-server probe hung around `advanceTime` before the browser context closed.
- Remaining risks: the existing Vite large chunk warning remains, and the handbook should get a dedicated responsive-height check because the non-fullscreen Safari smoke view showed inner scrolling near the bottom of the panel.

Visual anchor scene polish implementation:
- Added a dedicated `anchor-scene-accents` visual layer for the six review anchors: opening meadow, opening lake shore, Silver Bend, Fir Gate forest edge, highland creek/waterfalls, and shrine approach.
- The new layer uses the existing instanced small-prop batching for clover, flowers, reeds, moss, grass clumps, pebbles, and shrubs, while only adding a few authored mature trees, rock accents, shadows, and side waterfall ribbons.
- Tuned water profiles to reduce milky shoreline glare and sparkle washout while preserving readable shallow/deep bands.
- Updated the visual contract test roots so the new anchor small-prop batch is covered by the black-plant / instance-color checks.
- Verification:
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `git diff --check` passes.
- Required `develop-web-game` client notes: direct skill-path launch still cannot resolve repo-local `playwright`; the repo-local symlink launch with escalated local-network access loaded the built static preview, entered gameplay, and captured `output/anchor-scene-polish/shot-0.png` plus `state-0.json`.
- Headless/desktop visual caveat: real Chrome was opened with the local preview URL, but macOS screen capture returned black/desktop captures instead of a useful Chrome frame. Treat the Playwright gameplay screenshot as the reliable captured artifact for this run and do a human Chrome route review before shipping.
- Temporary Vite and Python preview servers were stopped after QA.

Roll mode / Karu mimic pass:
- Shift rolling is now stamina-free. The stamina meter is reserved for Breeze Float, and the character screen copy now says that explicitly.
- Added simulation state for `rollHoldSeconds` and `rollModeReady`; holding Shift for about 3 seconds now drives a small Roll Mode HUD indicator.
- Roll jump still preserves forward momentum, and holding Space after the roll jump can transition into Breeze Float while consuming stamina only for the float.
- Recruited Karu now tighten their follow slots while Mossu rolls, speed up slightly to keep pace, tuck their feet, bounce, and rotate through a soft rolling mimic pose instead of only hopping behind.
- `render_game_to_text` now reports roll hold and roll-ready state for lightweight QA.
- Future animation plan:
- Phase 1: add Mossu roll-charge anticipation, a tiny dust puff, and a clearer "ready" body squash when Shift is held long enough.
- Phase 2: give Karu staggered mimic delays so the herd rolls in a cute wave instead of all matching the same frame.
- Phase 3: build a roll-jump transition pose: squash, launch stretch, air tuck, then Breeze Float fluff/ear spread.
- Phase 4: add landing recovery feedback for roll landings, slope landings, and roll-to-float landings.
- Verification:
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- Required `develop-web-game` browser smoke was attempted against `http://127.0.0.1:8002/`, but headless Chromium timed out before `domcontentloaded`. A custom Shift-specific Playwright probe was also attempted and hit the same headless initialization problem before `render_game_to_text` became available. The temporary server and hung probe were stopped.

Karu true-roll follow-up:
- Promoted Karu rolling from a visual-only mimic blend into explicit `blob.rolling` state.
- Recruited Karu now enter that state with a tiny per-slot stagger when Mossu is rolling, stay out of roll state while floating or bank-waiting, and use stronger catch-up movement while rolling.
- The Karu roll pose now keys off their own rolling state, and `render_game_to_text` reports `fauna.rollingCount` so QA can tell whether the herd is actually rolling.
- The HUD can briefly surface how many Karu are rolling with Mossu.
- Verification:
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `git diff --check` passes.

Mossu/Karu soft collision pass:
- Added lightweight planar collisions between Mossu and Karu without introducing a full physics engine.
- Karu now use slightly different collision radii for idle, recruited, and rolling states, so rolling herd members feel rounder and less ghost-like.
- Overlaps are resolved mostly by nudging Karu away, with a smaller Mossu nudge while grounded and not swimming; both sides also get a small velocity response when they run into each other.
- The world update order now applies Karu collision before the Mossu avatar pose update, so the visible body follows the adjusted position in the same frame.
- `render_game_to_text` now reports `fauna.mossuCollisionCount` for QA probes.
- Verification:
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `git diff --check` passes before this progress note.
- The required `develop-web-game` client loaded a built static preview on `http://127.0.0.1:8003/`, entered gameplay, and captured `output/karu-collision-smoke/shot-0.png` plus `state-0.json`.

Experimental WebGPU renderer pass:
- Added an async app bootstrap so the normal game path still starts on the existing WebGL renderer while `?renderer=webgpu` or `?webgpu` lazy-loads Three's WebGPU renderer chunk.
- Added renderer backend reporting to `render_game_to_text` and the `?perfDebug=1` overlay: requested backend, active backend, WebGPU browser availability, and fallback reason if WebGPU initialization fails.
- Kept the current EffectComposer bloom on the WebGL path only. WebGPU skips the WebGL postprocessing stack for now, because the current bloom pass is tied to `WebGLRenderer`.
- Added a WebGPU-compatible sky dome fallback. The existing shader sky stays on WebGL, while WebGPU avoids Three's `ShaderMaterial` incompatibility warning during startup.
- Verification:
- `npm run build` passes. Vite now emits the WebGPU renderer as a separate async chunk and still reports the existing large main chunk warning.
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- Browser smoke against the built preview loaded `?renderer=webgpu&perfDebug=1`, entered gameplay, and reported `activeBackend: "webgpu"` with no fallback reason.
- Headless browser caveat: the WebGPU smoke is enough to confirm startup/backend selection, but real Chrome performance and visual parity still need a human pass because Mossu's water/grass/tree animation shaders are still WebGL-style `onBeforeCompile` hooks.

Reference UI + shader polish pass:
- Restyled the live HUD toward the provided storybook/Pokemon/Animal Crossing reference: cream cards, navy outlines, separated top-right status pills, keyboard-card controls, a warmer Roll Mode card, and a small illustrated route map inside the Trail Note.
- Tightened the bottom quick-action labels so they read more like game UI (`Click camera`, `Tab inventory`) instead of dev labels.
- Improved shader/art direction details: grass now uses stronger painterly root/mid/tip bands, water clamps glare/sparkle brightness with more controlled contour lines, and distant/highland tree flutter is damped while broad sway remains.
- Added a modest amount of extra opening-meadow flowers/clover/understory so the first scene reads closer to the lush reference without adding new mesh types.
- Verification:
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- Remaining visual note: the shader polish is still mostly on the WebGL material path. WebGPU startup works from the previous pass, but full visual parity would need porting the custom grass/water/tree shader hooks to WebGPU-compatible node/TSL materials.

Karu little-spirit visual pass:
- Reworked the Karu rig in `src/render/world/ambientBlobs.ts` toward the provided "Little Spirit" reference: lighter cloud-blue fur texture, horizontal fluffy body, larger glossy eyes, rounded snout, tiny nose/mouth, blush cheeks, tail puff, and four paws instead of two front nubs.
- Preserved existing Karu behavior, recruitment, rolling, collision, and herd state; this was a visual rig pass only.
- Updated Karu idle/roll animation scaling so the new body, tail, paws, and fur puffs keep their intended proportions while still bobbing, sniffing, hopping, and tucking during roll mimic.
- Verification:
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- Required `develop-web-game` client ran against `http://127.0.0.1:8005/?spiritCloseup=1` and captured `output/karu-spirit-redesign-final/shot-0.png` plus `state-0.json`. The client still reports the known start-button click timeout, but gameplay state and screenshot are captured after entering the game.

Compact HUD pass:
- Added a compact override in `src/styles.css` so the storybook HUD keeps the same visual style but leaves more gameplay visible.
- Reduced the Trail Note card, top status pills, bottom quick-action buttons, prompt chips, pouch card, pickup card, ability pill, and Roll Mode card by roughly 10-15% depending on component.
- Verification:
- `npm run build` passes. Vite still reports the existing large JS chunk warning.
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `git diff --check` passes.
- Required `develop-web-game` client ran against `http://127.0.0.1:8005/` and captured `output/ui-compact-pass/shot-0.png` plus `state-0.json`. The client still reports the known start-button click timeout, but gameplay state and screenshot are captured after entering the game.

Mossu eye-readability pass:
- Kept the character-face change scoped to eyes only: no nose or mouth marks were added.
- Enlarged Mossu's glossy oval eyes, added small white catchlight meshes, and added a simple periodic blink/squint response that also reacts to landing, rolling, jumping, and Karu-call pulses.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing large chunk warning.
- `git diff --check` passes.
- Required `develop-web-game` client initially failed from its installed path because `playwright` resolved relative to `~/.codex`; rerunning the same client through `.codex-tmp/web_game_playwright_client.js` with `--preserve-symlinks-main` captured `output/mossu-eye-readability/shot-0.png` and `state-0.json` from `http://127.0.0.1:8007/?modelViewer=1`.

Mossu secondary-motion pass:
- Added a small spring layer for Mossu's fluff puffs and top tufts: each keeps its authored base offset, trails behind local movement, compresses/rebounds on landing, lifts on jump/call/swim pulses, and gets a little extra side sway during roll/call states.
- Kept the motion scoped to `MossuAvatar.ts`; no gameplay constants, controls, or model-viewer UI were changed.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing large chunk warning.
- Required `develop-web-game` client captured `output/mossu-secondary-motion/shot-0.png` and `state-0.json` from `http://127.0.0.1:8008/?modelViewer=1`; the attempted normal click on the Roll pose timed out after resolving the button, so the captured artifact is the idle model-viewer state.
- A targeted force-click Roll probe confirmed the roll pose state path before timing out during WebGL screenshot capture; treat the required client screenshot as the reliable visual artifact for this pass.

Model viewer lag fix:
- The model viewer was laggier than gameplay because it capped pixel ratio at 1.7, kept shadow maps enabled, and called full `updateUiState()` DOM queries/writes every render frame.
- Matched the viewer closer to gameplay performance policy by capping pixel ratio at 1.1, disabling model-viewer shadows, and moving timeline scrub updates out of the full per-frame UI refresh path.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing large chunk warning.
- `git diff --check` passes.
- Reopened Dia at `http://127.0.0.1:8008/?modelViewer=1&perf=1` so the browser loads the rebuilt model-viewer chunk.

Model viewer Mossu ground-height fix:
- Fixed Mossu clipping through the model-viewer platform by adding a preview-only ground lift before feeding the synthetic `PlayerState` into `MossuAvatar.update()`.
- Gameplay height/simulation code was left untouched; the issue was specific to the model-viewer preview player being authored at `y = 0`.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing large chunk warning.
- `git diff --check` passes.
- Reopened Dia at `http://127.0.0.1:8008/?modelViewer=1&groundfix=1` so the browser loads the rebuilt model-viewer chunk.

Three.js geometry / shader / lighting focus pass:
- Used the installed `threejs-geometry`, `threejs-shaders`, and `threejs-lighting` project skills as references for a focused scene-readability pass.
- Added a single instanced `terrain-form-strokes` layer that places 96 low-opacity brush/contour ellipses along the authored route to clarify terrain shelves and clearings without many individual prop meshes.
- Tuned the grass shader so gust fronts add a subtle darker wind-combed band plus brighter tip sheen, making wind movement read better without adding instances.
- Raised water sparkle slightly and added a shallow shoreline glow term so water edges and current highlights feel warmer and more painterly while keeping the existing glare clamps.
- Promoted ambient, hemisphere, and sky-bounce lights to mood-controlled fields, then slightly reduced fog density and tuned lowland/highland sun/fill levels for better readability.
- Verification:
- `node node_modules/typescript/bin/tsc --noEmit` passes.
- `/usr/local/bin/node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing large chunk warning.
- `/usr/local/bin/npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- `git diff --check` passes.

Opening sequence + first map/water overhaul pass:
- Added a short visual-only wake-up sequence after the title screen: Mossu starts in the meadow nest, the HUD stays hidden, input is paused, the camera pans from the nest toward the river route, and movement/jump/interact/menu inputs can skip after the first beat.
- Staged nearby and distant Karu groups around the opening meadow so the first view establishes the herd fantasy instead of relying on random scatter.
- Added an opening shoreline composition layer with damp painted ground patches, sand/wet-sand rims, reeds, reed tips, stepping stones, and small bank accents around the starting pools.
- Tightened starting water profiles and shader clamps so the lowland pools read less like pale translucent slabs: reduced opacity/glare/milk, controlled shallow/deep bands, and softened shoreline edge brightness.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing async chunk warning.
- `npm run test:contracts` passes: camera, controls, habitats, movement, visuals, water-state-agreement, route-checkpoints.
- Required `develop-web-game` client captured `output/opening-water-sequence-smoke-2/shot-0.png` and `state-0.json`; the screenshot shows the wake-up overlay, Mossu, staged Karu, and start-area water/shoreline accents. A custom no-screenshot Playwright state probe was inconclusive in this environment because headless startup did not expose `window.render_game_to_text()` before timeout, so the game-client artifact remains the reliable visual QA result for this pass.

Dual UI click sound pass:
- Added `public/audio/destiny-ui-click.mp3` from the provided download while keeping the existing `menu-ui-click.mp3`.
- Reworked `InterfaceAudio` to use two UI click variants with a small per-variant audio pool, alternating between the original Mossu click and the new Destiny-like click so repeated UI interactions feel less identical.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing async chunk warning.
- Contract checks passed via the local tooling path after `npm` was unavailable on this shell PATH: `tsc -p tsconfig.contracts.json`, `esbuild tests/contracts/runContracts.ts ...`, and `/tmp/mossu-node .contract-test-build/runContracts.mjs`.
- Required `develop-web-game` client captured `output/ui-click-dual-sound/shot-0.png` and `state-0.json` from the built app; server logs confirmed both `/audio/menu-ui-click.mp3` and `/audio/destiny-ui-click.mp3` were requested.

Water ambience audio pass:
- Added `public/audio/water-river-loop.mp3` from the provided river sound.
- Added `sampleWaterAmbience()` in `src/simulation/world.ts` so water audio proximity is driven by the actual world water resources: main river, branch rivers, highland creek paths, and starting pools.
- Added `AmbientWaterAudio` with a looping river bed that unlocks on the title-screen Play gesture, fades in only near water, fades out away from water, and reports proximity/source state through `render_game_to_text()`.
- Added water ambience contract coverage for river centers, starting pools, a highland creek, and a far dry meadow.
- Verification:
- `/tmp/mossu-node node_modules/typescript/bin/tsc --noEmit` passes.
- `/tmp/mossu-node node_modules/vite/bin/vite.js build` passes. Vite still reports the existing async chunk warning.
- Contract checks passed via local tooling: `tsc -p tsconfig.contracts.json`, `esbuild tests/contracts/runContracts.ts ...`, and `/tmp/mossu-node .contract-test-build/runContracts.mjs`.
- Required `develop-web-game` client captured `output/water-ambient-audio/shot-0.png` and `state-0.json`; state showed `audio.waterAmbience.active: true`, `proximity: 1`, and server logs confirmed `/audio/water-river-loop.mp3` was requested after pressing Play.

Breeze Float animation polish pass:
- Added an explicit `player.floating` runtime state, fed by the existing Breeze Float movement result, reset on void/respawn, and exposed through `render_game_to_text()` for QA.
- Upgraded `MossuAvatar` so Breeze Float now has its own blend: hover lift, fluff and top-tuft spread, softer body stretch, brighter alert eyes, tucked legs, and a small landing recovery after ending the float.
- Updated the model viewer Glide pose to drive the same runtime float state, so the workshop pose now previews the gameplay silhouette instead of only using generic airborne movement.
- Added a light Karu support reaction: recruited Karu stop roll-mimicking while Mossu is floating and use a small breeze-hop/fluff response nearby without changing their follow or roll rules.
- Verification:
- Contract checks passed via local tooling because `npm` is unavailable on this shell PATH: `tsc -p tsconfig.contracts.json`, `esbuild tests/contracts/runContracts.ts ...`, and the bundled Node runtime running `.contract-test-build/runContracts.mjs`.
- `tsc --noEmit` passes.
- `vite build` passes and still emits the existing async chunk warning.
- `git diff --check` passes.
- Browser QA caveat: Vite preview still fails with `ENOSPC` while writing its temp config, the required `develop-web-game` client still cannot resolve Playwright from its skill folder, and custom headless Chrome probes remained unstable in this environment. The deterministic contract now verifies the new floating state; final visual judgment should be done in real Chrome.

Floating island shell read pass (WorldRenderer `buildFloatingIslandShell`):
- Named group `floating-island-shell`; split lower mass into upper taper + darker lower taper + cool underbelly sphere; rim torus lip; three horizontal mist discs under the break; ten small downward cones for hanging rock read; cliff bulges nudged outward; moss band slightly thicker with subtle emissive.
- Verification: `npm run qa` passed.

Ghibli-style tree pass (`terrainDecorations`):
- Instanced round forest: more canopy blobs, puff clusters, roots/branches, blossom reads; pine stack split into rotated tiers + top hip sphere; shared wind material gains `vFoliage` sun-tint, soft light lift, stronger sway/gust, cache key `mossu-instanced-tree-wind-ghibli`.
- `makeRoundTree` / `makePineTree` / saplings aligned with the same design language; landmark trees: extra lobes, emissive leaves, slightly softer trunk, more sphere segments.
- Verification: `npm run qa` passed.
