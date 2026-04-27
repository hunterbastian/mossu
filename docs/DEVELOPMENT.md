# Development

Single reference for running Mossu locally, profiling, URL flags, and what is experimental.

## Run

```bash
npm install
npm run dev          # Vite dev server
npm run build        # Production bundle (also runs `tsc --noEmit`)
npm run qa           # Contract tests + production build (CI-shaped gate)
npm run test:e2e     # Playwright smoke (preview server; Chromium)
```

Contract-only: `npm run test:contracts`.

CI (GitHub Actions) runs `npm run qa` on push/PR to `main` or `master`, and a separate job runs `npm run test:e2e` after installing Playwright browsers.

## Code splitting

- **`main`** dynamically imports **`GameApp`** (full game) vs **`ModelViewerApp`** (`?modelViewer`).
- **`GameApp`** dynamically imports **`WorldRenderer`** so the heavy world/grass/water chunk loads with the game route, not the model-viewer route.

## Profiling and debug URLs

Add query parameters to the dev or built URL (e.g. `http://localhost:5173/?perfDebug=1`).

| Flag | Purpose |
|------|---------|
| **`perfDebug=1`** | On-screen overlay: frame time, pixel ratio, bloom on/off, renderer draw counts, grass LOD / instancing stats, water surfaces, etc. Use on **real desktop hardware**; headless runs are not a substitute for how grass/water/overdraw feel. |
| **`cameraDebug=1`** | Camera profile, distance, polar angle, player position, river edge samples. |
| **`qaDebug=1`** | Exposes `window.mossuDebug` (opening skip, teleport helpers) for automated QA. |
| **`spiritCloseup=1`** | Debug framing for the spirit / closeup rig (passed into `WorldRenderer`). |
| **`modelViewer=1`** | Loads the isolated **ModelViewerApp** chunk instead of the game. |
| **`renderer=webgpu`** or **`webgpu=1`** | Request WebGPU backend when supported (see experimental). |
| **`renderer=auto`** | Use WebGPU when the browser reports `navigator.gpu`, else WebGL2. |
| **`quality=low`** or **`lowQuality=1`** | Caps pixel ratio, **disables bloom and the EffectComposer path** on WebGL (direct scene render only). Use for low-end desktop checks. Future heavy post (e.g. SSAO) should be gated the same way. |

## Experimental / backend notes

- **WebGPU** (`three/webgpu`) is optional. Initialization can fail on drivers or policies; the app falls back to **WebGL2** and records a reason in perf/debug output when that happens.
- **Bloom** is intentionally mild (single `UnrealBloomPass`). On WebGPU builds, postprocessing is not wired through the same composer path today.
- **Desktop-first performance**: validate grass instancing, water, and draw calls with `perfDebug` and GPU tools; dynamic resolution adjusts pixel ratio from frame time when not in `quality=low` mode.

## Related docs

- [Technical overview](TECHNICAL_OVERVIEW.md) — architecture and contracts.
- [Playtest checklist](PLAYTEST_CHECKLIST.md) — manual route verification.
