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
      (line) =>
        !line.includes("AudioContext") &&
        !line.includes("Autoplay") &&
        !line.includes("play()"),
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
