import { describe, test, expect } from 'vitest';
import { DeterminismHarness } from '../testing/DeterminismHarness';
import { ProvenanceSemiring, TraitApplication } from '../compiler/traits/ProvenanceSemiring';
import { hashBytes } from '../testing/DeterminismHarness';

// Pre-defined rules for our random trait sets
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

// Generate random trait
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
  test('200,000 order-independence evaluations + overhead profiling', async () => {
    // We will do a scaled down version for standard test runs (e.g. 10x20x10 = 2000) 
    // but the actual P3-S2 paper claims 100 objects x 20 sets x 100 orderings = 200,000.
    // For this benchmark run, we will run the full 200,000 if not in a fast CI, or we can just run it.
    // Given the efficiency of semiring, 200K should take ~1 second.
    
    const objects = 100;
    const traitSetsPerObject = 20;
    const orderingsPerSet = 100;
    
    const harness = new DeterminismHarness({ hashAlgorithm: 'sha256' });
    let totalSemiringTimeMs = 0;
    let totalShaTimeMs = 0;
    let totalApplications = 0;
    
    const results = [];
    
    // Baseline imperative overhead for comparison
    let baselineTimeMs = 0;

    for (let o = 0; o < objects; o++) {
      for (let s = 0; s < traitSetsPerObject; s++) {
        // Generate a random trait set of 5-10 traits
        const traitCount = 5 + Math.floor(Math.random() * 5);
        const traitSet: TraitApplication[] = [];
        for (let i = 0; i < traitCount; i++) {
          traitSet.push(generateTrait(i));
        }

        // Measure baseline (uncontracted imperative application)
        const t0Base = performance.now();
        for (let ord = 0; ord < orderingsPerSet; ord++) {
          const config: any = {};
          for (const trait of traitSet) {
            Object.assign(config, trait.config); // naive overwrite
          }
        }
        baselineTimeMs += (performance.now() - t0Base);

        // Run the 100 permutations
        for (let ord = 0; ord < orderingsPerSet; ord++) {
          const ordering = shuffle(traitSet);
          
          const semiring = new ProvenanceSemiring(rules);
          
          const t0Sem = performance.now();
          const composition = semiring.add(ordering);
          const t1Sem = performance.now();
          
          // Hash the result
          const jsonString = JSON.stringify(composition.config);
          
          const t0Hash = performance.now();
          const result = await harness.probe(`obj-${o}-set-${s}-ord-${ord}`, async () => {
             return jsonString;
          });
          const t1Hash = performance.now();
          
          totalSemiringTimeMs += (t1Sem - t0Sem);
          totalShaTimeMs += (t1Hash - t0Hash);
          totalApplications += traitCount;
          
          results.push({
            setId: `obj-${o}-set-${s}`,
            hash: result.outputHash
          });
        }
      }
    }
    
    // Verify 100% hash equality per set
    const hashBySet = new Map<string, Set<string>>();
    for (const r of results) {
      if (!hashBySet.has(r.setId)) {
        hashBySet.set(r.setId, new Set());
      }
      hashBySet.get(r.setId)!.add(r.hash);
    }
    
    let divergentSets = 0;
    for (const [setId, hashes] of hashBySet.entries()) {
      if (hashes.size > 1) {
        divergentSets++;
      }
    }
    
    expect(divergentSets).toBe(0); // 100% equality
    
    const avgSemiringUs = (totalSemiringTimeMs * 1000) / totalApplications;
    const avgShaUs = (totalShaTimeMs * 1000) / (objects * traitSetsPerObject * orderingsPerSet);
    const totalContractedTime = totalSemiringTimeMs + totalShaTimeMs;
    const overheadPercent = ((totalContractedTime - baselineTimeMs) / baselineTimeMs) * 100;
    
    console.log(`P3-S2 Evaluation Benchmark Complete`);
    console.log(`Evaluations: ${objects * traitSetsPerObject * orderingsPerSet}`);
    console.log(`Total trait applications: ${totalApplications}`);
    console.log(`Divergent sets: ${divergentSets}`);
    console.log(`Semiring avg overhead per trait: ${avgSemiringUs.toFixed(3)} µs`);
    console.log(`SHA-256 avg overhead per resolution: ${avgShaUs.toFixed(3)} µs`);
    console.log(`Relative overhead vs imperative: ${overheadPercent.toFixed(2)}%`);
    
  }, 120000); // Allow up to 120s
});
