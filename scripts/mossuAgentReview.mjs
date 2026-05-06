import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  outDir: "output/agent-review",
  artSummary: "output/art-review-route/summary.json",
  perfSummary: "output/perf-guard/latest.json",
  karuSummary: "output/karu-route-probe/summary.json",
  wikiRoot: "/Users/hunterbastian/wiki",
};

const DOC_FILES = [
  "docs/CURRENT_STATE.md",
  "docs/NEXT_PASSES.md",
  "docs/GAME_MEMORY.md",
  "docs/KNOWN_ISSUES.md",
  "progress.md",
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--out" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--art-summary" && next) {
      args.artSummary = next;
      index += 1;
    } else if (arg === "--perf-summary" && next) {
      args.perfSummary = next;
      index += 1;
    } else if (arg === "--karu-summary" && next) {
      args.karuSummary = next;
      index += 1;
    } else if (arg === "--wiki-root" && next) {
      args.wikiRoot = next;
      index += 1;
    } else if (arg === "--help") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run agent:review -- [options]

Creates a Swarms-ready Mossu review packet and a local markdown report.

Options:
  --out <dir>             Output directory. Default: ${DEFAULTS.outDir}
  --art-summary <file>    Art-review summary JSON. Default: ${DEFAULTS.artSummary}
  --perf-summary <file>   Perf guard JSON. Default: ${DEFAULTS.perfSummary}
  --karu-summary <file>   Karu route JSON. Default: ${DEFAULTS.karuSummary}
  --wiki-root <dir>       Local wiki root, if available. Default: ${DEFAULTS.wikiRoot}
`);
}

function repoPath(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(process.cwd(), absolute);
  return relative.startsWith("..") ? absolute : relative;
}

async function readJsonOptional(filePath) {
  try {
    return {
      available: true,
      path: filePath,
      data: JSON.parse(await fs.readFile(filePath, "utf8")),
    };
  } catch (error) {
    return { available: false, path: filePath, error: String(error) };
  }
}

async function readTextOptional(filePath) {
  try {
    return {
      available: true,
      path: filePath,
      text: await fs.readFile(filePath, "utf8"),
    };
  } catch (error) {
    return { available: false, path: filePath, error: String(error) };
  }
}

async function statOptional(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function markdownList(items) {
  if (items.length === 0) {
    return "- none";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function extractBullets(text, limit = 8) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .slice(0, limit)
    .map((line) => line.slice(2));
}

function extractNumberedPasses(text, limit = 8) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+\*\*/.test(line))
    .slice(0, limit)
    .map((line) => line.replace(/^\d+\.\s+/, "").replaceAll("**", ""));
}

function maxNumber(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : 0;
}

async function summarizeArtReview(filePath) {
  const artifact = await readJsonOptional(filePath);
  if (!artifact.available) {
    return {
      available: false,
      path: filePath,
      summary: `Missing art-review artifact: ${repoPath(filePath)}`,
      promptFacts: [],
      risks: ["Run npm run art:review before asking art agents for route-specific judgment."],
    };
  }

  const summary = artifact.data;
  const summaryDir = path.dirname(filePath);
  const captures = Array.isArray(summary.captures) ? summary.captures : [];
  const captureFacts = [];
  const screenshotFacts = [];
  for (const capture of captures) {
    const name = capture.name ?? "unnamed";
    const pngPath = path.join(summaryDir, `${name}.png`);
    const stat = await statOptional(pngPath);
    captureFacts.push(
      `${name}: ${capture.landmark ?? "unknown landmark"} / ${capture.zone ?? "unknown zone"} / ${capture.mode ?? "unknown mode"}`,
    );
    screenshotFacts.push(`${name}.png ${stat ? `${Math.round(stat.size / 1024)}KB` : "missing"}`);
  }

  const fatalErrors = Array.isArray(summary.fatalErrors) ? summary.fatalErrors : [];
  const maxFollowerDistance = maxNumber(captures.map((capture) => Number(capture.fauna?.maxFollowerDistance ?? 0)));

  return {
    available: true,
    path: filePath,
    captureCount: captures.length,
    fatalErrors,
    maxFollowerDistance,
    captureFacts,
    screenshotFacts,
    summary: `${captures.length} art route captures, ${fatalErrors.length} fatal browser errors, max follower distance ${round(maxFollowerDistance)}m.`,
    promptFacts: [
      `Art summary: ${repoPath(filePath)}`,
      `Captures: ${captureFacts.join("; ")}`,
      `Screenshots: ${screenshotFacts.join("; ")}`,
      `Fatal browser errors: ${fatalErrors.length === 0 ? "none" : fatalErrors.join(" | ")}`,
    ],
    risks:
      fatalErrors.length > 0
        ? [`Fix fatal browser errors before trusting visual review: ${fatalErrors.join(" | ")}`]
        : [],
  };
}

async function summarizePerf(filePath) {
  const artifact = await readJsonOptional(filePath);
  if (!artifact.available) {
    return {
      available: false,
      path: filePath,
      summary: `Missing perf artifact: ${repoPath(filePath)}`,
      promptFacts: [],
      risks: ["Run npm run perf:guard before asking performance agents for current route judgment."],
    };
  }

  const perf = artifact.data;
  const route = perf.route ?? {};
  const checkpoints = Array.isArray(route.checkpoints) ? route.checkpoints : [];
  const failedCheckpoints = checkpoints.filter((checkpoint) => checkpoint.reached !== true);
  const slowest = [...checkpoints]
    .filter((checkpoint) => checkpoint.frameSummary)
    .sort((a, b) => (b.frameSummary?.p95FrameMs ?? 0) - (a.frameSummary?.p95FrameMs ?? 0))
    .slice(0, 4)
    .map(
      (checkpoint) =>
        `${checkpoint.label}: ${round(checkpoint.frameSummary?.averageFps ?? 0)}fps avg / ${round(
          checkpoint.frameSummary?.p95FrameMs ?? 0,
        )}ms p95`,
    );
  const failures = Array.isArray(perf.failures) ? perf.failures : [];
  const consoleErrors = Array.isArray(perf.consoleErrors) ? perf.consoleErrors : [];
  const frameSummary = perf.frameSummary ?? {};

  return {
    available: true,
    path: filePath,
    averageFps: frameSummary.averageFps,
    p95FrameMs: frameSummary.p95FrameMs,
    failures,
    consoleErrors,
    failedCheckpoints,
    summary: `${round(frameSummary.averageFps ?? 0)}fps average, ${round(frameSummary.p95FrameMs ?? 0)}ms p95, ${route.reached ?? "?"}/${route.total ?? "?"} checkpoints, ${failures.length} failures.`,
    promptFacts: [
      `Perf summary: ${repoPath(filePath)}`,
      `Overall: ${round(frameSummary.averageFps ?? 0)}fps avg, ${round(frameSummary.p95FrameMs ?? 0)}ms p95, ${round(
        frameSummary.p99FrameMs ?? 0,
      )}ms p99`,
      `Route: ${route.reached ?? "?"}/${route.total ?? "?"} checkpoints reached`,
      `Slowest checkpoints: ${slowest.length > 0 ? slowest.join("; ") : "not available"}`,
      `Perf failures: ${failures.length === 0 ? "none" : failures.join(" | ")}`,
      `Console errors: ${consoleErrors.length}`,
    ],
    risks: [
      ...failures.map((failure) => `Perf guard failure: ${failure}`),
      ...failedCheckpoints.map((checkpoint) => `Route checkpoint not reached: ${checkpoint.label}`),
    ],
  };
}

async function summarizeKaru(filePath) {
  const artifact = await readJsonOptional(filePath);
  if (!artifact.available) {
    return {
      available: false,
      path: filePath,
      summary: `Missing Karu route artifact: ${repoPath(filePath)}`,
      promptFacts: [],
      risks: ["Run npm run karu:route before asking Karu companion agents for route stability judgment."],
    };
  }

  const summary = artifact.data;
  const checkpoints = Array.isArray(summary.checkpoints) ? summary.checkpoints : [];
  const followerFailures = Array.isArray(summary.followerFailures) ? summary.followerFailures : [];
  const fatalErrors = Array.isArray(summary.fatalErrors) ? summary.fatalErrors : [];
  const maxFollowerDistance = maxNumber(checkpoints.map((checkpoint) => checkpoint.fauna?.maxFollowerDistance ?? 0));
  const checkpointFacts = checkpoints.map((checkpoint) => {
    const followers = Array.isArray(checkpoint.fauna?.followers) ? checkpoint.fauna.followers.length : 0;
    return `${checkpoint.name}: ${checkpoint.landmark ?? "unknown"} / ${followers} followers / max ${round(
      checkpoint.fauna?.maxFollowerDistance ?? 0,
    )}m`;
  });

  return {
    available: true,
    path: filePath,
    checkpointCount: checkpoints.length,
    followerFailures,
    fatalErrors,
    maxFollowerDistance,
    checkpointFacts,
    summary: `${checkpoints.length} Karu route checkpoints, max follower distance ${round(maxFollowerDistance)}m, ${followerFailures.length} follower failures, ${fatalErrors.length} fatal errors.`,
    promptFacts: [
      `Karu route summary: ${repoPath(filePath)}`,
      `Checkpoints: ${checkpointFacts.join("; ")}`,
      `Follower failures: ${followerFailures.length === 0 ? "none" : followerFailures.join(" | ")}`,
      `Fatal errors: ${fatalErrors.length === 0 ? "none" : fatalErrors.join(" | ")}`,
    ],
    risks: [
      ...followerFailures.map((failure) => `Karu follower failure: ${failure}`),
      ...fatalErrors.map((failure) => `Karu route fatal error: ${failure}`),
    ],
  };
}

async function summarizeDocs(wikiRoot) {
  const docs = [];
  for (const filePath of DOC_FILES) {
    const doc = await readTextOptional(filePath);
    if (!doc.available) {
      docs.push({ path: filePath, available: false, bullets: [], passes: [] });
      continue;
    }
    docs.push({
      path: filePath,
      available: true,
      bullets: extractBullets(doc.text, filePath.endsWith("progress.md") ? 4 : 8),
      passes: filePath.endsWith("docs/NEXT_PASSES.md") ? extractNumberedPasses(doc.text, 10) : [],
      lastUpdated: doc.text.match(/^Last updated:\s*(.+)$/m)?.[1] ?? null,
    });
  }

  const wikiFiles = [
    "summaries/current-operating-brief.md",
    "summaries/active-projects.md",
    "entities/mossu.md",
    "queries/mossu-development-brief.md",
  ];
  const wiki = [];
  for (const relativePath of wikiFiles) {
    const filePath = path.join(wikiRoot, relativePath);
    const stat = await statOptional(filePath);
    wiki.push({
      path: filePath,
      relativePath,
      available: Boolean(stat),
      modifiedAt: stat ? stat.mtime.toISOString() : null,
    });
  }

  const nextPasses = docs.find((doc) => doc.path === "docs/NEXT_PASSES.md")?.passes ?? [];
  const currentState = docs.find((doc) => doc.path === "docs/CURRENT_STATE.md");
  const progress = docs.find((doc) => doc.path === "progress.md");
  const missingDocs = docs.filter((doc) => !doc.available).map((doc) => doc.path);
  const missingWiki = wiki.filter((entry) => !entry.available).map((entry) => entry.relativePath);

  return {
    docs,
    wiki,
    nextPasses,
    summary: `${docs.length - missingDocs.length}/${docs.length} repo docs available, ${wiki.length - missingWiki.length}/${wiki.length} wiki probes available, top next pass: ${nextPasses[0] ?? "none"}.`,
    promptFacts: [
      `Current state last updated: ${currentState?.lastUpdated ?? "unknown"}`,
      `Current state bullets: ${(currentState?.bullets ?? []).join("; ")}`,
      `Latest progress bullets: ${(progress?.bullets ?? []).join("; ")}`,
      `Next passes: ${nextPasses.join("; ")}`,
      `Wiki probes: ${wiki
        .map((entry) => `${entry.relativePath} ${entry.available ? `mtime ${entry.modifiedAt}` : "missing"}`)
        .join("; ")}`,
    ],
    risks: [
      ...missingDocs.map((doc) => `Missing repo doc: ${doc}`),
      ...missingWiki.map((doc) => `Missing wiki probe: ${doc}`),
    ],
  };
}

function chooseNextPass({ art, perf, karu, docs }) {
  if (art.risks.length > 0) {
    return {
      title: "Stabilize art-review artifacts",
      reason: "The art council needs clean captures before subjective visual judgement is useful.",
    };
  }
  if (perf.risks.length > 0 || (perf.available && perf.p95FrameMs > 18)) {
    return {
      title: "Performance triage",
      reason: "Route health has measurable risk, so visual-density work should wait.",
    };
  }
  if (karu.risks.length > 0 || (karu.available && karu.maxFollowerDistance > 26)) {
    return {
      title: "Karu companion route polish",
      reason: "Follower distance is the most likely companion-readability risk on the current route.",
    };
  }
  return {
    title: docs.nextPasses[0] ?? "Opening minute polish",
    reason: "Artifacts look usable, so the planner can follow the current prioritized queue.",
  };
}

function createAgentPrompts({ art, perf, karu, docs, nextPass }) {
  const sharedContext = [
    "Project: Mossu, a cozy Vite + TypeScript + Three.js route slice.",
    "Do not propose adding runtime AI or Swarms dependencies to the browser game.",
    "Prefer narrow visual/feel passes that preserve the current route and verification loop.",
    ...art.promptFacts,
    ...perf.promptFacts,
    ...karu.promptFacts,
    ...docs.promptFacts,
  ];

  return [
    {
      name: "art_review_council",
      role: "Judge route screenshot composition, readability, reference fit, and UI clutter.",
      expectedOutput: "Rank captures that need visual attention and name the smallest safe art pass.",
      prompt: [
        ...sharedContext,
        "Focus on: first-read composition, path clarity, Mossu/Karu visibility, color/atmosphere fit, and UI obstruction.",
      ].join("\n"),
    },
    {
      name: "performance_triage_team",
      role: "Read perf guard data and separate render cost, asset density, shader/postprocess risk, and safe optimizations.",
      expectedOutput: "List any perf blockers, then recommend the safest optimization or say no perf action is needed.",
      prompt: [
        ...sharedContext,
        "Focus on: average FPS, p95/p99 frame time, slow checkpoints, draw/triangle risk, and rollback cost.",
      ].join("\n"),
    },
    {
      name: "karu_companion_polish_review",
      role: "Judge Karu route follow quality, silhouette, crowding, cuteness, and readable companion behavior.",
      expectedOutput: "Name companion issues by route checkpoint and recommend one narrow Karu polish pass.",
      prompt: [
        ...sharedContext,
        "Focus on: follower distance, water-bank behavior, ridge crowding, join beat readability, and cute motion.",
      ].join("\n"),
    },
    {
      name: "docs_wiki_sync_assistant",
      role: "Compare repo docs, progress log, and local wiki probes for source-of-truth drift.",
      expectedOutput: "List doc/wiki sync actions and flag if repo docs are already sufficient.",
      prompt: [
        ...sharedContext,
        "Focus on: CURRENT_STATE, GAME_MEMORY, NEXT_PASSES, progress.md, and local wiki drift.",
      ].join("\n"),
    },
    {
      name: "next_pass_planner",
      role: "Synthesize all reviewers into one recommended next Mossu pass.",
      expectedOutput:
        "Output one recommended next pass, why it beats alternatives, files likely touched, and verification.",
      prompt: [
        ...sharedContext,
        `Initial deterministic recommendation: ${nextPass.title} - ${nextPass.reason}`,
        "Focus on: visual value, risk, verification cost, and keeping the pass shippable.",
      ].join("\n"),
    },
  ];
}

function buildPromptPack({ art, perf, karu, docs, nextPass, generatedAt }) {
  return {
    project: "mossu",
    generatedAt,
    purpose: "Swarms-ready multi-agent review packet for Mossu artifacts and planning.",
    dependencyPolicy:
      "Use Swarms only as an optional local workflow layer. Do not add Swarms or LLM calls to Mossu browser runtime.",
    suggestedOrchestration:
      "Run the five agents concurrently, then feed their outputs to next_pass_planner for final synthesis.",
    agents: createAgentPrompts({ art, perf, karu, docs, nextPass }),
  };
}

function buildReport({ art, perf, karu, docs, nextPass, promptPackPath, generatedAt }) {
  const risks = [...art.risks, ...perf.risks, ...karu.risks, ...docs.risks];
  const nextPasses = docs.nextPasses.slice(0, 6);
  return `# Mossu Agent Review

Generated: ${generatedAt}

This is a local Swarms-ready review packet for Mossu. It does not install or require Swarms, and it does not add any AI dependency to the game runtime.

## Five Workflows

1. Art Review Council
   ${art.summary}

2. Performance Triage Team
   ${perf.summary}

3. Karu Companion Polish Review
   ${karu.summary}

4. Docs And Wiki Sync Assistant
   ${docs.summary}

5. Next-Pass Planner
   Recommended pass: ${nextPass.title}
   Reason: ${nextPass.reason}

## Current Risks

${markdownList(risks)}

## Current Next-Pass Queue

${markdownList(nextPasses)}

## Swarms Packet

Prompt pack: ${repoPath(promptPackPath)}

Use the prompt pack with Swarms or any other local multi-agent runner. The intended orchestration is concurrent reviewers followed by one synthesis pass. Keep outputs as review reports; do not let agents mutate source files directly.

## Evidence Files

${markdownList([art.path, perf.path, karu.path, ...DOC_FILES].map((filePath) => repoPath(filePath)))}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const generatedAt = new Date().toISOString();
  await fs.mkdir(args.outDir, { recursive: true });

  const [art, perf, karu, docs] = await Promise.all([
    summarizeArtReview(args.artSummary),
    summarizePerf(args.perfSummary),
    summarizeKaru(args.karuSummary),
    summarizeDocs(args.wikiRoot),
  ]);
  const nextPass = chooseNextPass({ art, perf, karu, docs });
  const promptPack = buildPromptPack({ art, perf, karu, docs, nextPass, generatedAt });

  const contextPath = path.join(args.outDir, "context.json");
  const promptPackPath = path.join(args.outDir, "swarms-prompt-pack.json");
  const reportPath = path.join(args.outDir, "review.md");
  await fs.writeFile(contextPath, JSON.stringify({ generatedAt, art, perf, karu, docs, nextPass }, null, 2));
  await fs.writeFile(promptPackPath, JSON.stringify(promptPack, null, 2));
  await fs.writeFile(reportPath, buildReport({ art, perf, karu, docs, nextPass, promptPackPath, generatedAt }));

  console.log(`agent review written: ${repoPath(reportPath)}`);
  console.log(`swarms prompt pack: ${repoPath(promptPackPath)}`);
  console.log(`recommended pass: ${nextPass.title}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
