## Learned User Preferences

- When Cursor notifies that a **subagent or background task finished** and the result is already visible to the user (e.g. “Handle the above notification”), **do not** restate or summarize that output unless the user asks or **multi-task synthesis** is genuinely required.
- When a model is selectable for Mossu or other multi-step work, prefer **ChatGPT 5.5 High** (GPT-5.5 High).
- Uses **Cursor** for implementation and **OpenAI Codex** in parallel (e.g. review or second opinion).
- For transitions between world zones, prefers **wider clearings** and **longer mixed transition bands** between biomes (so changes feel like travel, not a sharp line on the heightfield); when feature priority is unclear, optimize for **visual quality** (“as long as it looks good”).
- When **background subagent** work hits **usage/API limits**, prefer **narrow parallel passes** (e.g. water-only vs. island-only) over one large combined task.

## Learned Workspace Facts

- Mossu’s repo on disk is **`/Users/hunterbastian/Desktop/mossu`** (Vite + Three.js + TypeScript); agent chats tied to other workspace roots still refer to this tree for game work.
- `npm run qa` runs contract tests and the production Vite build—use it as the bar before treating changes as shippable.
- In **`waterSystem.ts`**, the **underfill** mesh must apply the **same vertex wave displacement** as the main water surface (shared time/ripple/flow uniforms + matching `onBeforeCompile` logic); a **static Y offset** on shared geometry alone leaves **gaps** where terrain shows through the water.
- The instant title shell’s loading copy expects a **`[data-loading-status]`** node in **`index.html`**—keep it aligned with **`setLoadingStatus`** in **`main.ts`**.
- **`?qaDebug=1`** exposes **`window.mossuDebug.applySaveState`** for QA save/position replays; **`npm run perf:guard`** runs the FPS guard via **`scripts/perfGuard.mjs`**.
- Heavy **grass / tree / decor** setup in **`WorldRenderer`** can be **staged** through a **`startupContentQueue`** (per-frame and/or idle) to reduce synchronous constructor cost; keep ordering coherent with deferred world slices (e.g. clouds) so nothing double-runs.
- **`?e2e=1`** on the game URL uses a small `render_game_to_text` payload and keeps **Playwright / headless** reliable; **`window.__MOSSU_E2E__`** exposes `{ ready, mode }` after the first frame post-`start()`. Prefer `npm run test:e2e:smoke` for the browser smoke tests.
- Visual, shader, and interaction validation should be checked in a **real desktop browser**, not only headless or embedded automation.
- Focused playtesting can follow `docs/PLAYTEST_CHECKLIST.md` (e.g. a walk from Burrow to Moss Crown).
- Project-level Three.js skill files from `cloudai-x/threejs-skills` are installed under `.claude/skills/`. For Three.js rendering, lighting, materials, shaders, postprocessing, loaders, animation, geometry, textures, or interaction work, consult the matching skill before changing code. Mossu's current TypeScript setup resolves Three.js add-ons through `three/examples/jsm/...`; do not switch those imports to `three/addons/...` unless the module resolution/types are updated and `tsc --noEmit` passes.

## Waza Workflow For Mossu

- Treat **tw93/Waza** as an agent-workflow layer, not a Mossu runtime dependency. Do not add Waza packages to `package.json` unless the user explicitly asks to install or update local agent skills.
- Waza-style skills are available locally under `/Users/hunterbastian/.agents/skills/` (`think`, `design`, `check`, `hunt`, `learn`, `read`, `write`, `health`). Use the matching skill playbook when the task clearly fits.
- For new Mossu feature or architecture direction, use `think` before implementation unless the user has already given concrete approval and scope.
- For visual/UI/art-direction work, use `design` plus the relevant `.claude/skills/threejs-*` file before editing render, material, geometry, lighting, shader, postprocessing, texture, animation, or interaction code.
- For bugs, regressions, or unexpected runtime behavior, use `hunt` and confirm the root cause before patching.
- Before considering a substantial Mossu pass done, use `check`-style review discipline: inspect the diff for scope drift, verify dependencies did not change unintentionally, run `npm run qa`, and do a real-browser visual check when the change touches rendering or interaction.
