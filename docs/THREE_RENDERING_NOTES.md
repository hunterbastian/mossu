# Three.js Rendering Notes

This note keeps the useful parts of the Three.js / TSL reference close to the Mossu repo. It is not a full copy of the docs; use it as the local decision guide before renderer, shader, material, or postprocessing work.

## Mossu Baseline

- Mossu is a Vite + TypeScript app with npm imports. Do not copy CDN script tags or import-map examples into the app.
- The current package uses `three` from `package.json`; version upgrades should be deliberate and verified with `npm run build`.
- Add-ons currently resolve through `three/examples/jsm/...`, for example postprocessing and utility modules. Do not switch to `three/addons/...` unless module resolution/types are updated and TypeScript passes.
- `src/render/app/GameApp.ts` defaults to `WebGLRenderer` for broad browser compatibility.
- WebGPU is optional and URL-driven through `?renderer=webgpu`, `?webgpu`, or `?renderer=auto`; it should keep a WebGL fallback path.
- `EffectComposer`, `RenderPass`, and `UnrealBloomPass` already support the current subtle bloom path for WebGL.

## Renderer Choice

Use `WebGLRenderer` by default when the goal is:

- Maximum browser compatibility.
- Visual polish, camera work, world layout, UI, or gameplay feel.
- Small postprocessing improvements that already work with `EffectComposer`.

Consider `WebGPURenderer` when the goal specifically needs:

- TSL / node materials.
- Compute-like effects.
- Advanced grass, water, atmosphere, or material experiments that are hard to maintain with shader string patches.
- A WebGPU-first prototype path that can still fall back safely.

## TSL Direction

TSL is most useful for future custom material work. Prefer it over expanding `onBeforeCompile` patches when a feature needs to become renderer-aware or WebGPU-friendly.

Good future candidates:

- Grass blade wind, push, tint, and distance fade.
- Water color bands, shore blending, and refraction-like surface treatment.
- Atmosphere, fog, soft glow, or stylized postprocessing.
- Shared shader functions reused across materials and post effects.

Do not migrate existing shader patches just for style. A TSL migration should solve a concrete problem: compatibility, maintainability, reuse, or a visual effect that is difficult with the current setup.

## Postprocessing

Current rule for Mossu: keep bloom cinematic but light. Heavy full-scene bloom can muddy the cozy painterly look and hurt performance.

For WebGL:

- Continue using `EffectComposer` and passes from `three/examples/jsm/postprocessing/...`.
- Keep pixel-ratio and performance behavior in mind; visual changes should be checked in a real browser with `?perfDebug=1`.

For WebGPU:

- If WebGPU postprocessing becomes a priority, revisit Three's TSL render pipeline docs instead of trying to force the existing WebGL composer path across renderers.

## Documentation Links

- Three docs markdown pattern: `https://threejs.org/docs/pages/{Name}.html.md`
- `WebGLRenderer`: `https://threejs.org/docs/pages/WebGLRenderer.html.md`
- `WebGPURenderer`: `https://threejs.org/docs/pages/WebGPURenderer.html.md`
- `TSL`: `https://threejs.org/docs/pages/TSL.html.md`
- `EffectComposer`: `https://threejs.org/docs/pages/EffectComposer.html.md`
- `UnrealBloomPass`: `https://threejs.org/docs/pages/UnrealBloomPass.html.md`
- `GLTFLoader`: `https://threejs.org/docs/pages/GLTFLoader.html.md`

## Before Changing Rendering Code

1. Check the matching `.claude/skills/` Three.js skill if the change touches renderer, lighting, materials, shaders, postprocessing, loaders, animation, geometry, textures, or interaction.
2. Check the live implementation in `src/render/app/GameApp.ts` and the relevant world module before applying generic Three.js examples.
3. Run `npm run build`.
4. For visual work, use a real browser preview; automated/headless screenshots are not enough for final visual confidence.
