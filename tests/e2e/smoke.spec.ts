import { expect, test } from "@playwright/test";

test.describe("Mossu smoke", () => {
  test("loads game shell and reaches interactive canvas", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.locator("#app")).toBeVisible();
    // Main WebGL canvas is the only <canvas> direct child of #app; HUD nests CharacterPreview.
    await expect(page.locator("#app > canvas")).toBeVisible({ timeout: 60_000 });

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

    const fatal = errors.filter(
      (line) =>
        !line.includes("AudioContext") &&
        !line.includes("Autoplay") &&
        !line.includes("play()"),
    );
    expect(fatal, `unexpected console errors: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("model viewer route loads", async ({ page }) => {
    await page.goto("/?modelViewer=1", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("canvas.model-viewer__canvas")).toBeVisible({ timeout: 60_000 });
  });
});
