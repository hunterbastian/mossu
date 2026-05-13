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
    player: { x: 20, z: 76, heading: 0.35 },
    camera: { heading: 0.35, distance: 18, focusHeight: 6, lift: 12 },
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
const CANVAS_CAPTURE_MIN_BYTES = 50_000;
const CANVAS_CAPTURE_ATTEMPTS = 4;
const CANVAS_CAPTURE_TIMEOUT_MS = 10_000;
const CANVAS_CAPTURE_RETRY_MS = 650;
const ADVANCE_TIME_TIMEOUT_MS = 12_000;
const STATE_TICK_TIMEOUT_MS = 5_000;
const RUNTIME_READY_TIMEOUT_MS = 120_000;
const NAVIGATION_TIMEOUT_MS = 60_000;

function readOptionValue(arg, next, flag) {
  if (arg === flag) {
    return { value: next, consumedNext: true };
  }
  const equalsPrefix = `${flag}=`;
  if (arg.startsWith(equalsPrefix)) {
    return { value: arg.slice(equalsPrefix.length), consumedNext: false };
  }
  return null;
}

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

    const browser = readOptionValue(arg, next, "--browser");
    const out = readOptionValue(arg, next, "--out");
    const url = readOptionValue(arg, next, "--url");
    const viewport = readOptionValue(arg, next, "--viewport");

    if (browser?.value) {
      args.browser = browser.value;
      index += browser.consumedNext ? 1 : 0;
    } else if (arg === "--headed") {
      args.headless = false;
    } else if (arg === "--headless") {
      args.headless = true;
    } else if (arg === "--deterministic-step") {
      args.deterministicStep = true;
    } else if (out?.value) {
      args.outDir = out.value;
      index += out.consumedNext ? 1 : 0;
    } else if (url?.value) {
      args.url = url.value;
      index += url.consumedNext ? 1 : 0;
    } else if (viewport?.value) {
      const [width, height] = viewport.value.split("x").map((value) => Number.parseInt(value, 10));
      if (Number.isFinite(width) && Number.isFinite(height)) {
        args.viewportWidth = width;
        args.viewportHeight = height;
      }
      index += viewport.consumedNext ? 1 : 0;
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
  reviewUrl.searchParams.set("visualProbe", "1");

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
  const saveCanvasCapture = async (filePath) => {
    const result = await evaluatePage(
      "capture canvas blob",
      async (timeoutMs) => {
        const canvases = Array.from(document.querySelectorAll("canvas"))
          .filter((node) => node instanceof HTMLCanvasElement && node.width > 0 && node.height > 0)
          .sort((a, b) => b.width * b.height - a.width * a.height);
        const canvas = canvases[0];
        if (!canvas) {
          return { ok: false, error: "No render canvas found for art review capture." };
        }

        window.advanceTime?.(1000 / 60, true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const blobResult = await new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
          };
          const timer = setTimeout(
            () => finish({ ok: false, error: `canvas.toBlob did not finish within ${timeoutMs}ms.` }),
            timeoutMs,
          );
          try {
            canvas.toBlob(
              (blob) => finish(blob ? { ok: true, blob } : { ok: false, error: "canvas.toBlob returned null." }),
              "image/png",
            );
          } catch (error) {
            finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        });

        if (!blobResult.ok) {
          return blobResult;
        }

        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onerror = () => resolve(null);
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.readAsDataURL(blobResult.blob);
        });

        if (!dataUrl?.startsWith("data:image/png;base64,")) {
          return { ok: false, error: "Unable to encode canvas blob as PNG data URL." };
        }

        return {
          ok: true,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
        };
      },
      CANVAS_CAPTURE_TIMEOUT_MS,
      CANVAS_CAPTURE_TIMEOUT_MS + 5_000,
    );

    if (!result?.ok) {
      throw new Error(result?.error ?? "Unable to capture canvas image.");
    }

    const buffer = Buffer.from(result.dataUrl.split(",")[1], "base64");
    await fs.writeFile(filePath, buffer);
    return {
      bytes: buffer.length,
      width: result.width,
      height: result.height,
    };
  };
  const saveScreenshot = async (name) => {
    const imagePath = path.join(args.outDir, `${name}.png`);
    for (let attempt = 1; attempt <= CANVAS_CAPTURE_ATTEMPTS; attempt += 1) {
      try {
        const { bytes, width, height } = await saveCanvasCapture(imagePath);
        if (bytes >= CANVAS_CAPTURE_MIN_BYTES) {
          if (attempt > 1) {
            console.warn(`warning: canvas capture recovered for ${name} on attempt ${attempt}`);
          }
          return "canvas";
        }
        console.warn(
          `warning: canvas capture attempt ${attempt} for ${name} was only ${bytes} bytes (${width}x${height})`,
        );
      } catch (error) {
        console.warn(`warning: canvas capture attempt ${attempt} failed for ${name}`);
        console.warn(error instanceof Error ? error.message : String(error));
      }
      await page.waitForTimeout(CANVAS_CAPTURE_RETRY_MS * attempt);
    }

    throw new Error(
      `Canvas capture for ${name} did not produce a PNG above ${CANVAS_CAPTURE_MIN_BYTES} bytes after ${CANVAS_CAPTURE_ATTEMPTS} attempts.`,
    );
  };
  const waitForState = async (predicate, description, timeoutMs = 6000, stepMs = 120) => {
    const startedAt = Date.now();
    let latestState = null;
    while (Date.now() - startedAt < timeoutMs) {
      const state = await readState();
      if (predicate(state)) {
        return state;
      }
      latestState = state;
      try {
        await tickState(stepMs);
      } catch (error) {
        console.warn(`warning: state tick failed while waiting for ${description}`);
        console.warn(error instanceof Error ? error.message : String(error));
        await page.waitForTimeout(stepMs);
      }
    }
    const fauna = latestState?.fauna;
    const details =
      fauna && typeof fauna === "object"
        ? ` Latest fauna.recruited=${fauna.recruited ?? "unknown"}, followers=${fauna.followers?.length ?? "unknown"}.`
        : "";
    throw new Error(`Timed out waiting for ${description}.${details}`);
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
      () =>
        typeof window.render_game_to_text === "function" &&
        typeof window.mossuDebug?.completeOpeningSequence === "function" &&
        (window.__MOSSU_E2E__?.ready === true || document.readyState === "complete"),
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
          unlockedAbilities: [],
          catalogedLandmarkIds: ["start-burrow"],
          gatheredForageableIds: [],
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
