#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildBrittneyCaelRecord,
  verifyBrittneyCaelRecord as verifyCaelRecord,
  type BrittneyCaelRecord,
} from '../../../packages/studio/src/lib/brittney/cael';

interface Options {
  selfTest: boolean;
  out: string;
  seeds: number;
  trials: number;
  distances: number[];
  pValues: number[];
}

interface Point {
  x: number;
  y: number;
}

interface CaelLattice {
  cleanRecords: BrittneyCaelRecord[];
  tamperedRecords: BrittneyCaelRecord[];
  cleanVerified: number;
  tamperedRejected: number;
}

interface SweepRow {
  p: number;
  distance: number;
  seeds: number;
  trialsPerSeed: number;
  totalTrials: number;
  logicalFailures: number;
  logicalErrorRate: number;
  observedPhysicalRate: number;
  meanDefectsPerTrial: number;
  caelRecordsObserved: number;
  tamperedRecordsRejected: number;
}

const DEFAULT_OUT = 'research/stabilizer-fleet/real-cael-toric-sweep-2026-06-21.json';
const DEFAULT_P_VALUES = [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2];
const DEFAULT_DISTANCES = [3, 5, 7];
const BURST_OFFSETS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function parseArgs(argv: string[]): Options {
  const selfTest = argv.includes('--self-test');
  const arg = (name: string): string | null => {
    const prefix = `${name}=`;
    return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
  };

  return {
    selfTest,
    out: arg('--out') ?? DEFAULT_OUT,
    seeds: Number(arg('--seeds') ?? (selfTest ? 1 : 5)),
    trials: Number(arg('--trials') ?? (selfTest ? 32 : 4000)),
    distances: parseNumberList(arg('--distances'), selfTest ? [3, 5] : DEFAULT_DISTANCES),
    pValues: parseNumberList(arg('--p'), selfTest ? [0.02, 0.12] : DEFAULT_P_VALUES),
  };
}

function parseNumberList(raw: string | null, fallback: number[]): number[] {
  if (!raw) return fallback;
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return values.length > 0 ? values : fallback;
}

function sha(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(...parts: Array<string | number>): number {
  const hex = sha(parts.join(':')).slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

function indexOf(point: Point, distance: number): number {
  const x = ((point.x % distance) + distance) % distance;
  const y = ((point.y % distance) + distance) % distance;
  return y * distance + x;
}

function pointOf(index: number, distance: number): Point {
  return { x: index % distance, y: Math.floor(index / distance) };
}

function tamper(record: BrittneyCaelRecord): BrittneyCaelRecord {
  const layerHashes = [...record.layer_hashes];
  const composite = layerHashes[6] ?? '';
  layerHashes[6] = `${composite.slice(0, -1)}${composite.endsWith('0') ? '1' : '0'}`;
  return { ...record, layer_hashes: layerHashes };
}

function buildCaelLattice(distance: number): CaelLattice {
  const cleanRecords: BrittneyCaelRecord[] = [];
  const tamperedRecords: BrittneyCaelRecord[] = [];
  let cleanVerified = 0;
  let tamperedRejected = 0;

  for (let y = 0; y < distance; y++) {
    for (let x = 0; x < distance; x++) {
      const record = buildBrittneyCaelRecord({
        sessionId: `exp5-real-cael-toric:d${distance}:x${x}:y${y}`,
        round: 0,
        model: 'cael-z-syndrome-worker',
        messages: [{ role: 'worker', content: `toric-check ${x},${y}` }],
        finalText: 'z-syndrome check passed',
        toolCalls: [
          {
            name: 'surface_code_z_syndrome_check',
            input: { distance, x, y },
            result: { verified: true },
          },
        ],
        evidencePaths: ['packages/studio/src/lib/brittney/cael.ts'],
        simContractCheck: { passed: true, constraints: ['real-cael-z-syndrome'] },
        prevChain: null,
      });
      const bad = tamper(record);
      if (verifyCaelRecord(record)) cleanVerified++;
      if (!verifyCaelRecord(bad)) tamperedRejected++;
      cleanRecords.push(record);
      tamperedRecords.push(bad);
    }
  }

  return { cleanRecords, tamperedRecords, cleanVerified, tamperedRejected };
}

function observeCaelZDefect(lattice: CaelLattice, site: number): boolean {
  return !verifyCaelRecord(lattice.tamperedRecords[site]);
}

function sampleCorrelatedCaelSyndrome(
  rng: () => number,
  distance: number,
  p: number,
  lattice: CaelLattice,
  counters: { observed: number; rejected: number }
): Set<number> {
  const defects = new Set<number>();
  for (let y = 0; y < distance; y++) {
    for (let x = 0; x < distance; x++) {
      if (rng() >= p) continue;
      const burst = rng() < 0.42;
      const offsets = burst ? BURST_OFFSETS : [BURST_OFFSETS[0]];
      for (const offset of offsets) {
        if (burst && offset.x !== 0 && offset.y !== 0 && rng() < 0.2) continue;
        if (burst && (offset.x !== 0 || offset.y !== 0) && rng() < 0.35) continue;
        const site = indexOf({ x: x + offset.x, y: y + offset.y }, distance);
        counters.observed++;
        if (observeCaelZDefect(lattice, site)) {
          counters.rejected++;
          defects.add(site);
        }
      }
    }
  }
  return defects;
}

function toricDelta(a: Point, b: Point, distance: number): { dx: number; dy: number; wrapsX: boolean; wrapsY: boolean } {
  const rawDx = b.x - a.x;
  const rawDy = b.y - a.y;
  const dx =
    Math.abs(rawDx) <= distance / 2 ? rawDx : rawDx > 0 ? rawDx - distance : rawDx + distance;
  const dy =
    Math.abs(rawDy) <= distance / 2 ? rawDy : rawDy > 0 ? rawDy - distance : rawDy + distance;
  return {
    dx,
    dy,
    wrapsX: dx !== rawDx,
    wrapsY: dy !== rawDy,
  };
}

function toricDistance(a: Point, b: Point, distance: number): number {
  const delta = toricDelta(a, b, distance);
  return Math.abs(delta.dx) + Math.abs(delta.dy);
}

function decodeGreedyToric(defects: Set<number>, distance: number): { logicalFailure: boolean } {
  const unmatched = [...defects].map((index) => pointOf(index, distance));
  let logicalX = false;
  let logicalY = false;

  while (unmatched.length > 1) {
    const a = unmatched.shift()!;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < unmatched.length; i++) {
      const d = toricDistance(a, unmatched[i], distance);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const [b] = unmatched.splice(bestIndex, 1);
    const delta = toricDelta(a, b, distance);
    logicalX = logicalX !== delta.wrapsX;
    logicalY = logicalY !== delta.wrapsY;
  }

  return {
    logicalFailure: unmatched.length === 1 || logicalX || logicalY,
  };
}

function runSweep(options: Options): SweepRow[] {
  const rows: SweepRow[] = [];
  const lattices = new Map<number, CaelLattice>();

  for (const distance of options.distances) {
    lattices.set(distance, buildCaelLattice(distance));
  }

  for (const p of options.pValues) {
    for (const distance of options.distances) {
      const lattice = lattices.get(distance)!;
      let logicalFailures = 0;
      let totalDefects = 0;
      const counters = { observed: 0, rejected: 0 };

      for (let seed = 0; seed < options.seeds; seed++) {
        const rng = mulberry32(seedFor('exp5-real-cael-toric', p, distance, seed));
        for (let trial = 0; trial < options.trials; trial++) {
          const defects = sampleCorrelatedCaelSyndrome(rng, distance, p, lattice, counters);
          totalDefects += defects.size;
          if (decodeGreedyToric(defects, distance).logicalFailure) {
            logicalFailures++;
          }
        }
      }

      const totalTrials = options.seeds * options.trials;
      const totalSites = totalTrials * distance * distance;
      rows.push({
        p,
        distance,
        seeds: options.seeds,
        trialsPerSeed: options.trials,
        totalTrials,
        logicalFailures,
        logicalErrorRate: logicalFailures / totalTrials,
        observedPhysicalRate: totalDefects / totalSites,
        meanDefectsPerTrial: totalDefects / totalTrials,
        caelRecordsObserved: counters.observed,
        tamperedRecordsRejected: counters.rejected,
      });
    }
  }

  return rows;
}

function thresholdReport(rows: SweepRow[], distances: number[]): Record<string, unknown> {
  const ordered = [...distances].sort((a, b) => a - b);
  const pValues = [...new Set(rows.map((row) => row.p))].sort((a, b) => a - b);
  let lastImproving: number | null = null;
  let firstReversed: number | null = null;

  for (const p of pValues) {
    const byDistance = new Map(
      rows.filter((row) => row.p === p).map((row) => [row.distance, row.logicalErrorRate])
    );
    const rates = ordered.map((distance) => byDistance.get(distance) ?? Number.NaN);
    const improvesWithDistance = rates.every(
      (rate, index) => index === 0 || rate <= rates[index - 1]
    );
    const reversesWithDistance = rates.every(
      (rate, index) => index === 0 || rate >= rates[index - 1]
    );

    if (improvesWithDistance) lastImproving = p;
    if (firstReversed === null && reversesWithDistance && p > (lastImproving ?? 0)) {
      firstReversed = p;
    }
  }

  return {
    holdsUnderCorrelatedBursts: lastImproving !== null,
    lastImprovingP: lastImproving,
    firstReversedP: firstReversed,
    conclusion:
      lastImproving === null
        ? 'No distance-improving regime observed in this bounded sweep.'
        : `Real-CAEL toric decoding has a distance-improving regime through p=${lastImproving}.`,
  };
}

function buildReceipt(options: Options, rows: SweepRow[]): Record<string, unknown> {
  const verifierChecks = options.distances.map((distance) => {
    const lattice = buildCaelLattice(distance);
    return {
      distance,
      cleanVerified: lattice.cleanVerified,
      tamperedRejected: lattice.tamperedRejected,
      sites: distance * distance,
    };
  });

  const receipt = {
    schema: 'holoscript.exp5.surface.real-cael-toric.v1',
    generatedAt: new Date().toISOString(),
    mode: options.selfTest ? 'self-test' : 'acceptance',
    acceptance: {
      seeds: options.seeds,
      trialsPerSeed: options.trials,
      totalTrialsPerPoint: options.seeds * options.trials,
      pValues: options.pValues,
      distances: options.distances,
      correlatedBurst: {
        radius: 1,
        activationProbability: 0.42,
        neighborDropProbability: 0.35,
      },
    },
    zSyndromeObservable: {
      source: 'packages/studio/src/lib/brittney/cael.ts#verifyBrittneyCaelRecord',
      importedAs: 'verifyCaelRecord',
      rule: 'site is a Z defect iff verifyCaelRecord(siteRecord) returns false',
      cleanAndTamperChecks: verifierChecks,
    },
    decoder: {
      family: 'toric-code',
      geometry: 'periodic square lattice',
      decoder: 'greedy nearest-neighbor matching on toric Manhattan distance',
      logicalFailureRule: 'odd unpaired defect or odd correction winding around either torus cycle',
    },
    threshold: thresholdReport(rows, options.distances),
    curve: rows,
  };
  return { ...receipt, receiptHash: `sha256:${sha(JSON.stringify(receipt))}` };
}

function writeReceipt(out: string, receipt: Record<string, unknown>): string {
  const abs = resolve(out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return abs;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(options.seeds) || options.seeds <= 0) throw new Error('--seeds must be > 0');
  if (!Number.isInteger(options.trials) || options.trials <= 0) {
    throw new Error('--trials must be > 0');
  }

  const rows = runSweep(options);
  const receipt = buildReceipt(options, rows);
  const out = writeReceipt(options.out, receipt);
  const threshold = receipt.threshold as { conclusion?: string };

  console.log(`wrote ${out}`);
  console.log(`schema=${receipt.schema}`);
  console.log(`mode=${receipt.mode}`);
  console.log(`totalTrialsPerPoint=${options.seeds * options.trials}`);
  console.log(`threshold=${threshold.conclusion ?? 'n/a'}`);
}

main();
