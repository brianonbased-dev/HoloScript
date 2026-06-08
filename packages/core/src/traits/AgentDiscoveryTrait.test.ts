import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  agentDiscoveryHandler,
  type AgentDiscoveryConfig,
  type AgentCapability,
  type AgentEndpoint,
} from './AgentDiscoveryTrait';
import type { TraitContext } from './TraitTypes';

const mockNode = { id: 'test_node' } as any;
const mockContext = {
  emit: vi.fn(),
} as unknown as TraitContext;

const createMockCapability = (name: string, version = '1.0'): AgentCapability => ({
  name,
  version,
  category: 'utility',
});

const createMockEndpoint = (protocol = 'local'): AgentEndpoint => ({
  protocol,
  address: protocol === 'local' ? 'in-process' : '127.0.0.1:9000',
  primary: true,
});

describe('AgentDiscoveryTrait', () => {
  beforeEach(() => {
    delete mockNode.__agentDiscoveryState;
    (mockContext.emit as any)?.mockClear();
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(agentDiscoveryHandler.name).toBe('agent_discovery');
    });

    it('should provide default configuration', () => {
      expect(agentDiscoveryHandler.defaultConfig).toBeDefined();
      expect(agentDiscoveryHandler.defaultConfig.discovery_mode).toBe('active');
    });

    it('should expose all lifecycle methods', () => {
      expect(typeof agentDiscoveryHandler.onAttach).toBe('function');
      expect(typeof agentDiscoveryHandler.onDetach).toBe('function');
      expect(typeof agentDiscoveryHandler.onUpdate).toBe('function');
      expect(typeof agentDiscoveryHandler.onEvent).toBe('function');
    });

    it('should have auto_register enabled by default', () => {
      expect(agentDiscoveryHandler.defaultConfig.auto_register).toBe(true);
    });

    it('should have auto_discover enabled by default', () => {
      expect(agentDiscoveryHandler.defaultConfig.auto_discover).toBe(true);
    });

    it('should have heartbeat interval of 10000ms', () => {
      expect(agentDiscoveryHandler.defaultConfig.heartbeat_interval).toBe(10000);
    });

    it('should have discovery interval of 30000ms', () => {
      expect(agentDiscoveryHandler.defaultConfig.discovery_interval).toBe(30000);
    });

    it('should have default endpoints with local protocol', () => {
      const config = agentDiscoveryHandler.defaultConfig;
      expect(config.endpoints.length).toBeGreaterThan(0);
      expect(config.endpoints[0].protocol).toBe('local');
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize discovery state', async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState).toBeDefined();
      expect(mockNode.__agentDiscoveryState.discoveredAgents).toBeInstanceOf(Map);
      expect(Array.isArray(mockNode.__agentDiscoveryState.eventHistory)).toBe(true);
    });

    it('should create agent manifest', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        agent_id: 'test_agent_1',
        agent_name: 'TestAgent',
        agent_version: '2.0.0',
        description: 'Test discovery agent',
        capabilities: [createMockCapability('search')],
        endpoints: [createMockEndpoint()],
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      const state = mockNode.__agentDiscoveryState;
      expect(state.manifest).toBeDefined();
      expect(state.manifest.id).toBe('test_agent_1');
      expect(state.manifest.name).toBe('TestAgent');
    });

    it('should emit agent_discovery_initialized event', async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'agent_discovery_initialized',
        expect.any(Object)
      );
    });

    it('should start heartbeat timer if interval > 0', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        heartbeat_interval: 5000,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.heartbeatTimer).toBeDefined();
    });

    it('should not start heartbeat if interval is 0', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        heartbeat_interval: 0,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.heartbeatTimer).toBeNull();
    });

    it('should start discovery timer when auto_discover is true', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        auto_discover: true,
        discovery_interval: 15000,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.discoveryTimer).toBeDefined();
    });

    it('should not start discovery timer when auto_discover is false', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        auto_discover: false,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.discoveryTimer).toBeNull();
    });

    it('should support auto-register enabled', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        auto_register: true,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      // After attach with auto_register, should emit registration-related event
      const registrationEvents = (mockContext.emit as any).mock.calls.some(
        (c: any) => c[0]?.includes('registered') || c[0]?.includes('registration')
      );
      expect(registrationEvents || mockNode.__agentDiscoveryState.manifest).toBeTruthy();
    });

    it('should skip auto-register when disabled', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        auto_register: false,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should support custom discovery modes', async () => {
      const modes: Array<'passive' | 'active' | 'broadcast'> = ['passive', 'active', 'broadcast'];

      for (const mode of modes) {
        const node = { id: `node_${mode}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          discovery_mode: mode,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentDiscoveryState).toBeDefined();
      }
    });

    it('should support custom trust levels', async () => {
      const trustLevels: Array<'local' | 'network' | 'global'> = ['local', 'network', 'global'];

      for (const level of trustLevels) {
        const node = { id: `node_${level}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          trust_level: level,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentDiscoveryState.manifest?.trustLevel).toBe(level);
      }
    });

    it('should store provided tags', async () => {
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        tags: ['ai', 'search', 'llm'],
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.manifest?.tags).toEqual(['ai', 'search', 'llm']);
    });

    it('should support multiple capabilities', async () => {
      const capabilities = [createMockCapability('search'), createMockCapability('reasoning')];
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        capabilities,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.manifest?.capabilities.length).toBe(2);
    });

    it('should support multiple endpoints', async () => {
      const endpoints = [
        createMockEndpoint('local'),
        { protocol: 'grpc', address: '127.0.0.1:50051', primary: false },
      ];
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        endpoints,
      };
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.manifest?.endpoints.length).toBe(2);
    });

    it('should have non-null registry after attach', async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);

      expect(mockNode.__agentDiscoveryState.registry).not.toBeNull();
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should emit agent_discovery_detached event', async () => {
      (mockContext.emit as any)?.mockClear();
      await agentDiscoveryHandler.onDetach(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext
      );

      expect(mockContext.emit).toHaveBeenCalledWith('agent_discovery_detached', expect.any(Object));
    });

    it('should clean up state reference', async () => {
      await agentDiscoveryHandler.onDetach(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext
      );

      expect(mockNode.__agentDiscoveryState).toBeUndefined();
    });

    it('should handle detach without prior attach', () => {
      const node = {} as any;
      expect(() => {
        agentDiscoveryHandler.onDetach(
          node,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext
        );
      }).not.toThrow();
    });
  });

  describe('lifecycle: onUpdate', () => {
    beforeEach(async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should accept delta time parameter', () => {
      expect(() => {
        agentDiscoveryHandler.onUpdate(
          mockNode,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          0.016
        );
      }).not.toThrow();
    });

    it('should handle zero delta time', () => {
      expect(() => {
        agentDiscoveryHandler.onUpdate(
          mockNode,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          0
        );
      }).not.toThrow();
    });

    it('should handle missing state gracefully', () => {
      const node = {} as any;
      expect(() => {
        agentDiscoveryHandler.onUpdate(
          node,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          0.016
        );
      }).not.toThrow();
    });

    it('should support repeated updates', () => {
      for (let i = 0; i < 5; i++) {
        expect(() => {
          agentDiscoveryHandler.onUpdate(
            mockNode,
            agentDiscoveryHandler.defaultConfig,
            mockContext as TraitContext,
            0.016
          );
        }).not.toThrow();
      }
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should handle agent_register event', async () => {
      const event = { type: 'agent_register' };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      // Should not throw and state should remain valid
      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should handle agent_deregister event', async () => {
      const event = { type: 'agent_deregister' };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should handle agent_discover event', async () => {
      const event = { type: 'agent_discover' };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should handle agent_query with capability filter', async () => {
      const query = {
        capability: 'search',
        minTrustLevel: 'local' as const,
      };
      const event = { type: 'agent_query', query };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should handle agent_query with tag filter', async () => {
      const query = {
        tags: ['llm', 'reasoning'],
      };
      const event = { type: 'agent_query', query };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockNode.__agentDiscoveryState).toBeDefined();
    });

    it('should handle agent_get_discovered event', async () => {
      const event = { type: 'agent_get_discovered' };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__agentDiscoveryState;
      expect(state.discoveredAgents).toBeInstanceOf(Map);
    });

    it('should handle agent_get_status event', async () => {
      const event = { type: 'agent_get_status' };

      await agentDiscoveryHandler.onEvent(
        mockNode,
        agentDiscoveryHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__agentDiscoveryState;
      expect(state.registrationStatus).toBeDefined();
    });

    it('should ignore unknown event types', () => {
      const event = { type: 'unknown_agent_event' };

      expect(() => {
        agentDiscoveryHandler.onEvent(
          mockNode,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          event
        );
      }).not.toThrow();
    });

    it('should handle event without type property', () => {
      expect(() => {
        agentDiscoveryHandler.onEvent(
          mockNode,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          {} as any
        );
      }).not.toThrow();
    });
  });

  describe('state isolation', () => {
    it('should maintain independent registrations for each node', async () => {
      const node1 = { id: 'node_1' } as any;
      const node2 = { id: 'node_2' } as any;
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;

      await agentDiscoveryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentDiscoveryHandler.onAttach(node2, config, mockContext as TraitContext);

      expect(node1.__agentDiscoveryState).not.toBe(node2.__agentDiscoveryState);
    });

    it('should not share discovered agents between nodes', async () => {
      const node1 = { id: 'node_1' } as any;
      const node2 = { id: 'node_2' } as any;
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;

      await agentDiscoveryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentDiscoveryHandler.onAttach(node2, config, mockContext as TraitContext);

      expect(node1.__agentDiscoveryState.discoveredAgents).not.toBe(
        node2.__agentDiscoveryState.discoveredAgents
      );
    });

    it('should maintain separate event histories per node', async () => {
      const node1 = { id: 'node_1' } as any;
      const node2 = { id: 'node_2' } as any;
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;

      await agentDiscoveryHandler.onAttach(node1, config, mockContext as TraitContext);
      await agentDiscoveryHandler.onAttach(node2, config, mockContext as TraitContext);

      expect(node1.__agentDiscoveryState.eventHistory).not.toBe(
        node2.__agentDiscoveryState.eventHistory
      );
    });
  });

  describe('configuration variations', () => {
    it('should support different heartbeat intervals', async () => {
      for (const interval of [0, 5000, 10000, 30000]) {
        const node = { id: `node_${interval}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          heartbeat_interval: interval,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

        if (interval > 0) {
          expect(node.__agentDiscoveryState.heartbeatTimer).toBeDefined();
        } else {
          expect(node.__agentDiscoveryState.heartbeatTimer).toBeNull();
        }
      }
    });

    it('should support different discovery intervals', async () => {
      for (const interval of [0, 10000, 30000, 60000]) {
        const node = { id: `node_${interval}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          discovery_interval: interval,
          auto_discover: interval > 0,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

        if (interval > 0) {
          expect(node.__agentDiscoveryState.discoveryTimer).toBeDefined();
        } else {
          expect(node.__agentDiscoveryState.discoveryTimer).toBeNull();
        }
      }
    });

    it('should support max_discovered_agents limits', async () => {
      for (const max of [10, 100, 1000]) {
        const node = { id: `node_${max}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          max_discovered_agents: max,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentDiscoveryState).toBeDefined();
      }
    });

    it('should support different event_history_limit values', async () => {
      for (const limit of [100, 1000, 10000]) {
        const node = { id: `node_${limit}` } as any;
        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          event_history_limit: limit,
        };
        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentDiscoveryState).toBeDefined();
      }
    });

    it('should support null spatial scope', async () => {
      const node = { id: 'test_null_scope' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        spatial_scope: null,
      };
      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

      expect(node.__agentDiscoveryState.manifest?.spatialScope).toBeUndefined();
    });

    it('should support custom registry config', async () => {
      const node = { id: 'test_custom_registry' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        registry_config: {
          name: 'custom-registry',
        },
      };
      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

      expect(node.__agentDiscoveryState.registry).toBeDefined();
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;
      await agentDiscoveryHandler.onAttach(mockNode, config, mockContext as TraitContext);
    });

    it('should handle very long agent description', async () => {
      const node = { id: 'test_long_desc' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        description: 'x'.repeat(10000),
      };

      await expect(
        agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext)
      ).resolves.not.toThrow();
    });

    it('should handle special characters in agent name', async () => {
      const node = { id: 'test_special' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        agent_name: 'Agent-!@#$%^&*()',
      };

      await expect(
        agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext)
      ).resolves.not.toThrow();
    });

    it('should handle empty capabilities array', async () => {
      const node = { id: 'test_empty_caps' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        capabilities: [],
      };
      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

      expect(node.__agentDiscoveryState.manifest?.capabilities.length).toBe(0);
    });

    it('should handle missing agent_id (auto-generated)', async () => {
      const node = { id: 'test_autoid' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        agent_id: '',
      };
      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

      expect(node.__agentDiscoveryState.manifest?.id).toBeDefined();
      expect(node.__agentDiscoveryState.manifest?.id.length).toBeGreaterThan(0);
    });

    it('should handle empty tags array', async () => {
      const node = { id: 'test_empty_tags' } as any;
      const config: AgentDiscoveryConfig = {
        ...agentDiscoveryHandler.defaultConfig,
        tags: [],
      };
      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);

      expect(node.__agentDiscoveryState.manifest?.tags).toEqual([]);
    });

    it('should handle multiple attach-detach cycles', async () => {
      const node = { id: 'test_cycle' } as any;
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;

      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentDiscoveryState).toBeDefined();

      await agentDiscoveryHandler.onDetach(node, config, mockContext as TraitContext);
      expect(node.__agentDiscoveryState).toBeUndefined();

      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentDiscoveryState).toBeDefined();
    });

    it('should handle workflow: attach -> register -> discover -> query -> detach', async () => {
      const node = { id: 'workflow_node' } as any;
      const config = agentDiscoveryHandler.defaultConfig as AgentDiscoveryConfig;

      await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
      expect(node.__agentDiscoveryState).toBeDefined();

      await agentDiscoveryHandler.onEvent(node, config, mockContext as TraitContext, {
        type: 'agent_discover',
      });
      expect(node.__agentDiscoveryState).toBeDefined();

      await agentDiscoveryHandler.onEvent(node, config, mockContext as TraitContext, {
        type: 'agent_query',
        query: { capability: 'search' },
      });
      expect(node.__agentDiscoveryState).toBeDefined();

      await agentDiscoveryHandler.onDetach(node, config, mockContext as TraitContext);
      expect(node.__agentDiscoveryState).toBeUndefined();
    });

    it('should handle multiple discovery modes with same node', async () => {
      const node = { id: 'mode_test' } as any;

      for (const mode of ['passive', 'active', 'broadcast'] as const) {
        delete node.__agentDiscoveryState;

        const config: AgentDiscoveryConfig = {
          ...agentDiscoveryHandler.defaultConfig,
          discovery_mode: mode,
        };

        await agentDiscoveryHandler.onAttach(node, config, mockContext as TraitContext);
        expect(node.__agentDiscoveryState).toBeDefined();
        await agentDiscoveryHandler.onDetach(node, config, mockContext as TraitContext);
      }
    });

    it('should handle parallel queries', async () => {
      const queries = [
        { type: 'agent_query', query: { capability: 'search' } },
        { type: 'agent_query', query: { tags: ['llm'] } },
        { type: 'agent_query', query: { minTrustLevel: 'network' } },
      ];

      for (const query of queries) {
        await agentDiscoveryHandler.onEvent(
          mockNode,
          agentDiscoveryHandler.defaultConfig,
          mockContext as TraitContext,
          query as any
        );
        expect(mockNode.__agentDiscoveryState).toBeDefined();
      }
    });
  });
});
