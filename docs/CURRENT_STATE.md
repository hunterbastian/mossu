# Mossu Current State

Last updated: 2026-05-13

This is the short current-state brief for future agents. Use it before opening the longer chronological `progress.md` log.

## Product Shape

Mossu is a cozy third-person exploration game prototype built with TypeScript, Vite, and Three.js. The playable slice runs from Burrow Hollow to Moss Crown Shrine and is focused on one polished route, not a broad unfinished open world.

The game currently supports walking, rolling, jumping, Breeze Float, swimming, forageable gathering, landmark cataloging, held one-at-a-time Karu recruitment/following with a cute profile-card celebration and route catch-up guard, a route map, a profile/field-guide screen, local save persistence, fresh-start reset, quality settings, and QA/debug route jumps.

The latest controller-feel pass makes ground start/stop/turn response snappier, keeps roll release momentum alive longer, lets Breeze Float catch the late upward arc sooner, smooths the shallow-water handoff, and makes the follow camera respond faster without changing core route content.

## Visual Direction

The current look is a cute painterly/anime creature-habitat route:

- first-paint loading and the main title menu now use a soft meadow-hill vista: fresh layered greens, cream/cyan sky haze, drifting cloud bands, broad warm sun glow, floating-island accents, and a quieter sprout/dew loading bar
- the runtime island structure should read as a floating landmass: the ocean plane sits visibly below the underside with a clear air gap, distance-grading from rich near blue to turquoise, pale cyan, and cream/peach horizon haze; the open sea now uses broader rolling Gerstner swells, steeper crest/trough contrast, slope-aware sun glints, and long broken white foam tears for a brighter Sea-of-Thieves-like tropical read; the island shell is an exterior cliff skin with a smooth terrain-derived underside, thin horizontal cliff strata, waterfall ledge lips, tiny perched groves near selected rim lips, under-island shoreline mist, waterfall impact haze, and falling-water ribbons instead of a closed wall or saucer under the route
- the island-scale composition now follows the overview-spec/concept-art direction: a taller 2-3 peak mountain crown/source cleft plus sharper needle peaks, stepped central cascade terraces, a bluer river falling toward the low meadow, a much larger west-side great-lake basin with rock shelves and richer hero-water treatment, a cleaner south/front meadow plateau with a visible broken walking loop, layered front terraces with cove cuts and a stronger waterfall face, coarse sheer cliff-wall slabs and ocean-contact surf foam around the floating rim, evergreen bands around the climb and cliff lips, alpine/snow caps, a less board-like base contour with stronger authored headlands/coves, warmer stratified cliff edges, and 15 edge-waterfall markers with wider front hero falls visible in `?islandViewer=1`; the latest reference-aerial pass adds a no-UI `?islandViewer=1&referenceAerial=1&e2e=1` capture preset for judging the full-island composition against the concept art
- Aero creature interface UI with cool glass chrome, crisp handheld-RPG menu states, and small organism accents
- normal desktop gameplay HUD surfaces now lean Windows 7 / Frutiger Aero: translucent aqua glass, rounded glossy edges, blue depth, gold actionable accents, bubble-like highlights, and a tighter centered status hierarchy
- mobile gameplay HUD now protects the playfield by collapsing learned controls after first movement, showing one `Now` objective chip up top, and reserving pouch/roll/stamina UI for relevant moments
- the isolated Karu/model viewer and `?islandViewer=1` atlas now share a neutral Vercel/Linear-inspired debug-tool chrome: crisp white panels, thin borders, small mono labels, restrained shadows, compact controls, and a purple active accent instead of the older Aqua glass shell
- the isolated `?islandViewer=1` atlas now provides a full-floating-island debug view with orbit controls, wider zoom-out, WASD/QE fly mode, overview/top/profile/under presets, named Terrain/Water/Forests/Meadows/Rocks/Landmarks/Lighting/Debug folders, layer toggles, route/river/edge guide lines, landmark pins, mirrored waterfall pins, shell cliffs/waterfalls/under-mist, a stylized sky dome with warm directional haze, a displaced distance-graded ocean plane with crest foam, peach/cream horizon mist, clustered hand-painted cloud banks, a wider softened ocean horizon, and angles that show the island suspended over the ocean
- the main gameplay shader stack now pushes harder toward a Ghibli/anime look: warmer cream highlights, cooler teal-green shadows, restrained poster/value bands, peach horizon haze, watercolor terrain patches, richer blue-green water, warmer Sildur-inspired bloom/glints, and pine material floors that keep close forest silhouettes readable instead of pure black
- recruited Karu now get a small companion-card celebration, stay listed in a persistent right-side gameplay Karu friends rail, and remain visible at the top of the field guide's Karu friends section
- Burrow Hollow's starter nest now reads more like a cozy Spore-like living cradle, with a rounded pod rim, moss cushions, blanket-like lining petals, warm seed glows, seed/dew details, and a clearer exit path toward the first Karu
- Karu bedding spots now have subtle creature-scale pod shelters, extra cushions, low warm glow discs, comfort seeds, and mood-colored seed glints while staying secondary to the Karu themselves
- the opening camera now uses a 4.8s aerial valley reveal with a wider FOV, earlier smooth handoff, and concise Karu-first prompt copy
- default Nordic filmic render preset with lifted ACES exposure, pearl-cool fog, restrained bloom, and slightly lower render cap
- warmer readable paths and wider clearings, now with sparse pale half-buried stepping stones and grass tufts where the route should feel walked rather than road-cut
- sharper storybook tree silhouettes
- hand-painted grass clumps, reactive grass motion, and small leaf/water glints around authored route pockets
- cooler blue-green water with profile-driven shoreline definition, stronger lake-edge foam, milkier still-pool banks, clearer shallow/mid/deep depth bands, brighter but controlled current/specular strokes, downstream current threads, lens-current ribbons, bend eddies, bank laps, traveling caustics, and Mossu/Karu wake rings that now react to actor speed, shallow-bank movement, roll state, swim/splash state, and entry/exit transitions
- terrain material color now separates grass, warm shore shelves, teal damp banks, cooler rock, bright snow, and dry lip bands more clearly so atlas and route frames do not collapse into one green/yellow wash
- soft pearl far-range fog, controlled warm sun haze, and slow broad cloud-shadow patches over the terrain
- a small world-space 3D sun that drives scene lighting and subtle sky ray bands
- a taller Moss Crown shrine/crown silhouette plus destination peak layers that read from earlier climb checkpoints

Keep the look charming and readable. Do not push blur, bloom, fog, or glow so far that route edges, Mossu, water depth, or HUD text become hard to read.

## Technical Shape

- Runtime: TypeScript + Vite + Three.js, WebGLRenderer by default.
- Gameplay truth: `src/simulation/world.ts` terrain/water samplers and movement contracts; `src/simulation/worldTypes.ts` owns shared domain types, `src/simulation/worldContent.ts` owns stable world catalog builders, and `src/simulation/progressionObjectives.ts` owns objective/progression text.
- World rendering: `src/render/world/WorldRenderer.ts` delegates authored set pieces, forageables, map markers, co-op visual helpers, water profiles, water-surface geometry, floating-island underside geometry, terrain prop primitives, and small-prop instancing to focused files under `src/render/world/`.
- UI/HUD: `src/render/app/HudShell.ts` owns HUD state and DOM node lifecycle, while `src/render/app/hudSurfaceBuilders.ts` owns reusable card/section/pause/map builders.
- CSS: `src/styles.css` imports semantic chunks under `src/styles/`; `src/styles/theme-overrides.css` now imports named late-cascade theme layers under `src/styles/theme/`.
- Water: `src/render/world/waterSystem.ts` is the public facade/coordinator; `waterBodies.ts` builds river/lake/creek groups; `waterSurfaceFactory.ts` owns the shader-backed `WaterSurface` and WebGL material factory; `waterSurfaceGeometry.ts` owns river/lake surface plus underfill mesh construction; `waterProfiles.ts` owns profile art tuning; `waterRipples.ts` owns actor ripple lifecycle; `waterWaterfalls.ts` owns decorative waterfall panels/spray; `waterTypes.ts` owns shared water controller/ripple types. Underfill must keep the same vertex wave displacement as the main water surface.
- Debug hooks: `?qaDebug=1` exposes `window.mossuDebug`, including route jumps, named save presets, and a compact water probe panel with depth, bank mask, swim/wade state, rendered surface Y, gameplay water Y, and current water profile; `?e2e=1` keeps browser tests lightweight. Normal player URLs do not expose `advanceTime`, `render_game_to_text`, or `__MOSSU_E2E__`.
- Debug atlas: `?islandViewer=1` loads a separate `IslandViewerApp` chunk for whole-island terrain planning; the atlas ocean shader/disc helpers live in `src/render/app/islandViewerOcean.ts`. Adding `?e2e=1` exposes a compact `island_viewer` text snapshot with terrain, fly-mode, max-distance, layer, hierarchy, biome-layout, and waterfall-marker counts for smoke tests. Adding `?cleanCapture=1` hides the foreground atlas cloud planes for clean terrain reference JPGs without changing normal atlas or gameplay rendering; adding `?referenceAerial=1` opens the no-UI aerial preset for full-island concept-art comparison captures.
- Feel debug: compact `render_game_to_text` now includes player planar speed, vertical speed, roll/float/grounded state, and camera planar speed so browser probes can judge moment-to-moment controller/camera behavior directly.
- Performance: `npm run perf:guard` runs the route guard with screenshots and frame metrics; the far ocean Gerstner plane keeps a bounded vertex grid for the default filmic pass, grassland ambient points animate in a GPU shader, and distant tree leaf-wind meshes are culled around the camera/player route.
- Art review: `npm run art:review` builds production, opens headed Chrome with `?qaDebug=1&visualProbe=1`, enters gameplay through debug hooks, uses the normal browser render loop for visual settling, captures named screenshots/JSON in `output/art-review-route/` through async canvas PNG retries, and records each capture method; `npm run art:compare` rejects incomplete/stale artifacts and validates PNG contrast/chroma/detail before optional baseline comparison. If headed Chrome cannot launch in a sandboxed session, `node scripts/artReviewRoute.mjs --headless --browser=chromium --deterministic-step` remains a fallback artifact path, but final art judgement still needs a real desktop browser.
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
- `docs/concept-art/` is the curated reference-art folder; current floating-island references live under `docs/concept-art/floating-island/`.
- `.deepsec/` is initialized for local scanning. The safe regex scan works; the AI `process` phase exports source to an external model backend and needs explicit user approval.
- Local `.env.local` is ignored by git and DeepSec config, but should be treated as sensitive local state.
- `CLAUDE.md` is a thin local pointer into `AGENTS.md`, `docs/CURRENT_STATE.md`, and `docs/NEXT_PASSES.md` so direct Claude Code sessions start with the same Mossu routing.
- `Mossu weekly wiki sync` is active as a local weekly automation so wiki pages can be checked against repo docs after larger passes.
- `npm run agent:review` can summarize existing route/perf/Karu/doc evidence, but fresh visual or performance calls still need the underlying capture commands first.
- The latest controller/camera feel browser probe passed all checks in `output/controller-camera-feel/browser-feel-probe.json`: walk startup reached `9.85m/s` after 8 frames, stop settled to `2.64m/s`, roll held the roll camera while active, roll-release carry stayed at `22.06m/s` after 12 frames, Breeze Float caught cleanly, and water entry switched to swim camera.
- The May 8 controller/camera perf triage found the earlier Burrow/Amber/Skyward budget miss was not a steady-state route workload regression: `npm run perf:guard` now passes the exact headed wrapper at `149.8fps` average / `9.9ms` p95 with all 12 checkpoints reached. Keep the old `pixelRatio=0.92` diagnostic only as evidence that render scale was not the right fix.
- The May 8 art-review hardening run completed the headed `npm run art:review` wrapper with 6/6 fresh route captures, all via canvas PNG capture, zero fatal browser errors, and `npm run art:compare` passing. Keep a real desktop-browser judgement for final art taste, but the prior screenshot-timeout wrapper caveat is superseded.
- The May 9 floating-island structure pass keeps gameplay terrain/contracts unchanged while restoring a clearer ocean-below read in highland/ridge/shrine route captures and the Skyward Ledge perf frame. Follow-ups added more perimeter cliff faces, ledge shelves, crease slabs, and now 15 edge waterfall ribbons around the shell, with source lips and faint lower mist so the sides read more naturally in the atlas. The full headed route guard has passed at `184.2fps` average / `6.8ms` p95 with all 12 checkpoints reached after the added cliff/waterfall meshes. If Burrow Hollow or Amber Tree still needs more sea visibility, treat that as an authored overlook/composition pass rather than lowering performance budgets or dulling controller/camera feel.
- The May 9 atlas follow-up added `?islandViewer=1` as a route-only planning tool. Browser screenshots in `output/island-viewer/overview.png` and `output/island-viewer/profile.png` verify the atlas loads, the profile preset exposes ocean below the floating shell, and the tool stays out of normal gameplay chunks. Later support passes added an under-island preset, layer toggles, 15 mirrored waterfall pins for cliff/waterfall planning, wider zoom, a Fly WASD mode, a neutral Vercel/Linear-style UI shared with the model viewer, plus a stylized sky dome, warm sun-haze wash, drifting cloud banks, and larger softened ocean plane for cleaner whole-island reference captures.
- The island overview spec pass refreshed `output/island-spec-pass/atlas-canvas-overview-final-verified.png` and keeps the shippable bar green: lint, QA, smoke, Karu route, visual e2e, perf guard, headed art review, art compare, and diff-check all pass. Treat the remaining open low meadow foreground as a deliberate composition area for future authored details, not as a contract bug.
- The May 10 terrain-detail/floating-island pass has the full rendering bar green again: lint, QA, smoke, visual e2e, Karu route, headed perf guard, headed art review, art compare, and diff-check pass. `npm run perf:guard` reports `171.5fps` average / `7ms` p95 with all `12/12` checkpoints reached after the favicon, rim-grove, stepping-stone, cloud-shadow, cliff-ledge, and stronger headland/cove changes.
- The May 10 Ghibli/anime shader pass has the route back under the rendering budget after the stronger grade initially made Fir Gate/Whisper Pass foreground pines count as near-blank pixels. The fix is a narrow dark-evergreen pine material floor plus shader/material color tuning, not a camera or route-density rollback. Current `npm run perf:guard` passes at `105.2fps` average / `10.7ms` p95 / `11.2ms` p99 with all `12/12` checkpoints reached; art review also completed `6/6` headed captures and `npm run art:compare` passed.
- The May 10 concept-art island pass strengthened the whole-island read without touching controller/camera feel: terrain carries the large mountain/front-meadow/side-shoulder changes, the shell uses warmer cliff strata and wider front falls, and the atlas blockout names the concept meadow/forest/rock masses. `npm run perf:guard` passes at `99fps` average / `14.8ms` p95 / `20.5ms` p99 with all `12/12` checkpoints reached after trimming extra shell micro-meshes; `npm run art:review` headed timed out at runtime readiness in this Codex desktop session, so the deterministic route fallback produced `6/6` captures and `npm run art:compare` passed with its real-time fallback warning.
- The May 11 concept-art reverify pass made the island closer in real Chrome: stronger central mountain/cascade, more asymmetric front rim, wider brighter hero waterfall, smoother underside taper, clearer ocean/air gap, and atlas-only terrain edge clipping for cleaner whole-island captures without adding gameplay route shader cost. Fresh references are in `output/concept-reverify/`. `npm run perf:guard` passes at `115.1fps` average / `10.5ms` p95 / `13.1ms` p99 with `12/12` checkpoints reached, and the installed-Chrome route fallback completed `6/6` art-review captures. Remaining art gap: the front meadow shelf is still broader and smoother than the concept art's layered cliff terraces and dramatic waterfall face.
- The May 11 terrain composition pass focused that remaining front/south art gap without changing movement, route definitions, save data, swim contracts, or progression. The terrain sampler now gives the front shelf stepped terrace bands, cove cuts, and a deeper hero waterfall-face cut; the shell adds stacked front cliff slabs/ledges and stronger front falls; the atlas labels the stepped front shelves and waterfall-face cut while thinning front-meadow forest density. Fresh atlas references are in `output/terrain-composition-pass/`. `npm run perf:guard` passes at `111.9fps` average / `10.6ms` p95 / `11.6ms` p99 with `12/12` checkpoints reached, installed-Chrome Karu route has no follower failures, and the installed-Chrome art-review fallback completed `6/6` captures with `npm run art:compare` passing. Package smoke/visual e2e remain blocked by the missing Playwright Chromium cache, not by this terrain pass.
- The May 12 terrain composition follow-up lightened and shortened the new front/south cliff strata after atlas profile review, keeping the terrace/waterfall structure but reducing the dark slab read. Fresh follow-up atlas references are in `output/terrain-composition-followup/`. Cheap gates, installed-Chrome art review, `npm run art:compare`, and an installed-Chrome headless perf diagnostic pass; the official headed `npm run perf:guard` is not green, with one strict-budget failure after `12/12` checkpoints and a later Amber Tree replay timeout, so headed route perf is the open verification risk before checkpointing.
- The May 12 river/lake pass makes the west lowland lake a much larger landmark with a silver-braid inlet, brighter/deeper still-water surface, and authored boulder/shore clusters. The follow-up water/material pass adds reusable water-profile knobs for shoreline definition, depth bands, current strokes, and hero specular while pushing terrain material colors farther apart around grass, shore, damp bank, rock, and snow. Fresh references are in `output/water-lake-pass/` and `output/water-material-pass/`. Lint, QA, diff-check, installed-Chrome atlas capture, and installed-Chrome headless perf pass for the latest material pass at `130.7fps` average / `11.9ms` p95 with `12/12` checkpoints; package smoke remains blocked by the missing Playwright Chromium cache before test bodies.
- The May 12 reference aerial pass adds the no-UI aerial atlas preset, stronger sheer rim wall slabs, ocean-contact surf foam, a more visible meadow walking loop, cleaner south/front plateau read, sharper mountain needle peaks, and brighter open-air sky/ocean colors. Fresh evidence is in `output/reference-aerial-pass/reference-aerial-no-ui.png` and `output/perf-guard/reference-aerial/`; lint, QA, diff-check, and installed-Chrome route perf pass at `140.3fps` average / `9.6ms` p95 with `12/12` checkpoints. Package smoke remains blocked by the missing Playwright Chromium cache, and headed art review still times out at runtime readiness, so `art:compare` is red until route artifacts are refreshed.
- The May 13 ocean/water pass keeps the scope inside existing shader paths while moving the open sea toward a brighter Sea-of-Thieves-like motion read: seven-layer Gerstner swell, crest/slope/trough shader signals, stronger breaker foam, atlas ocean displacement, and slightly livelier profile-driven close-water wakes. Fresh evidence is in `output/ocean-sea-thieves-pass/reference-aerial-sea-of-thieves.png` and `output/perf-guard/ocean-sea-thieves/`; lint, QA, build, diff-check, installed-Chrome atlas capture, and installed-Chrome route perf pass at `155.1fps` average / `8.7ms` p95 with `12/12` checkpoints. Package smoke is still blocked by the missing Playwright Chromium cache, and the approved browser install failed with `ENOSPC`.
- The May 13 terrain/island/water refactor pass split water-surface geometry, atlas ocean helpers, and floating-island underside mesh construction out of the large orchestration modules without changing route, terrain, movement, save, swim, or progression behavior. Fresh evidence is in `output/refactor-water-island/reference-aerial.png` and `output/perf-guard/refactor-water-island/`; lint, QA/build, diff-check, installed-Chrome atlas capture, and installed-Chrome route perf pass at `143.2fps` average / `8.8ms` p95 with `12/12` checkpoints. Package smoke is still blocked by the missing Playwright Chromium cache, and the approved browser install failed with `ENOSPC`.
- The May 13 water bank/probe pass adds `sampleWaterProbe()` plus a `?qaDebug=1` readout and exposes the same probe in `render_game_to_text`. Installed Chrome evidence in `output/water-bank-closeup-pass/` covers opening pools, great lake shore, Silver Bend, highland creek, and shrine approach: shallow banks report wading with `swimAllowed=false`, the highland creek reports `swimmingSurface`, and rendered/gameplay surface Y match at every sampled spot. Lint, QA/build, diff-check, and installed-Chrome route perf pass at `159.9fps` average / `8ms` p95 with `12/12` checkpoints; package smoke is still blocked before test bodies by the missing Playwright Chromium cache.
- The May 13 giant water-system refactor turns `waterSystem.ts` into an 80-line facade while preserving its public exports. River/lake/creek construction, shader-backed surface factory, geometry, profiles, ripple lifecycle, waterfall accents, and shared types now live in separate focused modules under `src/render/world/`. Local lint, type-check, contract build/run, and diff-check pass; Vite build is currently blocked by local Rollup native optional dependency state (`@rollup/rollup-darwin-arm64` code signature / `ERR_DLOPEN_FAILED`) even after npm install/rebuild.

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
