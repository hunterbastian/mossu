# Mossu Next Passes

Last updated: 2026-05-13

This is the prioritized work queue. Keep items narrow enough that Mossu remains playable after every pass.

## Do First

1. **Manual Karu route spot-check**
   `npm run karu:route` now guards recruited-Karu drift across the route. Still do one real desktop-browser walk after companion-feel changes to judge cute motion, crowding, and narrow-turn readability.

2. **Art-review artifact refresh**
   The reference-aerial pass has green lint/QA/diff-check, a no-UI installed-Chrome aerial capture, and installed-Chrome route perf at `140.3fps` average / `9.6ms` p95 with `12/12` checkpoints. The maintained headed `npm run art:review` still times out at runtime readiness and leaves `output/art-review-route/summary.json` incomplete, so `npm run art:compare` remains red until route artifacts are refreshed. Fix the art-review readiness/cache path before treating route captures as current.

3. **Concept-art island spot-check**
   The island is now closer to the floating-island concept in Chrome: stronger central mountain/cascade, sharper needle peaks, more asymmetric front rim, wider front hero falls, smoother underside taper, clearer ocean/air gap, visible ocean-contact surf foam, a cleaner south/front meadow plateau with a visible walking loop, and the no-UI reference capture in `output/reference-aerial-pass/reference-aerial-no-ui.png`. Next work here should be a real-browser beauty spot-check and only small targeted refinements to path readability, cliff-wall material shape, and surf foam placement, not more global shell micro-meshes, route sampler changes, swim-contract changes, or movement/camera tuning.

4. **Water bank feel follow-up**
   The close-up QA pass now has installed-Chrome evidence in `output/water-bank-closeup-pass/` plus a `?qaDebug=1` water probe for depth, bank mask, swim/wade state, rendered surface Y, gameplay water Y, and current profile. The water stack is also split into focused modules, so future feel work should touch the narrow owner first: profiles for art tuning, ripples for actor response, bodies for river/lake placement, factory/geometry for shader or mesh changes. Avoid changing swim thresholds unless the probe shows a real gameplay/render mismatch.

5. **Open-ocean motion spot-check**
   The far ocean is now aiming for a brighter Sea-of-Thieves-like tropical read with broad rolling Gerstner swells, crest/trough contrast, slope-aware glints, and long foam tears. Check `?islandViewer=1&referenceAerial=1&e2e=1` plus high-route gameplay views in a real desktop browser to confirm the ocean reads alive without stealing attention from the floating-island silhouette.

6. **Ghibli shader beauty spot-check**
   The broad shader pass is now automated-guard clean, including Fir Gate and Whisper Pass nonblank recovery. Do one real desktop-browser route walk focused on close foreground pines, Silver Bend water color, and Skyward Ledge haze before adding more post effects; tune tiny material/color values only where the scene feels too dark, too yellow, or too glossy.

7. **Opening cinematic capture trim**
   The desktop Chrome title-to-gameplay watch pass is done. Revisit only after a share clip or manual playtest shows a specific issue with first-frame occlusion, timing, or the opening Karu prompt.

8. **Fir Gate composition spot-check**
   The automated Fir Gate art-review frame now uses a cleaner route-entry angle and passes artifact validation. Still do a manual desktop-browser beauty pass there before treating the full art-review set as presentation-grade.

9. **Wiki and repo-doc sync review**
   `Mossu weekly wiki sync` now runs weekly against the repo and local wiki. Still do an immediate manual sync after substantial work when current direction changes before the next Monday run.

## High-Value Small Passes

10. **Populated handbook follow-up**
   The laptop-density pass is complete for the `handbook-populated` debug preset. Revisit only after manual playtesting shows a specific copy, scrolling, or mobile issue.

11. **Shrine arrival reward**
   Make Moss Crown arrival feel more complete with a small visual/audio/state beat, without turning progression into a checklist.

12. **Karu personality follow-up**
   The profile/card celebration is in place. Only deepen it after playtesting, with small mood-specific details or idle reactions rather than a larger companion-management system.

13. **Route memory moments**
   Add tiny environmental or UI feedback after key discoveries so route stamps feel more rewarding.

14. **Art-review screenshot triage**
   After bigger art changes, run `npm run art:review` and `npm run art:compare`, then tune only route frames that still look hazy, cluttered, or hard to read.

15. **Desktop HUD manual pass**
    The Aero hierarchy is tighter now. Do one desktop route walk and only quiet glow/opacity/noise where the centered objective/status strip competes with route reads.

16. **Accessibility settings**
    Add or tune motion-intensity and stronger-contrast options if playtest shows blur, motion, or HUD contrast is uncomfortable.

17. **Debug preset UX polish**
    The `window.mossuDebug` save preset helper exists. Add a visible QA-only preset picker only if repeated playtesting shows console calls are too slow.

## Medium Art And Feel Passes

18. **Terrain and forest composition**
    Continue improving route-overlook composition and biome-specific forest density now that terrain material colors have more separation. Avoid broad palette churn unless a specific route or atlas frame still collapses into a green/yellow wash.

19. **Route overlook read**
    Tune specific early and mid-route viewpoints where the strengthened Moss Crown/highland silhouette still feels hidden, cluttered, or too hazy after screenshot review.

20. **Tree silhouette polish**
    Keep trees storybook-sharp from gameplay distance; avoid broad blur or one-note green silhouettes.

21. **Grass personality follow-up**
    Tune meadow tufts, route-edge grass, reeds, and Mossu path traces only after route sightlines are stable.

22. **Camera scenic beats**
    Add restrained camera framing moments for Silver Bend and Moss Crown, building on `FollowCamera` rather than replacing it.

23. **Progression flavor**
    Add a few more lightweight discovery pings, forage goal feedback, and Karu profile details.

## Tech And Release Hygiene

24. **DeepSec follow-up**
    Review the regex candidates locally; run the AI `process` phase only after explicit approval for source export. Track any real findings in `docs/KNOWN_ISSUES.md`.

25. **Performance baseline refresh**
    The controller/camera perf triage cleared the Burrow/Amber/Skyward budget miss without dulling the feel pass: current `npm run perf:guard` passes the full headed route at `149.8fps` average / `9.9ms` p95. Before the next visual-density pass, refresh `npm run perf:guard:baseline` and compare with a candidate run.

26. **Large-module refactor series**
    First checkpoints split `worldTypes.ts`, `worldContent.ts`, and `progressionObjectives.ts` out of the simulation contract, then split water-surface geometry, atlas ocean helpers, and floating-island underside geometry out of the large render modules while preserving public exports. Continue as narrow slices: `terrainDecorations.ts` forest/threshold/route accents, `HudShell.ts` field-guide/map/status sections, `WorldRenderer.ts` startup/layer orchestration, remaining `waterSystem.ts` shader/control helpers, and `ambientBlobs.ts` Karu rig/behavior separation.

## Rule Of Thumb

Prefer one focused pass plus verification over a broad rewrite. If a pass touches rendering, movement, water, or terrain contracts, update docs and run the heavier browser checks.
