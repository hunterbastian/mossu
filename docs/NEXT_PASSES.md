# Mossu Next Passes

Last updated: 2026-05-08

This is the prioritized work queue. Keep items narrow enough that Mossu remains playable after every pass.

## Do First

1. **Manual Karu route spot-check**
   `npm run karu:route` now guards recruited-Karu drift across the route. Still do one real desktop-browser walk after companion-feel changes to judge cute motion, crowding, and narrow-turn readability.

2. **Water bank close-up QA**
   The close water shader now has stronger current threads, lens ribbons, bank laps, and traveling caustics. Walk Silver Bend, opening pools, highland creek, and shrine approach in desktop Chrome to verify the prettier motion still agrees with swim/exit readability.

3. **Opening cinematic capture trim**
   The desktop Chrome title-to-gameplay watch pass is done. Revisit only after a share clip or manual playtest shows a specific issue with first-frame occlusion, timing, or the opening Karu prompt.

4. **Fir Gate composition spot-check**
   The automated Fir Gate art-review frame is valid but still feels closer/occluder-heavy than the other route frames. Do a narrow camera/foreground-occlusion tune there before treating the art-review set as presentation-grade.

5. **Wiki and repo-doc sync review**
   `Mossu weekly wiki sync` now runs weekly against the repo and local wiki. Still do an immediate manual sync after substantial work when current direction changes before the next Monday run.

## High-Value Small Passes

6. **Populated handbook follow-up**
   The laptop-density pass is complete for the `handbook-populated` debug preset. Revisit only after manual playtesting shows a specific copy, scrolling, or mobile issue.

7. **Shrine arrival reward**
   Make Moss Crown arrival feel more complete with a small visual/audio/state beat, without turning progression into a checklist.

8. **Karu personality follow-up**
   The profile/card celebration is in place. Only deepen it after playtesting, with small mood-specific details or idle reactions rather than a larger companion-management system.

9. **Route memory moments**
   Add tiny environmental or UI feedback after key discoveries so route stamps feel more rewarding.

10. **Art-review screenshot triage**
   After bigger art changes, run `npm run art:review` and `npm run art:compare`, then tune only route frames that still look hazy, cluttered, or hard to read.

11. **Desktop HUD manual pass**
    The Aero hierarchy is tighter now. Do one desktop route walk and only quiet glow/opacity/noise where the centered objective/status strip competes with route reads.

12. **Accessibility settings**
    Add or tune motion-intensity and stronger-contrast options if playtest shows blur, motion, or HUD contrast is uncomfortable.

13. **Debug preset UX polish**
    The `window.mossuDebug` save preset helper exists. Add a visible QA-only preset picker only if repeated playtesting shows console calls are too slow.

## Medium Art And Feel Passes

14. **Terrain and forest composition**
    Continue improving rock/snow/grass transitions, route overlooks, and biome-specific forest density now that Moss Crown has a stronger destination read.

15. **Route overlook read**
    Tune specific early and mid-route viewpoints where the strengthened Moss Crown/highland silhouette still feels hidden, cluttered, or too hazy after screenshot review.

16. **Tree silhouette polish**
    Keep trees storybook-sharp from gameplay distance; avoid broad blur or one-note green silhouettes.

17. **Grass personality follow-up**
    Tune meadow tufts, route-edge grass, reeds, and Mossu path traces only after route sightlines are stable.

18. **Camera scenic beats**
    Add restrained camera framing moments for Silver Bend and Moss Crown, building on `FollowCamera` rather than replacing it.

19. **Progression flavor**
    Add a few more lightweight discovery pings, forage goal feedback, and Karu profile details.

## Tech And Release Hygiene

20. **DeepSec follow-up**
    Review the regex candidates locally; run the AI `process` phase only after explicit approval for source export. Track any real findings in `docs/KNOWN_ISSUES.md`.

21. **Performance baseline refresh**
    Refresh `npm run perf:guard:baseline` before a visual-density pass and compare after with a candidate run.

22. **Large-module follow-up**
    Continue only if it serves an active pass: `terrainDecorations.ts`, `HudShell.ts`, and `simulation/world.ts` are still large, but recent splits now define the preferred pattern. Move stable ownership slices into neighboring modules instead of rewriting behavior.

## Rule Of Thumb

Prefer one focused pass plus verification over a broad rewrite. If a pass touches rendering, movement, water, or terrain contracts, update docs and run the heavier browser checks.
