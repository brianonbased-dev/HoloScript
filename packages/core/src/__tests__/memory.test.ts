import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptCodeParser } from '../HoloScriptCodeParser';
import { MemoryNode, SemanticMemoryNode, EpisodicMemoryNode, ProceduralMemoryNode } from '../types';

describe('HoloScript Memory Parser', () => {
  let parser: HoloScriptCodeParser;

  beforeEach(() => {
    parser = new HoloScriptCodeParser();
  });

  test('should parse a complete AgentMemory block', () => {
    const code = `
      memory AgentMemory {
        semantic: SemanticMemory {
          capacity: 10000,
          shared: true,
          storage: "postgresql+pgvector"
        },
        episodic: EpisodicMemory {
          retention: "30 days",
          private: true,
          storage: "redis_streams"
        },
        procedural: ProceduralMemory {
          shared: true,
          storage: "code_repository"
        }
      }
    `;

    const result = parser.parse(code);

    // Ensure parser succeeds without HS000+ errors
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toHaveLength(1);

    const memoryNode = result.ast[0] as any;
    console.dir({ firstNode: memoryNode }, { depth: null });
    
    expect(memoryNode?.type).toBe('memory');
    expect(memoryNode?.name).toBe('AgentMemory');

    // Validate Semantic Memory
    expect(memoryNode.semantic).toBeDefined();
    expect(memoryNode.semantic?.type).toBe('semantic-memory');
    expect(memoryNode.semantic?.properties.capacity).toBe(10000);
    expect(memoryNode.semantic?.properties.shared).toBe(true);
    expect(memoryNode.semantic?.properties.storage).toBe("postgresql+pgvector");

    // Validate Episodic Memory
    expect(memoryNode.episodic).toBeDefined();
    expect(memoryNode.episodic?.type).toBe('episodic-memory');
    expect(memoryNode.episodic?.properties.retention).toBe("30 days");
    expect(memoryNode.episodic?.properties.private).toBe(true);
    expect(memoryNode.episodic?.properties.storage).toBe("redis_streams");

    expect(memoryNode.procedural).toBeDefined();
    expect(memoryNode.procedural?.type).toBe('procedural-memory');
    expect(memoryNode.procedural?.properties.shared).toBe(true);
    expect(memoryNode.procedural?.properties.storage).toBe("code_repository");
  });
});

import { HoloScriptRuntime } from '../HoloScriptRuntime';

describe('HoloScript Runtime - Memory Execution', () => {
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    runtime = new HoloScriptRuntime({ mode: 'secure' });
  });

  test('should execute MemoryNode and bind memory object to context variables', async () => {
    const memoryNode: MemoryNode = {
      type: 'memory',
      name: 'AgentMemory',
      position: { x: 0, y: 0, z: 0 },
      semantic: {
        type: 'semantic-memory',
        properties: { capacity: 10000, storage: 'postgresql+pgvector' },
        position: { x: 0, y: 0, z: 0 }
      },
      episodic: {
        type: 'episodic-memory',
        properties: { retention: '30 days', storage: 'redis_streams' },
        position: { x: 0, y: 0, z: 0 }
      }
    };

    const result = await runtime.executeNode(memoryNode);

    expect(result.success).toBe(true);

    // Context should contain the memory state
    const agentMemory = runtime.getContext().variables.get('AgentMemory');

    expect(agentMemory).toBeDefined();
    expect((agentMemory as any).type).toBe('agent-memory');
    expect((agentMemory as any).semantic).toEqual({
      type: 'semantic-memory',
      config: { capacity: 10000, storage: 'postgresql+pgvector' }
    });
    expect((agentMemory as any).episodic).toEqual({
      type: 'episodic-memory',
      config: { retention: '30 days', storage: 'redis_streams' }
    });
  });
});
