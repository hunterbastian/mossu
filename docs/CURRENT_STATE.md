# Mossu Current State

Last updated: 2026-05-05

This is the short current-state brief for future agents. Use it before opening the longer chronological `progress.md` log.

## Product Shape

Mossu is a cozy third-person exploration game prototype built with TypeScript, Vite, and Three.js. The playable slice runs from Burrow Hollow to Moss Crown Shrine and is focused on one polished route, not a broad unfinished open world.

The game currently supports walking, rolling, jumping, Breeze Float, swimming, forageable gathering, landmark cataloging, held one-at-a-time Karu recruitment/following with a quiet join beat, a route map, a profile/field-guide screen, local save persistence, fresh-start reset, quality settings, and QA/debug route jumps.

## Visual Direction

The current look is a cute painterly/anime creature-habitat route:

- aqua handheld/field-guide UI
- warmer readable paths and wider clearings
- sharper storybook tree silhouettes
- hand-painted grass clumps and reactive grass motion
- turquoise water with shoreline milk, foam strokes, sparkles, and readable depth bands
- soft far-range fog and warm sun haze
- a small world-space 3D sun that drives scene lighting and subtle sky ray bands

Keep the look charming and readable. Do not push blur, bloom, fog, or glow so far that route edges, Mossu, water depth, or HUD text become hard to read.

## Technical Shape

- Runtime: TypeScript + Vite + Three.js, WebGLRenderer by default.
- Gameplay truth: `src/simulation/world.ts` terrain/water samplers and movement contracts.
- World rendering: `src/render/world/WorldRenderer.ts` and system files under `src/render/world/`.
- UI/HUD: `src/render/app/HudShell.ts`, `src/render/app/GameApp.ts`, and `src/styles.css`.
- Water: `src/render/world/waterSystem.ts`; underfill must keep the same vertex wave displacement as the main water surface.
- Debug hooks: `?qaDebug=1` exposes `window.mossuDebug`; `?e2e=1` keeps browser tests lightweight.
- Performance: `npm run perf:guard` runs the route guard with screenshots and frame metrics.
- Art review: `npm run art:review` builds production, opens headed Chrome, uses debug route jumps, and captures named screenshots/JSON in `output/art-review-route/`.

## Current Verification Bar

Minimum for shippable code changes:

```bash
npm run lint
npm run qa
npm run test:e2e:smoke
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
