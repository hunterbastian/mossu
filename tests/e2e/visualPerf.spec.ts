import { expect, test, type Page } from "@playwright/test";

type CanvasMetrics = {
  available: boolean;
  reason?: string;
  averageLuma?: number;
  contrast?: number;
  averageChroma?: number;
  darkRatio?: number;
  lightRatio?: number;
  nonBlankRatio?: number;
  hash?: string;
};

type FrameSummary = {
  samples: number;
  averageFrameMs: number;
  p95FrameMs: number;
};

const visualAnchors = [
  {
    label: "opening meadow",
    player: { x: -68, z: -140, heading: 0 },
    camera: { heading: 0.24, distance: 16, focusHeight: 5.6, lift: 12 },
  },
  {
    label: "silver bend river bank",
    player: { x: 34, z: 24, heading: 0.08 },
    camera: { heading: 0.18, distance: 18, focusHeight: 7.2, lift: 16 },
  },
  {
    label: "highland basin",
    player: { x: 42, z: 134, heading: 3.14 },
    camera: { heading: 3.14, distance: 19, focusHeight: 8, lift: 20 },
  },
] as const;

async function step(page: Page, ms: number) {
  await page.evaluate((duration) => window.advanceTime?.(duration), ms);
}

async function launchPlayableScene(page: Page) {
  await page.goto("/?e2e=1&qaDebug=1&lowQuality=1&visualProbe=1", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
    { timeout: 120_000 },
  );
  await page.evaluate(() => window.mossuDebug?.completeOpeningSequence?.());
  await step(page, 34);
}

async function moveToAnchor(page: Page, anchor: (typeof visualAnchors)[number]) {
  await page.evaluate((payload) => {
    window.mossuDebug?.applySaveState?.({
      player: payload.player,
      save: {
        unlockedAbilities: ["breeze_float"],
      },
    });
    window.mossuDebug?.faceRouteHeading?.(payload.camera.heading, {
      distance: payload.camera.distance,
      focusHeight: payload.camera.focusHeight,
      lift: payload.camera.lift,
    });
  }, anchor);
  await step(page, 50);
}

async function sampleMainCanvas(page: Page): Promise<CanvasMetrics> {
  return page.evaluate(() => {
    const source = document.querySelector("#app > canvas");
    if (!(source instanceof HTMLCanvasElement)) {
      return { available: false, reason: "missing-main-canvas" };
    }

    const width = 80;
    const height = 50;
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { available: false, reason: "missing-2d-context" };
    }

    ctx.drawImage(source, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let lumaSum = 0;
    let lumaSqSum = 0;
    let chromaSum = 0;
    let darkPixels = 0;
    let lightPixels = 0;
    let nonBlankPixels = 0;
    const blockLuma = new Array<number>(64).fill(0);
    const blockCounts = new Array<number>(64).fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const a = pixels[offset + 3];
        const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        lumaSum += luma;
        lumaSqSum += luma * luma;
        chromaSum += chroma;
        if (luma < 18) darkPixels += 1;
        if (luma > 236) lightPixels += 1;
        if (a > 0 && (luma > 8 || chroma > 8)) nonBlankPixels += 1;

        const bx = Math.min(7, Math.floor((x / width) * 8));
        const by = Math.min(7, Math.floor((y / height) * 8));
        const blockIndex = by * 8 + bx;
        blockLuma[blockIndex] += luma;
        blockCounts[blockIndex] += 1;
      }
    }

    const total = width * height;
    const averageLuma = lumaSum / total;
    const contrast = Math.sqrt(Math.max(0, lumaSqSum / total - averageLuma * averageLuma));
    const averageChroma = chromaSum / total;
    const blockAverages = blockLuma.map((value, index) => value / Math.max(1, blockCounts[index]));
    const blockAverage = blockAverages.reduce((sum, value) => sum + value, 0) / blockAverages.length;
    let hashBits = "";
    for (const value of blockAverages) {
      hashBits += value >= blockAverage ? "1" : "0";
    }
    let hash = "";
    for (let i = 0; i < hashBits.length; i += 4) {
      hash += Number.parseInt(hashBits.slice(i, i + 4), 2).toString(16);
    }

    return {
      available: true,
      averageLuma: Math.round(averageLuma * 10) / 10,
      contrast: Math.round(contrast * 10) / 10,
      averageChroma: Math.round(averageChroma * 10) / 10,
      darkRatio: Math.round((darkPixels / total) * 1000) / 1000,
      lightRatio: Math.round((lightPixels / total) * 1000) / 1000,
      nonBlankRatio: Math.round((nonBlankPixels / total) * 1000) / 1000,
      hash,
    };
  });
}

async function measureAdvanceTime(page: Page, durationMs: number): Promise<FrameSummary> {
  const frames = await page.evaluate((duration) => {
    const frameCount = Math.max(1, Math.round(duration / (1000 / 60)));
    const samples: number[] = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      const start = performance.now();
      window.advanceTime?.(1000 / 60);
      samples.push(performance.now() - start);
    }
    return samples;
  }, durationMs);
  const trimmed = frames
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(3)
    .sort((a, b) => a - b);
  const averageFrameMs = trimmed.reduce((sum, value) => sum + value, 0) / Math.max(1, trimmed.length);
  const p95FrameMs = trimmed[Math.min(trimmed.length - 1, Math.max(0, Math.ceil(trimmed.length * 0.95) - 1))] ?? 0;
  return {
    samples: trimmed.length,
    averageFrameMs: Math.round(averageFrameMs * 100) / 100,
    p95FrameMs: Math.round(p95FrameMs * 100) / 100,
  };
}

test.describe("Mossu visual/perf guard", () => {
  test.describe.configure({ timeout: 180_000 });

  test("fixed camera anchors stay nonblank, colorful, and inexpensive to step", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await launchPlayableScene(page);

    const hashes = new Set<string>();
    for (const anchor of visualAnchors) {
      await moveToAnchor(page, anchor);
      const metrics = await sampleMainCanvas(page);
      expect(metrics.available, `${anchor.label}: ${metrics.reason ?? "canvas unavailable"}`).toBe(true);
      expect(metrics.nonBlankRatio, `${anchor.label}: nonblank ratio`).toBeGreaterThan(0.9);
      expect(metrics.contrast, `${anchor.label}: contrast`).toBeGreaterThan(6.5);
      expect(metrics.averageChroma, `${anchor.label}: chroma`).toBeGreaterThan(5);
      expect(metrics.darkRatio, `${anchor.label}: dark pixel ratio`).toBeLessThan(0.8);
      expect(metrics.lightRatio, `${anchor.label}: light pixel ratio`).toBeLessThan(0.8);
      if (metrics.hash) {
        hashes.add(metrics.hash);
      }
    }
    expect(hashes.size, "fixed visual anchors should not all collapse to the same pixel fingerprint").toBeGreaterThan(
      1,
    );

    const frameSummary = await measureAdvanceTime(page, 360);
    expect(frameSummary.samples).toBeGreaterThanOrEqual(12);
    expect(frameSummary.averageFrameMs, "average deterministic frame cost").toBeLessThan(35);
    expect(frameSummary.p95FrameMs, "p95 deterministic frame cost").toBeLessThan(220);

    const fatal = errors.filter(
      (line) => !line.includes("AudioContext") && !line.includes("Autoplay") && !line.includes("play()"),
    );
    expect(fatal, `unexpected console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
