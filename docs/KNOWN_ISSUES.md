# Known Issues And Watchlist

Last updated: 2026-05-01

This file tracks current caveats that are useful for future agents. These are not all release blockers.

## Active Watchlist

### WebGPU Is Diagnostic-Only

The normal runtime should use WebGLRenderer. The WebGPU request path can reach route checkpoints, but active Three `ShaderMaterial` paths are not compatible with the WebGPU node-material pipeline and log errors such as `NodeMaterial: Material "ShaderMaterial" is not compatible.`

Keep the explicit WebGL fallback behavior. Do not treat true WebGPU as shippable until the custom shader/material stack has a deliberate WebGPU-compatible pass.

### Headless WebGL Screenshots Can Be Flaky

Some Playwright/headless screenshot probes have timed out or closed during heavy WebGL startup even when smoke tests, visual canvas probes, and perf guards pass. Prefer:

- `npm run test:e2e:visual` for deterministic canvas metrics.
- `npm run perf:guard:headless` or the headed perf guard for route health.
- A real desktop browser for final art, lighting, camera, and interaction judgement.

Playwright and perf-guard temp files now default to `.codex-tmp/playwright-tmp` inside the workspace, which should reduce failures caused by system temp pressure.

### Local Preview Binding May Need Approval

In the Codex desktop sandbox, Vite preview or Playwright preview servers may hit local binding restrictions. If an otherwise important browser verification fails with `listen EPERM`, rerun with approved local-server permissions instead of rewriting the test.

## Parked By Design

The Mossback Titan is intentionally inactive. Active source and tests should not import or expose Titan state. The preserved implementation lives in:

- `src/simulation/unused/giantMossCreature.ts`
- `src/render/objects/unused/MossbackTitanAvatar.ts`

See [Asset Parking](ASSET_PARKING.md) before restoring it.

## Resolved Or Superseded Notes

- Large production chunk warning: the core Three.js vendor chunk is intentionally isolated and Vite's warning threshold now matches the current known baseline. Revisit code splitting only if load time or memory becomes user-visible.
- Extraneous local packages: `npm prune` removed the stale Next/React/Sharp-related packages from `node_modules`; `npm ls --depth=0` is clean after the focused tech-cleanup pass.
