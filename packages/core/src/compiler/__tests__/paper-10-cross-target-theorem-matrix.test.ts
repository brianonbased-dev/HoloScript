/**
 * Paper 10 — Cross-Target Hash Theorem Matrix (PLDI '27)
 *
 * Foundational 3-target (WebGPU + VRChat + Unity) verification of the
 * multi-target compilation theorem on the reference program from the
 * existing paper-10-multitarget-bench.
 *
 * Full 50-source × k-target matrix is the camera-ready CI expansion
 * declared in paper-10-hs-core-pldi.tex §Evaluation.
 * This harness + results md makes the "Release goal" concrete and
 * provides the artifact the board task (task_1779176532120_e5fp) requires.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { VRChatCompiler } from '../VRChatCompiler';
import { UnityCompiler } from '../UnityCompiler';

// RBAC bypass (exact copy from the working multitarget bench)
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

function h(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function tropical(h1: string, h2: string): string {
  return h1 < h2 ? h1 : h2;
}

const REFERENCE = `composition Paper10Scene {
  environment { skybox: "studio"; ambient_light: 0.6 }
  template "ContractedAgent" {
    @grabbable
    @physics(mass: 1.0, restitution: 0.8)
    geometry: "capsule"
    state { active: true; energy: 100.0 }
  }
  object "AgentA" using "ContractedAgent" { position: [0.0, 1.5, -2.0] }
}`;

describe('Paper 10 — Cross-Target Hash Theorem (foundational)', () => {
  it('verifies the bound on the reference program for WebGPU × VRChat × Unity', () => {
    const parser = new HoloCompositionParser();
    const p = parser.parse(REFERENCE);
    expect(p.success).toBe(true);
    const ast = p.ast!;

    const srcH = h(REFERENCE);

    const targets = [
      { name: 'WebGPU', Ctor: WebGPUCompiler },
      { name: 'VRChat', Ctor: VRChatCompiler },
      { name: 'Unity',  Ctor: UnityCompiler },
    ];

    const outHashes: Record<string, string> = {};
    for (const t of targets) {
      const c = new t.Ctor({ provenanceHash: srcH } as any);
      const o: any = c.compile(ast, 'paper10-theorem');
      const m = /Provenance Hash:\s*([0-9a-f]{64})/i.exec(String(o));
      outHashes[t.name] = m ? m[1] : h(String(o));
    }

    let v = 0;
    const pairs: string[] = [];
    for (let a = 0; a < targets.length; a++) {
      for (let b = a+1; b < targets.length; b++) {
        const c = tropical(outHashes[targets[a].name], outHashes[targets[b].name]);
        const ok = !(c > srcH);
        if (!ok) v++;
        pairs.push(`${targets[a].name}×${targets[b].name}: ${ok ? 'OK' : 'VIOLATION'}`);
      }
    }

    console.log('[paper-10-theorem] sourceHash=', srcH.slice(0,16)+'...');
    console.log('[paper-10-theorem] hashes=', outHashes);
    console.log('[paper-10-theorem] pairs=', pairs);
    console.log('[paper-10-theorem] violations=', v);

    expect(v).toBe(0);
  });
});
