/**
 * Agent Registry Module Tests
 * Sprint 4 Priority 1 - Agent Registry & Discovery
 *
 * Tests for AgentRegistry, AgentManifest, and CapabilityMatcher.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentRegistry,
  DEFAULT_REGISTRY_CONFIG,
  getDefaultRegistry,
  resetDefaultRegistry,
} from '../AgentRegistry';
import {
  createManifest,
  validateManifest,
  AgentManifest,
  AgentManifestBuilder,
  AgentCapability,
  AgentEndpoint,
} from '../AgentManifest';
import { CapabilityMatcher, CapabilityQuery, AgentMatch } from '../CapabilityMatcher';
import { PHASE_ORDER, DEFAULT_PHASE_TIMINGS, AgentPhase } from '../AgentTypes';

// Helper to create test manifests quickly
function createTestManifest(
  id: string,
  capabilities: Array<{ type: string; domain: string }> = [{ type: 'analyze', domain: 'general' }],
  options: Partial<AgentManifest> = {}
): AgentManifest {
  return {
    id,
    name: options.name || `Test Agent ${id}`,
    version: options.version || '1.0.0',
    capabilities: capabilities.map((c, i) => ({
      type: c.type,
      domain: c.domain,
      id: `${id}-cap-${i}`,
      name: `Capability ${i}`,
    })) as AgentCapability[],
    endpoints: options.endpoints || [{ protocol: 'local' as const, address: 'internal' }],
    trustLevel: options.trustLevel || 'local',
    status: options.status || 'online',
    ...options,
  };
}

// =============================================================================
// AGENT TYPES TESTS
// =============================================================================

describe('AgentTypes', () => {
  describe('PHASE_ORDER', () => {
    it('should have 7 phases', () => {
      expect(PHASE_ORDER).toHaveLength(7);
    });

    it('should start with INTAKE', () => {
      expect(PHASE_ORDER[0]).toBe('INTAKE');
    });

    it('should end with EVOLVE', () => {
      expect(PHASE_ORDER[6]).toBe('EVOLVE');
    });

    it('should have correct phase sequence', () => {
      expect(PHASE_ORDER).toEqual([
        'INTAKE',
        'REFLECT',
        'EXECUTE',
        'COMPRESS',
        'REINTAKE',
        'GROW',
        'EVOLVE',
      ]);
    });
  });

  describe('DEFAULT_PHASE_TIMINGS', () => {
    it('should have timings for all phases', () => {
      for (const phase of PHASE_ORDER) {
        expect(DEFAULT_PHASE_TIMINGS[phase]).toBeGreaterThan(0);
      }
    });

    it('should have reasonable timing values', () => {
      expect(DEFAULT_PHASE_TIMINGS.INTAKE).toBeLessThanOrEqual(5000);
      expect(DEFAULT_PHASE_TIMINGS.EXECUTE).toBeGreaterThanOrEqual(1000);
    });
  });
});

// =============================================================================
// AGENT MANIFEST TESTS
// =============================================================================

describe('AgentManifest', () => {
  describe('AgentManifestBuilder', () => {
    it('should create a builder', () => {
      const builder = createManifest();
      expect(builder).toBeInstanceOf(AgentManifestBuilder);
    });

    it('should build a valid manifest with fluent API', () => {
      const manifest = createManifest()
        .identity('test-agent', 'Test Agent', '1.0.0')
        .description('A test agent')
        .addCapability({
          type: 'analyze',
          domain: 'general',
          id: 'cap-1',
          name: 'Test Capability',
        })
        .addEndpoint({
          protocol: 'local',
          address: 'internal',
        })
        .trust('local')
        .build();

      expect(manifest.id).toBe('test-agent');
      expect(manifest.name).toBe('Test Agent');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.capabilities).toHaveLength(1);
      expect(manifest.endpoints).toHaveLength(1);
    });

    it('should throw when building without id', () => {
      expect(() => {
        createManifest()
          .addCapability({ type: 'analyze', domain: 'general' })
          .addEndpoint({ protocol: 'local', address: 'local' })
          .build();
      }).toThrow();
    });

    it('should throw when building without capabilities', () => {
      expect(() => {
        createManifest()
          .identity('agent', 'Agent', '1.0.0')
          .addEndpoint({ protocol: 'local', address: 'local' })
          .build();
      }).toThrow();
    });

    it('should throw when building without endpoints', () => {
      expect(() => {
        createManifest()
          .identity('agent', 'Agent', '1.0.0')
          .addCapability({ type: 'analyze', domain: 'general' })
          .build();
      }).toThrow();
    });

    it('should add multiple capabilities', () => {
      const manifest = createManifest()
        .identity('multi', 'Multi', '1.0.0')
        .addCapabilities([
          { type: 'analyze', domain: 'general' },
          { type: 'generate', domain: 'nlp' },
        ])
        .addEndpoint({ protocol: 'local', address: 'local' })
        .build();

      expect(manifest.capabilities).toHaveLength(2);
    });

    it('should add tags', () => {
      const manifest = createManifest()
        .identity('tagged', 'Tagged', '1.0.0')
        .addCapability({ type: 'analyze', domain: 'general' })
        .addEndpoint({ protocol: 'local', address: 'local' })
        .tags('ml', 'python')
        .build();

      expect(manifest.tags).toContain('ml');
      expect(manifest.tags).toContain('python');
    });
  });

  describe('validateManifest', () => {
    it('should validate valid manifest', () => {
      const manifest = createTestManifest('valid-agent');
      const result = validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest without id', () => {
      const manifest = {
        name: 'No ID Agent',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'general' }],
        endpoints: [{ protocol: 'local', address: 'local' }],
      } as unknown as AgentManifest;

      const result = validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('id'))).toBe(true);
    });

    it('should reject manifest without capabilities', () => {
      const manifest = {
        id: 'agent',
        name: 'Agent',
        version: '1.0.0',
        capabilities: [],
        endpoints: [{ protocol: 'local', address: 'local' }],
      } as unknown as AgentManifest;

      const result = validateManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should reject manifest without endpoints', () => {
      const manifest = {
        id: 'agent',
        name: 'Agent',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'general' }],
        endpoints: [],
      } as unknown as AgentManifest;

      const result = validateManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should validate capabilities have type and domain', () => {
      const manifest = {
        id: 'agent',
        name: 'Agent',
        version: '1.0.0',
        capabilities: [{ id: 'test' }], // Missing type and domain
        endpoints: [{ protocol: 'local', address: 'local' }],
      } as unknown as AgentManifest;

      const result = validateManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should validate endpoints have protocol and address', () => {
      const manifest = {
        id: 'agent',
        name: 'Agent',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'general' }],
        endpoints: [{ port: 8080 }], // Missing protocol and address
      } as unknown as AgentManifest;

      const result = validateManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should generate warnings for missing description', () => {
      const manifest = createTestManifest('no-desc');
      delete manifest.description;

      const result = validateManifest(manifest);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.toLowerCase().includes('description'))).toBe(true);
    });
  });
});

// =============================================================================
// CAPABILITY MATCHER TESTS
// =============================================================================

describe('CapabilityMatcher', () => {
  let matcher: CapabilityMatcher;
  let manifests: AgentManifest[];

  beforeEach(() => {
    matcher = new CapabilityMatcher();
    manifests = [];
  });

  describe('Capability Matching', () => {
    it('should match capability by type', () => {
      const capability: AgentCapability = {
        type: 'analyze',
        domain: 'general',
        id: 'cap-1',
      };

      const query: CapabilityQuery = { type: 'analyze' };
      const match = matcher.matchCapability(capability, query);

      expect(match).not.toBeNull();
      expect(match?.matchedCriteria).toContain('type');
    });

    it('should match capability by domain', () => {
      const capability: AgentCapability = {
        type: 'generate',
        domain: 'nlp',
        id: 'cap-1',
      };

      const query: CapabilityQuery = { domain: 'nlp' };
      const match = matcher.matchCapability(capability, query);

      expect(match).not.toBeNull();
      expect(match?.matchedCriteria).toContain('domain');
    });

    it('should return null for non-matching type', () => {
      const capability: AgentCapability = {
        type: 'analyze',
        domain: 'general',
      };

      const query: CapabilityQuery = { type: 'generate' };
      const match = matcher.matchCapability(capability, query);

      expect(match).toBeNull();
    });

    it('should return null for unavailable capability', () => {
      const capability: AgentCapability = {
        type: 'analyze',
        domain: 'general',
        available: false,
      };

      const query: CapabilityQuery = { type: 'analyze' };
      const match = matcher.matchCapability(capability, query);

      expect(match).toBeNull();
    });
  });

  describe('Agent Matching', () => {
    beforeEach(() => {
      manifests = [
        createTestManifest('coder', [
          { type: 'generate', domain: 'general' },
          { type: 'analyze', domain: 'general' },
        ]),
        createTestManifest('analyst', [
          { type: 'analyze', domain: 'general' },
          { type: 'render', domain: 'general' },
        ]),
        createTestManifest('ml-agent', [
          { type: 'analyze', domain: 'vision' },
          { type: 'detect', domain: 'vision' },
        ]),
      ];
    });

    it('should match agent by capability type', () => {
      const query: CapabilityQuery = { type: 'generate' };
      const match = matcher.matchAgent(manifests[0], query);

      expect(match).not.toBeNull();
      expect(match?.manifest.id).toBe('coder');
    });

    it('should return null for offline agents', () => {
      const offlineManifest = createTestManifest('offline', [], { status: 'offline' });
      const query: CapabilityQuery = { type: 'analyze' };
      const match = matcher.matchAgent(offlineManifest, query);

      expect(match).toBeNull();
    });

    it('should include offline agents with includeOffline', () => {
      const offlineManifest = createTestManifest(
        'offline',
        [{ type: 'analyze', domain: 'general' }],
        { status: 'offline' }
      );
      const query: CapabilityQuery = { type: 'analyze', includeOffline: true };
      const match = matcher.matchAgent(offlineManifest, query);

      expect(match).not.toBeNull();
    });

    it('should filter by min trust level', () => {
      const externalManifest = createTestManifest(
        'external',
        [{ type: 'analyze', domain: 'general' }],
        { trustLevel: 'external' }
      );
      const query: CapabilityQuery = { minTrust: 'verified' };
      const match = matcher.matchAgent(externalManifest, query);

      expect(match).toBeNull();
    });

    it('should match with tags filter', () => {
      const taggedManifest = createTestManifest(
        'tagged',
        [{ type: 'analyze', domain: 'general' }],
        { tags: ['ml', 'python'] }
      );
      const query: CapabilityQuery = { tags: ['ml'] };
      const match = matcher.matchAgent(taggedManifest, query);

      expect(match).not.toBeNull();
    });
  });

  describe('findMatches', () => {
    beforeEach(() => {
      manifests = [
        createTestManifest('agent-1', [{ type: 'analyze', domain: 'general' }]),
        createTestManifest('agent-2', [{ type: 'generate', domain: 'nlp' }]),
        createTestManifest('agent-3', [{ type: 'analyze', domain: 'vision' }]),
      ];
    });

    it('should find all matching agents', () => {
      const query: CapabilityQuery = { type: 'analyze' };
      const matches = matcher.findMatches(manifests, query);

      expect(matches).toHaveLength(2);
    });

    it('should return empty array when no matches', () => {
      const query: CapabilityQuery = { type: 'orchestrate' };
      const matches = matcher.findMatches(manifests, query);

      expect(matches).toHaveLength(0);
    });

    it('should return matches with scores', () => {
      const query: CapabilityQuery = { type: 'analyze' };
      const matches = matcher.findMatches(manifests, query);

      for (const match of matches) {
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('findBest', () => {
    beforeEach(() => {
      manifests = [
        createTestManifest('agent-a', [{ type: 'analyze', domain: 'general' }], {}),
        createTestManifest('agent-b', [{ type: 'analyze', domain: 'vision' }], {}),
      ];
    });

    it('should return a matching agent', () => {
      const query: CapabilityQuery = { type: 'analyze' };
      const best = matcher.findBest(manifests, query);

      expect(best).not.toBeNull();
      expect(best?.manifest.id).toMatch(/agent-[ab]/);
    });

    it('should respect limit of 1', () => {
      const query: CapabilityQuery = { type: 'analyze' };
      const best = matcher.findBest(manifests, query);

      // Should only return one match
      expect(best).not.toBeNull();
    });

    it('should return null when no matches', () => {
      const query: CapabilityQuery = { type: 'quantum' };
      const best = matcher.findBest(manifests, query);

      expect(best).toBeNull();
    });

    it('should sort by name when specified', () => {
      const query: CapabilityQuery = { type: 'analyze', sortBy: 'name', sortOrder: 'asc' };
      const best = matcher.findBest(manifests, query);

      expect(best).not.toBeNull();
      // agent-a comes before agent-b alphabetically
      expect(best?.manifest.id).toBe('agent-a');
    });
  });
});

// =============================================================================
// AGENT REGISTRY TESTS
// =============================================================================

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry({
      autoCleanup: false, // Disable timers for testing
    });
  });

  afterEach(() => {
    registry.stop();
    registry.clear();
  });

  describe('Configuration', () => {
    it('should use default config', () => {
      const reg = new AgentRegistry();
      expect(reg).toBeDefined();
      reg.stop();
    });

    it('should accept custom config', () => {
      const reg = new AgentRegistry({
        maxAgents: 50,
        defaultTTL: 10000,
      });
      expect(reg).toBeDefined();
      reg.stop();
    });

    it('should have default registry config values', () => {
      expect(DEFAULT_REGISTRY_CONFIG).toBeDefined();
      expect(DEFAULT_REGISTRY_CONFIG.maxAgents).toBeGreaterThan(0);
    });
  });

  describe('Registration', () => {
    it('should register an agent', async () => {
      const manifest = createTestManifest('test-agent', [{ type: 'analyze', domain: 'general' }]);

      await registry.register(manifest);

      expect(registry.has('test-agent')).toBe(true);
    });

    it('should emit agent:registered event', async () => {
      const listener = vi.fn();
      registry.on('agent:registered', listener);

      const manifest = createTestManifest('event-agent', [{ type: 'analyze', domain: 'general' }]);

      await registry.register(manifest);

      expect(listener).toHaveBeenCalled();
    });

    it('should throw for invalid manifest', async () => {
      const invalid = {
        name: 'No ID',
        version: '1.0.0',
      } as unknown as AgentManifest;

      await expect(registry.register(invalid)).rejects.toThrow();
    });

    it('should update existing agent on re-register', async () => {
      const manifest = createTestManifest('update-agent', [{ type: 'analyze', domain: 'general' }]);

      await registry.register(manifest);

      // Update with new capability
      const updated = createTestManifest('update-agent', [
        { type: 'analyze', domain: 'general' },
        { type: 'generate', domain: 'nlp' },
      ]);

      const listener = vi.fn();
      registry.on('agent:updated', listener);

      await registry.register(updated);

      expect(listener).toHaveBeenCalled();
    });

    it('should enforce max agents limit', async () => {
      const smallRegistry = new AgentRegistry({
        maxAgents: 2,
        autoCleanup: false,
      });

      await smallRegistry.register(
        createTestManifest('agent-1', [{ type: 'analyze', domain: 'general' }])
      );

      await smallRegistry.register(
        createTestManifest('agent-2', [{ type: 'analyze', domain: 'general' }])
      );

      await expect(
        smallRegistry.register(
          createTestManifest('agent-3', [{ type: 'analyze', domain: 'general' }])
        )
      ).rejects.toThrow(/full|maximum/i);

      smallRegistry.stop();
    });
  });

  describe('Deregistration', () => {
    it('should deregister an agent', async () => {
      const manifest = createTestManifest('to-remove', [{ type: 'analyze', domain: 'general' }]);

      await registry.register(manifest);
      await registry.deregister('to-remove');

      expect(registry.has('to-remove')).toBe(false);
    });

    it('should emit agent:deregistered event', async () => {
      const listener = vi.fn();
      registry.on('agent:deregistered', listener);

      const manifest = createTestManifest('deregister-event', [
        { type: 'analyze', domain: 'general' },
      ]);

      await registry.register(manifest);
      await registry.deregister('deregister-event');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Discovery', () => {
    beforeEach(async () => {
      await registry.register(
        createTestManifest('dev-agent', [
          { type: 'generate', domain: 'general' },
          { type: 'analyze', domain: 'general' },
        ])
      );

      await registry.register(
        createTestManifest('ops-agent', [
          { type: 'orchestrate', domain: 'general' },
          { type: 'validate', domain: 'general' },
        ])
      );
    });

    it('should get agent by id', () => {
      const agent = registry.get('dev-agent');

      expect(agent).toBeDefined();
      expect(agent?.name).toContain('dev-agent');
    });

    it('should return undefined for non-existent agent', () => {
      const agent = registry.get('ghost');
      expect(agent).toBeUndefined();
    });

    it('should list all agents', () => {
      const agents = registry.getAllManifests();

      expect(agents).toHaveLength(2);
    });

    it('should discover agents by capability type', async () => {
      const matches = await registry.discover({
        type: 'generate',
      });

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].id).toBe('dev-agent');
    });

    it('should find best agent for query', async () => {
      const best = await registry.findBest({
        type: 'orchestrate',
      });

      expect(best).not.toBeNull();
      expect(best?.id).toBe('ops-agent');
    });
  });

  describe('Heartbeat', () => {
    it('should accept heartbeat from registered agent', async () => {
      await registry.register(
        createTestManifest('heartbeat-agent', [{ type: 'analyze', domain: 'general' }])
      );

      await expect(registry.heartbeat('heartbeat-agent')).resolves.not.toThrow();
    });

    it('should throw for heartbeat from unknown agent', async () => {
      await expect(registry.heartbeat('unknown')).rejects.toThrow();
    });

    it('should update agent status to online', async () => {
      await registry.register(
        createTestManifest('status-agent', [{ type: 'analyze', domain: 'general' }], {
          status: 'offline',
        })
      );

      await registry.heartbeat('status-agent');

      const agent = registry.get('status-agent');
      expect(agent?.status).toBe('online');
    });
  });

  describe('Stats & Status', () => {
    it('should get agent count', async () => {
      await registry.register(
        createTestManifest('stat-agent', [{ type: 'analyze', domain: 'general' }])
      );

      expect(registry.size).toBe(1);
    });

    it('should get status counts', async () => {
      await registry.register(
        createTestManifest('online-agent', [{ type: 'analyze', domain: 'general' }])
      );

      const counts = registry.getStatusCounts();

      expect(counts.online).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop', () => {
      const reg = new AgentRegistry();
      reg.start();
      expect(reg).toBeDefined();
      reg.stop();
    });

    it('should clear all agents', async () => {
      await registry.register(
        createTestManifest('to-clear', [{ type: 'analyze', domain: 'general' }])
      );

      registry.clear();

      expect(registry.size).toBe(0);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Agent Module Integration', () => {
  it('should support full agent lifecycle', async () => {
    const registry = new AgentRegistry({ autoCleanup: false });

    // 1. Create and register agent
    const manifest = createTestManifest('lifecycle-agent', [
      { type: 'generate', domain: 'general' },
      { type: 'analyze', domain: 'general' },
    ]);

    await registry.register(manifest);
    expect(registry.has('lifecycle-agent')).toBe(true);

    // 2. Discover agent
    const found = registry.get('lifecycle-agent');
    expect(found).toBeDefined();

    // 3. Query by capability
    const matches = await registry.discover({ type: 'generate' });
    expect(matches.some((m) => m.id === 'lifecycle-agent')).toBe(true);

    // 4. Send heartbeat
    await expect(registry.heartbeat('lifecycle-agent')).resolves.not.toThrow();

    // 5. Deregister
    await registry.deregister('lifecycle-agent');
    expect(registry.has('lifecycle-agent')).toBe(false);

    registry.stop();
  });

  it('should match agents for complex queries', async () => {
    const registry = new AgentRegistry({ autoCleanup: false });

    // Register diverse agents
    await registry.register(
      createTestManifest('specialist', [
        { type: 'analyze', domain: 'vision' },
        { type: 'detect', domain: 'vision' },
      ])
    );

    await registry.register(
      createTestManifest('generalist', [
        { type: 'analyze', domain: 'general' },
        { type: 'generate', domain: 'nlp' },
      ])
    );

    await registry.register(
      createTestManifest('devops', [
        { type: 'orchestrate', domain: 'general' },
        { type: 'validate', domain: 'general' },
      ])
    );

    // Query by domain
    const visionAgents = await registry.discover({ domain: 'vision' });
    expect(visionAgents.length).toBe(1);
    expect(visionAgents[0].id).toBe('specialist');

    // Query by type across domains
    const analyzeAgents = await registry.discover({ type: 'analyze' });
    expect(analyzeAgents.length).toBe(2);

    registry.stop();
  });

  it('should work with manifest builder', async () => {
    const registry = new AgentRegistry({ autoCleanup: false });

    const manifest = createManifest()
      .identity('built-agent', 'Built Agent', '1.0.0')
      .description('An agent built with the builder')
      .addCapability({
        type: 'generate',
        domain: 'nlp',
        id: 'gen-nlp',
        name: 'NLP Generation',
      })
      .addEndpoint({
        protocol: 'local',
        address: 'internal',
        primary: true,
      })
      .trust('local')
      .tags('test', 'builder')
      .build();

    await registry.register(manifest);

    const found = registry.get('built-agent');
    expect(found).toBeDefined();
    expect(found?.tags).toContain('builder');

    registry.stop();
  });

  it('should validate and reject invalid manifests', async () => {
    const registry = new AgentRegistry({ autoCleanup: false });

    // Missing required fields
    const invalid = {
      name: 'Invalid Agent',
      version: '1.0.0',
    } as unknown as AgentManifest;

    const validation = validateManifest(invalid);
    expect(validation.valid).toBe(false);

    await expect(registry.register(invalid)).rejects.toThrow();

    registry.stop();
  });
});
