import { describe, it, expect, vi } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { VRChatCompiler } from '../VRChatCompiler';
import { createHash } from 'crypto';

// Mock RBAC to bypass security checks (this test validates compiler OUTPUT, not security)
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

function computeProvenanceHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('Paper 10 Benchmark: Multi-Target Provenance Preservation', () => {
  it('compiles single HoloScript source to multiple targets preserving provenance', () => {
    const N = 200;
    const parser = new HoloCompositionParser();
    
    const sourceHolo = `
      composition "Paper10Scene" {
        environment {
          skybox: "studio"
          ambient_light: 0.6
        }
        
        template "ContractedAgent" {
          @grabbable
          @physics(mass: 1.0, restitution: 0.8)
          geometry: "capsule"
          
          state {
            active: true
            energy: 100.0
          }
        }
        
        object "AgentA" using "ContractedAgent" {
          position: [0.0, 1.5, -2.0]
        }
      }
    `;

    const parseResult = parser.parse(sourceHolo);
    expect(parseResult.success).toBe(true);
    
    const astJson = JSON.stringify(parseResult.ast, null, 2);
    const astProvenanceHash = computeProvenanceHash(astJson);

    const webGpuLatencies: number[] = [];
    let lastWebGpuOutput = '';
    for (let i = 0; i < N; i++) {
      const startWebGPU = performance.now();
      const webGpuCompiler = new WebGPUCompiler({ provenanceHash: astProvenanceHash });
      lastWebGpuOutput = webGpuCompiler.compile(parseResult.ast!, 'paper10-token');
      const webGpuMs = performance.now() - startWebGPU;
      webGpuLatencies.push(webGpuMs);
    }
    webGpuLatencies.sort((a, b) => a - b);
    const webGpuMedian = webGpuLatencies[Math.floor(N / 2)];
    const webGpuP99 = webGpuLatencies[Math.floor(N * 0.99)];

    const vrChatLatencies: number[] = [];
    let lastVrChatOutput = '';
    for (let i = 0; i < N; i++) {
      const startVRChat = performance.now();
      const vrChatCompiler = new VRChatCompiler({ provenanceHash: astProvenanceHash });
      const result = vrChatCompiler.compile(parseResult.ast!, 'paper10-token');
      lastVrChatOutput = result.mainScript;
      const vrChatMs = performance.now() - startVRChat;
      vrChatLatencies.push(vrChatMs);
    }
    vrChatLatencies.sort((a, b) => a - b);
    const vrChatMedian = vrChatLatencies[Math.floor(N / 2)];
    const vrChatP99 = vrChatLatencies[Math.floor(N * 0.99)];

    console.log('[multitarget-bench] === RESULTS ===');
    console.log(`[multitarget-bench] Iterations: ${N}`);
    console.log(`[multitarget-bench] WebGPU Compile latency | Median: ${webGpuMedian.toFixed(2)} ms | p99: ${webGpuP99.toFixed(2)} ms`);
    console.log(`[multitarget-bench] VRChat Compile latency | Median: ${vrChatMedian.toFixed(2)} ms | p99: ${vrChatP99.toFixed(2)} ms`);
    
    // Provenance verification: the AST hash MUST be embedded in the output.
    expect(lastWebGpuOutput).toContain(`// Provenance Hash: ${astProvenanceHash}`);
    expect(lastVrChatOutput).toContain(`// Provenance Hash: ${astProvenanceHash}`);
  });
});
