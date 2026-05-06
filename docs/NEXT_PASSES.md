# Mossu Next Passes

Last updated: 2026-05-05

This is the prioritized work queue. Keep items narrow enough that Mossu remains playable after every pass.

## Do First

1. **Opening minute polish**
   Tighten the first 10 seconds: title transition, nest exit, first camera composition, first Karu read, and first route prompt.

2. **Manual Karu route spot-check**
   `npm run karu:route` now guards recruited-Karu drift across the route. Still do one real desktop-browser walk after companion-feel changes to judge cute motion, crowding, and narrow-turn readability.

3. **Real-browser art review follow-up**
   Use `npm run art:review` for named Chrome screenshots, run `npm run art:compare` to catch artifact/state drift, then manually review any questionable route spots in Chrome/Dia before doing more art polish.

4. **Wiki and repo-doc sync review**
   `Mossu weekly wiki sync` now runs weekly against the repo and local wiki. Still do an immediate manual sync after substantial work when current direction changes before the next Monday run.

## High-Value Small Passes

5. **Populated handbook follow-up**
   The laptop-density pass is complete for the `handbook-populated` debug preset. Revisit only after manual playtesting shows a specific copy, scrolling, or mobile issue.

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

12. **Debug preset UX polish**
    The `window.mossuDebug` save preset helper exists. Add a visible QA-only preset picker only if repeated playtesting shows console calls are too slow.

## Medium Art And Feel Passes

13. **Terrain and forest composition**
    Continue improving rock/snow/grass transitions, route overlooks, and biome-specific forest density now that Moss Crown has a stronger destination read.

14. **Route overlook read**
    Tune specific early and mid-route viewpoints where the strengthened Moss Crown/highland silhouette still feels hidden, cluttered, or too hazy after screenshot review.

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

21. **Large-module follow-up**
    Continue only if it serves an active pass: `terrainDecorations.ts`, `HudShell.ts`, and `simulation/world.ts` are still large, but recent splits now define the preferred pattern. Move stable ownership slices into neighboring modules instead of rewriting behavior.

## Rule Of Thumb

Prefer one focused pass plus verification over a broad rewrite. If a pass touches rendering, movement, water, or terrain contracts, update docs and run the heavier browser checks.
