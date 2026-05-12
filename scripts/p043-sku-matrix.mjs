#!/usr/bin/env node
/**
 * P043 cross-vendor SKU matrix scaffold.
 *
 * This does not run the GPU benchmark. It emits the exact matrix of hardware,
 * scene, and view-count cells that must be captured before P043 can replace
 * projected scaling with measured data.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

export const SAMPLE_SECONDS = 60;
export const WARMUP_SECONDS = 5;

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
    label: "Dense foliage / high overdraw scan",
    gaussianCount: 2000000,
    fixture: "benchmarks/p043-multiview/scenes/dense-2m.splat",
    rationale: "Alpha overdraw and visibility-mask stress case for shared-sort kernels.",
  },
]);

export const SKUS = Object.freeze([
  {
    id: "quest3-adreno740",
    label: "Meta Quest 3 / Snapdragon XR2 Gen 2 / Adreno 740",
    class: "mobile-xr",
    nValues: [2, 3, 4],
    requiredAdapterTokens: ["adreno", "qualcomm"],
    notes: "Run in Quest Browser or WebXR shell with thermal state recorded after each 60 s sample.",
  },
  {
    id: "rtx4090",
    label: "NVIDIA GeForce RTX 4090",
    class: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["nvidia", "4090"],
    notes: "Primary desktop high-end cell for the paper table.",
  },
  {
    id: "rtx3090",
    label: "NVIDIA GeForce RTX 3090",
    class: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["nvidia", "3090"],
    notes: "Ampere comparison point for separating architecture from raw desktop class.",
  },
  {
    id: "m3-mac",
    label: "Apple M3 GPU",
    class: "desktop-integrated",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["apple", "m3"],
    notes: "Metal/WebGPU path; capture browser and macOS version in artifact metadata.",
  },
  {
    id: "intel-arc",
    label: "Intel Arc GPU",
    class: "desktop-discrete",
    nValues: [2, 4, 8],
    requiredAdapterTokens: ["intel", "arc"],
    notes: "Non-NVIDIA discrete WebGPU sanity cell.",
  },
]);

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function safeTimestamp() {
  return new Date().toISOString();
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

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    outputRoot: ".bench-logs/p043-sku-matrix",
    planPath: null,
    checkResults: false,
    listCells: false,
    runCell: null,
    outPath: null,
    sku: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    else if (arg === "--write-plan") out.planPath = argv[++i] ?? ".bench-logs/p043-sku-matrix-plan.json";
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

export function buildMatrix(options = {}) {
  const outputRoot = options.outputRoot ?? ".bench-logs/p043-sku-matrix";
  const generatedAt = options.generatedAt ?? safeTimestamp();
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
          artifactPath: artifactPath(outputRoot, sku.id, scene.id, views),
          requiredMetrics: [
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
          ],
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
    generatedAt,
    gitHead: options.gitHead ?? gitHead(),
    sampleSeconds: SAMPLE_SECONDS,
    warmupSeconds: WARMUP_SECONDS,
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
    const path = resolve(REPO_ROOT, cell.artifactPath);
    if (!existsSync(path)) {
      pending.push(cell.id);
      continue;
    }

    try {
      const artifact = JSON.parse(readFileSync(path, "utf8"));
      const missing = cell.requiredMetrics.filter((metric) => !hasPath(artifact, metric));
      if (missing.length > 0) {
        invalid.push({ id: cell.id, artifactPath: cell.artifactPath, missing });
      } else {
        captured.push(cell.id);
      }
    } catch (error) {
      invalid.push({ id: cell.id, artifactPath: cell.artifactPath, error: error.message });
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

function hasPath(obj, dottedPath) {
  let cur = obj;
  for (const part of dottedPath.split(".")) {
    if (cur == null || !Object.prototype.hasOwnProperty.call(cur, part)) return false;
    cur = cur[part];
  }
  return true;
}

function printHelp() {
  console.log(`Usage:
  node scripts/p043-sku-matrix.mjs --write-plan .bench-logs/p043-sku-matrix-plan.json
  node scripts/p043-sku-matrix.mjs --list-cells [--sku rtx4090]
  node scripts/p043-sku-matrix.mjs --check-results
  node scripts/p043-sku-matrix.mjs --run-cell <cell-id> --out <artifact.json>

Notes:
  --run-cell is a scaffold hook. It prints the required cell contract and exits
  2 until a GPU capture harness is wired behind P043_BENCH_COMMAND.`);
}

function writeJson(path, data) {
  const full = resolve(REPO_ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  return full;
}

function runCell(matrix, cellId, outPath) {
  const cell = matrix.cells.find((candidate) => candidate.id === cellId);
  if (!cell) {
    console.error(`[p043-sku-matrix] unknown cell: ${cellId}`);
    process.exit(2);
  }

  const sku = matrix.skus.find((candidate) => candidate.id === cell.skuId);
  const scene = matrix.scenes.find((candidate) => candidate.id === cell.sceneId);
  const contract = {
    status: "pending_capture_harness",
    message: "Set P043_BENCH_COMMAND to a GPU capture runner before using --run-cell for real measurement.",
    cell,
    sku,
    scene,
    requiredSampleSeconds: SAMPLE_SECONDS,
    requiredWarmupSeconds: WARMUP_SECONDS,
    outPath: outPath ?? cell.artifactPath,
  };

  if (!process.env.P043_BENCH_COMMAND) {
    console.log(JSON.stringify(contract, null, 2));
    process.exit(2);
  }

  const command = process.env.P043_BENCH_COMMAND;
  const env = {
    ...process.env,
    P043_CELL_ID: cell.id,
    P043_SKU_ID: cell.skuId,
    P043_SCENE_ID: cell.sceneId,
    P043_SCENE_FIXTURE: scene.fixture,
    P043_VIEW_COUNT: String(cell.views),
    P043_SAMPLE_SECONDS: String(SAMPLE_SECONDS),
    P043_WARMUP_SECONDS: String(WARMUP_SECONDS),
    P043_OUTPUT_PATH: outPath ?? cell.artifactPath,
  };

  console.error(`[p043-sku-matrix] running ${cell.id}: ${command}`);
  execSync(command, { cwd: REPO_ROOT, stdio: "inherit", env, shell: true });
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
    const full = writeJson(args.planPath, matrix);
    console.log(`[p043-sku-matrix] wrote ${full}`);
  }

  if (args.checkResults) {
    const summary = summarizeResults(matrix);
    console.log(JSON.stringify(summary, null, 2));
    return;
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
