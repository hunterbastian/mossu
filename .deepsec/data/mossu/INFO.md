# mossu

## What this codebase does

Mossu is a private TypeScript + Vite + Three.js browser-game prototype. It ships a client-only playable exploration slice with a normal game route and a `?modelViewer=1` creature viewer route. The app owns rendering, simulation, HUD, local save/progression, audio, Playwright smoke/visual tests, and perf-guard scripts; it does not expose an application backend, API routes, database layer, or multi-user account system.

## Auth shape

There is no production authentication or authorization boundary in the game runtime. The closest gate is query-string controlled tooling: `?qaDebug=1` exposes `window.mossuDebug`, `?e2e=1` exposes lightweight test state, `?perfDebug=1` enables perf counters, and `?modelViewer=1` switches to the local model viewer. Persistent save and quality settings intentionally disable storage in QA/e2e/perf/debug modes through `shouldUsePersistentSave` and `shouldPersistQualitySettings`.

## Threat model

Highest-impact bugs would be browser-side issues that let untrusted URL/query/localStorage state execute script, corrupt persistent local save/quality state, or crash/freeze the WebGL runtime. Lower-impact issues include debug hooks accidentally available outside `qaDebug`, unsafe handling of generated HUD/title/model-viewer HTML, static asset path mistakes, and tooling scripts that accidentally expose secrets or scan ignored build artifacts.

## Project-specific patterns to flag

- Query parameters are the main external input: `qaDebug`, `e2e`, `perfDebug`, `visualProbe`, `modelViewer`, `model`, `visualPreset`, and `pixelRatio` should stay allowlisted and non-privileged.
- `window.mossuDebug` is intentional only under `qaDebug`; any always-on mutation hook for save state, teleporting, quality settings, or layer visibility is suspicious.
- Local persistence uses `mossu.save.v1` and `mossu.quality.v1`; parsing should stay schema/version checked and debug/perf/e2e modes should not write normal saves.
- Several UI surfaces use `innerHTML` for authored markup and small controlled strings; flag any flow where user-controlled query/localStorage data reaches `innerHTML`.
- Perf and Playwright scripts start local static servers and headed Chrome; network/file serving should remain bound to local test roots and not accept arbitrary file paths.

## Known false-positives

- `src/render/app/appTitleScreen.ts` and `src/render/app/ModelViewerApp.ts` use static template markup for authored UI shells, not remote content.
- `src/render/app/HudShell.ts` uses `innerHTML` for controlled in-game labels from simulation/content tables; the game has no user-generated content pipeline.
- `src/main.ts` intentionally exposes `advanceTime` and `render_game_to_text` for QA; `mossuDebug` is gated by `qaDebug`.
- `public/audio/*`, `public/fonts/*`, and `favicon.svg` are bundled static game assets.
- `output/`, `dist/`, `.contract-test-build/`, `.codex-tmp/`, and `.deepsec/data/*/{files,runs,reports}` are generated verification/build/scan artifacts, not source.
