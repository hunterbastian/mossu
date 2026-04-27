import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const defaultFixturePath = path.join(root, "scripts", "perf", "mossu-route-save.json");
const defaultOutputPath = path.join(root, "output", "perf-guard", "latest.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function parseArgs(argv) {
  const args = {
    fixture: process.env.PERF_GUARD_FIXTURE ?? defaultFixturePath,
    output: process.env.PERF_GUARD_OUTPUT ?? defaultOutputPath,
    baseline: process.env.PERF_GUARD_BASELINE ?? "",
    headed: process.env.PERF_GUARD_HEADLESS === "0",
    browserChannel: process.env.PERF_GUARD_BROWSER ?? "",
    softwareGl: process.env.PERF_GUARD_SOFTWARE_GL === "1",
    minAverageFps: undefined,
    maxP95FrameMs: undefined,
  };

  for (const arg of argv) {
    if (arg === "--headed") {
      args.headed = true;
    } else if (arg.startsWith("--fixture=")) {
      args.fixture = path.resolve(arg.slice("--fixture=".length));
    } else if (arg.startsWith("--output=")) {
      args.output = path.resolve(arg.slice("--output=".length));
    } else if (arg.startsWith("--baseline=")) {
      args.baseline = path.resolve(arg.slice("--baseline=".length));
    } else if (arg.startsWith("--browser=")) {
      args.browserChannel = arg.slice("--browser=".length);
    } else if (arg === "--software-gl") {
      args.softwareGl = true;
    } else if (arg.startsWith("--min-average-fps=")) {
      args.minAverageFps = Number(arg.slice("--min-average-fps=".length));
    } else if (arg.startsWith("--max-p95-frame-ms=")) {
      args.maxP95FrameMs = Number(arg.slice("--max-p95-frame-ms=".length));
    }
  }

  return args;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function withTimeout(label, ms, task) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function createStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const filePath = path.resolve(distRoot, `.${requested}`);
      if (!filePath.startsWith(distRoot)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Could not start perf guard static server.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function readGameState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}"));
}

async function pressKeys(page, keys) {
  for (const key of keys) {
    await page.keyboard.down(key);
  }
}

async function releaseKeys(page, keys) {
  for (const key of [...keys].reverse()) {
    await page.keyboard.up(key);
  }
}

async function runMeasuredSegment(page, segment) {
  const durationMs = segment.durationMs ?? 1000;
  const frameCount = Math.max(1, Math.round(durationMs / (1000 / 60)));
  return page.evaluate((count) => {
    const frames = [];
    for (let frame = 0; frame < count; frame += 1) {
      const start = performance.now();
      window.advanceTime?.(1000 / 60);
      frames.push(performance.now() - start);
    }
    return frames;
  }, frameCount);
}

function summarizeFrames(frames) {
  const trimmed = frames.filter((frameMs) => Number.isFinite(frameMs) && frameMs > 0).slice(3);
  const averageFrameMs = mean(trimmed);
  const p95FrameMs = percentile(trimmed, 95);
  const p99FrameMs = percentile(trimmed, 99);
  return {
    samples: trimmed.length,
    averageFrameMs: round(averageFrameMs),
    averageFps: round(1000 / Math.max(0.1, averageFrameMs), 1),
    p95FrameMs: round(p95FrameMs),
    p99FrameMs: round(p99FrameMs),
    p05Fps: round(1000 / Math.max(0.1, p95FrameMs), 1),
  };
}

function findFailures({ fixture, args, initialState, finalState, frameSummary, consoleErrors }) {
  const guardrails = fixture.guardrails ?? {};
  const minAverageFps = args.minAverageFps ?? guardrails.minAverageFps;
  const maxP95FrameMs = args.maxP95FrameMs ?? guardrails.maxP95FrameMs;
  const failures = [];

  if (consoleErrors.length > 0) {
    failures.push(`console errors: ${consoleErrors.join(" | ")}`);
  }
  if (Number.isFinite(minAverageFps) && frameSummary.averageFps < minAverageFps) {
    failures.push(`average FPS ${frameSummary.averageFps} < ${minAverageFps}`);
  }
  if (Number.isFinite(maxP95FrameMs) && frameSummary.p95FrameMs > maxP95FrameMs) {
    failures.push(`p95 frame ${frameSummary.p95FrameMs}ms > ${maxP95FrameMs}ms`);
  }
  if (Number.isFinite(guardrails.minFrameSamples) && frameSummary.samples < guardrails.minFrameSamples) {
    failures.push(`frame samples ${frameSummary.samples} < ${guardrails.minFrameSamples}`);
  }
  if (finalState.titleScreenOpen || finalState.openingSequence?.active || finalState.pauseMenuOpen) {
    failures.push("gameplay did not stay in active play mode");
  }
  if (finalState.player?.fallingToVoid) {
    failures.push("player entered void fall during perf route");
  }
  if (Number.isFinite(guardrails.minForwardProgress)) {
    const progress = (finalState.player?.z ?? 0) - (initialState.player?.z ?? 0);
    if (progress < guardrails.minForwardProgress) {
      failures.push(`forward progress ${round(progress, 1)} < ${guardrails.minForwardProgress}`);
    }
  }
  if (Number.isFinite(guardrails.maxAbsX) && Math.abs(finalState.player?.x ?? 0) > guardrails.maxAbsX) {
    failures.push(`player x drift ${round(finalState.player?.x ?? 0, 1)} exceeded ${guardrails.maxAbsX}`);
  }

  return failures;
}

function compareBaseline(current, baseline) {
  if (!baseline?.frameSummary) {
    return null;
  }
  return {
    averageFpsDelta: round(current.frameSummary.averageFps - baseline.frameSummary.averageFps, 1),
    p95FrameMsDelta: round(current.frameSummary.p95FrameMs - baseline.frameSummary.p95FrameMs, 2),
    rendererCallsDelta:
      (current.finalState.performance?.renderer?.calls ?? 0) -
      (baseline.finalState?.performance?.renderer?.calls ?? 0),
    trianglesDelta:
      (current.finalState.performance?.renderer?.triangles ?? 0) -
      (baseline.finalState?.performance?.renderer?.triangles ?? 0),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = await loadJson(args.fixture);
  const server = await createStaticServer();
  const consoleErrors = [];
  let browser;

  try {
    console.log(`perf:guard fixture ${fixture.name}`);
    console.log("perf:guard starting static server");
    const browserArgs = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"];
    if (args.softwareGl) {
      browserArgs.push("--use-gl=angle", "--use-angle=swiftshader");
    }
    browser = await chromium.launch({
      headless: !args.headed,
      channel: args.browserChannel || undefined,
      args: browserArgs,
    });
    console.log(`perf:guard browser launched (${args.headed ? "headed" : "headless"})`);
    const page = await browser.newPage({
      viewport: fixture.viewport ?? { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }
      const text = message.text();
      if (text.includes("AudioContext") || text.includes("Autoplay") || text.includes("play()")) {
        return;
      }
      consoleErrors.push(text);
      console.error(`browser console error: ${text}`);
    });
    page.on("pageerror", (error) => {
      const text = error instanceof Error ? error.stack ?? error.message : String(error);
      consoleErrors.push(text);
      console.error(`browser page error: ${text}`);
    });

    const routeUrl = buildUrl(server.url, fixture.urlParams);
    console.log(`perf:guard opening ${routeUrl}`);
    await withTimeout(
      "page load",
      70_000,
      page.goto(routeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      }),
    );
    console.log("perf:guard waiting for Mossu runtime");
    await withTimeout(
      "Mossu runtime",
      70_000,
      page.waitForFunction(() => typeof window.render_game_to_text === "function", undefined, { timeout: 60_000 }),
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    console.log("perf:guard applying saved route state");
    await page.evaluate((save) => {
      window.mossuDebug?.completeOpeningSequence?.();
      window.mossuDebug?.applySaveState?.(save);
    }, fixture.save);
    await page.waitForTimeout(250);

    const initialState = await readGameState(page);
    const frames = [];

    for (const segment of fixture.segments ?? []) {
      const keys = segment.keys ?? [];
      console.log(`perf:guard segment: ${segment.label ?? "unnamed"} (${segment.durationMs ?? 1000}ms)`);
      await pressKeys(page, keys);
      frames.push(...(await withTimeout(
        `segment ${segment.label ?? "unnamed"}`,
        Math.max(60_000, (segment.durationMs ?? 1000) * 10),
        runMeasuredSegment(page, segment),
      )));
      await releaseKeys(page, keys);
      frames.push(...(await runMeasuredSegment(page, { durationMs: 1000 / 60 })));
    }

    await page.waitForTimeout(100);
    const finalState = await readGameState(page);
    const frameSummary = summarizeFrames(frames);
    const result = {
      fixture: {
        name: fixture.name,
        path: path.relative(root, args.fixture),
      },
      timestamp: new Date().toISOString(),
      headed: args.headed,
      frameSummary,
      initialState,
      finalState,
      consoleErrors,
    };
    result.failures = findFailures({ fixture, args, initialState, finalState, frameSummary, consoleErrors });

    if (args.baseline) {
      try {
        const baseline = await loadJson(args.baseline);
        result.baseline = {
          path: path.relative(root, args.baseline),
          comparison: compareBaseline(result, baseline),
        };
      } catch (error) {
        result.baseline = {
          path: path.relative(root, args.baseline),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    await mkdir(path.dirname(args.output), { recursive: true });
    await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`);

    const perf = finalState.performance ?? {};
    console.log(`perf:guard ${fixture.name}`);
    console.log(
      `frames avg ${frameSummary.averageFrameMs}ms (${frameSummary.averageFps} fps), p95 ${frameSummary.p95FrameMs}ms, p99 ${frameSummary.p99FrameMs}ms, samples ${frameSummary.samples}`,
    );
    console.log(
      `renderer calls ${perf.renderer?.calls ?? "?"}, tris ${perf.renderer?.triangles ?? "?"}, pixelRatio ${perf.pixelRatio ?? "?"}, bloom ${perf.bloomEnabled ? "on" : "off"}`,
    );
    if (result.baseline?.comparison) {
      console.log(
        `baseline delta fps ${result.baseline.comparison.averageFpsDelta}, p95 ${result.baseline.comparison.p95FrameMsDelta}ms, calls ${result.baseline.comparison.rendererCallsDelta}, tris ${result.baseline.comparison.trianglesDelta}`,
      );
    }
    console.log(`wrote ${path.relative(root, args.output)}`);

    if (result.failures.length > 0) {
      console.error(`perf:guard failed: ${result.failures.join("; ")}`);
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
