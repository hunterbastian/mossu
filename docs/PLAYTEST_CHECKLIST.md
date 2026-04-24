# Playtest Checklist

Last updated: 2026-04-24

Use this after major game changes. Start with `npm run build`, then run the game in Chrome or another real browser.

## Build

- `npm run build` passes.
- No TypeScript errors.
- No obvious browser console errors.

## Startup

- Game loads without a blank canvas.
- Mossu appears in the opening meadow.
- HUD appears and does not overlap incoherently.
- Objective text is readable.
- Opening lake, grass, trees, river, and mountains are visible enough to orient the player.

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
- `Shift` rolls.
- `E` interacts with nearby landmarks or fauna.
- `Tab` opens and closes inventory/profile.
- `M` opens and closes map mode.
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
- Water flow direction appears downhill or route-consistent.

## Terrain

- Grass/rock/snow bands blend smoothly.
- Flat areas read as grass.
- Steep slopes read as rock.
- High areas read as snow or pale alpine stone.
- Route shelves remain playable.
- Mountains are visible when looking upward.
- Fog/mist adds depth without hiding the path.

## Forest And Grass

- Instanced forest does not show black or broken canopies.
- Trees are naturally spaced, not grid-like.
- Trees do not block the main route too aggressively.
- Grass density feels lush but Mossu remains visible.
- Grass wind is not synchronized like one sine wave.
- Mossu push interaction visibly bends grass outward without hiding Mossu.
- Premium grass does not make Chrome frame pacing noticeably worse.

## UI

- HUD control text matches actual controls.
- Inventory/profile is readable at laptop size.
- Map route markers match the world route.
- Pause menu does not stack with map or inventory.
- Holographic cards, once implemented, remain readable and performant.

## Fauna

- Karu are visible near intended pockets.
- Idle/wander motion is soft, not jittery.
- `E` recruitment works when near Karu.
- Followers use separation, alignment, cohesion, and leader follow.
- Followers do not crowd, clip badly, or vanish.
- Followers remain readable across slopes, banks, and shallow water edges.

## Performance

- Frame rate feels stable during normal meadow traversal.
- Frame rate remains acceptable near dense grass/forest.
- Opening map/inventory/pause does not hitch heavily.
- Dynamic pixel ratio does not visibly blur the game too much.
- No runaway memory or repeated console warnings after a few minutes.

## Regression Notes

Record any bug with:

- exact location or coordinates if possible
- active view mode
- controls pressed
- screenshot path
- whether it reproduces after refresh

Useful debug URL:

```text
http://127.0.0.1:4193/?cameraDebug=1&perfDebug=1
```
