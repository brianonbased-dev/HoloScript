# @holoscript/intelligence

> AI intelligence layer — agents, swarm coordination, training, and self-improvement.

## Overview

The intelligence package provides higher-level AI capabilities built on top of `@holoscript/core`, including swarm coordination, training data management, and autonomous self-improvement pipelines.

## Key Components

| Component             | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| **AgentIntelligence** | AI decision-making for spatial agents              |
| **SwarmCoordinator**  | Multi-agent swarm behaviors and coordination       |
| **TrainingPipeline**  | Training data collection and curriculum management |
| **SelfImproveEngine** | Autonomous code evolution and optimization         |

## Usage

```typescript
import { SwarmCoordinator, AgentIntelligence } from '@holoscript/intelligence';

const swarm = new SwarmCoordinator({
  agents: ['guard-1', 'guard-2', 'guard-3'],
  strategy: 'formation',
});

await swarm.coordinate('patrol', { zone: 'TreasureRoom' });
```

## Related

- [`@holoscript/core`](../core/) — Core agent types and registries
- [`@holoscript/agent-sdk`](../agent-sdk/) — Public agent SDK
- [`@holoscript/llm-provider`](../llm-provider/) — LLM adapter layer

## License

MIT
