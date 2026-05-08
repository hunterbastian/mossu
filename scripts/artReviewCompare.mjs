import fs from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

const EXPECTED_CAPTURE_NAMES = [
  "00-burrow-hollow",
  "01-karu-join",
  "02-fir-gate",
  "03-highland-basin",
  "04-ridge-saddle",
  "05-moss-crown-shrine",
];
const STALE_ARTIFACT_TOLERANCE_MS = 1500;

function parseArgs(argv) {
  const args = {
    summary: "output/art-review-route/summary.json",
    baseline: null,
    maxPositionDelta: 1,
    maxHeightDelta: 8,
    minScreenshotBytes: 50_000,
    minVisualContrast: 6.5,
    minVisualChroma: 5,
    minVisualDetail: 2,
    minLowerVisualDetail: 1.8,
    minNonBlankRatio: 0.9,
    maxLightRatio: 0.86,
    minDistinctVisualHashes: 3,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--summary" && next) {
      args.summary = next;
      index += 1;
    } else if (arg === "--baseline" && next) {
      args.baseline = next;
      index += 1;
    } else if (arg === "--max-position-delta" && next) {
      args.maxPositionDelta = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--max-height-delta" && next) {
      args.maxHeightDelta = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-screenshot-bytes" && next) {
      args.minScreenshotBytes = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--min-visual-contrast" && next) {
      args.minVisualContrast = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-visual-chroma" && next) {
      args.minVisualChroma = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-visual-detail" && next) {
      args.minVisualDetail = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-lower-visual-detail" && next) {
      args.minLowerVisualDetail = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-nonblank-ratio" && next) {
      args.minNonBlankRatio = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--max-light-ratio" && next) {
      args.maxLightRatio = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--min-distinct-visual-hashes" && next) {
      args.minDistinctVisualHashes = Number.parseInt(next, 10);
      index += 1;
    }
  }

  return args;
}

async function readJson(filePath, description = "JSON file") {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      const relativePath = path.relative(process.cwd(), filePath);
      const suffix =
        description === "art review summary" ? "; run npm run art:review before npm run art:compare" : "";
      throw new Error(`missing ${description} ${relativePath}${suffix}`, { cause: error });
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const relativePath = path.relative(process.cwd(), filePath);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid ${description} ${relativePath}: ${message}`, { cause: error });
  }
}

async function fileStat(filePath) {
  return fs.stat(filePath);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  let nonBlankPixels = 0;
  let edgeSum = 0;
  let lowerEdgeSum = 0;
  let edgeSamples = 0;
  let lowerEdgeSamples = 0;
  const blockLuma = new Array(64).fill(0);
  const blockCounts = new Array(64).fill(0);
  const sampleWidth = 96;
  const sampleHeight = 60;
  const lumaValues = new Float32Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y / sampleHeight) * height));
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x / sampleWidth) * width));
      const pixelIndex = y * sampleWidth + x;
      const offset = (sourceY * width + sourceX) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      lumaValues[pixelIndex] = luma;
      lumaSum += luma;
      lumaSqSum += luma * luma;
      chromaSum += chroma;
      if (luma < 18) {
        darkPixels += 1;
      }
      if (luma > 236) {
        lightPixels += 1;
      }
      if (a > 0 && (luma > 8 || chroma > 8)) {
        nonBlankPixels += 1;
      }
      const bx = Math.min(7, Math.floor((x / sampleWidth) * 8));
      const by = Math.min(7, Math.floor((y / sampleHeight) * 8));
      const blockIndex = by * 8 + bx;
      blockLuma[blockIndex] += luma;
      blockCounts[blockIndex] += 1;
    }
  }

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const pixelIndex = y * sampleWidth + x;
      const luma = lumaValues[pixelIndex];
      if (x + 1 < sampleWidth) {
        const delta = Math.abs(luma - lumaValues[pixelIndex + 1]);
        edgeSum += delta;
        edgeSamples += 1;
        if (y >= sampleHeight * 0.42) {
          lowerEdgeSum += delta;
          lowerEdgeSamples += 1;
        }
      }
      if (y + 1 < sampleHeight) {
        const delta = Math.abs(luma - lumaValues[pixelIndex + sampleWidth]);
        edgeSum += delta;
        edgeSamples += 1;
        if (y >= sampleHeight * 0.42) {
          lowerEdgeSum += delta;
          lowerEdgeSamples += 1;
        }
      }
    }
  }

  const total = sampleWidth * sampleHeight;
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
  for (let index = 0; index < hashBits.length; index += 4) {
    hash += Number.parseInt(hashBits.slice(index, index + 4), 2).toString(16);
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
    nonBlankRatio: round(nonBlankPixels / Math.max(1, total), 3),
    detail: round(edgeSum / Math.max(1, edgeSamples), 2),
    lowerDetail: round(lowerEdgeSum / Math.max(1, lowerEdgeSamples), 2),
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

function validateVisual(name, visual, args) {
  const failures = [];
  if (!visual?.available) {
    failures.push(`${name} visual snapshot unavailable: ${visual?.reason ?? "missing visual metrics"}`);
    return failures;
  }

  if (visual.contrast < args.minVisualContrast) {
    failures.push(`${name} visual contrast ${visual.contrast} < ${args.minVisualContrast}`);
  }
  if (visual.averageChroma < args.minVisualChroma) {
    failures.push(`${name} visual chroma ${visual.averageChroma} < ${args.minVisualChroma}`);
  }
  if (visual.nonBlankRatio < args.minNonBlankRatio) {
    failures.push(`${name} nonblank pixels ${visual.nonBlankRatio} < ${args.minNonBlankRatio}`);
  }
  if (visual.lightRatio > args.maxLightRatio) {
    failures.push(`${name} light pixels ${visual.lightRatio} > ${args.maxLightRatio}`);
  }
  if (visual.detail < args.minVisualDetail) {
    failures.push(`${name} visual detail ${visual.detail} < ${args.minVisualDetail}`);
  }
  if (visual.lowerDetail < args.minLowerVisualDetail) {
    failures.push(`${name} lower-scene detail ${visual.lowerDetail} < ${args.minLowerVisualDetail}`);
  }

  return failures;
}

function captureByName(summary) {
  return new Map((summary.captures ?? []).map((capture) => [capture.name, capture]));
}

async function validateSummary(summary, summaryPath, args) {
  const failures = [];
  const warnings = [];
  const summaryDir = path.dirname(summaryPath);
  const captures = Array.isArray(summary.captures) ? summary.captures : [];
  const capturesByName = captureByName(summary);
  const visualHashes = new Set();
  let summaryStat = null;
  try {
    summaryStat = await fileStat(summaryPath);
  } catch {
    failures.push(`missing summary ${path.relative(process.cwd(), summaryPath)}`);
  }

  if (Array.isArray(summary.fatalErrors) && summary.fatalErrors.length > 0) {
    failures.push(`summary has fatal console errors: ${summary.fatalErrors.join(" | ")}`);
  }
  if (summary.completed === false) {
    failures.push(`summary is incomplete${summary.runFailure ? `: ${summary.runFailure}` : ""}`);
  }
  if (typeof summary.runFailure === "string" && summary.runFailure.length > 0) {
    failures.push(`art review run failed: ${summary.runFailure}`);
  }
  if (typeof summary.deterministicStepFailure === "string" && summary.deterministicStepFailure.length > 0) {
    warnings.push(`art review used real-time fallback after ${summary.deterministicStepFailure}`);
  }

  for (const name of EXPECTED_CAPTURE_NAMES) {
    const capture = capturesByName.get(name);
    if (!capture) {
      failures.push(`missing route capture ${name}`);
      continue;
    }

    if (!capture.landmark || !capture.zone || !capture.mode) {
      failures.push(`${name} is missing landmark, zone, or mode state`);
    }

    const player = capture.player ?? {};
    for (const axis of ["x", "y", "z", "heading"]) {
      if (!isFiniteNumber(player[axis])) {
        failures.push(`${name} has non-finite player.${axis}`);
      }
    }

    let visual = capture.visual;
    for (const extension of ["png", "json"]) {
      const artifactPath = path.join(summaryDir, `${name}.${extension}`);
      try {
        const stat = await fileStat(artifactPath);
        const size = stat.size;
        if (extension === "png" && size < args.minScreenshotBytes) {
          failures.push(`${name}.png is too small (${size} bytes); screenshot may be blank`);
        }
        if (summaryStat && stat.mtimeMs - summaryStat.mtimeMs > STALE_ARTIFACT_TOLERANCE_MS) {
          failures.push(
            `${name}.${extension} is newer than summary.json; rerun art:review because artifacts are from a partial or stale run`,
          );
        }
        if (extension === "png" && !visual) {
          visual = collectVisualSnapshotFromPng(await fs.readFile(artifactPath));
        }
      } catch {
        failures.push(`missing artifact ${path.relative(process.cwd(), artifactPath)}`);
      }
    }

    failures.push(...validateVisual(name, visual, args));
    if (visual?.hash) {
      visualHashes.add(visual.hash);
    }
  }

  if (captures.length !== EXPECTED_CAPTURE_NAMES.length) {
    warnings.push(`summary has ${captures.length} captures; expected ${EXPECTED_CAPTURE_NAMES.length}`);
  }
  if (visualHashes.size < args.minDistinctVisualHashes) {
    failures.push(
      `only ${visualHashes.size} distinct visual hashes across route captures; expected at least ${args.minDistinctVisualHashes}`,
    );
  }

  return { failures, warnings };
}

async function compareBaseline(summary, baseline, args) {
  const failures = [];
  const warnings = [];
  const currentByName = captureByName(summary);
  const baselineByName = captureByName(baseline);

  for (const name of EXPECTED_CAPTURE_NAMES) {
    const current = currentByName.get(name);
    const previous = baselineByName.get(name);
    if (!current || !previous) {
      continue;
    }

    for (const field of ["landmark", "mode"]) {
      if (current[field] !== previous[field]) {
        failures.push(`${name} ${field} changed from ${previous[field]} to ${current[field]}`);
      }
    }

    if (current.zone !== previous.zone) {
      warnings.push(`${name} zone changed from ${previous.zone} to ${current.zone}`);
    }

    const currentPlayer = current.player ?? {};
    const baselinePlayer = previous.player ?? {};
    const planarDelta = Math.hypot(
      (currentPlayer.x ?? 0) - (baselinePlayer.x ?? 0),
      (currentPlayer.z ?? 0) - (baselinePlayer.z ?? 0),
    );
    const heightDelta = Math.abs((currentPlayer.y ?? 0) - (baselinePlayer.y ?? 0));
    if (planarDelta > args.maxPositionDelta) {
      failures.push(`${name} player x/z moved by ${planarDelta.toFixed(2)}m`);
    }
    if (heightDelta > args.maxHeightDelta) {
      warnings.push(`${name} player height changed by ${heightDelta.toFixed(2)}m`);
    }
  }

  return { failures, warnings };
}

async function main() {
  const args = parseArgs(process.argv);
  const summary = await readJson(args.summary, "art review summary");
  const result = await validateSummary(summary, args.summary, args);
  const failures = [...result.failures];
  const warnings = [...result.warnings];

  if (args.baseline) {
    const baseline = await readJson(args.baseline, "baseline summary");
    const baselineResult = await compareBaseline(summary, baseline, args);
    failures.push(...baselineResult.failures);
    warnings.push(...baselineResult.warnings);
  }

  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`error: ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const mode = args.baseline ? `against ${args.baseline}` : "without baseline";
  console.log(`✓ art route summary is valid ${mode}: ${summary.captures.length} captures`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
});
