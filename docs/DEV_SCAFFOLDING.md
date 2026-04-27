# Dev scaffolding

## Bootstrap

1. `main.ts` loads `#app`, then either **`GameApp`** (default) or **`ModelViewerApp`** (`?modelViewer=1`).
2. `attachRuntime` wires **`window.advanceTime`**, **`window.render_game_to_text`**, and **`window.__MOSSU_E2E__`**, then calls **`start()`**.
3. **`__MOSSU_E2E__.ready`** becomes `true` on the **next `requestAnimationFrame`** so automation runs after one frame boundary (avoids probing before the loop exists).

## Automation & E2E

| Mechanism | Purpose |
|-----------|---------|
| **`?e2e=1`** | `GameApp.renderGameToText()` returns a **minimal JSON** snapshot (no perf block, no full character screen). Use in Playwright / perf scripts to avoid long sync work on the main thread. |
| **`window.__MOSSU_E2E__`** | `{ version: 1, ready, mode }` — wait for `ready` before driving `advanceTime` or snapshot. |
| **`window.mossuDebug`** | Only with **`?qaDebug`** — teleport, opening skip, save payload (see `main.ts`). |

## Commands

- **`npm run qa`** — contract tests + production build (CI bar).
- **`npm run test:e2e`** — full Playwright suite (starts `vite preview` on **4173** unless `reuseExistingServer` matches).
- **`npm run test:e2e:smoke`** — smoke tests only.

Headless runs should use **`/?e2e=1`** for the main game smoke. Real-browser QA can omit it to exercise the full snapshot (e.g. manual `render_game_to_text()` in devtools).
