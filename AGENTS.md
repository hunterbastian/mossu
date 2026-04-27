## Learned User Preferences

- When Cursor notifies that a **subagent or background task finished** and the result is already visible to the user (e.g. “Handle the above notification”), **do not** restate or summarize that output unless the user asks or **multi-task synthesis** is genuinely required.
- When a model is selectable for Mossu or other multi-step work, prefer **ChatGPT 5.5 High** (GPT-5.5 High).
- Uses **Cursor** for implementation and **OpenAI Codex** in parallel (e.g. review or second opinion).
- For transitions between world zones, prefers **wider clearings** and **longer mixed transition bands** between biomes (so changes feel like travel, not a sharp line on the heightfield); when feature priority is unclear, optimize for **visual quality** (“as long as it looks good”).

## Learned Workspace Facts

- Mossu’s repo on disk is **`/Users/hunterbastian/Desktop/mossu`** (Vite + Three.js + TypeScript); agent chats tied to other workspace roots still refer to this tree for game work.
- `npm run qa` runs contract tests and the production Vite build—use it as the bar before treating changes as shippable.
- **`?e2e=1`** on the game URL uses a small `render_game_to_text` payload and keeps **Playwright / headless** reliable; **`window.__MOSSU_E2E__`** exposes `{ ready, mode }` after the first frame post-`start()`. Prefer `npm run test:e2e:smoke` for the browser smoke tests.
- Visual, shader, and interaction validation should be checked in a **real desktop browser**, not only headless or embedded automation.
- Focused playtesting can follow `docs/PLAYTEST_CHECKLIST.md` (e.g. a walk from Burrow to Moss Crown).
- Project-level Three.js skill files from `cloudai-x/threejs-skills` are installed under `.claude/skills/`. For Three.js rendering, lighting, materials, shaders, postprocessing, loaders, animation, geometry, textures, or interaction work, consult the matching skill before changing code. Mossu's current TypeScript setup resolves Three.js add-ons through `three/examples/jsm/...`; do not switch those imports to `three/addons/...` unless the module resolution/types are updated and `tsc --noEmit` passes.
