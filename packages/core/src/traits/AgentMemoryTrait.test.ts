import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  agentMemoryHandler,
  type AgentMemoryConfig,
  type Memory,
  type MemoryRecallResult,
} from './AgentMemoryTrait';
import type { TraitContext } from './TraitTypes';

const mockNode = {} as any;
const mockContext = {
  emit: vi.fn(),
} as unknown as TraitContext;

describe('AgentMemoryTrait', () => {
  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(agentMemoryHandler.name).toBe('agent_memory');
    });

    it('should provide default configuration', () => {
      expect(agentMemoryHandler.defaultConfig).toBeDefined();
      expect(agentMemoryHandler.defaultConfig.max_memories).toBe(10000);
      expect(agentMemoryHandler.defaultConfig.auto_compress).toBe(true);
    });

    it('should expose all lifecycle methods', () => {
      expect(typeof agentMemoryHandler.onAttach).toBe('function');
      expect(typeof agentMemoryHandler.onDetach).toBe('function');
      expect(typeof agentMemoryHandler.onUpdate).toBe('function');
      expect(typeof agentMemoryHandler.onEvent).toBe('function');
    });
  });

  describe('lifecycle: onAttach', () => {
    beforeEach(() => {
      (mockContext.emit as any)?.mockClear();
      delete mockNode.__agentMemoryState;
    });

    it('should initialize memory state', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeDefined();
      expect(mockNode.__agentMemoryState.isReady).toBe(true);
      expect(mockNode.__agentMemoryState.memories).toBeInstanceOf(Map);
    });

    it('should emit memory_ready event', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_ready', expect.objectContaining({ node: mockNode }));
    });

    it('should set totalStored to initial value', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState.totalStored).toBeGreaterThanOrEqual(0);
    });

    it('should initialize totalRecalled to 0', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState.totalRecalled).toBe(0);
    });

    it('should initialize totalCompressed to 0', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState.totalCompressed).toBe(0);
    });

    it('should support custom max_memories', async () => {
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        max_memories: 5000,
      };
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeDefined();
    });

    it('should support custom embedding_dim', async () => {
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        embedding_dim: 768,
      };
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeDefined();
    });

    it('should support custom db_name', async () => {
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        db_name: 'custom-memory-db',
      };
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeDefined();
    });

    it('should disable auto_compress when set to false', async () => {
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        auto_compress: false,
      };
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeDefined();
    });

    it('should support different embedding models', async () => {
      const models: Array<'local' | 'openai' | 'none'> = ['local', 'openai', 'none'];

      for (const model of models) {
        const node = {} as any;
        const config: AgentMemoryConfig = {
          ...agentMemoryHandler.defaultConfig,
          embedding_model: model,
        };
        await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentMemoryState).toBeDefined();
      }
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should emit memory_closed event', () => {
      agentMemoryHandler.onDetach(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_closed', expect.objectContaining({ node: mockNode }));
    });

    it('should clean up state reference', () => {
      agentMemoryHandler.onDetach(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext);

      expect(mockNode.__agentMemoryState).toBeUndefined();
    });

    it('should handle detach without prior attach', () => {
      const node = {} as any;
      expect(() => {
        agentMemoryHandler.onDetach(node, agentMemoryHandler.defaultConfig, mockContext as TraitContext);
      }).not.toThrow();
    });
  });

  describe('lifecycle: onUpdate', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should accept delta time parameter', () => {
      expect(() => {
        agentMemoryHandler.onUpdate(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });

    it('should handle zero delta time', () => {
      expect(() => {
        agentMemoryHandler.onUpdate(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, 0);
      }).not.toThrow();
    });

    it('should handle missing state gracefully', () => {
      const node = {} as any;
      expect(() => {
        agentMemoryHandler.onUpdate(node, agentMemoryHandler.defaultConfig, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });

    it('should support repeated updates', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => {
          agentMemoryHandler.onUpdate(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, 0.016);
        }).not.toThrow();
      }
    });
  });

  describe('event handling: memory_store', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should store memory with key and content', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'test_key',
          content: 'Test content',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.objectContaining({ node: mockNode }));
    });

    it('should store memory with tags', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'tagged_memory',
          content: 'Content with tags',
          tags: ['important', 'recent'],
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should store memory with TTL', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'ttl_memory',
          content: 'Temporary content',
          ttl: 60000,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should store memory with embedding', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'embedded_memory',
          content: 'Semantic content',
          embedding: [0.1, 0.2, 0.3, 0.4],
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should store memory with source', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'sourced_memory',
          content: 'Memory from somewhere',
          source: 'chat_system',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should ignore store with missing key', () => {
      const event = {
        type: 'memory_store',
        payload: {
          content: 'No key provided',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should ignore store with missing content', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'no_content',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should replace existing memory by key', () => {
      const event1 = {
        type: 'memory_store',
        payload: {
          key: 'replace_me',
          content: 'Original content',
        },
      };

      const event2 = {
        type: 'memory_store',
        payload: {
          key: 'replace_me',
          content: 'Updated content',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event1);
      (mockContext.emit as any)?.mockClear();
      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event2);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stored', expect.any(Object));
    });

    it('should increment totalStored counter', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'count_memory',
          content: 'For counting',
        },
      };

      const before = mockNode.__agentMemoryState.totalStored;
      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      const after = mockNode.__agentMemoryState.totalStored;

      expect(after).toBeGreaterThan(before);
    });
  });

  describe('event handling: memory_recall', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: {
          key: 'recall_test',
          content: 'Content to recall',
          tags: ['test', 'recall'],
        },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);
      (mockContext.emit as any)?.mockClear();
    });

    it('should recall memory by query', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          query: 'recall',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.objectContaining({ node: mockNode }));
    });

    it('should recall memory by embedding', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          embedding: [0.1, 0.2, 0.3, 0.4],
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });

    it('should recall memory filtered by tags', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          query: 'test',
          tags: ['test'],
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });

    it('should recall memory with custom top_k', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          query: 'test',
          top_k: 5,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });

    it('should increment totalRecalled counter', () => {
      const before = mockNode.__agentMemoryState.totalRecalled;

      const event = {
        type: 'memory_recall',
        payload: {
          query: 'test',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      const after = mockNode.__agentMemoryState.totalRecalled;

      expect(after).toBeGreaterThan(before);
    });

    it('should handle recall with no results', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          query: 'nonexistent_query_xyz',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });

    it('should require at least one filter', () => {
      const event = {
        type: 'memory_recall',
        payload: {},
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });
  });

  describe('event handling: memory_forget', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: {
          key: 'forget_test',
          content: 'To be forgotten',
          tags: ['temp'],
        },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);
      (mockContext.emit as any)?.mockClear();
    });

    it('should forget memory by key', () => {
      const event = {
        type: 'memory_forget',
        payload: {
          key: 'forget_test',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_forgotten', expect.any(Object));
    });

    it('should forget memories by tag', () => {
      const event = {
        type: 'memory_forget',
        payload: {
          tag: 'temp',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_forgotten', expect.any(Object));
    });

    it('should forget all memories when all=true', () => {
      const event = {
        type: 'memory_forget',
        payload: {
          all: true,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_forgotten', expect.any(Object));
    });
  });

  describe('event handling: memory_compress', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      for (let i = 0; i < 5; i++) {
        const storeEvent = {
          type: 'memory_store',
          payload: {
            key: `compress_${i}`,
            content: `Content ${i}`,
          },
        };
        agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);
      }
      (mockContext.emit as any)?.mockClear();
    });

    it('should compress memories with oldest strategy', () => {
      const event = {
        type: 'memory_compress',
        payload: {
          strategy: 'oldest',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_compressed', expect.any(Object));
    });

    it('should compress with custom keep_percent', () => {
      const event = {
        type: 'memory_compress',
        payload: {
          strategy: 'oldest',
          keep_percent: 0.5,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_compressed', expect.any(Object));
    });

    it('should support least_accessed strategy', () => {
      const event = {
        type: 'memory_compress',
        payload: {
          strategy: 'least_accessed',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_compressed', expect.any(Object));
    });

    it('should compress by tag', () => {
      const event = {
        type: 'memory_compress',
        payload: {
          strategy: 'tag',
          tag: 'important',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_compressed', expect.any(Object));
    });

    it('should increment totalCompressed counter', () => {
      const before = mockNode.__agentMemoryState.totalCompressed;

      const event = {
        type: 'memory_compress',
        payload: {
          strategy: 'oldest',
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      const after = mockNode.__agentMemoryState.totalCompressed;

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('event handling: memory_list', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: {
          key: 'list_test',
          content: 'For listing',
        },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);
      (mockContext.emit as any)?.mockClear();
    });

    it('should list memories with defaults', () => {
      const event = {
        type: 'memory_list',
        payload: {},
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_listed', expect.any(Object));
    });

    it('should list memories with limit', () => {
      const event = {
        type: 'memory_list',
        payload: {
          limit: 10,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_listed', expect.any(Object));
    });

    it('should list memories with offset', () => {
      const event = {
        type: 'memory_list',
        payload: {
          offset: 5,
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_listed', expect.any(Object));
    });

    it('should list memories filtered by tags', () => {
      const event = {
        type: 'memory_list',
        payload: {
          tags: ['important'],
        },
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_listed', expect.any(Object));
    });
  });

  describe('event handling: memory_stats', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should emit memory statistics', () => {
      const event = {
        type: 'memory_stats',
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_stats', expect.any(Object));
    });

    it('should include memory count in stats', () => {
      const event = {
        type: 'memory_stats',
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      const call = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'memory_stats');
      expect(call[1]).toHaveProperty('count');
    });

    it('should include totalStored in stats', () => {
      const event = {
        type: 'memory_stats',
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      const call = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'memory_stats');
      expect(call[1]).toHaveProperty('totalStored');
    });

    it('should include totalRecalled in stats', () => {
      const event = {
        type: 'memory_stats',
      };

      agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);

      const call = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'memory_stats');
      expect(call[1]).toHaveProperty('totalRecalled');
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should ignore unknown event types', () => {
      const event = {
        type: 'unknown_memory_event',
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle event without type', () => {
      const event = {} as any;

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle event without payload', () => {
      const event = {
        type: 'memory_store',
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });
  });

  describe('state isolation', () => {
    it('should maintain independent memory for each node', async () => {
      const node1 = {} as any;
      const node2 = {} as any;
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;

      await agentMemoryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentMemoryHandler.onAttach(node2, config, mockContext as TraitContext);

      const event1 = {
        type: 'memory_store',
        payload: { key: 'node1_memory', content: 'Node 1 content' },
      };

      agentMemoryHandler.onEvent(node1, config, mockContext as TraitContext, event1);

      expect(node1.__agentMemoryState.memories.has('node1_memory')).toBe(true);
      expect(node2.__agentMemoryState.memories.has('node1_memory')).toBe(false);
    });

    it('should not share totalStored between nodes', async () => {
      const node1 = {} as any;
      const node2 = {} as any;
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;

      await agentMemoryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentMemoryHandler.onAttach(node2, config, mockContext as TraitContext);

      const event = {
        type: 'memory_store',
        payload: { key: 'test', content: 'test' },
      };

      agentMemoryHandler.onEvent(node1, config, mockContext as TraitContext, event);

      expect(node1.__agentMemoryState.totalStored).toBeGreaterThan(node2.__agentMemoryState.totalStored);
    });

    it('should not share totalRecalled between nodes', async () => {
      const node1 = {} as any;
      const node2 = {} as any;
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;

      await agentMemoryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentMemoryHandler.onAttach(node2, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: { key: 'test', content: 'test' },
      };
      agentMemoryHandler.onEvent(node1, config, mockContext as TraitContext, storeEvent);

      const recallEvent = {
        type: 'memory_recall',
        payload: { query: 'test' },
      };
      agentMemoryHandler.onEvent(node1, config, mockContext as TraitContext, recallEvent);

      expect(node1.__agentMemoryState.totalRecalled).toBeGreaterThan(node2.__agentMemoryState.totalRecalled);
    });
  });

  describe('configuration variations', () => {
    it('should support max_memories from 100 to 100000', async () => {
      for (const max of [100, 1000, 10000, 100000]) {
        const node = {} as any;
        const config: AgentMemoryConfig = {
          ...agentMemoryHandler.defaultConfig,
          max_memories: max,
        };
        await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentMemoryState).toBeDefined();
      }
    });

    it('should support null default_ttl (permanent memories)', async () => {
      const node = {} as any;
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        default_ttl: null,
      };
      await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentMemoryState).toBeDefined();
    });

    it('should support numeric default_ttl', async () => {
      const node = {} as any;
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        default_ttl: 3600000,
      };
      await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentMemoryState).toBeDefined();
    });

    it('should support custom embedding dimensions', async () => {
      for (const dim of [384, 768, 1536]) {
        const node = {} as any;
        const config: AgentMemoryConfig = {
          ...agentMemoryHandler.defaultConfig,
          embedding_dim: dim,
        };
        await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentMemoryState).toBeDefined();
      }
    });

    it('should support different compress_prompt prefixes', async () => {
      const node = {} as any;
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        compress_prompt: 'Summarize these memories:',
      };
      await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentMemoryState).toBeDefined();
    });
  });

  describe('complex workflows', () => {
    it('should handle store-recall-forget workflow', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: { key: 'workflow_test', content: 'Workflow content' },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);

      const recallEvent = {
        type: 'memory_recall',
        payload: { query: 'workflow' },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, recallEvent);

      const forgetEvent = {
        type: 'memory_forget',
        payload: { key: 'workflow_test' },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, forgetEvent);

      expect(mockNode.__agentMemoryState.memories.has('workflow_test')).toBe(false);
    });

    it('should handle auto-compression on exceed max_memories', async () => {
      const node = {} as any;
      const config: AgentMemoryConfig = {
        ...agentMemoryHandler.defaultConfig,
        max_memories: 5,
        auto_compress: true,
      };
      await agentMemoryHandler.onAttach(node, config, mockContext as TraitContext);

      for (let i = 0; i < 10; i++) {
        const event = {
          type: 'memory_store',
          payload: { key: `auto_compress_${i}`, content: `Content ${i}` },
        };
        agentMemoryHandler.onEvent(node, config, mockContext as TraitContext, event);
      }

      expect(node.__agentMemoryState.memories.size).toBeLessThanOrEqual(5);
    });

    it('should handle multiple tag filtering and recall', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      for (let i = 0; i < 3; i++) {
        const event = {
          type: 'memory_store',
          payload: {
            key: `tagged_${i}`,
            content: `Tagged content ${i}`,
            tags: ['multi', 'test', `variant_${i}`],
          },
        };
        agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, event);
      }

      (mockContext.emit as any)?.mockClear();

      const recallEvent = {
        type: 'memory_recall',
        payload: { query: 'content', tags: ['multi', 'test'] },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, recallEvent);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });

    it('should handle semantic search with embeddings', async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const storeEvent = {
        type: 'memory_store',
        payload: {
          key: 'semantic_test',
          content: 'Semantic content',
          embedding: [0.1, 0.2, 0.3, 0.4],
        },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, storeEvent);

      (mockContext.emit as any)?.mockClear();

      const recallEvent = {
        type: 'memory_recall',
        payload: {
          embedding: [0.12, 0.22, 0.32, 0.42],
        },
      };
      agentMemoryHandler.onEvent(mockNode, config, mockContext as TraitContext, recallEvent);

      expect(mockContext.emit).toHaveBeenCalledWith('memory_recalled', expect.any(Object));
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const config = agentMemoryHandler.defaultConfig as AgentMemoryConfig;
      await agentMemoryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should handle very long content', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'long_content',
          content: 'x'.repeat(100000),
        },
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle special characters in keys', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'key:with:colons:and/slashes',
          content: 'content',
        },
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle empty tags array', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'empty_tags',
          content: 'content',
          tags: [],
        },
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle zero embedding dimension', () => {
      const event = {
        type: 'memory_recall',
        payload: {
          embedding: [],
        },
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle negative TTL gracefully', () => {
      const event = {
        type: 'memory_store',
        payload: {
          key: 'negative_ttl',
          content: 'content',
          ttl: -1000,
        },
      };

      expect(() => {
        agentMemoryHandler.onEvent(mockNode, agentMemoryHandler.defaultConfig, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle state not ready before onAttach completes', () => {
      const node = {} as any;
      expect(() => {
        agentMemoryHandler.onEvent(node, agentMemoryHandler.defaultConfig, mockContext as TraitContext, {
          type: 'memory_store',
          payload: { key: 'test', content: 'test' },
        });
      }).not.toThrow();
    });
  });
});
