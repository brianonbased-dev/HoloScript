import { describe, test, expect } from 'vitest';
import { DeterminismHarness } from '../testing/DeterminismHarness';
import { ProvenanceSemiring, TraitApplication } from '../compiler/traits/ProvenanceSemiring';
import { hashBytes } from '../testing/DeterminismHarness';

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
  { property: 'color', strategy: 'domain-override' as const, precedence: ['material', 'color', 'hoverable', 'glowing'] },
  { property: 'opacity', strategy: 'min' as const },
];

function shuffle<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function generateTrait(index: number): TraitApplication {
  const sources = ['material', 'color', 'hoverable', 'glowing', 'physics', 'kinematic'];
  const name = sources[index % sources.length];
  
  return {
    name,
    config: {
      mass: Math.random() * 100,
      friction: Math.random(),
      restitution: Math.random(),
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
      opacity: Math.random()
    },
    context: {
      authorityLevel: Math.floor(Math.random() * 100),
      agentId: `agent-${Math.floor(Math.random() * 10)}`
    }
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
    
    const semiringOverheadSamples: number[] = [];
    const shaOverheadSamples: number[] = [];
    const relativeOverheadSamples: number[] = [];
    
    for (let r = 0; r < runs; r++) {
      let runSemiringTimeMs = 0;
      let runShaTimeMs = 0;
      let runApplications = 0;
      let runBaselineTimeMs = 0;
      const results = [];

      for (let o = 0; o < objects; o++) {
        for (let s = 0; s < traitSetsPerObject; s++) {
          const traitCount = 5 + Math.floor(Math.random() * 5);
          const traitSet: TraitApplication[] = [];
          for (let i = 0; i < traitCount; i++) {
            traitSet.push(generateTrait(i));
          }

          const t0Base = performance.now();
          for (let ord = 0; ord < orderingsPerSet; ord++) {
            const config: any = {};
            for (const trait of traitSet) {
              Object.assign(config, trait.config);
            }
          }
          runBaselineTimeMs += (performance.now() - t0Base);

          for (let ord = 0; ord < orderingsPerSet; ord++) {
            const ordering = shuffle(traitSet);
            const semiring = new ProvenanceSemiring(rules);
            
            const t0Sem = performance.now();
            const composition = semiring.add(ordering);
            const t1Sem = performance.now();
            
            const jsonString = JSON.stringify(composition.config);
            
            const t0Hash = performance.now();
            const result = await harness.probe(`obj-${o}-set-${s}-ord-${ord}`, async () => {
               return jsonString;
            });
            const t1Hash = performance.now();
            
            runSemiringTimeMs += (t1Sem - t0Sem);
            runShaTimeMs += (t1Hash - t0Hash);
            runApplications += traitCount;
            
            results.push({ setId: `obj-${o}-set-${s}`, hash: result.outputHash });
          }
        }
      }
      
      const hashBySet = new Map<string, Set<string>>();
      for (const res of results) {
        if (!hashBySet.has(res.setId)) hashBySet.set(res.setId, new Set());
        hashBySet.get(res.setId)!.add(res.hash);
      }
      
      for (const hashes of hashBySet.values()) {
        expect(hashes.size).toBe(1); // Ensure 100% hash equality in every run
      }
      
      const avgSemiringUs = (runSemiringTimeMs * 1000) / runApplications;
      const avgShaUs = (runShaTimeMs * 1000) / (objects * traitSetsPerObject * orderingsPerSet);
      const totalContractedTime = runSemiringTimeMs + runShaTimeMs;
      const overheadPercent = ((totalContractedTime - runBaselineTimeMs) / runBaselineTimeMs) * 100;
      
      semiringOverheadSamples.push(avgSemiringUs);
      shaOverheadSamples.push(avgShaUs);
      relativeOverheadSamples.push(overheadPercent);
    }
    
    const semiringStats = calcStats(semiringOverheadSamples);
    const shaStats = calcStats(shaOverheadSamples);
    const relStats = calcStats(relativeOverheadSamples);

    console.log(`\nP3-S2 Evaluation Benchmark Complete (N=${runs} runs)`);
    console.log(`Total evaluations: ${objects * traitSetsPerObject * orderingsPerSet * runs}`);
    console.log(`Semiring avg overhead per trait: ${semiringStats.median.toFixed(3)} µs median (p99: ${semiringStats.p99.toFixed(3)} µs)`);
    console.log(`SHA-256 avg overhead per resolution: ${shaStats.median.toFixed(3)} µs median (p99: ${shaStats.p99.toFixed(3)} µs)`);
    console.log(`Relative overhead vs imperative: ${relStats.median.toFixed(2)}% median (p99: ${relStats.p99.toFixed(2)}%)\n`);
    
  }, 120000); // Allow up to 120s
});
