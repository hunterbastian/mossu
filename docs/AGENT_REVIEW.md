# Mossu Agent Review

Last updated: 2026-05-06

This workflow turns the current Mossu verification artifacts into a local multi-agent review packet. It is Swarms-ready, but Swarms stays outside the browser game: do not add Swarms packages, API calls, or runtime agent orchestration to Mossu's shipped code.

## Run It

```bash
npm run agent:review
```

The command reads the latest local artifacts when they exist:

- `output/art-review-route/summary.json`
- `output/perf-guard/latest.json`
- `output/karu-route-probe/summary.json`
- repo docs such as `docs/CURRENT_STATE.md`, `docs/NEXT_PASSES.md`, `docs/GAME_MEMORY.md`, `docs/KNOWN_ISSUES.md`, and `progress.md`
- local wiki probes under `/Users/hunterbastian/wiki`

It writes:

- `output/agent-review/review.md` - human-readable local synthesis
- `output/agent-review/context.json` - normalized artifact/doc context
- `output/agent-review/swarms-prompt-pack.json` - prompts for a Swarms-style runner

Run the underlying capture commands first when current evidence matters:

```bash
npm run art:review
npm run perf:guard
npm run karu:route
npm run agent:review
```

## Five Lanes

1. **Art Review Council** - judges route screenshot composition, readability, reference fit, creature visibility, and UI clutter.
2. **Performance Triage Team** - reads perf guard data and separates route failures, frame-time risk, shader/postprocess risk, and safe optimization targets.
3. **Karu Companion Polish Review** - reads the Karu route probe for follower distance, crowding, water-bank behavior, and companion motion polish.
4. **Docs And Wiki Sync Assistant** - compares repo docs and local wiki probes for source-of-truth drift.
5. **Next-Pass Planner** - synthesizes the other lanes into one recommended narrow Mossu pass with likely files and verification.

## How To Use With Swarms

Feed `output/agent-review/swarms-prompt-pack.json` into Swarms or another local multi-agent runner. Run the first four reviewer prompts concurrently, then pass their outputs to the next-pass planner. Keep the result as a review report or planning artifact; do not let outside agents mutate source files directly unless a human explicitly approves a concrete implementation scope.

The packet is intentionally deterministic and dependency-free so it can also be useful without Swarms. If artifacts are missing, the local report will say which capture command should run before trusting that review lane.
