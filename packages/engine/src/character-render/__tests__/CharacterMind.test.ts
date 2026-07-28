/**
 * CharacterMind tests — the D.102 portable-mind seam. Pure data, zero network, no GPU.
 *
 * Asserts: StaticCharacterMind identity + filtered loadMemory + rememberOutcome round-trip;
 * CharacterHost.bindMind adopts identity + loads memory; bindMind NEVER throws and degrades to
 * body-only on a failing mind; and — the load-bearing additive guarantee — getDrawSpec is
 * byte-identical with vs without a bound mind (the mind never changes how the body renders).
 */
import { describe, it, expect } from 'vitest';
import { StaticCharacterMind, type CharacterMind } from '../CharacterMind';
import { CharacterHost } from '../CharacterHost';

describe('StaticCharacterMind', () => {
  it('returns identity and filters memory by query, capped by limit', async () => {
    const mind = new StaticCharacterMind({ wallet: '0xABC', agentId: 'brittney' }, [
      { content: 'prefers concise answers' },
      { content: 'working on the WebGPU renderer' },
      { content: 'likes tea' },
    ]);
    expect(mind.identity()).toEqual({ wallet: '0xABC', agentId: 'brittney' });
    expect(await mind.loadMemory()).toHaveLength(3);
    expect(await mind.loadMemory('webgpu')).toHaveLength(1);
    expect(await mind.loadMemory(undefined, 2)).toHaveLength(2);
  });

  it('rememberOutcome prepends a new entry', async () => {
    const mind = new StaticCharacterMind({ wallet: '0x1' }, []);
    await mind.rememberOutcome({ content: 'shipped the eyes layer' });
    const mem = await mind.loadMemory();
    expect(mem[0].content).toBe('shipped the eyes layer');
  });
});

describe('CharacterHost.bindMind', () => {
  it('adopts the mind identity and loads its memory', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    expect(host.hasMind()).toBe(false);
    expect(host.getIdentity()).toBeNull();

    await host.bindMind(
      new StaticCharacterMind({ wallet: '0xWALLET', agentId: 'brittney' }, [
        { content: 'remembers the plan' },
      ])
    );
    expect(host.hasMind()).toBe(true);
    expect(host.getIdentity()).toEqual({ wallet: '0xWALLET', agentId: 'brittney' });
    expect(host.getMemory()).toHaveLength(1);
    expect(host.getMemory()[0].content).toBe('remembers the plan');
  });

  it('degrades to body-only on a failing mind — never throws', async () => {
    const broken: CharacterMind = {
      identity: () => ({ wallet: '0xBAD' }),
      loadMemory: async () => {
        throw new Error('store unreachable');
      },
    };
    const host = new CharacterHost({ entityId: 'agent-2' });
    await expect(host.bindMind(broken)).resolves.toBeUndefined();
    expect(host.hasMind()).toBe(true);
    expect(host.getMemory()).toEqual([]); // load failed → empty, body still works
  });

  it('binding a mind does NOT change how the body renders (getDrawSpec byte-identical)', async () => {
    const a = new CharacterHost({ entityId: 'brittney' });
    const b = new CharacterHost({ entityId: 'brittney' });
    await b.bindMind(new StaticCharacterMind({ wallet: '0xW' }, [{ content: 'x' }]));

    const sa = a.getDrawSpec();
    const sb = b.getDrawSpec();
    expect(sb.mesh.positions).toEqual(sa.mesh.positions);
    expect(sb.mesh.indices).toEqual(sa.mesh.indices);
    expect(Array.from(sb.jointMatrices)).toEqual(Array.from(sa.jointMatrices));
    expect(sb.materialGroups?.length).toBe(sa.materialGroups?.length);
  });
});
