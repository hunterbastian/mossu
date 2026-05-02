# Playtest Checklist

Last updated: 2026-05-01

Use this after major game changes. Start with `npm run qa`, then run the game in Chrome or another real browser.

## Build

- `npm run qa` passes.
- `npm run build` passes if it was run separately from `qa`.
- No TypeScript errors.
- No obvious browser console errors.

## Startup

- Game loads without a blank canvas.
- Mossu appears in the opening meadow.
- HUD appears and does not overlap incoherently.
- Objective text is readable.
- Opening lake, grass, trees, river, and mountains are visible enough to orient the player.
- The visible 3D sun is present in the sky, reads as part of the world, and is not a flat UI overlay.

## Controls

- `W` moves forward relative to the camera.
- `A` moves left relative to the camera.
- `D` moves right relative to the camera.
- `S` moves backward relative to the camera.
- Arrow keys still work as fallback.
- Mouse look works after clicking into the game.
- Camera can tilt up enough to see mountains.
- Camera recenters gently without snapping.
- `Space` jumps / floats / swim-strokes.
- `Q` works as dedicated Breeze Float in air and as underwater dive in deep swim water.
- `Shift` rolls.
- `E` interacts with nearby landmarks or fauna.
- `Tab` opens and closes inventory/profile.
- `M` opens and closes map mode; while the map is open, scroll wheel zooms the island view; `R` or `Home` resets map zoom.
- `Esc` opens pause and closes menus.

## Movement Feel

- Mossu movement feels smooth, not twitchy.
- Direction changes are responsive but softened.
- Rolling still feels faster than walking.
- Jump and Breeze Float still work on slopes and shelves.
- Mossu does not snag on route terrain.
- Void fall and respawn still work.

## Water

- Main river reads as water, not a tube or stripe.
- Broad channels do not visibly overlap in broken ways.
- Grassy nooks between river braids are readable.
- Opening lake is not filled with grass.
- Mossu swims in deep water.
- Mossu exits water cleanly at banks.
- Shoreline reeds, sedges, pebbles, damp rims, and visible swim state agree at every major bank entry (and `npm run test:contracts` should stay green: water-state-agreement).
- Highland creek ribbons, pools, runoffs, and waterfalls read as intentional water features instead of pale slabs.
- Water flow direction appears downhill or route-consistent.

## Terrain

- Grass/rock/snow bands blend smoothly.
- Flat areas read as grass.
- Steep slopes read as rock.
- High areas read as snow or pale alpine stone.
- Route shelves remain playable.
- Mountains are visible when looking upward.
- Fog/mist adds depth without hiding the path.

## Sun And Atmosphere

- The sun appears as a 3D sky/world element and moves subtly with the orbit rig.
- Directional light, sky sun, cloud lighting, grass/water highlights, and haze agree enough that the sun appears to affect the scene.
- Low-angle warmth and light god rays stay subtle; they should not wash out route readability or HUD contrast.
- Cloud layers, watercolor-like distance fog, and moving grass cloud-shadows read as soft atmosphere, not heavy dark bands across the route.
- Disabling or hiding debug layers does not leave a visible sun/light mismatch.

## Forest And Grass

- Instanced forest does not show black or broken canopies.
- Trees are naturally spaced, not grid-like.
- Trees do not block the main route too aggressively.
- Real trees frame spaces; saplings, shrubs, and shoreline understory do not scatter evenly everywhere.
- Grass density feels lush but Mossu remains visible.
- Grass wind is not synchronized like one sine wave.
- Mossu push interaction visibly bends grass outward without hiding Mossu.
- Premium grass does not make Chrome frame pacing noticeably worse.

## Full Route

- Start at Burrow Hollow and reach Moss Crown Shrine in Chrome without teleporting.
- Automated guard workflow for every visual pass: run `npm run perf:guard:baseline` before changing the scene, then run `npm run perf:guard:candidate` after the pass. Both commands build the production bundle, open headed Chromium, replay the Burrow-to-Moss-Crown route through many small QA positions, capture per-checkpoint screenshots, and write comparable JSON under `output/perf-guard/`.
- Route guard must pass the full budget: all route checkpoints reached, all route landmark stamps logged, average FPS >= 60, p95 frame time <= 18ms, every checkpoint average FPS >= 60, every checkpoint p95 <= 20ms, and nonblank/contrast/chroma screenshot checks must stay above the fixture thresholds.
- Candidate guard also compares against `output/perf-guard/baseline.json` and fails on regressions larger than the fixture tolerance: average FPS drop > 3, p95 frame increase > 3ms, checkpoint FPS drop > 5, or checkpoint p95 increase > 5ms. Inspect `output/perf-guard/baseline/` vs `output/perf-guard/candidate/` screenshots before replacing the baseline.
- Record every stuck spot, confusing side bank, unreadable creek crossing, camera collision, and Karu-following failure.
- At each landmark, check that the next intended route still reads from the terrain shape, water edge, tree framing, and HUD/map language.
- Capture at least one screenshot from the opening meadow, opening lake shore, river bend/creek shore, forest edge, highland creek/waterfall, and shrine approach.

## Visual Anchor Scenes

- Title screen into opening meadow: spawn remains readable, grass/clover detail stays at the edges, and the title transition does not hide Mossu.
- Opening meadow sky read: visible sun, cloud edge light, grass highlights, and soft haze feel coherent from the normal camera.
- Anime/painterly read: color grade adds warm highlights, cooler shadows, and light value bands without washing out Mossu, the HUD, route edges, or water-depth cues.
- Character silhouettes: Mossu and Karu soft outlines are visible at normal camera distance but do not look like thick black stickers.
- Opening lake shore: simplified turquoise depth bands, soft milk edge, damp lip, reeds, pebbles, and swim state agree from the normal gameplay camera.
- River bend / creek shore: Silver Bend reads as painted water with white foam strokes and visible bank rims, not a pale translucent slab.
- Forest edge near route: mature trees frame the route while saplings/shrubs stay in transition areas.
- Highland creek / small waterfalls: trickles, mossy lips, and creek ribbons read as small island water features.
- Shrine approach: final climb has pale rock/greenery framing without blocking route readability.

## UI

- HUD control text matches actual controls.
- Inventory/profile is readable at laptop size.
- Map route markers match the world route.
- Pause menu does not stack with map or inventory.
- Pause menu shows current trail progress and whether saves are persistent or session-only.
- Fresh-start reset in the pause menu asks for confirmation, returns Mossu to Burrow Hollow, clears collected progression, and leaves the game playable without refresh.
- Holographic cards, once implemented, remain readable and performant.

## Mossu Handbook (`Tab`)

- Opens and closes without leaving a blank game surface.
- At **short viewports** (window not maximized, laptop 13″, or browser chrome visible), the shell fits within the viewport: no content is permanently clipped; columns and card grids **scroll** inside the panel.
- Keepsake and Pouch card grids scroll independently when many cards are populated; preview panel does not steal the entire height.
- Tabs remain visible and tappable/clickable when the panel is narrow (stacked layout).

## Fauna

- Karu are visible near intended pockets.
- Idle/wander motion is soft, not jittery.
- `E` recruitment works when near Karu.
- Followers use separation, alignment, cohesion, and leader follow.
- Followers do not crowd, clip badly, or vanish.
- Followers remain readable across slopes, banks, and shallow water edges.
- Mossback Titan does not appear, warn, attack, ripple water, or show in model viewer unless it has been intentionally restored from parked assets.

## Performance

- Frame rate feels stable during normal meadow traversal.
- Frame rate remains acceptable near dense grass/forest.
- Opening map/inventory/pause does not hitch heavily.
- Dynamic pixel ratio does not visibly blur the game too much.
- Anime color grade, soft outlines, and painterly grass/water bands do not cause a visible performance drop.
- No runaway memory or repeated console warnings after a few minutes.
- With `?perfHud=1`, track FPS/p95 frame time, pixel ratio, bloom, renderer calls, triangles, active grass instances, and water surfaces after any world-density pass. Use `?perfDebug=1` when you need the full world-count dump.

## Regression Notes

Record any bug with:

- exact location or coordinates if possible
- active view mode
- controls pressed
- screenshot path
- whether it reproduces after refresh

Useful debug URL:

```text
http://127.0.0.1:4193/?cameraDebug=1&perfHud=1
```
