# @holoscript/agent-protocol

**uAA2++ 7-Phase Protocol** — The cognitive lifecycle contract for autonomous agents.

Defines protocol phases, BaseAgent interface, BaseService lifecycle, and PWG (Pattern/Wisdom/Gotcha) knowledge interchange format.

## Quick Start

```ts
import { BaseAgent, ProtocolPhase, PhaseResult } from '@holoscript/agent-protocol';

class MyAgent extends BaseAgent {
  readonly identity = {
    id: 'agent_001',
    name: 'MyAgent',
    domain: 'spatial-reasoning',
    version: '1.0.0',
    capabilities: ['3d-pathfinding', 'object-recognition'],
  };

  async intake(input: unknown): Promise<PhaseResult> {
    // Phase 0: Gather data and context
    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success',
      data: { /* collected context */ },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  // Implement remaining 6 phases: reflect, execute, compress, reintake, grow, evolve
  // ...
}

const agent = new MyAgent();
const result = await agent.runCycle('Analyze spatial layout');
// result.status === 'complete', result.phases.length === 7
```

## 8-Phase Protocol

| Phase | ID | Purpose |
|---|---|---|
| 0. INTAKE | `0` | Gather data and context |
| 1. REFLECT | `1` | Analyze and understand |
| 2. EXECUTE | `2` | Take action |
| 3. COMPRESS | `3` | Store knowledge efficiently |
| 4. REINTAKE | `4` | Re-evaluate with compressed knowledge |
| 5. GROW | `5` | Learn patterns, wisdom, gotchas |
| 6. EVOLVE | `6` | Adapt and optimize |
| 7. AUTONOMIZE | `7` | Self-directed goal synthesis |

## PWG Knowledge Format

```ts
import { Pattern, Wisdom, Gotcha } from '@holoscript/agent-protocol';

const pattern: Pattern = {
  id: 'P.SPATIAL.001',
  domain: 'spatial-reasoning',
  problem: 'Object occlusion in 3D scenes',
  solution: 'Use Z-buffer depth testing and spatial hashing',
  tags: ['3d', 'rendering', 'occlusion'],
  confidence: 0.95,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const wisdom: Wisdom = {
  id: 'W.SPATIAL.042',
  domain: 'spatial-reasoning',
  insight: 'Geospatial coordinates are the only universal anchor across AR/VR/Web',
  context: 'Cross-platform spatial computing',
  source: 'uAA2++ research phase 3',
  tags: ['cross-reality', 'anchors'],
  createdAt: Date.now(),
};

const gotcha: Gotcha = {
  id: 'G.SPATIAL.009',
  domain: 'spatial-reasoning',
  mistake: 'Using Euler angles for quaternion interpolation',
  fix: 'Always use quaternion SLERP for smooth rotation',
  severity: 'high',
  tags: ['quaternions', 'rotation', 'math'],
  createdAt: Date.now(),
};
```

## BaseService Lifecycle

```ts
import { BaseService, ServiceLifecycle, ServiceError } from '@holoscript/agent-protocol';

class MySpatialService extends BaseService {
  constructor() {
    super(
      { name: 'spatial-indexer', version: '1.0.0', description: 'Spatial hash grid service' },
      { timeout: 5000, retries: 2 }
    );
  }

  protected async onInit(): Promise<void> {
    // Initialize resources
  }

  protected async onReady(): Promise<void> {
    // Service is ready to accept requests
  }

  protected async onStop(): Promise<void> {
    // Cleanup resources
  }
}

const service = new MySpatialService();
await service.initialize();
// service.isReady() === true
```

## Goal Synthesizer (Phase 7: AUTONOMIZE)

```ts
import { GoalSynthesizer } from '@holoscript/agent-protocol';

const synthesizer = new GoalSynthesizer();
const goal = synthesizer.synthesize('coding', 'autonomous-boredom');
// goal.description: "Refactor legacy modules in the codebase"
// goal.priority: "low"
// goal.source: "autonomous-boredom"
```

## MicroPhase Decomposer

```ts
import { MicroPhaseDecomposer } from '@holoscript/agent-protocol';

const decomposer = new MicroPhaseDecomposer();

decomposer.registerTask({
  id: 'task_1',
  name: 'Load scene',
  estimatedDuration: 100,
  dependencies: [],
  execute: async () => ({ loaded: true }),
});

decomposer.registerTask({
  id: 'task_2',
  name: 'Process geometry',
  estimatedDuration: 200,
  dependencies: ['task_1'],
  execute: async () => ({ processed: 42 }),
});

const plan = decomposer.createExecutionPlan();
// plan.groups.length === 2 (task_1 in group 0, task_2 in group 1)
// plan.parallelizationRatio: percentage of time saved via parallel execution

const results = await decomposer.executePlan(plan);
// results[0].status === 'success', results[1].status === 'success'
```

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
