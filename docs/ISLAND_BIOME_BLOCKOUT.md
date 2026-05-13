# Island Biome Blockout

Last updated: 2026-05-10

This note describes the first strong island art-direction pass in `?islandViewer=1`. The goal is a playable/inspectable composition pass, not a final authored map.

## Inspectable Scene

Open the island atlas with:

```text
/?islandViewer=1
```

The atlas uses the live Mossu terrain mesh, water system, floating shell, route landmarks, map POIs, and waterfall turn list. It can be inspected with orbit controls, zoom, the overview/top/profile/under presets, and Fly WASD mode.

## Scene Hierarchy

`IslandViewerApp` now organizes the atlas scene with named Three.js `Group` folders:

- `Terrain`: the sampled playable heightfield mesh.
- `Water`: ocean below the island plus the runtime river, lake basin, and highland source water group.
- `Forests`: mid-slope evergreen patch reads and tree mass instances.
- `Meadows`: open traversal bowls, lake clearing, terrace meadow, and lower outlet field.
- `Rocks`: floating cliff shell, underbelly, alpine rock spine, shoulder ridges, and snow caps.
- `Landmarks`: route landmarks and map POI pins.
- `Lighting`: ambient/key/rim lights, sky dome, and drifting cloud banks.
- `Debug/Blockout`: guide lines, river centerlines, boundary outline, waterfall pins, and biome flow anchors.

## Biome Layout

- Alpine spine: the north/high-center rock mass is the island silhouette anchor and waterfall source.
- Freshwater: water reads as a high source, central river path, west lake basin, and lower outlet toward the sea.
- Forests: evergreen bands wrap the mid-slopes and ridge climb, with clearings preserved around the route and wet edges.
- Meadows: broad open fields define the south foreground, central travel bowl, east terrace, lake basin, and lower outlet.
- Cliffs: the shell and rim falls are the edge language, keeping the island legible from profile and under views.

## Assumptions

- The debug atlas is the right first-pass scene for whole-island art direction because it is already inspectable and shares live world data.
- “Folders” means named Three.js scene graph groups rather than Unity-style project folders.
- This pass should preserve gameplay sampler contracts, movement, save state, and the main playable route.
- Blockout pins belong in `Debug/Blockout` and stay hidden unless the Guides layer is enabled.

## Verification Artifacts

- `output/island-biome-blockout/atlas-hierarchy-overview.png`: production-build island atlas capture.
- `output/island-biome-blockout/atlas-hierarchy-state.json`: `render_game_to_text` snapshot confirming the hierarchy folders, biome layout notes, visible layers, landmark count, waterfall count, and terrain vertex count.
