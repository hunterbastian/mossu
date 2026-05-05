# Mossu Next Passes

Last updated: 2026-05-05

This is the prioritized work queue. Keep items narrow enough that Mossu remains playable after every pass.

## Do First

1. **Wiki and repo-doc sync review**
   `Mossu weekly wiki sync` now runs weekly against the repo and local wiki. Still do an immediate manual sync after substantial work when current direction changes before the next Monday run.

2. **Populated handbook playtest**
   Collect several landmarks, forageables, and Karu, then inspect the field guide at laptop sizes. Tune card density, copy, and holo treatment only where the populated state feels weak.

3. **Karu route playtest**
   Play recruited Karu across slopes, water banks, shallow water, route turns, narrow clearings, and dense grass. Fix jitter, crowding, or lost followers before adding new companion systems.

4. **Real-browser art review route**
   Use `npm run art:review` for named Chrome screenshots, then manually review any questionable route spots in Chrome/Dia before doing more art polish.

## High-Value Small Passes

5. **Opening minute polish**
   Tighten the first 10 seconds: title transition, nest exit, first camera composition, first Karu read, and first route prompt.

6. **Shrine arrival reward**
   Make Moss Crown arrival feel more complete with a small visual/audio/state beat, without turning progression into a checklist.

7. **Karu profile celebration**
   Build on the join beat with a persistent profile/card moment so recruited Karu feel visible after the prompt fades.

8. **Route memory moments**
   Add tiny environmental or UI feedback after key discoveries so route stamps feel more rewarding.

9. **Water bank QA pass**
   Walk real bank entries at Silver Bend, opening pools, highland creek, and shrine approach. Verify visible water, swimmable depth, shoreline milk, and exit readability agree.

10. **HUD quieting pass**
    Reduce UI glow/opacity/noise in camera-critical views while keeping the aqua field-guide tone.

11. **Accessibility settings**
    Add or tune motion-intensity and stronger-contrast options if playtest shows blur, motion, or HUD contrast is uncomfortable.

12. **Debug save presets**
    Add a small QA preset menu or helper for common save states: fresh nest, recruited Karu, populated handbook, shrine complete, water/swim checks.

## Medium Art And Feel Passes

13. **Terrain and forest composition**
    Improve mountain silhouettes, rock/snow/grass transitions, route overlooks, and biome-specific forest density.

14. **Far mountain read**
    Strengthen the distant peak layer so the route feels like it climbs toward a real place.

15. **Tree silhouette polish**
    Keep trees storybook-sharp from gameplay distance; avoid broad blur or one-note green silhouettes.

16. **Grass personality follow-up**
    Tune meadow tufts, route-edge grass, reeds, and Mossu path traces only after route sightlines are stable.

17. **Camera scenic beats**
    Add restrained camera framing moments for Silver Bend and Moss Crown, building on `FollowCamera` rather than replacing it.

18. **Progression flavor**
    Add a few more lightweight discovery pings, forage goal feedback, and Karu profile details.

## Tech And Release Hygiene

19. **DeepSec follow-up**
    Review the regex candidates locally; run the AI `process` phase only after explicit approval for source export. Track any real findings in `docs/KNOWN_ISSUES.md`.

20. **Performance baseline refresh**
    Refresh `npm run perf:guard:baseline` before a visual-density pass and compare after with a candidate run.

## Rule Of Thumb

Prefer one focused pass plus verification over a broad rewrite. If a pass touches rendering, movement, water, or terrain contracts, update docs and run the heavier browser checks.
