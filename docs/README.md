# Mossu Docs

Last updated: 2026-05-05

Use this as the docs index before opening the longer historical `progress.md` log.

## Start Here

| File                                        | Use it for                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Game Memory](GAME_MEMORY.md)               | Durable creative direction, current playable slice, non-negotiables, and near-term product priorities. |
| [Current State](CURRENT_STATE.md)           | Short present-tense brief for future agents before reading the longer implementation log.              |
| [Next Passes](NEXT_PASSES.md)               | Prioritized work queue with small, medium, and hygiene passes.                                         |
| [Development](DEVELOPMENT.md)               | Local run commands, URL flags, QA scripts, renderer options, and experimental backend notes.           |
| [Technical Overview](TECHNICAL_OVERVIEW.md) | Architecture, major systems, and implementation contracts.                                             |
| [Playtest Checklist](PLAYTEST_CHECKLIST.md) | Manual route, interaction, visual, and performance checks after meaningful game changes.               |
| [Perf Baseline](PERF_BASELINE.md)           | Current route performance baseline, WebGL/WebGPU status, and perf-guard artifacts.                     |
| [Known Issues](KNOWN_ISSUES.md)             | Active caveats that are not necessarily blockers but should be checked before big changes.             |
| [Asset Parking](ASSET_PARKING.md)           | Disabled or unused assets that should stay preserved but inactive.                                     |
| [Model Inventory](MODEL_INVENTORY.md)       | Procedural model families and concept-sheet priorities.                                                |
| [Systems Audit](SYSTEMS_AUDIT.md)           | Current system audit and improvement targets.                                                          |
| [Redesign Roadmap](REDESIGN_ROADMAP.md)     | Larger redesign plan and staged feature/polish direction.                                              |
| [Rendering Notes](THREE_RENDERING_NOTES.md) | Three.js rendering guidance and local skill lookup reminder.                                           |
| [Dev Scaffolding](DEV_SCAFFOLDING.md)       | App bootstrap, E2E hooks, and automation support notes.                                                |

## Current Verification Bar

For code changes that affect gameplay, rendering, UI, or performance:

```bash
npm run lint
npm run qa
npm run test:e2e:smoke
git diff --check
```

For visual, world-density, renderer, or performance changes, add:

```bash
npm run art:review
npm run test:e2e:visual
npm run perf:guard:baseline
npm run perf:guard:candidate
```

`npm run art:review` builds the production bundle, opens a real Chrome route pass, and writes named screenshots plus JSON under `output/art-review-route/`. `npm run qa` is the minimum shippable gate because it runs contract tests plus the production Vite build. A real desktop browser pass is still required for final visual judgement.

## Current State

- Active runtime: TypeScript, Vite, Three.js, WebGLRenderer by default.
- Current game slice: Burrow Hollow to Moss Crown Shrine, with walking, rolling, jumping, Breeze Float, swimming, forageables, landmarks, local save persistence, fresh-start reset, quality settings, map, handbook, pause, persistent held one-at-a-time Karu recruitment/following, and a quiet Karu join HUD beat.
- Current art direction: cozy creature-habitat route, aqua handbook UI, painterly grass/water, light anime color grading, soft character outlines, readable route clearings, sharpened tree silhouettes, far-range atmosphere, hand-painted water/shoreline treatment, and a visible 3D orbiting sun that affects scene lighting with subtle ray bands.
- Current tech cleanup state: `npm prune` has removed stale extraneous packages, Playwright/perf temp output is workspace-local under `.codex-tmp`, and the known Three vendor chunk is managed rather than reported as an active Vite warning.
- Current security tooling state: `.deepsec/` is initialized for Mossu with local-env/build/generated paths ignored. Regex scanning works; AI processing needs explicit source-export approval.
- Current parked work: Mossback Titan is preserved in unused source files but removed from active simulation, world rendering, HUD copy, model viewer, and text-state output.

## When To Update Docs

- Update [Current State](CURRENT_STATE.md) when the short present-tense project snapshot changes.
- Update [Next Passes](NEXT_PASSES.md) when priority order changes.
- Update [Game Memory](GAME_MEMORY.md) when the creative direction, current mechanics, or product priorities change.
- Update [Known Issues](KNOWN_ISSUES.md) when a caveat becomes fixed, gets worse, or gains a clear owner.
- Update [Asset Parking](ASSET_PARKING.md) when moving code/assets into or out of `unused` folders.
- Update [Perf Baseline](PERF_BASELINE.md) after replacing `output/perf-guard/baseline.json`.
- Add a fresh note at the top of `progress.md` after significant implementation or verification work.
