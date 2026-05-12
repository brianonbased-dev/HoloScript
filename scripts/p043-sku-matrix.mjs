#!/usr/bin/env node
/**
 * P043 cross-vendor SKU matrix scaffold.
 *
 * This script does not claim benchmark numbers. It defines the hardware x scene
 * x view-count matrix, writes a machine-readable capture plan, checks captured
 * artifacts, and provides a one-cell runner hook for the future GPU harness.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

export const SAMPLE_SECONDS = 60;
export const WARMUP_SECONDS = 5;
export const REQUIRED_RUNS = 3;

export const SCENES = Object.freeze([
  {
    id: "indoor-500k",
    label: "Indoor room scan",
    gaussianCount: 500000,
    fixture: "benchmarks/p043-multiview/scenes/indoor-500k.splat",
    rationale: "Medium occlusion, near-field geometry, laptop-webcam foveation demo scale.",
  },
  {
    id: "outdoor-1m",
    label: "Outdoor plaza scan",
    gaussianCount: 1000000,
    fixture: "benchmarks/p043-multiview/scenes/outdoor-1m.splat",
    rationale: "Wide field of view, long depth range, stresses centroid sort quality.",
  },
  {
    id: "dense-2m",
    label: "Dense foliage / high-overdraw scan",
    gaussianCount: 2000000,
    fixture: "benchmarks/p043-multiview/scenes/dense-2m.splat",
    rationale: "Alpha overdraw and visibility-mask stress case for shared-sort kernels.",
  },
]);

export const SKUS = Object.freeze([
  {
    id: "quest3-adreno740",
    label: "Meta Quest 3 / Snapdragon XR2 Gen 2 / Adreno 740",
    gpuClass: "mobile-xr",
    nValues: [2, 3, 4],
    requiredAdapterTokens: ["adreno", "qualcomm"],
    notes: "Run in Quest Browser or WebXR shell with battery and thermal state recorded after each sample.",
  },
  {
    id: "rtx4090",
    label: "NVIDIA GeForce RTX 4090",
    gpuClass: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["nvidia", "4090"],
    notes: "Primary desktop high-end cell for the paper table.",
  },
  {
    id: "rtx3090",
    label: "NVIDIA GeForce RTX 3090",
    gpuClass: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["nvidia", "3090"],
    notes: "Ampere comparison point for separating architecture from raw desktop class.",
  },
  {
    id: "m3-mac",
    label: "Apple M3 GPU",
    gpuClass: "desktop-integrated",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["apple", "m3"],
    notes: "Metal/WebGPU path; capture browser and macOS version in artifact metadata.",
  },
  {
    id: "intel-arc",
    label: "Intel Arc GPU",
    gpuClass: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["intel", "arc"],
    notes: "Non-NVIDIA discrete WebGPU sanity cell.",
  },
]);

const REQUIRED_METRICS = Object.freeze([
  "adapterInfo",
  "browserVersion",
  "osVersion",
  "frameTimeMs.samples",
  "frameTimeMs.p50",
  "frameTimeMs.p95",
  "frameTimeMs.p99",
  "perUserFrameTimeMs.p95",
  "sharedSortMs.p95",
  "visibilityMaskMs.p95",
  "droppedFrameCount",
  "thermalState",
]);

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function artifactPath(outputRoot, skuId, sceneId, views) {
  return `${outputRoot}/${skuId}/${sceneId}/n${views}.json`;
}

function captureCommand(cell) {
  return [
    "node",
    "scripts/p043-sku-matrix.mjs",
    "--run-cell",
    cell.id,
    "--out",
    cell.artifactPath,
  ].join(" ");
}

export function buildMatrix(options = {}) {
  const outputRoot = options.outputRoot ?? ".bench-logs/p043-sku-matrix";
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const cells = [];

  for (const sku of SKUS) {
    for (const scene of SCENES) {
      for (const views of sku.nValues) {
        const cell = {
          id: `${sku.id}__${scene.id}__n${views}`,
          skuId: sku.id,
          sceneId: scene.id,
          views,
          sampleSeconds: SAMPLE_SECONDS,
          warmupSeconds: WARMUP_SECONDS,
          requiredRuns: REQUIRED_RUNS,
          artifactPath: artifactPath(outputRoot, sku.id, scene.id, views),
          requiredMetrics: [...REQUIRED_METRICS],
        };
        cell.captureCommand = captureCommand(cell);
        cells.push(cell);
      }
    }
  }

  return {
    schema_version: "p043-sku-matrix-v1",
    benchmark: "p043-cross-vendor-shared-sort",
    paper_ref: "docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md",
    protocol_ref: "docs/paper-program/P043-cross-vendor-sku-matrix.md",
    generatedAt,
    gitHead: options.gitHead ?? gitHead(),
    sampleSeconds: SAMPLE_SECONDS,
    warmupSeconds: WARMUP_SECONDS,
    requiredRuns: REQUIRED_RUNS,
    scenes: SCENES,
    skus: SKUS,
    targetCellCount: cells.length,
    cells,
  };
}

export function summarizeResults(matrix) {
  const captured = [];
  const pending = [];
  const invalid = [];

  for (const cell of matrix.cells) {
    const fullPath = resolve(REPO_ROOT, cell.artifactPath);
    const validation = validateArtifact(cell, fullPath, matrix);

    if (validation.status === "pending") {
      pending.push(cell.id);
    } else if (validation.status === "invalid") {
      invalid.push(validation);
    } else {
      captured.push(cell.id);
    }
  }

  return {
    targetCellCount: matrix.cells.length,
    capturedCellCount: captured.length,
    pendingCellCount: pending.length,
    invalidCellCount: invalid.length,
    captured,
    pending,
    invalid,
  };
}

export function validateArtifact(cell, fullPath, matrix) {
  if (!existsSync(fullPath)) {
    return { status: "pending", id: cell.id, artifactPath: cell.artifactPath };
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    return { status: "invalid", id: cell.id, artifactPath: cell.artifactPath, error: error.message };
  }

  const missing = cell.requiredMetrics.filter((metric) => !hasPath(artifact, metric));
  const sampleValue = getPath(artifact, "frameTimeMs.samples");
  if (!Array.isArray(sampleValue) || sampleValue.length === 0) {
    missing.push("frameTimeMs.samples[]");
  }

  const sku = matrix.skus.find((candidate) => candidate.id === cell.skuId);
  const adapterText = JSON.stringify(artifact.adapterInfo ?? {}).toLowerCase();
  const missingAdapterTokens = (sku?.requiredAdapterTokens ?? []).filter((token) => {
    return !adapterText.includes(token.toLowerCase());
  });

  if (missing.length > 0 || missingAdapterTokens.length > 0) {
    return {
      status: "invalid",
      id: cell.id,
      artifactPath: cell.artifactPath,
      missing,
      missingAdapterTokens,
    };
  }

  return { status: "captured", id: cell.id, artifactPath: cell.artifactPath };
}

function hasPath(obj, dottedPath) {
  return getPath(obj, dottedPath) !== undefined;
}

function getPath(obj, dottedPath) {
  let cur = obj;
  for (const part of dottedPath.split(".")) {
    if (cur == null || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    outputRoot: ".bench-logs/p043-sku-matrix",
    planPath: null,
    checkResults: false,
    listCells: false,
    runCell: null,
    outPath: null,
    sku: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--write-plan") out.planPath = argv[++i] ?? ".bench-logs/p043-sku-matrix-plan.json";
    else if (arg === "--output-root") out.outputRoot = argv[++i] ?? out.outputRoot;
    else if (arg === "--check-results") out.checkResults = true;
    else if (arg === "--list-cells") out.listCells = true;
    else if (arg === "--run-cell") out.runCell = argv[++i] ?? null;
    else if (arg === "--out") out.outPath = argv[++i] ?? null;
    else if (arg === "--sku") out.sku = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/p043-sku-matrix.mjs --write-plan .bench-logs/p043-sku-matrix-plan.json
  node scripts/p043-sku-matrix.mjs --list-cells [--sku rtx4090]
  node scripts/p043-sku-matrix.mjs --check-results
  node scripts/p043-sku-matrix.mjs --run-cell <cell-id> --out <artifact.json>

Notes:
  --run-cell is a scaffold hook. It prints the required cell contract and exits
  2 until a GPU capture harness is supplied via P043_BENCH_COMMAND.`);
}

function writeJson(relativePath, data) {
  const fullPath = resolve(REPO_ROOT, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
  return fullPath;
}

function runCell(matrix, cellId, outPath) {
  const cell = matrix.cells.find((candidate) => candidate.id === cellId);
  if (!cell) {
    console.error(`[p043-sku-matrix] unknown cell: ${cellId}`);
    process.exit(2);
  }

  const sku = matrix.skus.find((candidate) => candidate.id === cell.skuId);
  const scene = matrix.scenes.find((candidate) => candidate.id === cell.sceneId);
  const outputPath = outPath ?? cell.artifactPath;
  const contract = {
    status: "pending_capture_harness",
    message: "Set P043_BENCH_COMMAND to a GPU capture runner before using --run-cell for real measurement.",
    cell,
    sku,
    scene,
    requiredSampleSeconds: SAMPLE_SECONDS,
    requiredWarmupSeconds: WARMUP_SECONDS,
    requiredRuns: REQUIRED_RUNS,
    outPath: outputPath,
  };

  if (!process.env.P043_BENCH_COMMAND) {
    console.log(JSON.stringify(contract, null, 2));
    process.exit(2);
  }

  const fullOutputPath = resolve(REPO_ROOT, outputPath);
  mkdirSync(dirname(fullOutputPath), { recursive: true });

  const env = {
    ...process.env,
    P043_CELL_ID: cell.id,
    P043_SKU_ID: cell.skuId,
    P043_SCENE_ID: cell.sceneId,
    P043_SCENE_FIXTURE: scene.fixture,
    P043_VIEW_COUNT: String(cell.views),
    P043_SAMPLE_SECONDS: String(SAMPLE_SECONDS),
    P043_WARMUP_SECONDS: String(WARMUP_SECONDS),
    P043_REQUIRED_RUNS: String(REQUIRED_RUNS),
    P043_OUTPUT_PATH: outputPath,
  };

  console.error(`[p043-sku-matrix] running ${cell.id}: ${process.env.P043_BENCH_COMMAND}`);
  execSync(process.env.P043_BENCH_COMMAND, { cwd: REPO_ROOT, stdio: "inherit", env, shell: true });

  const validation = validateArtifact({ ...cell, artifactPath: outputPath }, fullOutputPath, matrix);
  if (validation.status !== "captured") {
    console.error(JSON.stringify(validation, null, 2));
    process.exit(3);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs();
  } catch (error) {
    console.error(`[p043-sku-matrix] ${error.message}`);
    printHelp();
    process.exit(2);
  }

  if (args.help) {
    printHelp();
    return;
  }

  const matrix = buildMatrix({ outputRoot: args.outputRoot });

  if (args.runCell) {
    runCell(matrix, args.runCell, args.outPath);
    return;
  }

  if (args.planPath) {
    const fullPath = writeJson(args.planPath, matrix);
    console.log(`[p043-sku-matrix] wrote ${fullPath}`);
  }

  if (args.checkResults) {
    console.log(JSON.stringify(summarizeResults(matrix), null, 2));
    return;
  }

  if (args.sku && !matrix.skus.some((sku) => sku.id === args.sku)) {
    console.error(`[p043-sku-matrix] unknown sku: ${args.sku}`);
    process.exit(2);
  }

  if (args.listCells || !args.planPath) {
    const cells = args.sku ? matrix.cells.filter((cell) => cell.skuId === args.sku) : matrix.cells;
    for (const cell of cells) {
      console.log(`${cell.id}\t${cell.captureCommand}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[p043-sku-matrix] ${error.stack || error.message}`);
    process.exit(2);
  });
}
