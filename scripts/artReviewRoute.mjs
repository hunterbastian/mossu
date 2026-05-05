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
  { name: "02-fir-gate", jump: "fir-gate" },
  { name: "03-highland-basin", jump: "highland-basin" },
  { name: "04-ridge-saddle", jump: "ridge-saddle" },
  { name: "05-moss-crown-shrine", jump: "shrine" },
];

function parseArgs(argv) {
  const args = {
    browser: "chrome",
    headless: false,
    outDir: "output/art-review-route",
    url: null,
    viewportWidth: 1440,
    viewportHeight: 900,
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
  await fs.mkdir(args.outDir, { recursive: true });

  const localServer = args.url ? null : await startDistServer();
  const baseUrl = args.url ?? localServer.url;
  const reviewUrl = new URL(baseUrl);
  reviewUrl.searchParams.set("qaDebug", "1");
  reviewUrl.searchParams.set("visualProbe", "1");

  const browser = await chromium.launch({
    channel: args.browser === "chrome" ? "chrome" : undefined,
    headless: args.headless,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
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

  const step = async (ms = 240, renderFrame = true) => {
    await page.evaluate(([duration, shouldRender]) => window.advanceTime?.(duration, shouldRender), [ms, renderFrame]);
  };
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? "{}"));
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
    if (settleMs > 0) {
      await step(settleMs, true);
    }
    await page.screenshot({ path: path.join(args.outDir, `${name}.png`), fullPage: true });
    const state = await readState();
    await fs.writeFile(path.join(args.outDir, `${name}.json`), JSON.stringify(state, null, 2));
    return {
      name,
      player: state.player,
      fauna: state.fauna,
      zone: state.zone,
      landmark: state.landmark,
      mode: state.mode ?? state.viewMode,
    };
  };

  try {
    await page.goto(reviewUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      undefined,
      { timeout: 120_000 },
    );

    await page.keyboard.press("Enter");
    await step(450, true);
    await page.evaluate(() => {
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

    const captures = [];
    captures.push(await capture("00-burrow-hollow"));

    await page.keyboard.down("KeyE");
    await waitForState((state) => state.fauna?.recruited > 0, "Karu recruitment");
    await page.keyboard.up("KeyE");
    captures.push(await capture("01-karu-join", 80));

    for (const stop of ROUTE_STOPS) {
      const jumped = await page.evaluate((jumpId) => window.mossuDebug?.jumpTo?.(jumpId) ?? false, stop.jump);
      if (!jumped) {
        throw new Error(`Unable to jump to ${stop.jump}`);
      }
      captures.push(await capture(stop.name));
    }

    const fatalErrors = errors.filter(
      (line) => !line.includes("AudioContext") && !line.includes("Autoplay") && !line.includes("play()"),
    );
    const summary = {
      url: reviewUrl.toString(),
      viewport: `${args.viewportWidth}x${args.viewportHeight}`,
      browser: args.browser,
      headless: args.headless,
      captures,
      fatalErrors,
    };
    await fs.writeFile(path.join(args.outDir, "summary.json"), JSON.stringify(summary, null, 2));

    if (fatalErrors.length > 0) {
      throw new Error(`Browser console errors: ${fatalErrors.join(" | ")}`);
    }
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
