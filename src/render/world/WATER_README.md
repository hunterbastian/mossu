# Mossu Water Rendering Map

The water stack is split so visual tuning can stay narrow while gameplay water contracts remain stable.

## Runtime And Placement

- `waterSystem.ts` is the public facade. It owns the `WaterSystem` group, depth-debug flag, controller updates, and compatibility exports used by contracts.
- `waterBodies.ts` builds the authored river, lake, creek, and runoff surface groups.
- `waterSurfaceGeometry.ts` builds river/lake meshes and the attributes shared by the surface, fill, and volume layers.
- `waterSurfaceLayers.ts` creates the fill and volume layer meshes from the shared geometry.
- `waterSurfaceController.ts` owns runtime updates, ripple uniform uploads, opacity changes, depth-debug mode, and disposal.

## Tuning

- `waterProfiles.ts` owns the named water art profiles. Start here for most color, opacity, foam, caustic, current, and sparkle changes.
- `waterSurfaceColors.ts` converts profile hex values into `Color` objects and assigns layer color uniforms.
- `waterSurfaceMaterials.ts` creates the surface/fill/volume materials and profile-specific opacity setup.
- `waterProfileUniforms.ts` assigns scalar profile knobs to shader uniforms.
- `waterShaderUniforms.ts` creates and assigns the shared time, ripple, flow, wave, map-lookdown, and depth-debug uniforms.
- `waterShaderChunks.ts` owns shared GLSL snippets for wave uniform declarations and ripple-ring functions.

## Shader Hooks

- `waterSurfaceFactory.ts` is intentionally small. It assembles geometry, materials, layers, shader hooks, and the `WaterSurface` controller.
- `waterSurfaceShader.ts` owns the main visible water-surface shader hook: depth bands, shoreline milk, foam, caustics, glints, map-lookdown, and scene-lighting integration.
- `waterFillShader.ts` owns the fill/underfill shader hook. Keep its vertex displacement aligned with the main surface so banks do not expose cracks.
- `waterVolumeShader.ts` owns the low-opacity volume layer used to give filled banks and deeper pockets body.
- `waterSceneUniforms.ts` registers scene-lighting uniforms so `sceneLighting.ts` can update water mood without knowing about individual materials.

## Interaction Signals

- `waterRipples.ts` owns actor ripple lifecycle and emission. Use it for Mossu/Karu wake behavior.
- `waterTypes.ts` owns shared controller and ripple types.
- Gameplay truth still lives in `src/simulation/world.ts` and water traversal code. Do not tune swim/wade thresholds from shader files.

## Verification

For shader or profile edits, run at least:

```sh
npm run qa
node scripts/perfGuard.mjs --browser=chrome --output=output/perf-guard/<name>.json --screenshot-dir=output/perf-guard/<name>
git diff --check
```

Use `?qaDebug=1` water probe captures before changing bank visuals or swim feel.
