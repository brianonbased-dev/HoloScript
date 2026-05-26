import { describe, expect, it, vi } from 'vitest';
import { agentMemoryHandler } from '../AgentMemoryTrait';

vi.mock('@holoscript/core/traits', () => ({ agentMemoryHandler }));

describe('shared trait barrel population wiring', () => {
  it('resolves the same agent memory trait object for all agent populations', async () => {
    const [
      { UAA2_AGENT_MEMORY_TRAIT },
      { HOLOLAND_NPC_MEMORY_TRAIT },
      { HOLOMESH_AGENT_MEMORY_TRAIT },
    ] = await Promise.all([
      import('../../../../framework/src/agents/shared-traits'),
      import('../../../../hololand-platform/src/npc/jepa-npc-controller'),
      import('../../../../mcp-server/src/holomesh/agent/shared-traits'),
    ]);

    expect(HOLOMESH_AGENT_MEMORY_TRAIT).toBe(agentMemoryHandler);
    expect(HOLOLAND_NPC_MEMORY_TRAIT).toBe(agentMemoryHandler);
    expect(UAA2_AGENT_MEMORY_TRAIT).toBe(agentMemoryHandler);
  });
});
