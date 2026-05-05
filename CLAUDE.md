# Mossu Claude Entry Point

Read `AGENTS.md` first. It is the source of truth for Mossu-specific agent behavior, user preferences, documentation discipline, and verification expectations.

Before making changes, read:

- `docs/CURRENT_STATE.md` for the present-tense project snapshot.
- `docs/NEXT_PASSES.md` for the current priority queue.
- `docs/GAME_MEMORY.md` for durable product and art-direction decisions.

Use `npm run qa` as the minimum shippable gate for code changes. For rendering, movement, UI, water, terrain, shader, postprocessing, camera, or interaction work, also follow the heavier browser checks described in `docs/CURRENT_STATE.md`.

For Three.js rendering work, consult the matching project skill under `.claude/skills/` before editing render, material, lighting, shader, postprocessing, texture, geometry, animation, loader, or interaction code.

Do not treat this file as a second spec. Keep detailed instructions in `AGENTS.md` and the docs above.
