/**
 * Paper-12 (HoloLand I3D) — plugin-loaded overhead + OpenUSD LOC proxy.
 *
 * HoloScript side: cold vs warm `parseHolo` timing on the same scene family.
 * OpenUSD side: static line-count proxy + one-shot "plugin registration" microbench.
 * Unity/editor timings remain manual until scripted loaders land.
 */

import { Bench } from 'tinybench';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { parseHolo } from '@holoscript/core';

const HOLO_TEMPLATE = (uniqueId: number) => `
      probe_${uniqueId} {
        @color(red)
        @position(0, 1, 0)
        @physics
        @grabbable
      }
    `;

/** Canonical warm path — fixed source string (parser + internal caches hot). */
const HOLO_WARM = HOLO_TEMPLATE(42);

/** Minimal OpenUSD-style stage text for LOC comparison (not a full pxr round-trip). */
export const OPENUSD_EQUIVALENT_PROXY = `#usda 1.0
(
  doc = "paper-12 LOC proxy — same hero + props as HoloScript probe scene"
)
def Xform "Root"
{
  def Mesh "HeroProbe"
  {
    vector3f[] extent = [(-0.5,-0.5,-0.5), (0.5,0.5,0.5)]
    int[] faceVertexCounts = [4]
    int[] faceVertexIndices = [0,1,2,3]
    point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  }
  def Xform "ProbeProps"
  {
    matrix4d xformOp:transform = ( (1,0,0,0), (0,1,0,0), (0,0,1,0), (0,1,0,1) )
  }
}
`;

export interface Paper12PluginProbeResult {
  paperId: 'paper-12';
  generatedAt: string;
  holo: {
    sourceLines: number;
    approxTraitShardLines: number;
    coldParseMeanMs: number;
    warmParseMeanMs: number;
    warmVsColdMeanRatio: number;
  };
  openUsdEquivalent: {
    schemaAndPayloadLines: number;
    pluginInitProxyMs: number;
  };
  notes: string[];
}

function countNonEmptyLines(s: string): number {
  return s.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

/** Simulate once-per-process USD / imaging / PhysX schema registration cost. */
function measurePluginInitProxyMs(): number {
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) {
    JSON.parse(
      JSON.stringify({
        schemas: ['UsdGeom', 'UsdPhysics', 'PhysxSchema', 'UsdLux', 'UsdImagingGLEngine'],
        registrySize: i,
      })
    );
  }
  return performance.now() - t0;
}

export interface RunPaper12PluginProbeOptions {
  /** Write `results/paper12-plugin-probe-*.json` under cwd (default true). */
  writeResults?: boolean;
  /** Working directory for `results/` (default `process.cwd()`). */
  cwd?: string;
}

/**
 * Run paper-12 HoloScript probe bench + LOC counts. Safe for CI when env
 * `PAPER12_QUICK=1` (shorter tinybench runs).
 */
export async function runPaper12PluginProbe(
  options: RunPaper12PluginProbeOptions = {}
): Promise<Paper12PluginProbeResult> {
  const writeResults = options.writeResults !== false;
  const cwd = options.cwd ?? process.cwd();
  const quick = process.env.PAPER12_QUICK === '1' || process.env.PAPER12_QUICK === 'true';

  const iter = quick ? 30 : 200;
  const timeMs = quick ? 50 : 150;

  let coldMean = 0;
  let warmMean = 0;

  const benchCold = new Bench({ time: timeMs, iterations: iter });
  benchCold.add('parseHolo cold (unique root name)', () => {
    const uid = Math.floor(Math.random() * 1_000_000);
    parseHolo(HOLO_TEMPLATE(uid));
  });
  await benchCold.run();
  coldMean = benchCold.tasks[0]?.result?.mean ?? 0;

  const benchWarm = new Bench({ time: timeMs, iterations: iter });
  benchWarm.add('parseHolo warm (fixed source)', () => {
    parseHolo(HOLO_WARM);
  });
  await benchWarm.run();
  warmMean = benchWarm.tasks[0]?.result?.mean ?? 0;

  const holoLines = countNonEmptyLines(HOLO_WARM);
  const traitTokens = 4;
  const approxTraitShardLines = traitTokens * 3;

  const pluginInitProxyMs = measurePluginInitProxyMs();
  const usdLines = countNonEmptyLines(OPENUSD_EQUIVALENT_PROXY);

  const result: Paper12PluginProbeResult = {
    paperId: 'paper-12',
    generatedAt: new Date().toISOString(),
    holo: {
      sourceLines: holoLines,
      approxTraitShardLines,
      coldParseMeanMs: coldMean,
      warmParseMeanMs: warmMean,
      warmVsColdMeanRatio: coldMean > 0 ? warmMean / coldMean : 0,
    },
    openUsdEquivalent: {
      schemaAndPayloadLines: usdLines,
      pluginInitProxyMs,
    },
    notes: [
      'Cold path varies the root identifier so the parser cannot reuse a single memoized key; warm path repeats identical source.',
      'OpenUSD line count is a static proxy stage — swap for pxr usdc/usda export from the same graph for camera-ready numbers.',
      'TTFF and RSS deltas vs Unity require host measurements; paste into JSON `externalSamples` when available.',
    ],
  };

  if (writeResults) {
    const dir = join(cwd, 'results');
    await mkdir(dir, { recursive: true });
    const stamp = result.generatedAt.replace(/[:.]/g, '-');
    const file = join(dir, `paper12-plugin-probe-${stamp}.json`);
    await writeFile(file, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[paper-12] wrote ${file}`);
  }

  console.log(
    `[paper-12] parseHolo mean ms cold=${coldMean.toFixed(4)} warm=${warmMean.toFixed(4)} usdProxyLines=${usdLines} pluginInitProxyMs=${pluginInitProxyMs.toFixed(3)}`
  );

  return result;
}
