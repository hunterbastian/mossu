# Big-World Performance Baseline

Captured: 2026-05-01

This baseline covers the current larger Mossu world, the optional WebGPU renderer path, and `?coopStress=1` creature/activity load. Treat the WebGL route and coop stress route as the shippable baseline. Treat active WebGPU as experimental until its shader compatibility errors are gone.

## Artifacts

| Check | Artifact | Result |
| --- | --- | --- |
| Normal WebGL route | `output/perf-guard/baseline.json` and `output/perf-guard/baseline/` | Pass: 12/12 checkpoints, 114.9fps average, 12.2ms p95, zero console errors |
| Coop stress route | `output/perf-guard/coop-stress.json` and `output/perf-guard/coop-stress/` | Pass: 12/12 checkpoints, 136.9fps average, 10.0ms p95, `remoteCount: 1`, `sharedEvents: 1`, zero console errors |
| Active WebGPU route | `output/perf-guard/webgpu.json` and `output/perf-guard/webgpu/` | Diagnostic fail: 12/12 checkpoints and 122.2fps average, but six `NodeMaterial: Material "ShaderMaterial" is not compatible.` console errors |
| Forced WebGPU fallback | `output/perf-guard/renderer-fallback-forced.json` | Pass: `requestedBackend: "webgpu"` falls back to `activeBackend: "webgl"` with zero console errors |
| Baseline summary | `output/perf-guard/big-world-baseline-summary.json` | Machine-readable rollup of the above |

## What Changed

- `src/render/app/rendererBackend.ts` now rejects Three's internal `webgpu-webgl2` backend and falls back to Mossu's normal `WebGLRenderer` path, recording a fallback reason.
- `tests/e2e/visualPerf.spec.ts` now samples the Silver Bend fixed-camera anchor from the river bank instead of placing Mossu directly underwater, so the visual guard measures the landscape/water scene rather than the underwater overlay.

## Verification Run

These passed on the final code:

```bash
npm run lint
npm run format:check
npm run qa
npm run test:e2e:smoke
npm run test:e2e:visual
npm run perf:guard:baseline
npm run perf:guard:coop
git diff --check
```

This WebGPU comparison intentionally exits non-zero until shader compatibility is fixed:

```bash
node scripts/perfGuard.mjs --headed --browser=chrome --url-param=renderer=webgpu --baseline=output/perf-guard/baseline.json --output=output/perf-guard/webgpu.json --screenshot-dir=output/perf-guard/webgpu
```

## Desktop Checks To Trust Next

1. Run `npm run perf:guard:baseline` after normal world/render changes. Trust it only if it passes, reaches 12/12 route checkpoints, has zero console errors, and the screenshots in `output/perf-guard/baseline/` still show readable route scenes.
2. Run `npm run perf:guard:coop` after creature, follower, grass, water, or world-density changes. Trust it only if `coopStress.enabled` is true in the JSON, route checkpoints are 12/12, and console errors stay at zero.
3. Open a real desktop Chrome session with `?perfHud=1` on the local dev or preview URL, walk Burrow Hollow to Moss Crown Shrine, and use the HUD to check FPS/p95, pixel ratio, draw calls, triangles, grass instances, and water surfaces while judging the scene visually.
4. Use `?renderer=webgpu&perfDebug=1` only as a WebGPU diagnostic. Do not accept WebGPU as shippable while the console contains `ShaderMaterial` compatibility errors, even if the route FPS is above budget.
