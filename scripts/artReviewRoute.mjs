import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
  [".mp3", "audio/mpeg"],
]);

const ROUTE_STOPS = [
  {
    name: "02-fir-gate",
    jump: "fir-gate",
    player: { x: 24, z: 88, heading: -0.18 },
    camera: { heading: -0.18, distance: 12, focusHeight: 6, lift: 14 },
  },
  {
    name: "03-highland-basin",
    jump: "highland-basin",
    player: { x: 42, z: 134, heading: 3.14 },
    camera: { heading: 3.14, distance: 18, focusHeight: 8, lift: 20 },
  },
  {
    name: "04-ridge-saddle",
    jump: "ridge-saddle",
    player: { x: 16, z: 186, heading: 0 },
    camera: { heading: 0, distance: 18, focusHeight: 8, lift: 20 },
  },
  {
    name: "05-moss-crown-shrine",
    jump: "shrine",
    player: { x: 2, z: 214, heading: 3.14 },
    camera: { heading: 3.14, distance: 18, focusHeight: 8, lift: 20 },
  },
];
const CAPTURE_NAMES = ["00-burrow-hollow", "01-karu-join", ...ROUTE_STOPS.map((stop) => stop.name)];
const SCREENSHOT_TIMEOUT_MS = 30_000;
const CANVAS_FALLBACK_MIN_BYTES = 50_000;
const ADVANCE_TIME_TIMEOUT_MS = 12_000;
const STATE_TICK_TIMEOUT_MS = 5_000;
const RUNTIME_READY_TIMEOUT_MS = 120_000;
const NAVIGATION_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const args = {
    browser: "chrome",
    headless: false,
    outDir: "output/art-review-route",
    url: null,
    viewportWidth: 1440,
    viewportHeight: 900,
    deterministicStep: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--browser" && next) {
      args.browser = next;
      index += 1;
    } else if (arg === "--headed") {
      args.headless = false;
    } else if (arg === "--headless") {
      args.headless = true;
    } else if (arg === "--deterministic-step") {
      args.deterministicStep = true;
    } else if (arg === "--out" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--url" && next) {
      args.url = next;
      index += 1;
    } else if (arg === "--viewport" && next) {
      const [width, height] = next.split("x").map((value) => Number.parseInt(value, 10));
      if (Number.isFinite(width) && Number.isFinite(height)) {
        args.viewportWidth = width;
        args.viewportHeight = height;
      }
      index += 1;
    }
  }

  return args;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resetOutputDirectory(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const staleFiles = [
    "summary.json",
    ...CAPTURE_NAMES.flatMap((name) => [`${name}.png`, `${name}.json`]),
  ];
  await Promise.all(staleFiles.map((fileName) => fs.rm(path.join(outDir, fileName), { force: true })));
}

async function withTimeout(promise, label, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

async function startDistServer() {
  const root = path.resolve("dist");
  if (!(await pathExists(path.join(root, "index.html")))) {
    throw new Error("dist/index.html is missing. Run npm run build before art review.");
  }

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = path.normalize(path.join(root, relative));
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }

      const data = await fs.readFile(filePath);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Unable to bind art review server.");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await resetOutputDirectory(args.outDir);

  const localServer = args.url ? null : await startDistServer();
  const baseUrl = args.url ?? localServer.url;
  const reviewUrl = new URL(baseUrl);
  reviewUrl.searchParams.set("qaDebug", "1");

  const browser = await chromium.launch({
    channel: args.browser === "chrome" ? "chrome" : undefined,
    headless: args.headless,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: args.viewportWidth, height: args.viewportHeight },
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  const logStep = (message) => console.log(`[art:review] ${message}`);
  let stepMode = args.deterministicStep ? "deterministic" : "browser-render-loop";
  let deterministicStepFailure = null;
  const evaluatePage = async (label, pageFunction, arg, timeoutMs = ADVANCE_TIME_TIMEOUT_MS) =>
    withTimeout(page.evaluate(pageFunction, arg), label, timeoutMs);
  const tickState = async (ms = 160) => {
    await evaluatePage(
      `advanceTime(${ms}, false)`,
      (duration) => window.advanceTime?.(duration, false),
      ms,
      STATE_TICK_TIMEOUT_MS,
    );
  };
  const step = async (ms = 240, renderFrame = true) => {
    if (stepMode === "deterministic") {
      try {
        await evaluatePage(
          `advanceTime(${ms}, ${renderFrame})`,
          ([duration, shouldRender]) => window.advanceTime?.(duration, shouldRender),
          [ms, renderFrame],
          ADVANCE_TIME_TIMEOUT_MS,
        );
        return;
      } catch (error) {
        deterministicStepFailure = error instanceof Error ? error.message : String(error);
        stepMode = "browser-render-loop-fallback";
        console.warn(`warning: ${deterministicStepFailure}; falling back to real-time waits`);
      }
    }

    if (!renderFrame && stepMode === "deterministic") {
      await tickState(ms);
    }
    await page.waitForTimeout(Math.max(80, Math.min(ms, 1200)));
  };
  const readState = async () =>
    JSON.parse(await evaluatePage("read render_game_to_text", () => window.render_game_to_text?.() ?? "{}"));
  const saveCanvasFallback = async (filePath) => {
    const dataUrl = await evaluatePage("capture canvas fallback", () => {
      const canvas = document.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        return null;
      }
      window.advanceTime?.(1000 / 60, true);
      return canvas.toDataURL("image/png");
    });
    if (!dataUrl?.startsWith("data:image/png;base64,")) {
      throw new Error("Unable to capture canvas fallback image.");
    }
    const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
    await fs.writeFile(filePath, buffer);
    return buffer.length;
  };
  const saveScreenshot = async (name) => {
    const imagePath = path.join(args.outDir, `${name}.png`);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const bytes = await saveCanvasFallback(imagePath);
        if (bytes >= CANVAS_FALLBACK_MIN_BYTES) {
          return "canvas";
        }
        console.warn(`warning: canvas capture attempt ${attempt} for ${name} was only ${bytes} bytes`);
      } catch (error) {
        console.warn(`warning: canvas capture attempt ${attempt} failed for ${name}`);
        console.warn(error instanceof Error ? error.message : String(error));
        break;
      }
      await page.waitForTimeout(900);
    }

    let pageScreenshotError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await page.screenshot({ path: imagePath, timeout: SCREENSHOT_TIMEOUT_MS });
        return "page";
      } catch (error) {
        pageScreenshotError = error;
        console.warn(`warning: page screenshot attempt ${attempt} failed for ${name}`);
        console.warn(error instanceof Error ? error.message : String(error));
        await page.waitForTimeout(900);
      }
    }

    console.warn(`warning: page screenshot failed for ${name}; falling back to canvas capture`);
    if (pageScreenshotError) {
      console.warn(pageScreenshotError instanceof Error ? pageScreenshotError.message : String(pageScreenshotError));
    }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const bytes = await saveCanvasFallback(imagePath);
      if (bytes >= CANVAS_FALLBACK_MIN_BYTES) {
        return "canvas";
      }
      console.warn(`warning: canvas fallback attempt ${attempt} for ${name} was only ${bytes} bytes`);
      await page.waitForTimeout(900);
    }
    throw new Error(`Canvas fallback for ${name} stayed below ${CANVAS_FALLBACK_MIN_BYTES} bytes.`);
  };
  const waitForState = async (predicate, description, timeoutMs = 2400, stepMs = 80) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await step(stepMs, true);
      const state = await readState();
      if (predicate(state)) {
        return state;
      }
    }
    throw new Error(`Timed out waiting for ${description}.`);
  };
  const capture = async (name, settleMs = 600) => {
    logStep(`capture ${name}`);
    if (settleMs > 0) {
      await step(settleMs, true);
    }
    const captureMethod = await saveScreenshot(name);
    const state = await readState();
    await fs.writeFile(path.join(args.outDir, `${name}.json`), JSON.stringify(state, null, 2));
    return {
      name,
      captureMethod,
      player: state.player,
      fauna: state.fauna,
      zone: state.zone,
      landmark: state.landmark,
      mode: state.mode ?? state.viewMode,
    };
  };
  const captures = [];
  let runFailure = null;
  const currentFatalErrors = () =>
    errors.filter((line) => !line.includes("AudioContext") && !line.includes("Autoplay") && !line.includes("play()"));
  const writeSummary = async () => {
    const fatalErrors = currentFatalErrors();
    const summary = {
      url: reviewUrl.toString(),
      viewport: `${args.viewportWidth}x${args.viewportHeight}`,
      browser: args.browser,
      headless: args.headless,
      stepMode,
      deterministicStepFailure,
      completed: runFailure === null && captures.length === CAPTURE_NAMES.length && fatalErrors.length === 0,
      runFailure,
      captures,
      fatalErrors,
    };
    await fs.writeFile(path.join(args.outDir, "summary.json"), JSON.stringify(summary, null, 2));
    return summary;
  };

  try {
    logStep(`open ${reviewUrl.toString()}`);
    await page.goto(reviewUrl.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    logStep("wait for Mossu runtime");
    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      undefined,
      { timeout: RUNTIME_READY_TIMEOUT_MS },
    );

    logStep("enter gameplay through debug bridge");
    await evaluatePage("seed Burrow Hollow state", () => {
      window.mossuDebug?.completeOpeningSequence?.();
      window.mossuDebug?.applySaveState?.({
        player: { x: -88, z: -132, heading: 0.42 },
        save: {
          unlockedAbilities: [],
          catalogedLandmarkIds: ["start-burrow"],
          gatheredForageableIds: [],
          recruitedKaruIds: [],
        },
      });
    });
    await step(450, true);

    captures.push(await capture("00-burrow-hollow", 1400));

    logStep("seed Karu companion");
    await evaluatePage("seed recruited Karu", () => {
      window.mossuDebug?.applySaveState?.({
        save: {
          recruitedKaruIds: ["karu-0-0"],
        },
      });
    });
    await waitForState((state) => state.fauna?.recruited > 0, "Karu companion sync");
    captures.push(await capture("01-karu-join", 80));

    for (const stop of ROUTE_STOPS) {
      logStep(`jump ${stop.jump}`);
      const jumped = await evaluatePage(`jump ${stop.jump}`, (jumpId) => window.mossuDebug?.jumpTo?.(jumpId) ?? false, stop.jump);
      if (!jumped) {
        throw new Error(`Unable to jump to ${stop.jump}`);
      }
      if (stop.player) {
        await evaluatePage(
          `place ${stop.name}`,
          (player) => window.mossuDebug?.applySaveState?.({ player }),
          stop.player,
        );
      }
      if (stop.camera) {
        await evaluatePage(
          `frame ${stop.name}`,
          (camera) =>
            window.mossuDebug?.faceRouteHeading?.(camera.heading, {
              distance: camera.distance,
              focusHeight: camera.focusHeight,
              lift: camera.lift,
            }),
          stop.camera,
        );
      }
      captures.push(await capture(stop.name));
    }

    const summary = await writeSummary();

    if (summary.fatalErrors.length > 0) {
      throw new Error(`Browser console errors: ${summary.fatalErrors.join(" | ")}`);
    }
    logStep(`complete ${captures.length}/${CAPTURE_NAMES.length} captures`);
  } catch (error) {
    runFailure = error instanceof Error ? error.message : String(error);
    await writeSummary();
    throw error;
  } finally {
    await browser.close();
    if (localServer) {
      await new Promise((resolve) => localServer.server.close(resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
