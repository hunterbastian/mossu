# Dev scaffolding

## Bootstrap

1. `main.ts` loads `#app`, then either **`GameApp`** (default) or **`ModelViewerApp`** (`?modelViewer=1`).
2. `runtimeBridge.ts` wires automation hooks only when the URL includes a test/debug/perf param, then calls **`start()`**.
3. When attached, **`__MOSSU_E2E__.ready`** becomes `true` on the **next `requestAnimationFrame`** so automation runs after one frame boundary (avoids probing before the loop exists).

## Automation & E2E

| Mechanism                  | Purpose                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`?e2e=1`**               | `GameApp.renderGameToText()` returns a **minimal JSON** snapshot (no perf block, no full character screen). Use in Playwright / perf scripts to avoid long sync work on the main thread. |
| **Automation bridge**      | `advanceTime`, `render_game_to_text`, and `__MOSSU_E2E__` attach only for `?e2e`, `?qaDebug`, `?perfDebug`, `?perfHud`, `?visualProbe`, or `?deterministicPerf`.                         |
| **`window.__MOSSU_E2E__`** | `{ version: 1, ready, mode }` — wait for `ready` before driving `advanceTime` or snapshot.                                                                                               |
| **`window.mossuDebug`**    | Only with **`?qaDebug`** — teleport, opening skip, route jumps, save payloads, and named save presets (see `runtimeBridge.ts` and `debugSavePresets.ts`).                                |
| **`npm run art:review`**   | Uses `?e2e=1&qaDebug=1&visualProbe=1` so headed route screenshots avoid the full debug snapshot path while still rendering deterministic frames.                                         |
| **`npm run art:compare`**  | Validates the latest route screenshots/JSON summary and can compare state against a saved art-review baseline.                                                                           |

## Commands

- **`npm run qa`** — contract tests + production build (CI bar).
- **`npm run test:e2e`** — full Playwright suite (starts `vite preview` on **4173** unless `reuseExistingServer` matches).
- **`npm run test:e2e:smoke`** — smoke tests only.
- **`npm run art:compare`** — route artifact/state sanity check after `npm run art:review`.

Headless runs should use **`/?e2e=1`** for the main game smoke. Manual real-browser QA that needs debug globals should include **`?qaDebug=1`**; add **`?e2e=1`** when deterministic automation does not need the full debug snapshot.
