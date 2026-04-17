import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as core from '../index';

vi.mock('../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compiler/identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

describe('18-Target Compiler Benchmark', () => {
  let objects: any[] = [];
  let ast: any;

  beforeAll(() => {
    for (let i = 0; i < 1000; i++) {
        const traits = [];
        for (let t = 0; t < 50; t++) {
            traits.push({
                name: `TraitVariation${t}`,
                config: { value: i * t, enabled: true, nested: { p: i } }
            });
        }
        objects.push({
            type: 'ObjectDecl',
            name: `Obj_${i}`,
            properties: [
                { key: 'geometry', value: 'cube' },
                { key: 'position', value: [i, 0, 0] },
                { key: 'scale', value: [1.1, 1.1, 1.1] }
            ],
            traits
        });
    }

    ast = {
        type: 'Composition',
        name: 'BenchmarkScene',
        declarations: objects,
        decls: objects, // for TraitCompositionCompiler
        domainBlocks: []
    };
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('Benchmarks all targets', () => {
    const compilerClasses = Object.keys(core).filter(k => k.endsWith('Compiler') && typeof (core as any)[k] === 'function');
    
    const results = [];
    for (const className of compilerClasses) {
      if (className.includes('create')) continue;
      if (className.includes('HolobCompiler')) continue; // Requires holo-vm
      if (className.includes('DomainBlockCompilerMixin')) continue; 
      try {
        const CompilerClass = (core as any)[className];
        const compiler = new CompilerClass();
        
        let testAst = ast;
        if (className === 'TraitCompositionCompiler') {
             continue; // ignore trait compiler layout bounds
        }

        if (typeof compiler.compile === 'function') {
          const start = performance.now();
          const output = compiler.compile(testAst, 'test-token');
          const time = Math.round((performance.now() - start) * 100) / 100;
          const size = output ? (typeof output === 'string' ? output.length : JSON.stringify(output).length) : 0;
          
          results.push({ target: className, timeMs: time, outputSize: size });
        }
      } catch (err: any) {
        results.push({ target: className, timeMs: -1, error: String(err.message || err).substring(0, 80) });
      }
    }

    results.sort((a, b) => b.timeMs - a.timeMs);
    console.log("\n=== Compilation Benchmark Results (1000 objects, 50 traits each) ===");
    for (const res of results) {
      if (res.timeMs >= 0) {
        console.log(`${res.target.padEnd(30)} | Time: ${res.timeMs.toFixed(2)}ms | Size: ${(res.outputSize / 1024).toFixed(2)} KB`);
      } else {
        console.log(`FAILED: ${res.target}: ${res.error}`);
      }
    }

    const totalAllowed = 50; 
    const valid = results.filter(r => r.timeMs >= 0);
    const worst = valid[0];
    
    console.log(`\nBottleneck Analysis:`);
    if (worst && worst.timeMs > totalAllowed) {
      console.log(`CRITICAL BOTTLENECK: ${worst.target} took ${worst.timeMs.toFixed(2)}ms, exceeding the ${totalAllowed}ms SLA.`);
    } else if (worst) {
      console.log(`All successful targets met the compile budget. Worst was ${worst.target} at ${worst.timeMs.toFixed(2)}ms.`);
    }

    import('fs').then(fs => {
        fs.writeFileSync('C:/Users/Josep/.ai-ecosystem/scratch/benchmark_results.json', JSON.stringify({worst, results}, null, 2));
    });
    
    expect(valid.length).toBeGreaterThan(15);
  });
});
