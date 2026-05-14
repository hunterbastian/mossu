# Known Issues And Watchlist

Last updated: 2026-05-13

This file tracks current caveats that are useful for future agents. These are not all release blockers.

## Active Watchlist

### WebGPU Is Diagnostic-Only

The normal runtime should use WebGLRenderer. The WebGPU request path can reach route checkpoints, but active Three `ShaderMaterial` paths are not compatible with the WebGPU node-material pipeline and log errors such as `NodeMaterial: Material "ShaderMaterial" is not compatible.`

Keep the explicit WebGL fallback behavior. Do not treat true WebGPU as shippable until the custom shader/material stack has a deliberate WebGPU-compatible pass.

### Browser WebGL Screenshots Can Be Flaky

Some Playwright/headless screenshot probes have timed out or closed during heavy WebGL startup even when smoke tests, visual canvas probes, and perf guards pass. Prefer:

- `npm run test:e2e:visual` for deterministic canvas metrics.
- `npm run karu:route` for state-first Karu follower route checks; pass `--screenshots` only when screenshot artifacts are explicitly needed.
- `npm run perf:guard:headless` or the headed perf guard for route health.
- `npm run art:review` plus `npm run art:compare` for the maintained headed Chrome route captures; this path now uses `?qaDebug=1&visualProbe=1`, clears stale artifacts, captures via async canvas PNG retries without the old page-screenshot fallback cascade, writes incomplete summaries on failure, and rejects mixed partial or visually blank outputs.
- Desktop Chrome or Computer Use for title/opening watch passes; throwaway Playwright opening-capture scripts can hang during browser close even when the real game plays correctly.
- A real desktop browser for final art, lighting, camera, and interaction judgement.

Playwright and perf-guard temp files now default to `.codex-tmp/playwright-tmp` inside the workspace, which should reduce failures caused by system temp pressure.

May 8 art-review hardening note: the prior headed-wrapper failure during screenshot capture is superseded. `npm run art:review` now completed headed Chrome with 6/6 fresh route captures through `?qaDebug=1&visualProbe=1`, all via canvas capture, zero fatal browser errors, and `npm run art:compare` passing. A direct headless deterministic route remains useful only when headed Chrome cannot launch in the local sandbox.

May 9 art-review caveat: the headed `npm run art:review` wrapper can still timeout during `render_game_to_text` readback in this Codex desktop session after entering gameplay. The direct deterministic fallback `node scripts/artReviewRoute.mjs --headless --browser=chromium --deterministic-step` completed 6/6 captures after real-time/canvas retry fallbacks, and `npm run art:compare` passed. Treat this as a harness/runtime-readback caveat, not evidence of a route-rendering failure.

May 8 controller/camera perf triage: the saved failure artifact showed Burrow Hollow, Amber Tree, and Skyward Ledge over budget (`78.9fps` average / `19.6ms` p95), and a `pixelRatio=0.92` diagnostic still missed. Follow-up profiling on the same dirty checkout showed the route workload itself was under budget (`157.2fps` average / `9.3ms` p95 with full captures), and the exact `npm run perf:guard` wrapper then passed at `149.8fps` average / `9.9ms` p95. If this recurs, inspect Chrome/GPU warmup or harness variance before changing game feel or visual density.

May 10 terrain-detail update: the earlier atlas-only dirty-checkout failures are superseded by the later full rendering bar. `npm run test:e2e:visual`, headed `npm run perf:guard`, headed `npm run art:review`, `npm run art:compare`, smoke, Karu route, lint, QA, and diff-check all pass after the floating-island terrain-detail pass. If Silver Bend contrast, route budget, or art-review readiness regress again, treat that as a fresh repro rather than carrying forward the older atlas-only caveat.

May 10 shader update: the stronger anime/Ghibli color grade initially made the Fir Gate and Whisper Pass near-camera pines count as visually blank in `npm run perf:guard` even though the route timing was healthy. That specific failure is superseded: the pine leaf/trunk material floor keeps shaded needles dark green instead of pure black, `npm run perf:guard` passes at `105.2fps` average / `10.7ms` p95, and headed `npm run art:review` completed 6/6 captures with recoverable canvas retry warnings. If close pines regress again, inspect material floors and the active Three shader chunk names before moving trees or weakening the route feel.

May 10 concept-art island update: the whole-island terrain/shell pass is perf-green after trimming extra shell micro-meshes, but the headed `npm run art:review` wrapper timed out waiting for runtime readiness in this Codex desktop session. The documented deterministic fallback `node scripts/artReviewRoute.mjs --headless --browser=chromium --deterministic-step` completed `6/6` captures and `npm run art:compare` passed with its real-time fallback warning. Treat this as the recurring art-review harness/readiness caveat, not evidence that the concept-art terrain pass failed to render.

May 11 concept-art reverify update: the scene itself is perf-green after the atlas/profile iteration (`npm run perf:guard` at `115.1fps` average / `10.5ms` p95 / `13.1ms` p99 with `12/12` checkpoints), and installed Chrome completed the maintained route capture path via `node scripts/artReviewRoute.mjs --headless --browser=chrome --deterministic-step --url=http://127.0.0.1:8000/` with `6/6` captures plus `npm run art:compare` passing. The bundled Playwright Chromium headless shell is currently missing from `~/Library/Caches/ms-playwright/chromium_headless_shell-1217`, which blocks `npm run test:e2e:smoke`, `npm run test:e2e:visual`, `npm run karu:route`, and Chromium-based deterministic art review until the cache is restored. Treat that as local browser-tooling state, not a scene regression.

May 12 terrain follow-up update: after softening the front cliff strata, cheap gates and installed-Chrome visual evidence are green, but the official headed `npm run perf:guard` is not green. One run reached all `12/12` route checkpoints but failed strict budget (`67.7fps` average / `20.6ms` p95 / `23.6ms` p99), and a final rerun timed out during Amber Tree replay after Burrow. A same-build installed-Chrome headless diagnostic passes at `94fps` average / `15.9ms` p95 with `12/12` checkpoints, so verify headed Chrome/device variance before removing terrain composition detail. The direct art-review route also needed real-time stepping and canvas retry fallbacks but completed `6/6` captures with `npm run art:compare` passing.

May 12 water/material update: the water-profile and terrain-material pass passes cheap gates plus installed-Chrome perf/atlas evidence (`130.7fps` average / `11.9ms` p95 / `12/12` checkpoints), but package `npm run test:e2e:smoke` remains blocked before test bodies by the missing Playwright `chromium_headless_shell-1217` cache. The direct installed-Chrome art-review route also timed out waiting for runtime readiness in this Codex desktop session, so use the captured atlas images and perf-route screenshots as the current evidence until the maintained art-review wrapper is refreshed.

May 12 reference-aerial update: the no-UI atlas capture and installed-Chrome route perf are green for the latest island-reference pass (`140.3fps` average / `9.6ms` p95 / `10.8ms` p99 with `12/12` checkpoints), but the package smoke suite is still blocked by the missing Playwright `chromium_headless_shell-1217` cache. The headed `npm run art:review` wrapper still times out at runtime readiness and leaves an incomplete zero-capture `output/art-review-route/summary.json`, so `npm run art:compare` remains red until fresh route artifacts are generated.

May 13 ocean/water update: the Sea-of-Thieves-style ocean pass has green lint, QA/build, diff-check, installed-Chrome atlas capture, and installed-Chrome route perf (`155.1fps` average / `8.7ms` p95 / `9.3ms` p99 with `12/12` checkpoints). `npm run test:e2e:smoke` is still blocked before test bodies by the missing Playwright `chromium_headless_shell-1217` cache, and the approved `npx playwright install chromium` repair failed with `ENOSPC` while downloading the 165 MB browser archive. Clear disk space before retrying package Playwright smoke/visual suites.

May 13 water bank update: the custom installed-Chrome close-up probe succeeded after waiting for the first-paint loading shell to be removed before screenshots. Evidence in `output/water-bank-closeup-pass/` covers opening pools, great lake shore, Silver Bend, highland creek, and shrine approach with matching rendered/gameplay surface Y in the new water probe. Lint, QA/build, diff-check, and installed-Chrome route perf pass; package smoke was retried and still fails before test bodies because the local Playwright `chromium_headless_shell-1217` executable is missing. If reusing one-off screenshot scripts, wait for `.instant-title` to be absent before judging captures.

May 13 water refactor update: local lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, and diff-check pass after the water module split. The Rollup native loader failure was traced to the Codex shell resolving `node` to `/Applications/Codex.app/Contents/Resources/node`; running npm with `/usr/local/bin` first in `PATH` avoids the code-signature mismatch and lets Vite build. Use `PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /usr/local/bin/npm run build` for build-backed checks in this desktop shell.

May 13 water-uniform helper update: the follow-up helper extraction did not change shader math or traversal behavior. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, and diff-check pass.

May 13 water-material helper update: extracting `waterSurfaceMaterials.ts` did not change shader strings, profile values, geometry, or traversal behavior. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, and diff-check pass.

May 13 water-color helper update: extracting `waterSurfaceColors.ts` for profile color construction plus layer color-uniform assignment did not change shader strings, material values, profile values, geometry, or traversal behavior. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, and diff-check pass.

May 13 water-profile uniform helper update: extracting `waterProfileUniforms.ts` for depth and surface scalar profile uniform assignment did not change shader strings, scalar values, material values, profile values, geometry, or traversal behavior. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, installed-Chrome route perf, and diff-check pass at `130.6fps` average / `10.4ms` p95 with `12/12` checkpoints.

May 13 water-surface controller update: extracting `waterSurfaceController.ts` for runtime update/dispose resource bookkeeping did not change shader strings, uniforms, material values, profile values, geometry, traversal behavior, or the public water-surface controller contract. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, and diff-check pass.

May 13 water-scene uniform helper update: extracting `waterSceneUniforms.ts` for scene-lighting fallback uniforms plus `waterShader` registration did not change shader strings, uniform values, material values, scene-lighting update behavior, profile values, geometry, or traversal behavior. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, and diff-check pass.

May 13 water-surface layer helper update: extracting `waterSurfaceLayers.ts` for fill/volume layer mesh construction and volume-geometry creation did not change shader strings, render order, mesh names, material values, geometry algorithm, profile values, traversal behavior, or the public water-surface controller contract. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, and diff-check pass.

May 13 water-volume shader helper update: extracting `waterVolumeShader.ts` for the volume-layer shader hook did not change shader strings, shared wave uniforms, color/profile uniform assignment, material values, geometry, profile values, traversal behavior, depth-debug behavior, or the public water-surface controller contract. Focused lint, `tsc --noEmit`, and diff-check pass.

May 13 reference wave update: the ocean/atlas shader tune toward the latest close-up tropical wave reference passes focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, installed-Chrome route perf, production atlas capture, and diff-check. A more aggressive foam-sheet variant was rejected after strict route perf failed; the final backed-off version passes at `145.7fps` average / `8.9ms` p95 with `12/12` checkpoints.

May 13 distant sky/backdrop update: the floating-islands reference pass is runtime-green after moving sky detail into far-only atmosphere and horizon set pieces. Focused lint, `tsc --noEmit`, forced-PATH production build, installed-Chrome route perf, and diff-check pass; route perf is `152.6fps` average / `8.4ms` p95 with `12/12` checkpoints. One-off low-camera screenshots under `output/sky-backdrop-close-check/` were useful for harness probing but stayed in map-style framing, so use `output/perf-guard/distant-sky-reference/` plus a normal desktop browser for final art judgement.

May 13 SoT water-color update: the ocean and atlas color blend now explicitly separates deep blue body water, turquoise sunlit wave faces, pale cyan horizon water, dark troughs, Fresnel/view-angle lift, and sun-direction glints without changing ocean mesh topology, gameplay water, traversal, save data, or swim contracts. Focused lint, `tsc --noEmit`, forced-PATH production build, installed-Chrome route perf, and diff-check pass at `119.1fps` average / `12.5ms` p95 with `12/12` checkpoints.

May 13 water-fill shader helper update: extracting `waterFillShader.ts` for the fill/underfill shader hook did not change shader strings, underfill offset, shared wave uniforms, color/profile uniform assignment, material values, geometry, profile values, traversal behavior, depth-debug behavior, swim contracts, or the public water-surface controller contract. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, installed-Chrome route perf, and diff-check pass at `117.8fps` average / `12.7ms` p95 with `12/12` checkpoints.

May 13 water-surface shader helper update: extracting `waterSurfaceShader.ts` for the main surface shader hook did not change shader strings, shared wave uniforms, painterly foam texture wiring, scene-lighting registration, color/profile uniform assignment, material values, geometry, profile values, traversal behavior, depth-debug behavior, map-lookdown behavior, swim contracts, or the public water-surface controller contract. Focused lint, `tsc --noEmit`, contract TypeScript build, esbuild contract bundling, contract runner, forced-PATH production build, installed-Chrome route perf, and diff-check pass at `141.2fps` average / `10.2ms` p95 with `12/12` checkpoints.

May 13 water-shader chunk helper update: extracting `waterShaderChunks.ts` centralizes shared wave-uniform declarations and ripple-ring GLSL generation across surface, fill, and volume shader helpers. The first installed-Chrome route guard failed on console shader errors from duplicated `uBaseFrequency`/`uDetailFrequency` declarations in the surface fragment; that failed artifact is superseded by `output/perf-guard/water-shader-chunks-fixed/`, which passes at `101.5fps` average / `15.5ms` p95 with `12/12` checkpoints and no console shader errors.

May 13 water-refactor closeout update: `WATER_README.md`, profile intent comments, and the `water-shader-chunks` contract now cover the tuning map and the duplicate-frequency shader regression caught during refactor. Fresh post-refactor water tuning captures are in `output/water-tuning-refactor/`; great lake shore, Silver Bend, highland creek, and shrine approach all report matching rendered/gameplay surface Y and no browser messages.

### Local Preview Binding May Need Approval

In the Codex desktop sandbox, Vite preview or Playwright preview servers may hit local binding restrictions. If an otherwise important browser verification fails with `listen EPERM`, rerun with approved local-server permissions instead of rewriting the test.

## Parked By Design

The Mossback Titan is intentionally inactive. Active source and tests should not import or expose Titan state. The preserved implementation lives in:

- `src/simulation/unused/giantMossCreature.ts`
- `src/render/objects/unused/MossbackTitanAvatar.ts`

See [Asset Parking](ASSET_PARKING.md) before restoring it.

## Resolved Or Superseded Notes

- Art-review partial/stall artifacts: `npm run art:review` no longer mixes fresh route screenshots with old summaries, and headed Chrome route capture now avoids the uncancelled `advanceTime(..., true)` stall by using real-time visual waits plus bounded debug-bridge calls.
- Art-review screenshot timeout cascade: `scripts/artReviewRoute.mjs` no longer falls from a stalled WebGL canvas readback into Playwright `page.screenshot()` retries. The route now uses async canvas blob capture with bounded retries, and the May 8 headed wrapper run completed 6/6 captures.
- Art-review readiness timeout: `npm run art:review` now opens headed Chrome with `?qaDebug=1&visualProbe=1`, avoiding the old e2e-minimal screenshot path while preserving named route screenshots and JSON captures from the real browser render loop.
- Large production chunk warning: the core Three.js vendor chunk is intentionally isolated and Vite's warning threshold now matches the current known baseline. Revisit code splitting only if load time or memory becomes user-visible.
- Extraneous local packages: `npm prune` removed the stale Next/React/Sharp-related packages from `node_modules`; `npm ls --depth=0` is clean after the focused tech-cleanup pass.
