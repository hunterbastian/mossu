import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const defaultFixturePath = path.join(root, "scripts", "perf", "mossu-route-save.json");
const defaultOutputPath = path.join(root, "output", "perf-guard", "latest.json");
const defaultScreenshotDir = path.join(root, "output", "perf-guard", "route");
const FRAME_MS = 1000 / 60;

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
    maxAverageFpsDrop: undefined,
    maxP95FrameMsIncrease: undefined,
    maxCheckpointAverageFpsDrop: undefined,
    maxCheckpointP95FrameMsIncrease: undefined,
    urlParams: {},
    screenshotDir: process.env.PERF_GUARD_SCREENSHOT_DIR ?? defaultScreenshotDir,
    skipScreenshots: process.env.PERF_GUARD_SCREENSHOTS === "0",
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
    } else if (arg.startsWith("--max-average-fps-drop=")) {
      args.maxAverageFpsDrop = Number(arg.slice("--max-average-fps-drop=".length));
    } else if (arg.startsWith("--max-p95-frame-ms-increase=")) {
      args.maxP95FrameMsIncrease = Number(arg.slice("--max-p95-frame-ms-increase=".length));
    } else if (arg.startsWith("--max-checkpoint-average-fps-drop=")) {
      args.maxCheckpointAverageFpsDrop = Number(arg.slice("--max-checkpoint-average-fps-drop=".length));
    } else if (arg.startsWith("--max-checkpoint-p95-frame-ms-increase=")) {
      args.maxCheckpointP95FrameMsIncrease = Number(arg.slice("--max-checkpoint-p95-frame-ms-increase=".length));
    } else if (arg.startsWith("--url-param=")) {
      const pair = arg.slice("--url-param=".length);
      const splitAt = pair.indexOf("=");
      if (splitAt > 0) {
        args.urlParams[pair.slice(0, splitAt)] = pair.slice(splitAt + 1);
      }
    } else if (arg.startsWith("--screenshot-dir=")) {
      args.screenshotDir = path.resolve(arg.slice("--screenshot-dir=".length));
    } else if (arg === "--skip-screenshots") {
      args.skipScreenshots = true;
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
  if (!Number.isFinite(value)) {
    return 0;
  }
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

function routeDistance(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
}

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) {
    value -= Math.PI * 2;
  }
  while (value < -Math.PI) {
    value += Math.PI * 2;
  }
  return value;
}

function sanitizeFilePart(value) {
  return String(value ?? "checkpoint")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "checkpoint";
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function readPngChunks(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("not a PNG");
  }
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
}

function decodePng(buffer) {
  const chunks = readPngChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!ihdr) {
    throw new Error("PNG missing IHDR");
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const inflated = inflateSync(compressed);
  const pixels = Buffer.alloc(width * height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    inflated.copy(current, 0, sourceOffset, sourceOffset + stride);
    sourceOffset += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) {
        current[x] = (current[x] + left) & 255;
      } else if (filter === 2) {
        current[x] = (current[x] + up) & 255;
      } else if (filter === 3) {
        current[x] = (current[x] + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        current[x] = (current[x] + paethPredictor(left, up, upLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      pixels[dst] = current[src];
      pixels[dst + 1] = current[src + 1];
      pixels[dst + 2] = current[src + 2];
      pixels[dst + 3] = channels === 4 ? current[src + 3] : 255;
    }
    previous.set(current);
  }

  return { width, height, pixels };
}

function fingerprintPixels({ width, height, pixels }) {
  let lumaSum = 0;
  let lumaSqSum = 0;
  let chromaSum = 0;
  let darkPixels = 0;
  let lightPixels = 0;
  let saturatedPixels = 0;
  let nonBlankPixels = 0;
  const blockLuma = new Array(64).fill(0);
  const blockCounts = new Array(64).fill(0);
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 100));
  let total = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      lumaSum += luma;
      lumaSqSum += luma * luma;
      chromaSum += chroma;
      total += 1;
      if (luma < 18) {
        darkPixels += 1;
      }
      if (luma > 236) {
        lightPixels += 1;
      }
      if (chroma > 38) {
        saturatedPixels += 1;
      }
      if (a > 0 && (luma > 8 || chroma > 8)) {
        nonBlankPixels += 1;
      }
      const bx = Math.min(7, Math.floor((x / width) * 8));
      const by = Math.min(7, Math.floor((y / height) * 8));
      const blockIndex = by * 8 + bx;
      blockLuma[blockIndex] += luma;
      blockCounts[blockIndex] += 1;
    }
  }

  const averageLuma = lumaSum / Math.max(1, total);
  const contrast = Math.sqrt(Math.max(0, lumaSqSum / Math.max(1, total) - averageLuma * averageLuma));
  const averageChroma = chromaSum / Math.max(1, total);
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
    source: "screenshot",
    width,
    height,
    averageLuma: round(averageLuma, 1),
    contrast: round(contrast, 1),
    averageChroma: round(averageChroma, 1),
    darkRatio: round(darkPixels / Math.max(1, total), 3),
    lightRatio: round(lightPixels / Math.max(1, total), 3),
    saturatedRatio: round(saturatedPixels / Math.max(1, total), 3),
    nonBlankRatio: round(nonBlankPixels / Math.max(1, total), 3),
    hash,
  };
}

function collectVisualSnapshotFromPng(buffer) {
  try {
    return fingerprintPixels(decodePng(buffer));
  } catch (error) {
    return {
      available: false,
      source: "screenshot",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
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

async function runRenderSegment(page, segment) {
  const durationMs = segment.durationMs ?? 1000;
  const frameCount = Math.max(1, Math.round(durationMs / FRAME_MS));
  return page.evaluate(async ({ count, frameMs }) => {
    const frames = [];
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const start = performance.now();
      window.advanceTime?.(frameMs, true);
      frames.push(performance.now() - start);
    }
    return frames;
  }, { count: frameCount, frameMs: FRAME_MS });
}

async function runSimulationWarmup(page, segment) {
  const durationMs = segment.durationMs ?? 1000;
  const frameCount = Math.max(1, Math.round(durationMs / FRAME_MS));
  await page.evaluate(({ count, frameMs }) => {
    for (let frame = 0; frame < count; frame += 1) {
      window.advanceTime?.(frameMs, false);
    }
  }, { count: frameCount, frameMs: FRAME_MS });
}

async function collectVisualSnapshot(page) {
  return page.evaluate(() => {
    const source = document.querySelector("#app > canvas");
    if (!(source instanceof HTMLCanvasElement)) {
      return { available: false, reason: "missing-game-canvas" };
    }

    try {
      const width = 64;
      const height = 40;
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
      let saturatedPixels = 0;
      let nonBlankPixels = 0;
      const blockLuma = new Array(64).fill(0);
      const blockCounts = new Array(64).fill(0);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const a = pixels[offset + 3];
          const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          lumaSum += luma;
          lumaSqSum += luma * luma;
          chromaSum += chroma;
          if (luma < 18) {
            darkPixels += 1;
          }
          if (luma > 236) {
            lightPixels += 1;
          }
          if (chroma > 38) {
            saturatedPixels += 1;
          }
          if (a > 0 && (luma > 8 || chroma > 8)) {
            nonBlankPixels += 1;
          }
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
        width: source.width,
        height: source.height,
        averageLuma: Math.round(averageLuma * 10) / 10,
        contrast: Math.round(contrast * 10) / 10,
        averageChroma: Math.round(averageChroma * 10) / 10,
        darkRatio: Math.round((darkPixels / total) * 1000) / 1000,
        lightRatio: Math.round((lightPixels / total) * 1000) / 1000,
        saturatedRatio: Math.round((saturatedPixels / total) * 1000) / 1000,
        nonBlankRatio: Math.round((nonBlankPixels / total) * 1000) / 1000,
        hash,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });
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

function summarizeCheckpointFrames(frames) {
  const summary = summarizeFrames(frames);
  const measuredFrames = frames.filter((frameMs) => Number.isFinite(frameMs) && frameMs > 0);
  const sorted = [...measuredFrames].sort((a, b) => b - a);
  return {
    ...summary,
    measuredMs: round(frames.length * FRAME_MS, 0),
    maxFrameMs: round(sorted[0] ?? 0),
    slowFramesOver20Ms: measuredFrames.filter((frameMs) => frameMs > 20).length,
    slowFramesOver33Ms: measuredFrames.filter((frameMs) => frameMs > 33.3).length,
    topFrameMs: sorted.slice(0, 5).map((frameMs) => round(frameMs)),
  };
}

function trimReplayBurstFrames(frames) {
  return frames.slice(Math.min(9, frames.length));
}

async function captureCheckpoint(page, args, fixture, checkpoint, index, frames = []) {
  await runRenderSegment(page, { durationMs: FRAME_MS });
  let state = await readGameState(page);
  const screenshotCamera = checkpoint.screenshotCamera ?? null;
  const screenshotHeading = Number.isFinite(screenshotCamera?.heading) ? screenshotCamera.heading : checkpoint.screenshotHeading;
  if (Number.isFinite(screenshotHeading)) {
    await page.evaluate((payload) => {
      window.mossuDebug?.faceRouteHeading?.(payload.heading, payload.cameraOptions);
    }, {
      heading: screenshotHeading,
      cameraOptions: screenshotCamera
        ? {
            distance: screenshotCamera.distance,
            focusHeight: screenshotCamera.focusHeight,
            lift: screenshotCamera.lift,
          }
        : undefined,
    });
    await runRenderSegment(page, { durationMs: checkpoint.screenshotSettleMs ?? 260 });
    state = await readGameState(page);
  }
  let visual = await collectVisualSnapshot(page);
  let screenshot = null;

  if (!args.skipScreenshots) {
    await mkdir(args.screenshotDir, { recursive: true });
    const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(checkpoint.label)}.png`;
    const absolutePath = path.join(args.screenshotDir, fileName);
    try {
      const buffer = await withTimeout(
        `checkpoint screenshot ${checkpoint.label}`,
        fixture.route?.screenshotTimeoutMs ?? 15_000,
        page.screenshot({ path: absolutePath, fullPage: false }),
      );
      screenshot = {
        path: path.relative(root, absolutePath),
        bytes: buffer.length,
      };
      visual = collectVisualSnapshotFromPng(buffer);
    } catch (error) {
      screenshot = {
        path: path.relative(root, absolutePath),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    label: checkpoint.label,
    target: checkpoint.target ?? null,
    expectedLandmarkId: checkpoint.landmarkId ?? null,
    expectedLandmark: checkpoint.expectedLandmark ?? null,
    reached: checkpoint.target ? routeDistance(state.player, checkpoint.target) <= (checkpoint.arrivalRadius ?? 18) : true,
    distanceToTarget: checkpoint.target ? round(routeDistance(state.player, checkpoint.target), 1) : null,
    frameSummary: summarizeCheckpointFrames(frames),
    state,
    visual,
    screenshot,
  };
}

function chooseRouteKeys(state, target, waypoint) {
  const dx = target.x - (state.player?.x ?? 0);
  const dz = target.z - (state.player?.z ?? 0);
  const desiredHeading = Math.atan2(dx, dz);
  const currentHeading = state.player?.heading ?? desiredHeading;
  const headingError = normalizeAngle(desiredHeading - currentHeading);
  const keys = ["w"];
  const steerDeadZone = waypoint.steerDeadZone ?? 0.2;
  if (headingError > steerDeadZone) {
    keys.push("d");
  } else if (headingError < -steerDeadZone) {
    keys.push("a");
  }
  if (waypoint.roll !== false && Math.abs(headingError) < (waypoint.rollHeadingLimit ?? 0.72)) {
    keys.push("Shift");
  }
  if (waypoint.float && state.player && !state.player.grounded && !state.player.swimming) {
    keys.push("q");
  }
  return keys;
}

async function driveRouteWaypoint(page, waypoint) {
  const frames = [];
  const target = waypoint.target;
  const arrivalRadius = waypoint.arrivalRadius ?? 18;
  const burstMs = waypoint.burstMs ?? 420;
  const maxDurationMs = waypoint.maxDurationMs ?? 18_000;
  let elapsedMs = 0;
  let reached = false;
  let lastState = await readGameState(page);

  while (elapsedMs < maxDurationMs) {
    const distance = routeDistance(lastState.player, target);
    if (distance <= arrivalRadius) {
      reached = true;
      break;
    }

    if (waypoint.headingAssist !== false) {
      const desiredHeading = Math.atan2(target.x - (lastState.player?.x ?? 0), target.z - (lastState.player?.z ?? 0));
      await page.evaluate((heading) => {
        window.mossuDebug?.faceRouteHeading?.(heading);
      }, desiredHeading);
      lastState = {
        ...lastState,
        player: {
          ...lastState.player,
          heading: desiredHeading,
        },
      };
    }
    const keys = chooseRouteKeys(lastState, target, waypoint);
    await pressKeys(page, keys);
    frames.push(...(await withTimeout(
      `route burst ${waypoint.label}`,
      Math.max(20_000, burstMs * 20),
      runRenderSegment(page, { durationMs: burstMs }),
    )));
    await releaseKeys(page, keys);
    elapsedMs += burstMs;
    lastState = await readGameState(page);

    if (lastState.player?.fallingToVoid || lastState.pauseMenuOpen || lastState.titleScreenOpen) {
      break;
    }
  }

  await releaseKeys(page, ["w", "a", "d", "Shift", "q", "Space"]);
  frames.push(...(await runRenderSegment(page, { durationMs: FRAME_MS })));
  const finalState = await readGameState(page);
  return {
    reached: reached || routeDistance(finalState.player, target) <= arrivalRadius,
    frames,
    finalState,
  };
}

async function replayRouteWaypoint(page, waypoint, route) {
  const frames = [];
  const startState = await readGameState(page);
  const start = {
    x: startState.player?.x ?? waypoint.target.x,
    z: startState.player?.z ?? waypoint.target.z,
  };
  const target = waypoint.target;
  const distance = routeDistance(start, target);
  const stepDistance = waypoint.stepDistance ?? route.stepDistance ?? 7;
  const stepDurationMs = waypoint.stepDurationMs ?? route.stepDurationMs ?? 220;
  const steps = Math.max(1, Math.ceil(distance / stepDistance));
  const heading = Math.atan2(target.x - start.x, target.z - start.z);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = start.x + (target.x - start.x) * t;
    const z = start.z + (target.z - start.z) * t;
    await page.evaluate((payload) => {
      window.mossuDebug?.applySaveState?.({
        player: {
          x: payload.x,
          z: payload.z,
          heading: payload.heading,
        },
      });
    }, { x, z, heading });
    await runSimulationWarmup(page, { durationMs: waypoint.stepWarmupMs ?? route.stepWarmupMs ?? 220 });
    const measuredFrames = await withTimeout(
      `route replay ${waypoint.label}`,
      Math.max(20_000, stepDurationMs * 20),
      runRenderSegment(page, { durationMs: stepDurationMs }),
    );
    frames.push(...trimReplayBurstFrames(measuredFrames));
  }

  const settleFrames = await runRenderSegment(page, { durationMs: waypoint.settleMs ?? route.settleMs ?? 360 });
  frames.push(...trimReplayBurstFrames(settleFrames));
  const finalState = await readGameState(page);
  return {
    reached: routeDistance(finalState.player, target) <= (waypoint.arrivalRadius ?? 18),
    frames,
    finalState,
  };
}

async function runRouteWalk(page, args, fixture) {
  const route = fixture.route;
  const checkpoints = [];
  const allFrames = [];

  checkpoints.push(await captureCheckpoint(page, args, fixture, {
    label: route.startLabel ?? "Burrow Hollow start",
    target: fixture.save?.player,
    landmarkId: route.startLandmarkId,
  }, checkpoints.length));

  for (const waypoint of route.waypoints ?? []) {
    const driver = waypoint.driver ?? route.driver ?? "replay";
    console.log(`perf:guard route ${driver}: ${waypoint.label} -> (${waypoint.target.x}, ${waypoint.target.z})`);
    const segment = driver === "input"
      ? await driveRouteWaypoint(page, waypoint)
      : await replayRouteWaypoint(page, waypoint, route);
    allFrames.push(...segment.frames);
    const checkpoint = await captureCheckpoint(page, args, fixture, waypoint, checkpoints.length, segment.frames);
    checkpoints.push({
      ...checkpoint,
      reached: segment.reached && checkpoint.reached,
    });
    const lineStatus = checkpoint.reached ? "ok" : "miss";
    console.log(
      `perf:guard checkpoint ${lineStatus}: ${checkpoint.label} dist ${checkpoint.distanceToTarget} avg ${checkpoint.frameSummary.averageFps}fps p95 ${checkpoint.frameSummary.p95FrameMs}ms visual ${checkpoint.visual.available ? `${checkpoint.visual.hash} c${checkpoint.visual.contrast}` : checkpoint.visual.reason}`,
    );
  }

  return {
    frames: allFrames,
    checkpoints,
  };
}

async function runFixedSegments(page, fixture) {
  const frames = [];
  for (const segment of fixture.segments ?? []) {
    const keys = segment.keys ?? [];
    console.log(`perf:guard segment: ${segment.label ?? "unnamed"} (${segment.durationMs ?? 1000}ms)`);
    await pressKeys(page, keys);
    frames.push(...(await withTimeout(
      `segment ${segment.label ?? "unnamed"}`,
      Math.max(60_000, (segment.durationMs ?? 1000) * 10),
      runRenderSegment(page, segment),
    )));
    await releaseKeys(page, keys);
    frames.push(...(await runRenderSegment(page, { durationMs: FRAME_MS })));
  }
  return frames;
}

function getCatalogedLandmarkIds(state) {
  return Array.isArray(state.save?.catalogedLandmarkIds) ? state.save.catalogedLandmarkIds : [];
}

function findFailures({ fixture, args, initialState, finalState, frameSummary, consoleErrors, routeResult }) {
  const guardrails = fixture.guardrails ?? {};
  const minAverageFps = args.minAverageFps ?? guardrails.minAverageFps;
  const maxP95FrameMs = args.maxP95FrameMs ?? guardrails.maxP95FrameMs;
  const routeGuardrails = guardrails.route ?? {};
  const visualGuardrails = guardrails.visual ?? {};
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
  if (routeResult) {
    const missed = routeResult.checkpoints.filter((checkpoint) => !checkpoint.reached);
    if (missed.length > 0) {
      failures.push(`missed route checkpoints: ${missed.map((checkpoint) => checkpoint.label).join(", ")}`);
    }

    const cataloged = new Set(getCatalogedLandmarkIds(finalState));
    const missingLandmarks = (routeGuardrails.requiredLandmarkIds ?? []).filter((id) => !cataloged.has(id));
    if (missingLandmarks.length > 0) {
      failures.push(`missing route landmark stamps: ${missingLandmarks.join(", ")}`);
    }

    if (Number.isFinite(routeGuardrails.minCheckpointsReached)) {
      const reachedCount = routeResult.checkpoints.filter((checkpoint) => checkpoint.reached).length;
      if (reachedCount < routeGuardrails.minCheckpointsReached) {
        failures.push(`route checkpoints reached ${reachedCount} < ${routeGuardrails.minCheckpointsReached}`);
      }
    }

    for (const checkpoint of routeResult.checkpoints) {
      if (
        Number.isFinite(routeGuardrails.minCheckpointAverageFps) &&
        checkpoint.frameSummary.samples > 0 &&
        checkpoint.frameSummary.averageFps < routeGuardrails.minCheckpointAverageFps
      ) {
        failures.push(`${checkpoint.label} average FPS ${checkpoint.frameSummary.averageFps} < ${routeGuardrails.minCheckpointAverageFps}`);
      }
      if (
        Number.isFinite(routeGuardrails.maxCheckpointP95FrameMs) &&
        checkpoint.frameSummary.p95FrameMs > routeGuardrails.maxCheckpointP95FrameMs
      ) {
        failures.push(`${checkpoint.label} p95 frame ${checkpoint.frameSummary.p95FrameMs}ms > ${routeGuardrails.maxCheckpointP95FrameMs}ms`);
      }
      if (checkpoint.screenshot?.error && visualGuardrails.requireScreenshot === true) {
        failures.push(`${checkpoint.label} screenshot failed: ${checkpoint.screenshot.error}`);
      }
      if (Number.isFinite(visualGuardrails.minScreenshotBytes) && checkpoint.screenshot?.bytes < visualGuardrails.minScreenshotBytes) {
        failures.push(`${checkpoint.label} screenshot ${checkpoint.screenshot.bytes} bytes < ${visualGuardrails.minScreenshotBytes}`);
      }
      if (checkpoint.visual?.available) {
        if (Number.isFinite(visualGuardrails.minContrast) && checkpoint.visual.contrast < visualGuardrails.minContrast) {
          failures.push(`${checkpoint.label} visual contrast ${checkpoint.visual.contrast} < ${visualGuardrails.minContrast}`);
        }
        if (Number.isFinite(visualGuardrails.minAverageChroma) && checkpoint.visual.averageChroma < visualGuardrails.minAverageChroma) {
          failures.push(`${checkpoint.label} visual chroma ${checkpoint.visual.averageChroma} < ${visualGuardrails.minAverageChroma}`);
        }
        if (Number.isFinite(visualGuardrails.minNonBlankRatio) && checkpoint.visual.nonBlankRatio < visualGuardrails.minNonBlankRatio) {
          failures.push(`${checkpoint.label} nonblank pixels ${checkpoint.visual.nonBlankRatio} < ${visualGuardrails.minNonBlankRatio}`);
        }
        if (Number.isFinite(visualGuardrails.maxDarkRatio) && checkpoint.visual.darkRatio > visualGuardrails.maxDarkRatio) {
          failures.push(`${checkpoint.label} dark pixels ${checkpoint.visual.darkRatio} > ${visualGuardrails.maxDarkRatio}`);
        }
        if (Number.isFinite(visualGuardrails.maxLightRatio) && checkpoint.visual.lightRatio > visualGuardrails.maxLightRatio) {
          failures.push(`${checkpoint.label} light pixels ${checkpoint.visual.lightRatio} > ${visualGuardrails.maxLightRatio}`);
        }
      } else if (visualGuardrails.requireVisualSnapshot) {
        failures.push(`${checkpoint.label} visual snapshot unavailable: ${checkpoint.visual?.reason ?? "unknown"}`);
      }
    }
  }

  return failures;
}

function compareBaseline(current, baseline) {
  if (!baseline?.frameSummary) {
    return null;
  }
  const checkpointComparison = current.route?.checkpoints?.map((checkpoint) => {
    const baselineCheckpoint = baseline.route?.checkpoints?.find((candidate) => candidate.label === checkpoint.label);
    if (!baselineCheckpoint) {
      return {
        label: checkpoint.label,
        error: "missing baseline checkpoint",
      };
    }
    return {
      label: checkpoint.label,
      averageFps: checkpoint.frameSummary.averageFps,
      p95FrameMs: checkpoint.frameSummary.p95FrameMs,
      baselineAverageFps: baselineCheckpoint.frameSummary.averageFps,
      baselineP95FrameMs: baselineCheckpoint.frameSummary.p95FrameMs,
      averageFpsDelta: round(checkpoint.frameSummary.averageFps - baselineCheckpoint.frameSummary.averageFps, 1),
      p95FrameMsDelta: round(checkpoint.frameSummary.p95FrameMs - baselineCheckpoint.frameSummary.p95FrameMs, 2),
      visualHashChanged: checkpoint.visual?.hash && baselineCheckpoint.visual?.hash
        ? checkpoint.visual.hash !== baselineCheckpoint.visual.hash
        : null,
      contrastDelta: checkpoint.visual?.available && baselineCheckpoint.visual?.available
        ? round(checkpoint.visual.contrast - baselineCheckpoint.visual.contrast, 1)
        : null,
      averageChromaDelta: checkpoint.visual?.available && baselineCheckpoint.visual?.available
        ? round(checkpoint.visual.averageChroma - baselineCheckpoint.visual.averageChroma, 1)
        : null,
      nonBlankRatioDelta: checkpoint.visual?.available && baselineCheckpoint.visual?.available
        ? round(checkpoint.visual.nonBlankRatio - baselineCheckpoint.visual.nonBlankRatio, 3)
        : null,
      screenshotBytesDelta: Number.isFinite(checkpoint.screenshot?.bytes) && Number.isFinite(baselineCheckpoint.screenshot?.bytes)
        ? checkpoint.screenshot.bytes - baselineCheckpoint.screenshot.bytes
        : null,
    };
  });
  return {
    averageFps: current.frameSummary.averageFps,
    p95FrameMs: current.frameSummary.p95FrameMs,
    baselineAverageFps: baseline.frameSummary.averageFps,
    baselineP95FrameMs: baseline.frameSummary.p95FrameMs,
    averageFpsDelta: round(current.frameSummary.averageFps - baseline.frameSummary.averageFps, 1),
    p95FrameMsDelta: round(current.frameSummary.p95FrameMs - baseline.frameSummary.p95FrameMs, 2),
    rendererCallsDelta:
      (current.finalState.performance?.renderer?.calls ?? 0) -
      (baseline.finalState?.performance?.renderer?.calls ?? 0),
    trianglesDelta:
      (current.finalState.performance?.renderer?.triangles ?? 0) -
      (baseline.finalState?.performance?.renderer?.triangles ?? 0),
    checkpoints: checkpointComparison,
  };
}

function findBaselineFailures(comparison, guardrails, args) {
  if (!comparison) {
    return ["baseline comparison unavailable"];
  }

  const baselineGuardrails = guardrails.baseline ?? guardrails;
  const maxAverageFpsDrop = args.maxAverageFpsDrop ?? baselineGuardrails.maxAverageFpsDrop;
  const maxP95FrameMsIncrease = args.maxP95FrameMsIncrease ?? baselineGuardrails.maxP95FrameMsIncrease;
  const routeGuardrails = guardrails.route ?? {};
  const baselineRouteGuardrails = baselineGuardrails.route ?? {};
  const minAverageFps = args.minAverageFps ?? guardrails.minAverageFps;
  const maxP95FrameMs = args.maxP95FrameMs ?? guardrails.maxP95FrameMs;
  const minCheckpointAverageFps = routeGuardrails.minCheckpointAverageFps ?? minAverageFps;
  const maxCheckpointP95FrameMs = routeGuardrails.maxCheckpointP95FrameMs ?? maxP95FrameMs;
  const maxCheckpointAverageFpsDrop = args.maxCheckpointAverageFpsDrop ?? baselineRouteGuardrails.maxCheckpointAverageFpsDrop;
  const maxCheckpointP95FrameMsIncrease =
    args.maxCheckpointP95FrameMsIncrease ?? baselineRouteGuardrails.maxCheckpointP95FrameMsIncrease;
  const failures = [];
  const averageFpsMissesBudget = Number.isFinite(minAverageFps) && comparison.averageFps < minAverageFps;
  const p95MissesBudget = Number.isFinite(maxP95FrameMs) && comparison.p95FrameMs > maxP95FrameMs;

  if (Number.isFinite(maxAverageFpsDrop) && comparison.averageFpsDelta < -maxAverageFpsDrop && averageFpsMissesBudget) {
    failures.push(`baseline average FPS drop ${Math.abs(comparison.averageFpsDelta)} > ${maxAverageFpsDrop}`);
  }
  if (Number.isFinite(maxP95FrameMsIncrease) && comparison.p95FrameMsDelta > maxP95FrameMsIncrease && p95MissesBudget) {
    failures.push(`baseline p95 frame increase ${comparison.p95FrameMsDelta}ms > ${maxP95FrameMsIncrease}ms`);
  }

  for (const checkpoint of comparison.checkpoints ?? []) {
    if (checkpoint.error) {
      failures.push(`${checkpoint.label} baseline comparison error: ${checkpoint.error}`);
      continue;
    }
    if (
      Number.isFinite(maxCheckpointAverageFpsDrop) &&
      checkpoint.averageFpsDelta < -maxCheckpointAverageFpsDrop &&
      Number.isFinite(minCheckpointAverageFps) &&
      checkpoint.averageFps < minCheckpointAverageFps
    ) {
      failures.push(
        `${checkpoint.label} baseline average FPS drop ${Math.abs(checkpoint.averageFpsDelta)} > ${maxCheckpointAverageFpsDrop}`,
      );
    }
    if (
      Number.isFinite(maxCheckpointP95FrameMsIncrease) &&
      checkpoint.p95FrameMsDelta > maxCheckpointP95FrameMsIncrease &&
      Number.isFinite(maxCheckpointP95FrameMs) &&
      checkpoint.p95FrameMs > maxCheckpointP95FrameMs
    ) {
      failures.push(
        `${checkpoint.label} baseline p95 frame increase ${checkpoint.p95FrameMsDelta}ms > ${maxCheckpointP95FrameMsIncrease}ms`,
      );
    }
  }

  return failures;
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

    const routeParams = { ...(fixture.urlParams ?? {}), ...args.urlParams };
    delete routeParams.e2e;
    delete routeParams.visualProbe;
    const routeUrl = buildUrl(server.url, routeParams);
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
    await runSimulationWarmup(page, { durationMs: fixture.route?.stepWarmupMs ?? 220 });
    await runSimulationWarmup(page, { durationMs: fixture.route?.startupSettleMs ?? 250 });

    const initialState = await readGameState(page);
    const routeResult = fixture.route ? await runRouteWalk(page, args, fixture) : null;
    const frames = routeResult?.frames ?? await runFixedSegments(page, fixture);

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
    if (routeResult) {
      result.route = {
        name: fixture.route.name ?? fixture.name,
        checkpoints: routeResult.checkpoints,
        reached: routeResult.checkpoints.filter((checkpoint) => checkpoint.reached).length,
        total: routeResult.checkpoints.length,
        catalogedLandmarkIds: getCatalogedLandmarkIds(finalState),
      };
    }
    result.failures = findFailures({ fixture, args, initialState, finalState, frameSummary, consoleErrors, routeResult });

    if (args.baseline) {
      try {
        const baseline = await loadJson(args.baseline);
        result.baseline = {
          path: path.relative(root, args.baseline),
          comparison: compareBaseline(result, baseline),
        };
        result.baseline.failures = findBaselineFailures(result.baseline.comparison, fixture.guardrails ?? {}, args);
        result.failures.push(...result.baseline.failures);
      } catch (error) {
        result.baseline = {
          path: path.relative(root, args.baseline),
          error: error instanceof Error ? error.message : String(error),
        };
        result.failures.push(`baseline could not be loaded: ${result.baseline.error}`);
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
    if (result.route) {
      console.log(`route checkpoints ${result.route.reached}/${result.route.total}; stamps ${result.route.catalogedLandmarkIds.join(", ") || "none"}`);
      for (const checkpoint of result.route.checkpoints) {
        console.log(
          `  ${checkpoint.reached ? "PASS" : "FAIL"} ${checkpoint.label}: z ${checkpoint.state.player?.z ?? "?"}, landmark ${checkpoint.state.landmark ?? "?"}, avg ${checkpoint.frameSummary.averageFps}fps, p95 ${checkpoint.frameSummary.p95FrameMs}ms, visual ${checkpoint.visual?.hash ?? checkpoint.visual?.reason ?? "n/a"}, shot ${checkpoint.screenshot?.path ?? "none"}`,
        );
      }
    }
    if (result.baseline?.comparison) {
      console.log(
        `baseline delta fps ${result.baseline.comparison.averageFpsDelta}, p95 ${result.baseline.comparison.p95FrameMsDelta}ms, calls ${result.baseline.comparison.rendererCallsDelta}, tris ${result.baseline.comparison.trianglesDelta}`,
      );
      if (result.baseline.failures?.length) {
        console.log(`baseline regression failures: ${result.baseline.failures.join("; ")}`);
      }
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
