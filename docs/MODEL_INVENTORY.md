# Mossu Procedural Model Families

Last updated: 2026-05-01

Mossu currently has no imported gameplay `.glb`, `.gltf`, `.fbx`, or `.obj` models. The game is procedural, but it should still have stable model families: recognizable things that stay true across generated placements, like a cow mob or forest tree in Minecraft.

Use this as the clean art/model checklist. Implementation-level pieces can change, but these families and variants should stay recognizable.

## 1. Mossu

Player character family.

Variants / states:

- walking Mossu
- rolling Mossu
- floating Mossu
- swimming Mossu
- calling / recruiting Mossu

Always true:

- snowy round body
- big readable dark eyes
- soft fluff silhouette
- small feet
- gentle, tactile motion

Source: `src/render/objects/MossuAvatar.ts`

## 2. Karu

Companion fauna family.

Variants / states:

- curious Karu
- shy Karu
- brave Karu
- sleepy Karu
- ambient Karu
- recruited/following Karu
- Karu nest

Always true:

- tiny blue-white soft creature
- glow/fur texture
- two eyes, cheeks, tail, four feet
- moves as a small herd, not a robot follower

Source: `src/render/objects/KaruAvatar.ts`, `src/render/world/ambientBlobs.ts`

## 3. Meadow Tree

Main cozy tree family, based on the new Mossu tree sheet.

Variants:

- sapling
- young tree
- mature tree
- blossom tree
- fruiting tree
- windswept tree

Always true:

- short chunky trunk
- flared roots
- rounded overlapping leaf clusters
- warm bark
- soft blossoms or fruit accents when used
- non-threatening meadow silhouette

Source: `src/render/world/terrainDecorations.ts`

## 4. Pine Tree

Foothill and highland tree family.

Variants:

- pine sapling
- mature pine
- foothill pine
- alpine pine
- ridge pine

Always true:

- taller fir silhouette
- stacked conic foliage
- darker cooler greens than meadow trees
- reads as highland / route-climb vegetation

Source: `src/render/world/terrainDecorations.ts`

## 5. Landmark Tree

Special route-marker tree family.

Variants:

- amber landmark tree
- green landmark tree

Always true:

- visually distinct from normal forest fill
- pale trunk with dark markings
- clustered canopy
- used to make route moments memorable

Source: `src/render/world/terrainDecorations.ts`

## 6. Shrine

Final route destination family.

Variants:

- Moss Crown Shrine
- shrine moss / crown moss accent
- shrine approach rocks

Always true:

- stacked pale stone
- moss crown/cap
- quiet final-destination silhouette
- should feel ancient but soft, not ominous

Source: `src/render/world/WorldRenderer.ts`, `src/simulation/world.ts`

## 7. Pickup Items

Collectible forageable family.

Variants:

- seed
- shell
- moss tuft
- berry
- smooth stone
- feather

Always true:

- small readable silhouette
- floats/bobs subtly
- should look like a keepsake, not generic loot
- each variant should be recognizable in the handbook/inventory

Source: `src/render/world/WorldRenderer.ts`, `src/simulation/world.ts`

## 8. Rocks And Boulders

Terrain grounding family.

Variants:

- tiny rock
- pebble cluster
- bank pebble trail
- rock formation
- highland boulder
- shrine rock

Always true:

- rounded low-poly forms
- warm lowland tones, cooler highland tones
- helps ground paths, banks, ridges, and shrine approach

Source: `src/render/world/terrainDecorations.ts`

## 9. Ground Flora

Small plant family.

Variants:

- grass blades
- grass clump
- flower cluster
- clover patch
- reed cluster
- moss patch
- mushroom

Always true:

- cozy saturated greens
- soft rounded forms
- clustered rather than isolated
- supports biome identity without cluttering route readability

Source: `src/render/world/grassSystem.ts`, `src/render/world/terrainDecorations.ts`

## 10. Bush

Low rounded meadow/forest-edge plant family.

Variants:

- bush

Always true:

- rounded low profile
- layered overlapping leaf clusters
- thicker twigs/branches near the base
- soft blossoms or berries can appear as accents
- generates mostly near trees and forest edges

Source: `src/render/world/terrainDecorations.ts`

## 11. Water And Shore Kit

Water-surface and bank-edge family.

Variants:

- main river
- river braid
- starting pool
- highland creek
- waterfall
- shore wash
- shore shelf
- bank sedge patch

Always true:

- stylized soft water
- readable shore edge
- water visuals match gameplay water sampling
- banks should feel natural, not like hard cutouts

Source: `src/render/world/waterSystem.ts`, `src/render/world/terrainDecorations.ts`, `src/simulation/world.ts`

## 12. Terrain And Island Kit

Large world-form family.

Variants:

- floating island terrain
- floating island underside
- cliff bulges
- route form strokes
- mountain silhouettes
- shadow pocket volumes

Always true:

- rendered terrain and gameplay height sampler stay aligned
- floating island reads clearly from map/lookdown mode
- route remains readable through the procedural world

Source: `src/render/world/WorldRenderer.ts`, `src/simulation/world.ts`

## 13. Atmosphere Kit

Sky and mood family.

Variants:

- sky dome
- orbiting sun
- cloud cluster
- mountain mist puff
- valley mist patch

Always true:

- soft, bright, gentle atmosphere
- visible sun and scene DirectionalLight stay aligned
- sun highlights remain subtle and readable
- visible depth across the valley and ridge route
- supports cozy adventure tone rather than heavy fog

Source: `src/render/world/atmosphereSystem.ts`, `src/render/world/sceneLighting.ts`, `src/render/world/WorldRenderer.ts`

## 14. Map And Marker Kit

Navigation/readability family.

Variants:

- player marker
- shrine marker
- landmark marker
- bridge marker
- point-of-interest marker
- special marker

Always true:

- translucent ring/core/cap language
- readable from map mode
- supports the route without feeling like debug geometry

Source: `src/render/world/WorldRenderer.ts`, `src/render/app/HudShell.ts`, `src/simulation/world.ts`

## Named Route Anchors

These are not all separate model families, but they should remain visually distinct:

- Burrow Hollow
- Amber Tree Knoll
- Silver Bend
- Fir Gate
- Whisper Pass
- Highland Basin
- Windstep Shelf
- Cloudback Ridge
- Ridge Saddle
- Moss Crown Shrine

## Parked Families

These are preserved but intentionally inactive. See [Asset Parking](ASSET_PARKING.md) before restoring them.

### Mossback Titan

Status: parked.

Source:

- `src/simulation/unused/giantMossCreature.ts`
- `src/render/objects/unused/MossbackTitanAvatar.ts`

Do not treat this as part of the active creature model inventory until it is deliberately restored into simulation, rendering, HUD copy, model-viewer options, and tests.

## Concept Sheet Priority

Make concept sheets in this order:

1. Mossu
2. Karu
3. Meadow Tree
4. Pine Tree
5. Pickup Items
6. Shrine
7. Ground Flora
8. Bush
9. Water And Shore Kit
10. Rocks And Boulders
11. Atmosphere Kit
12. Map And Marker Kit
