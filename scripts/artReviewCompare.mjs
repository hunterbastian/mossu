import fs from "node:fs/promises";
import path from "node:path";

const EXPECTED_CAPTURE_NAMES = [
  "00-burrow-hollow",
  "01-karu-join",
  "02-fir-gate",
  "03-highland-basin",
  "04-ridge-saddle",
  "05-moss-crown-shrine",
];

function parseArgs(argv) {
  const args = {
    summary: "output/art-review-route/summary.json",
    baseline: null,
    maxPositionDelta: 1,
    maxHeightDelta: 8,
    minScreenshotBytes: 50_000,
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
    }
  }

  return args;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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

  if (Array.isArray(summary.fatalErrors) && summary.fatalErrors.length > 0) {
    failures.push(`summary has fatal console errors: ${summary.fatalErrors.join(" | ")}`);
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

    for (const extension of ["png", "json"]) {
      const artifactPath = path.join(summaryDir, `${name}.${extension}`);
      try {
        const size = await fileSize(artifactPath);
        if (extension === "png" && size < args.minScreenshotBytes) {
          failures.push(`${name}.png is too small (${size} bytes); screenshot may be blank`);
        }
      } catch {
        failures.push(`missing artifact ${path.relative(process.cwd(), artifactPath)}`);
      }
    }
  }

  if (captures.length !== EXPECTED_CAPTURE_NAMES.length) {
    warnings.push(`summary has ${captures.length} captures; expected ${EXPECTED_CAPTURE_NAMES.length}`);
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
  const summary = await readJson(args.summary);
  const result = await validateSummary(summary, args.summary, args);
  const failures = [...result.failures];
  const warnings = [...result.warnings];

  if (args.baseline) {
    const baseline = await readJson(args.baseline);
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
  console.error(error);
  process.exitCode = 1;
});
