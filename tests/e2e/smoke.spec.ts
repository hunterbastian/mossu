import { expect, test } from "@playwright/test";

test.describe("Mossu smoke", () => {
  test.describe.configure({ timeout: 180_000 });

  test("loads game shell and reaches interactive canvas", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // `e2e=1` makes render_game_to_text a small JSON blob so headless does not block on a huge sync snapshot.
    await page.goto("/?e2e=1", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.locator("#app")).toBeVisible();
    // Main WebGL canvas is the only <canvas> direct child of #app; HUD nests CharacterPreview.
    await expect(page.locator("#app > canvas")).toBeVisible({ timeout: 60_000 });

    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      { timeout: 120_000 },
    );

    // Title / opening: advance enough for a real frame without requiring GPU-heavy screenshots.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);

    const hasAdvance = await page.evaluate(() => typeof window.advanceTime === "function");
    expect(hasAdvance).toBeTruthy();
    await page.evaluate(() => {
      window.advanceTime?.(500);
    });

    const text = await page.evaluate(() => window.render_game_to_text?.() ?? "");
    expect(text.length).toBeGreaterThan(20);
    const parsed = JSON.parse(text) as { e2e?: boolean; mode?: string };
    expect(parsed.e2e).toBe(true);

    const fatal = errors.filter(
      (line) => !line.includes("AudioContext") && !line.includes("Autoplay") && !line.includes("play()"),
    );
    expect(fatal, `unexpected console errors: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("opens binder and map without trapping controls", async ({ page }) => {
    await page.goto("/?e2e=1&qaDebug=1", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      { timeout: 120_000 },
    );

    const readState = async () =>
      JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? "{}")) as {
        titleScreenOpen?: boolean;
        openingSequence?: { active?: boolean };
        pauseMenuOpen?: boolean;
        characterScreenOpen?: boolean;
        viewMode?: string;
      };
    const step = async (ms = 160) => {
      await page.evaluate((duration) => window.advanceTime?.(duration), ms);
    };

    await page.keyboard.press("Enter");
    await step(400);
    await page.evaluate(() => window.mossuDebug?.completeOpeningSequence?.());
    await step();

    await page.keyboard.press("Tab");
    await step();
    let state = await readState();
    expect(state.titleScreenOpen).toBe(false);
    expect(state.openingSequence?.active).toBe(false);
    expect(state.characterScreenOpen).toBe(true);
    expect(state.viewMode).toBe("third_person");

    await page.keyboard.press("KeyM");
    await step();
    state = await readState();
    expect(state.characterScreenOpen).toBe(false);
    expect(state.viewMode).toBe("map_lookdown");

    await page.keyboard.press("Escape");
    await step();
    state = await readState();
    expect(state.pauseMenuOpen).toBe(false);
    expect(state.characterScreenOpen).toBe(false);
    expect(state.viewMode).toBe("third_person");
  });

  test("reset command returns saved progress to a fresh start", async ({ page }) => {
    await page.goto("/?e2e=1&qaDebug=1", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      { timeout: 120_000 },
    );

    const readState = async () =>
      JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? "{}")) as {
        pauseMenuOpen?: boolean;
        save?: {
          catalogedLandmarkIds?: string[];
          gatheredForageableIds?: string[];
          recruitedKaruIds?: string[];
        };
        player?: { x?: number; z?: number };
      };
    const step = async (ms = 160) => {
      await page.evaluate((duration) => window.advanceTime?.(duration), ms);
    };

    await page.keyboard.press("Enter");
    await step(400);
    await page.evaluate(() => {
      window.mossuDebug?.completeOpeningSequence?.();
      window.mossuDebug?.applySaveState?.({
        player: { x: 28, z: 24, heading: 0.25 },
        save: {
          unlockedAbilities: ["breeze_float"],
          catalogedLandmarkIds: ["start-burrow", "river-bend"],
          gatheredForageableIds: ["lake-shell"],
          recruitedKaruIds: ["karu-0-0"],
        },
      });
    });
    await step();

    let state = await readState();
    expect(state.save?.gatheredForageableIds).toContain("lake-shell");
    expect(state.save?.recruitedKaruIds).toContain("karu-0-0");

    await page.keyboard.press("Escape");
    await step();
    state = await readState();
    expect(state.pauseMenuOpen).toBe(true);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-ui-command='reset-progress']").click();
    await step();

    state = await readState();
    expect(state.pauseMenuOpen).toBe(false);
    expect(state.save?.gatheredForageableIds ?? []).toEqual([]);
    expect(state.save?.recruitedKaruIds ?? []).toEqual([]);
    expect(state.save?.catalogedLandmarkIds ?? []).toContain("start-burrow");
    expect(Math.round(state.player?.x ?? 0)).toBe(-68);
    expect(Math.round(state.player?.z ?? 0)).toBe(-140);
  });

  test("debug route jumps land on named inspection spots", async ({ page }) => {
    await page.goto("/?e2e=1&qaDebug=1", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      { timeout: 120_000 },
    );

    const readState = async () =>
      JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? "{}")) as {
        save?: { catalogedLandmarkIds?: string[] };
        player?: { x?: number; z?: number; heading?: number };
        viewMode?: string;
      };
    const step = async (ms = 160) => {
      await page.evaluate((duration) => window.advanceTime?.(duration), ms);
    };
    const jumpTo = async (target: string) => {
      const jumped = await page.evaluate((id) => window.mossuDebug?.jumpTo?.(id) ?? false, target);
      expect(jumped).toBe(true);
      await step();
      return readState();
    };

    await page.keyboard.press("Enter");
    await step(400);
    await page.evaluate(() => window.mossuDebug?.completeOpeningSequence?.());
    await step();

    let state = await jumpTo("highland-basin");
    expect(state.viewMode).toBe("third_person");
    expect(Math.round(state.player?.x ?? 0)).toBe(52);
    expect(Math.round(state.player?.z ?? 0)).toBe(140);
    expect(state.save?.catalogedLandmarkIds ?? []).toContain("highland-basin");

    state = await jumpTo("ridge-saddle");
    expect(Math.round(state.player?.x ?? 0)).toBe(20);
    expect(Math.round(state.player?.z ?? 0)).toBe(198);
    expect(state.save?.catalogedLandmarkIds ?? []).toContain("ridge-saddle-landmark");

    state = await jumpTo("shrine");
    expect(Math.round(state.player?.x ?? 0)).toBe(10);
    expect(Math.round(state.player?.z ?? 0)).toBe(218);
    expect(state.save?.catalogedLandmarkIds ?? []).toContain("peak-shrine");
  });

  test("model viewer route loads", async ({ page }) => {
    await page.goto("/?modelViewer=1&e2e=1", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && window.__MOSSU_E2E__?.mode === "model_viewer",
      { timeout: 60_000 },
    );
    await expect(page.locator("canvas.model-viewer__canvas")).toBeVisible({ timeout: 60_000 });
  });
});
