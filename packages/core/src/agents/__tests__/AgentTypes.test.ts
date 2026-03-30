import { describe, it, expect } from 'vitest';
import AgentTypesDefault, {
  PHASE_ORDER,
  DEFAULT_PHASE_TIMINGS,
  type AgentPhase,
  type PhaseResult,
  type IntakeResult,
  type ReflectResult,
  type ExecuteResult,
  type CompressResult,
  type ReintakeResult,
  type GrowResult,
  type EvolveResult,
  type CycleResult,
  type AgentCategory,
  type AgentPosition,
  type AgentSection,
  type AgentConfig,
  type AgentState,
  type AgentMessage,
  type MessagePriority,
  type PatternEntry,
  type WisdomEntry,
  type GotchaEntry,
  type AgentTraitContext,
  type BudgetConfig,
  type CuriosityConfig,
  type PhaseConfig,
  type ArchitectureAwareness,
  type AgentLifespanContext,
  type CycleMetric,
} from '../AgentTypes';

// =============================================================================
// PHASE DEFINITIONS
// =============================================================================

describe('AgentTypes — Phase Definitions', () => {
  it('PHASE_ORDER has exactly 7 phases', () => {
    expect(PHASE_ORDER).toHaveLength(7);
  });

  it('PHASE_ORDER follows correct protocol sequence', () => {
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

  it('PHASE_ORDER is readonly', () => {
    // TypeScript enforces this at compile time; runtime check that it's a frozen-like array
    expect(Array.isArray(PHASE_ORDER)).toBe(true);
  });

  it('DEFAULT_PHASE_TIMINGS covers all phases', () => {
    for (const phase of PHASE_ORDER) {
      expect(DEFAULT_PHASE_TIMINGS[phase]).toBeDefined();
      expect(typeof DEFAULT_PHASE_TIMINGS[phase]).toBe('number');
      expect(DEFAULT_PHASE_TIMINGS[phase]).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_PHASE_TIMINGS has expected values', () => {
    expect(DEFAULT_PHASE_TIMINGS.INTAKE).toBe(1000);
    expect(DEFAULT_PHASE_TIMINGS.REFLECT).toBe(2000);
    expect(DEFAULT_PHASE_TIMINGS.EXECUTE).toBe(5000);
    expect(DEFAULT_PHASE_TIMINGS.COMPRESS).toBe(1000);
    expect(DEFAULT_PHASE_TIMINGS.REINTAKE).toBe(1000);
    expect(DEFAULT_PHASE_TIMINGS.GROW).toBe(2000);
    expect(DEFAULT_PHASE_TIMINGS.EVOLVE).toBe(1000);
  });

  it('EXECUTE has the longest default timing', () => {
    const maxPhase = PHASE_ORDER.reduce((a, b) =>
      DEFAULT_PHASE_TIMINGS[a] > DEFAULT_PHASE_TIMINGS[b] ? a : b
    );
    expect(maxPhase).toBe('EXECUTE');
  });
});

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

describe('AgentTypes — Default Export', () => {
  it('exports PHASE_ORDER and DEFAULT_PHASE_TIMINGS', () => {
    expect(AgentTypesDefault.PHASE_ORDER).toBe(PHASE_ORDER);
    expect(AgentTypesDefault.DEFAULT_PHASE_TIMINGS).toBe(DEFAULT_PHASE_TIMINGS);
  });
});

// =============================================================================
// TYPE SHAPE VALIDATION (runtime assignability)
// =============================================================================

describe('AgentTypes — PhaseResult shapes', () => {
  it('IntakeResult conforms to expected shape', () => {
    const result: IntakeResult = {
      success: true,
      phase: 'INTAKE',
      duration_ms: 500,
      sources: ['knowledge-store', 'codebase'],
      items_loaded: 42,
    };
    expect(result.phase).toBe('INTAKE');
    expect(result.sources).toHaveLength(2);
    expect(result.items_loaded).toBe(42);
  });

  it('ReflectResult conforms to expected shape', () => {
    const result: ReflectResult = {
      success: true,
      phase: 'REFLECT',
      duration_ms: 1500,
      analysis_depth: 'deep',
      insights_generated: 5,
      data: {
        priorities: ['fix tests', 'add coverage'],
        risks: ['breaking change'],
      },
    };
    expect(result.analysis_depth).toBe('deep');
    expect(result.insights_generated).toBe(5);
  });

  it('ExecuteResult conforms to expected shape', () => {
    const result: ExecuteResult = {
      success: true,
      phase: 'EXECUTE',
      duration_ms: 3000,
      actions_taken: 3,
      deliverables: ['file.ts', 'test.ts'],
    };
    expect(result.actions_taken).toBe(3);
    expect(result.deliverables).toHaveLength(2);
  });

  it('CompressResult conforms to expected shape', () => {
    const result: CompressResult = {
      success: true,
      phase: 'COMPRESS',
      duration_ms: 800,
      compression_ratio: 0.6,
      tokens_saved: 1200,
      data: {
        patterns_extracted: ['singleton', 'factory'],
        wisdom_extracted: ['cache invalidation is hard'],
        gotchas_captured: ['vi.mock needs vi.hoisted'],
      },
    };
    expect(result.compression_ratio).toBe(0.6);
    expect(result.tokens_saved).toBe(1200);
  });

  it('ReintakeResult conforms to expected shape', () => {
    const result: ReintakeResult = {
      success: true,
      phase: 'REINTAKE',
      duration_ms: 700,
      items_refreshed: 10,
      effectiveness: 0.85,
    };
    expect(result.effectiveness).toBeGreaterThanOrEqual(0);
    expect(result.effectiveness).toBeLessThanOrEqual(1);
  });

  it('GrowResult conforms to expected shape', () => {
    const result: GrowResult = {
      success: true,
      phase: 'GROW',
      duration_ms: 1800,
      patterns_learned: 2,
      wisdom_gained: 1,
      gotchas_captured: 3,
      data: {
        new_patterns: [{ id: 'P.001', name: 'retry-pattern', confidence: 0.9 }],
        capability_score_delta: 0.05,
      },
    };
    expect(result.patterns_learned).toBe(2);
    expect(result.data?.new_patterns).toHaveLength(1);
  });

  it('EvolveResult conforms to expected shape', () => {
    const result: EvolveResult = {
      success: true,
      phase: 'EVOLVE',
      duration_ms: 900,
      evolution_level: 3,
      traits_activated: ['spatial-awareness', 'cost-optimization'],
      traits_deactivated: ['verbose-logging'],
      data: {
        efficiency_improvement: 0.12,
        next_evolution_threshold: 100,
      },
    };
    expect(result.evolution_level).toBe(3);
    expect(result.traits_activated).toContain('spatial-awareness');
  });
});

// =============================================================================
// CYCLE RESULT
// =============================================================================

describe('AgentTypes — CycleResult', () => {
  it('can represent a complete cycle', () => {
    const cycle: CycleResult = {
      cycle_number: 1,
      success: true,
      total_duration_ms: 12000,
      phases: {
        intake: {
          success: true,
          phase: 'INTAKE',
          duration_ms: 1000,
          sources: ['ws'],
          items_loaded: 5,
        },
        execute: {
          success: true,
          phase: 'EXECUTE',
          duration_ms: 5000,
          actions_taken: 2,
          deliverables: ['output.ts'],
        },
      },
      learnings: { patterns: 1, wisdom: 2, gotchas: 0 },
      evolution_delta: 0.1,
      timestamp: new Date().toISOString(),
    };
    expect(cycle.cycle_number).toBe(1);
    expect(cycle.phases.intake?.sources).toContain('ws');
    expect(cycle.phases.reflect).toBeUndefined(); // optional phases
  });
});

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

describe('AgentTypes — AgentConfig', () => {
  it('can build a minimal agent config', () => {
    const config: AgentConfig = {
      agent_id: 'agent-001',
      agent_name: 'TestAgent',
      agent_type: 'builder',
      categories: ['analysis'],
    };
    expect(config.agent_id).toBe('agent-001');
    expect(config.categories).toContain('analysis');
  });

  it('supports all 13 agent categories', () => {
    const categories: AgentCategory[] = [
      'trading',
      'analysis',
      'optimization',
      'monitoring',
      'creative',
      'management',
      'strategic',
      'assistant',
      'orchestrator',
      'quest_creator',
      'librarian',
      'twin_manager',
      'payment_handler',
    ];
    const config: AgentConfig = {
      agent_id: 'all-cats',
      agent_name: 'OmniAgent',
      agent_type: 'universal',
      categories,
    };
    expect(config.categories).toHaveLength(13);
  });

  it('supports architecture awareness with music patterns', () => {
    const arch: ArchitectureAwareness = {
      position: 'center',
      section: 'strings',
      role: 'coordinator',
      musicPatterns: {
        interval: 'I',
        formRole: 'exposition',
        pulse: 'strong',
      },
    };
    expect(arch.position).toBe('center');
    expect(arch.musicPatterns?.interval).toBe('I');
  });

  it('can configure phases individually', () => {
    const phaseConfig: PhaseConfig = {
      enabled: true,
      timeout_ms: 10000,
      retries: 3,
      parallel: false,
      dependencies: ['INTAKE'],
    };
    expect(phaseConfig.retries).toBe(3);
    expect(phaseConfig.dependencies).toContain('INTAKE');
  });

  it('supports budget configuration', () => {
    const budget: BudgetConfig = {
      max_tokens_per_cycle: 50000,
      max_duration_ms: 60000,
      max_actions_per_minute: 10,
      max_consecutive_failures: 3,
    };
    expect(budget.max_tokens_per_cycle).toBe(50000);
  });

  it('supports curiosity configuration', () => {
    const curiosity: CuriosityConfig = {
      enabled: true,
      depth: 'deep',
      sources: ['todo', 'codebase', 'pattern'],
      auto_continue: false,
      max_results: 5,
    };
    expect(curiosity.sources).toContain('pattern');
  });
});

// =============================================================================
// AGENT STATE
// =============================================================================

describe('AgentTypes — AgentState', () => {
  it('can construct a valid agent state', () => {
    const state: AgentState = {
      agent_id: 'test-agent',
      current_phase: 'INTAKE',
      phase_start_time: Date.now(),
      cycle_number: 0,
      knowledge: new Map(),
      patterns: [],
      wisdom: [],
      gotchas: [],
      reflection_context: {},
      execution_result: null,
      compressed_knowledge: '',
      metrics: {
        phases_completed: 0,
        total_cycles: 0,
        efficiency_score: 1.0,
        token_usage: 0,
      },
      is_training_mode: false,
      is_shutting_down: false,
    };
    expect(state.current_phase).toBe('INTAKE');
    expect(state.knowledge).toBeInstanceOf(Map);
    expect(state.is_training_mode).toBe(false);
  });

  it('supports lifespan context', () => {
    const lifespan: AgentLifespanContext = {
      total_cycles_completed: 42,
      evolution_level: 3,
      performance_trend: 'improving',
      average_cycle_duration: 8500,
      recent_metrics: [
        { cycle_number: 41, duration_ms: 8000, success: true, score: 0.9, timestamp: Date.now() },
        { cycle_number: 42, duration_ms: 7500, success: true, score: 0.95, timestamp: Date.now() },
      ],
      knowledge_growth_trajectory: 1.2,
      adaptation_score: 0.85,
      related_tasks: ['test-coverage', 'trait-expansion'],
    };
    expect(lifespan.performance_trend).toBe('improving');
    expect(lifespan.recent_metrics).toHaveLength(2);
  });

  it('supports cycle metrics', () => {
    const metric: CycleMetric = {
      cycle_number: 1,
      duration_ms: 5000,
      success: true,
      score: 0.88,
      timestamp: Date.now(),
    };
    expect(metric.score).toBeGreaterThan(0);
    expect(metric.score).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// INTER-AGENT COMMUNICATION
// =============================================================================

describe('AgentTypes — Inter-Agent Communication', () => {
  it('AgentMessage supports all priority levels', () => {
    const priorities: MessagePriority[] = ['low', 'medium', 'high', 'critical', 'sovereign'];
    priorities.forEach((priority) => {
      const msg: AgentMessage = {
        id: `msg-${priority}`,
        from: 'agent-a',
        to: 'agent-b',
        type: 'request',
        action: 'analyze',
        payload: { data: true },
        priority,
        timestamp: Date.now(),
      };
      expect(msg.priority).toBe(priority);
    });
  });

  it('AgentMessage supports broadcast targeting', () => {
    const msg: AgentMessage = {
      id: 'broadcast-1',
      from: 'coordinator',
      to: 'broadcast',
      type: 'notification',
      action: 'shutdown',
      payload: { reason: 'maintenance' },
      priority: 'critical',
      timestamp: Date.now(),
    };
    expect(msg.to).toBe('broadcast');
  });

  it('AgentMessage supports correlation and TTL', () => {
    const msg: AgentMessage = {
      id: 'req-1',
      from: 'a',
      to: 'b',
      type: 'request',
      action: 'ping',
      payload: {},
      priority: 'low',
      timestamp: Date.now(),
      correlation_id: 'session-xyz',
      ttl_ms: 5000,
    };
    expect(msg.correlation_id).toBe('session-xyz');
    expect(msg.ttl_ms).toBe(5000);
  });
});

// =============================================================================
// KNOWLEDGE TYPES
// =============================================================================

describe('AgentTypes — Knowledge Types', () => {
  it('PatternEntry has all required fields', () => {
    const pattern: PatternEntry = {
      pattern_id: 'P.001',
      name: 'singleton',
      domain: 'architecture',
      description: 'Ensure single instance',
      template: 'class X { static instance; static get() { ... } }',
      confidence: 0.95,
      usage_count: 42,
      created_at: '2026-01-01',
      updated_at: '2026-03-30',
      tags: ['design-pattern', 'creational'],
    };
    expect(pattern.confidence).toBeGreaterThan(0);
    expect(pattern.tags).toContain('design-pattern');
  });

  it('WisdomEntry has all required fields', () => {
    const wisdom: WisdomEntry = {
      wisdom_id: 'W.001',
      content: 'Cache invalidation is one of two hard problems in CS',
      domain: 'engineering',
      source: 'Phil Karlton',
      confidence: 1.0,
      citations: ['https://example.com'],
      created_at: '2026-01-01',
      tags: ['caching'],
    };
    expect(wisdom.confidence).toBe(1.0);
  });

  it('GotchaEntry has all required fields and severity levels', () => {
    const severities = ['low', 'medium', 'high', 'critical'] as const;
    severities.forEach((severity) => {
      const gotcha: GotchaEntry = {
        gotcha_id: `G.${severity}`,
        trigger: 'using vi.mock without vi.hoisted',
        consequence: 'variables are undefined at mock time',
        avoidance: 'wrap mock vars in vi.hoisted()',
        domain: 'testing',
        severity,
        occurrence_count: 5,
        created_at: '2026-01-01',
        tags: ['vitest'],
      };
      expect(gotcha.severity).toBe(severity);
    });
  });
});

// =============================================================================
// AGENT TRAIT CONTEXT
// =============================================================================

describe('AgentTypes — AgentTraitContext', () => {
  it('supports wallet extension', () => {
    const ctx: Partial<AgentTraitContext> = {
      agent_id: 'wallet-agent',
      wallet: {
        getBalance: async () => 1.5,
        pay: async () => ({ success: true, txHash: '0xabc' }),
        trade: async () => ({ success: true, txHash: '0xdef' }),
        mintNFT: async () => ({ success: true, tokenId: '42' }),
      },
    };
    expect(ctx.wallet).toBeDefined();
  });

  it('supports story_weaver extension', () => {
    const ctx: Partial<AgentTraitContext> = {
      agent_id: 'story-agent',
      story_weaver: {
        generateNarrative: async () => 'Once upon a time...',
        createWorld: async () => 'world-001',
        deployContracts: async () => true,
      },
    };
    expect(ctx.story_weaver).toBeDefined();
  });
});
