# Mossu Current State

Last updated: 2026-05-06

This is the short current-state brief for future agents. Use it before opening the longer chronological `progress.md` log.

## Product Shape

Mossu is a cozy third-person exploration game prototype built with TypeScript, Vite, and Three.js. The playable slice runs from Burrow Hollow to Moss Crown Shrine and is focused on one polished route, not a broad unfinished open world.

The game currently supports walking, rolling, jumping, Breeze Float, swimming, forageable gathering, landmark cataloging, held one-at-a-time Karu recruitment/following with a quiet join beat and route catch-up guard, a route map, a profile/field-guide screen, local save persistence, fresh-start reset, quality settings, and QA/debug route jumps.

## Visual Direction

The current look is a cute painterly/anime creature-habitat route:

- first-paint loading and the main title menu now use a retro pixel ocean/floating-island shell with a gold/blue Mossu logo, tiny clouds, and silver/gold pixel controls
- Aero creature interface UI with cool glass chrome, crisp handheld-RPG menu states, and small organism accents
- normal desktop gameplay HUD surfaces now lean Windows 7 / Frutiger Aero: translucent aqua glass, rounded glossy edges, blue depth, gold actionable accents, and bubble-like highlights
- mobile gameplay HUD now protects the playfield by collapsing learned controls after first movement, showing one `Now` objective chip up top, and reserving pouch/roll/stamina UI for relevant moments
- the isolated Karu/model viewer now reads as a polished macOS Aqua workshop, with an app-window shell, traffic lights, Geist UI type, Geist Mono keys/timers, frosted panels, warm selected controls, a CSS meadow viewport, and drag-to-orbit inspection
- default Nordic filmic render preset with lifted ACES exposure, pearl-cool fog, restrained bloom, and slightly lower render cap
- warmer readable paths and wider clearings
- sharper storybook tree silhouettes
- hand-painted grass clumps and reactive grass motion
- cooler blue-green water with shoreline milk, foam strokes, restrained sparkles, and readable depth bands
- soft pearl far-range fog and controlled warm sun haze
- a small world-space 3D sun that drives scene lighting and subtle sky ray bands
- a taller Moss Crown shrine/crown silhouette plus destination peak layers that read from earlier climb checkpoints

Keep the look charming and readable. Do not push blur, bloom, fog, or glow so far that route edges, Mossu, water depth, or HUD text become hard to read.

## Technical Shape

- Runtime: TypeScript + Vite + Three.js, WebGLRenderer by default.
- Gameplay truth: `src/simulation/world.ts` terrain/water samplers and movement contracts.
- World rendering: `src/render/world/WorldRenderer.ts` delegates authored set pieces, forageables, map markers, co-op visual helpers, water profiles, terrain prop primitives, and small-prop instancing to focused files under `src/render/world/`.
- UI/HUD: `src/render/app/HudShell.ts` owns HUD state and DOM node lifecycle, while `src/render/app/hudSurfaceBuilders.ts` owns reusable card/section/pause/map builders.
- CSS: `src/styles.css` imports semantic chunks under `src/styles/`; `src/styles/theme-overrides.css` now imports named late-cascade theme layers under `src/styles/theme/`.
- Water: `src/render/world/waterSystem.ts` plus `src/render/world/waterProfiles.ts`; underfill must keep the same vertex wave displacement as the main water surface.
- Debug hooks: `?qaDebug=1` exposes `window.mossuDebug`, including route jumps and named save presets; `?e2e=1` keeps browser tests lightweight. Normal player URLs do not expose `advanceTime`, `render_game_to_text`, or `__MOSSU_E2E__`.
- Performance: `npm run perf:guard` runs the route guard with screenshots and frame metrics; the far ocean Gerstner plane keeps a reduced vertex grid for the default filmic pass.
- Art review: `npm run art:review` builds production, opens headed Chrome with `?e2e=1&qaDebug=1&visualProbe=1`, uses debug route jumps, and captures named screenshots/JSON in `output/art-review-route/`; `npm run art:compare` validates those artifacts and can compare them to a saved summary baseline.
- Karu route guard: `npm run karu:route` builds production, runs a state-first recruited-Karu route probe from Burrow toward Moss Crown, and fails if followers go missing or drift beyond the route threshold.
- Agent review: `npm run agent:review` creates a dependency-free local review report plus a Swarms-ready prompt pack for art, perf, Karu, docs/wiki, and next-pass planning under `output/agent-review/`. Swarms is an optional workflow layer only, not a Mossu runtime dependency.

## Current Verification Bar

Minimum for shippable code changes:

```bash
npm run lint
npm run qa
npm run test:e2e:smoke
npm run karu:route
npm run art:compare
git diff --check
```

For rendering, lighting, UI, water, terrain, or camera changes, also run:

```bash
npm run test:e2e:visual
npm run perf:guard
npm run art:review
```

Final art judgement still needs a real desktop browser. Headless WebGL screenshots can pass while the final scene still needs human visual judgement.

## Current Watchlist

- WebGPU remains diagnostic-only because active custom shader/material paths are WebGL-oriented.
- Browser preview binding can need sandbox approval when Vite/Playwright hits `listen EPERM`.
- `progress.md` is useful evidence, but it is not a clean spec.
- `.deepsec/` is initialized for local scanning. The safe regex scan works; the AI `process` phase exports source to an external model backend and needs explicit user approval.
- Local `.env.local` is ignored by git and DeepSec config, but should be treated as sensitive local state.
- `CLAUDE.md` is a thin local pointer into `AGENTS.md`, `docs/CURRENT_STATE.md`, and `docs/NEXT_PASSES.md` so direct Claude Code sessions start with the same Mossu routing.
- `Mossu weekly wiki sync` is active as a local weekly automation so wiki pages can be checked against repo docs after larger passes.
- `npm run agent:review` can summarize existing route/perf/Karu/doc evidence, but fresh visual or performance calls still need the underlying capture commands first.

## Parked Work

Mossback Titan is intentionally inactive. The preserved code lives in:

- `src/simulation/unused/giantMossCreature.ts`
- `src/render/objects/unused/MossbackTitanAvatar.ts`

Do not re-enable it casually.

## Where To Look Next

- Planned work queue: `docs/NEXT_PASSES.md`
- Durable direction: `docs/GAME_MEMORY.md`
- QA checklist: `docs/PLAYTEST_CHECKLIST.md`
- Watchlist: `docs/KNOWN_ISSUES.md`
- Raw implementation log: `progress.md`
