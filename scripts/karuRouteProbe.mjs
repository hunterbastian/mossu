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

const RECRUITED_KARU_IDS = ["karu-0-0", "karu-0-1", "karu-0-2"];
const MAX_ROUTE_FOLLOW_DISTANCE = 30;

function parseArgs(argv) {
  const args = {
    browser: "chromium",
    headless: true,
    outDir: "output/karu-route-probe",
    screenshots: false,
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
    } else if (arg === "--screenshots") {
      args.screenshots = true;
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
    throw new Error("dist/index.html is missing. Run npm run build before Karu route probe.");
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
    throw new Error("Unable to bind Karu route probe server.");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

function buildSave(player) {
  return {
    player,
    save: {
      recruitedKaruIds: RECRUITED_KARU_IDS,
      catalogedLandmarkIds: ["start-burrow"],
      gatheredForageableIds: [],
      unlockedAbilities: [],
    },
  };
}

function assertFollowerHealth(name, state) {
  const fauna = state.fauna ?? {};
  const followers = fauna.followers ?? [];
  const maxDistance = fauna.maxFollowerDistance ?? Number.POSITIVE_INFINITY;
  const failures = [];

  if (fauna.recruited !== RECRUITED_KARU_IDS.length) {
    failures.push(`${name}: expected ${RECRUITED_KARU_IDS.length} recruited Karu, got ${fauna.recruited}`);
  }
  if (followers.length !== RECRUITED_KARU_IDS.length) {
    failures.push(`${name}: expected ${RECRUITED_KARU_IDS.length} follower snapshots, got ${followers.length}`);
  }
  if (maxDistance > MAX_ROUTE_FOLLOW_DISTANCE) {
    failures.push(`${name}: max follower distance ${maxDistance}m exceeds ${MAX_ROUTE_FOLLOW_DISTANCE}m`);
  }
  for (const follower of followers) {
    if (!Number.isFinite(follower.x) || !Number.isFinite(follower.y) || !Number.isFinite(follower.z)) {
      failures.push(`${name}: ${follower.id} has a non-finite position`);
    }
    if (follower.targetDistance > MAX_ROUTE_FOLLOW_DISTANCE) {
      failures.push(`${name}: ${follower.id} target distance ${follower.targetDistance}m is unstable`);
    }
  }

  return failures;
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(args.outDir, { recursive: true });

  const localServer = args.url ? null : await startDistServer();
  const baseUrl = args.url ?? localServer.url;
  const routeUrl = new URL(baseUrl);
  routeUrl.searchParams.set("e2e", "1");
  routeUrl.searchParams.set("qaDebug", "1");
  routeUrl.searchParams.set("visualProbe", "1");
  routeUrl.searchParams.set("lowQuality", "1");

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

  const step = async (ms = 160, renderFrame = true) => {
    await page.evaluate(([duration, shouldRender]) => window.advanceTime?.(duration, shouldRender), [ms, renderFrame]);
  };
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? "{}"));
  const applySave = async (payload) => {
    await page.evaluate((snapshot) => window.mossuDebug?.applySaveState?.(snapshot), payload);
    await step(900, false);
  };
  const capture = async (name) => {
    await step(160, false);
    const state = await readState();
    await fs.writeFile(path.join(args.outDir, `${name}.json`), JSON.stringify(state, null, 2));
    let screenshotError = null;
    if (args.screenshots) {
      try {
        await page.screenshot({ path: path.join(args.outDir, `${name}.png`), fullPage: false, timeout: 15_000 });
      } catch (error) {
        screenshotError = String(error);
      }
    }
    return {
      name,
      player: state.player,
      fauna: state.fauna,
      zone: state.zone,
      landmark: state.landmark,
      followerFailures: assertFollowerHealth(name, state),
      screenshotError,
    };
  };

  try {
    await page.goto(routeUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(
      () => window.__MOSSU_E2E__?.ready === true && typeof window.render_game_to_text === "function",
      undefined,
      { timeout: 120_000 },
    );

    await page.keyboard.press("Enter");
    await step(400, false);
    await page.evaluate(() => window.mossuDebug?.completeOpeningSequence?.());
    await applySave(buildSave({ x: -88, z: -132, heading: 0.42 }));

    const checkpoints = [];
    checkpoints.push(await capture("opening-narrow"));

    await page.keyboard.down("ArrowUp");
    await step(2400, false);
    await page.keyboard.up("ArrowUp");
    checkpoints.push(await capture("slope-bank"));

    await applySave(buildSave({ x: -23.1, z: -11.4, heading: 0.8 }));
    checkpoints.push(await capture("shallow-water-bank"));

    for (const [name, jump] of [
      ["highland-slope", "highland-basin"],
      ["ridge-narrow", "ridge-saddle"],
      ["moss-crown", "shrine"],
    ]) {
      const jumped = await page.evaluate((jumpId) => window.mossuDebug?.jumpTo?.(jumpId) ?? false, jump);
      if (!jumped) {
        throw new Error(`Unable to jump to ${jump}`);
      }
      await step(900, false);
      checkpoints.push(await capture(name));
    }

    const fatalErrors = errors.filter(
      (line) => !line.includes("AudioContext") && !line.includes("Autoplay") && !line.includes("play()"),
    );
    const followerFailures = checkpoints.flatMap((checkpoint) => checkpoint.followerFailures);
    const summary = {
      url: routeUrl.toString(),
      viewport: `${args.viewportWidth}x${args.viewportHeight}`,
      browser: args.browser,
      headless: args.headless,
      screenshots: args.screenshots,
      checkpoints,
      fatalErrors,
      followerFailures,
    };
    await fs.writeFile(path.join(args.outDir, "summary.json"), JSON.stringify(summary, null, 2));

    if (fatalErrors.length > 0) {
      throw new Error(`Browser console errors: ${fatalErrors.join(" | ")}`);
    }
    if (followerFailures.length > 0) {
      throw new Error(`Karu route probe failed: ${followerFailures.join(" | ")}`);
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
