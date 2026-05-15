import { describe, test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { DeterminismHarness } from '../testing/DeterminismHarness';
import { ProvenanceSemiring, TraitApplication } from '../compiler/traits/ProvenanceSemiring';

function calcStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p99Index = Math.floor(n * 0.99);
  const p99 = sorted[p99Index];
  return { median, p99 };
}

const rules = [
  { property: 'mass', strategy: 'authority-weighted' as const },
  { property: 'friction', strategy: 'max' as const },
  { property: 'restitution', strategy: 'min' as const },
  {
    property: 'color',
    strategy: 'domain-override' as const,
    precedence: ['material', 'color', 'hoverable', 'glowing'],
  },
  { property: 'opacity', strategy: 'min' as const },
];

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sha256Hex(input: string): string {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

function shuffle<T>(array: T[], random: () => number): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function generateTrait(index: number, random: () => number): TraitApplication {
  const sources = ['material', 'color', 'hoverable', 'glowing', 'physics', 'kinematic'];
  const name = sources[index % sources.length];

  return {
    name,
    config: {
      mass: random() * 100,
      friction: random(),
      restitution: random(),
      color: '#' + Math.floor(random() * 0x1000000).toString(16).padStart(6, '0'),
      opacity: random(),
    },
    context: {
      authorityLevel: Math.floor(random() * 100),
      agentId: `agent-${Math.floor(random() * 10)}`,
      opId: `op-${index}-${Math.floor(random() * 1000)}`,
    },
  };
}

describe('Trait Commutativity Evaluation (P3-S2)', () => {
  test('200,000 order-independence evaluations + overhead profiling (Multi-Run)', async () => {
    const objects = 100;
    const traitSetsPerObject = 20;
    // We scale down orderingsPerSet for multiple runs to avoid timing out,
    // or run fewer overall. Let's do 10 runs of 20,000 evaluations = 200,000 total.
    const orderingsPerSet = 10;
    const runs = 10;

    const harness = new DeterminismHarness({ hashAlgorithm: 'sha256' });
    const semiring = new ProvenanceSemiring(rules);

    const semiringOverheadSamples: number[] = [];
    const shaOverheadSamples: number[] = [];
    const harnessProbeSamples: number[] = [];
    const relativeOverheadSamples: number[] = [];
    let totalEvaluations = 0;

    for (let r = 0; r < runs; r++) {
      const random = createPrng(0x5eed_0000 + r);
      let runSemiringTimeMs = 0;
      let runShaTimeMs = 0;
      let runApplications = 0;
      let runBaselineTimeMs = 0;
      let runEvaluations = 0;
      let divergenceCount = 0;
      const firstHashBySet = new Map<string, string>();

      for (let o = 0; o < objects; o++) {
        for (let s = 0; s < traitSetsPerObject; s++) {
          const traitCount = 5 + Math.floor(random() * 5);
          const traitSet: TraitApplication[] = [];
          for (let i = 0; i < traitCount; i++) {
            traitSet.push(generateTrait(i, random));
          }

          const t0Base = performance.now();
          for (let ord = 0; ord < orderingsPerSet; ord++) {
            const config: Record<string, unknown> = {};
            for (const trait of traitSet) {
              Object.assign(config, trait.config);
            }
          }
          runBaselineTimeMs += performance.now() - t0Base;

          for (let ord = 0; ord < orderingsPerSet; ord++) {
            const ordering = shuffle(traitSet, random);

            const t0Sem = performance.now();
            const composition = semiring.add(ordering);
            const t1Sem = performance.now();

            const jsonString = JSON.stringify(composition.config);

            const t0Hash = performance.now();
            const outputHash = sha256Hex(jsonString);
            const t1Hash = performance.now();

            runSemiringTimeMs += t1Sem - t0Sem;
            runShaTimeMs += t1Hash - t0Hash;
            runApplications += traitCount;
            runEvaluations++;

            const setId = `obj-${o}-set-${s}`;
            const firstHash = firstHashBySet.get(setId);
            if (firstHash === undefined) {
              firstHashBySet.set(setId, outputHash);
            } else if (firstHash !== outputHash) {
              divergenceCount++;
            }
          }
        }
      }

      expect(divergenceCount).toBe(0);
      expect(firstHashBySet.size).toBe(objects * traitSetsPerObject);

      const probeStarted = performance.now();
      const probe = await harness.probe(`run-${r}-environment-sample`, async () => {
        return String(firstHashBySet.values().next().value ?? '');
      });
      const probeEnded = performance.now();
      expect(probe.error).toBeUndefined();
      harnessProbeSamples.push((probeEnded - probeStarted) * 1000);
      totalEvaluations += runEvaluations;

      const avgSemiringUs = (runSemiringTimeMs * 1000) / runApplications;
      const avgShaUs = (runShaTimeMs * 1000) / (objects * traitSetsPerObject * orderingsPerSet);
      const totalContractedTime = runSemiringTimeMs + runShaTimeMs;
      const baselineTimeMs = Math.max(runBaselineTimeMs, Number.EPSILON);
      const overheadPercent = ((totalContractedTime - baselineTimeMs) / baselineTimeMs) * 100;

      semiringOverheadSamples.push(avgSemiringUs);
      shaOverheadSamples.push(avgShaUs);
      relativeOverheadSamples.push(overheadPercent);
    }

    expect(totalEvaluations).toBe(objects * traitSetsPerObject * orderingsPerSet * runs);

    const semiringStats = calcStats(semiringOverheadSamples);
    const shaStats = calcStats(shaOverheadSamples);
    const harnessStats = calcStats(harnessProbeSamples);
    const relStats = calcStats(relativeOverheadSamples);

    console.log(`\nP3-S2 Evaluation Benchmark Complete (N=${runs} runs)`);
    console.log(`Total evaluations: ${totalEvaluations}`);
    console.log(
      `Semiring avg overhead per trait: ${semiringStats.median.toFixed(3)} µs median (p99: ${semiringStats.p99.toFixed(3)} µs)`
    );
    console.log(
      `SHA-256 avg overhead per resolution: ${shaStats.median.toFixed(3)} µs median (p99: ${shaStats.p99.toFixed(3)} µs)`
    );
    console.log(
      `Harness SHA-256 probe overhead: ${harnessStats.median.toFixed(3)} µs median (p99: ${harnessStats.p99.toFixed(3)} µs)`
    );
    console.log(
      `Relative overhead vs imperative: ${relStats.median.toFixed(2)}% median (p99: ${relStats.p99.toFixed(2)}%)\n`
    );
  }, 360_000); // Allow Windows CPU-fallback runs enough room for the full 200k gate
});
