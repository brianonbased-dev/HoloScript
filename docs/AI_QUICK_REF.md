# 🤖 AI Agent Quick Reference Card

**One-page cheat sheet for AI agents working with HoloScript**

---

## Core AI Trait

```holo
object "Agent" {
  @llm_agent(
    model: "gpt-4-turbo",
    system_prompt: "You are...",
    bounded_autonomy: true,
    max_actions_per_turn: 3
  )
}
```

---

## Key Events

| Event            | When           | Track For           |
| ---------------- | -------------- | ------------------- |
| `llm_request`    | API call start | Usage, costs        |
| `llm_response`   | Got response   | Quality, tokens     |
| `llm_tool_call`  | Tool invoked   | Tool usage          |
| `llm_escalation` | Need help      | Errors, uncertainty |

---

## uAA2++ Phases

```
INTAKE → REFLECT → EXECUTE → COMPRESS → REINTAKE → GROW → EVOLVE
  1s       2s         5s         1s          1s       2s      1s
```

Track: `phase_complete` event for each phase

---

## CometML Integration

```typescript
// Init
const experiment = new Experiment({
  apiKey: process.env.COMET_API_KEY,
  projectName: 'holoscript-agents',
});

// Track LLM
trait.onEvent = (node, config, ctx, event) => {
  if (event.type === 'llm_response') {
    experiment.logMetric('tokens', event.tokens_used);
  }
};
```

---

## Perplexity Tracking

```typescript
if (event.type === 'llm_response') {
  const perplexity = calculatePerplexity(event.content);
  experiment.logMetric('perplexity', perplexity);

  if (perplexity > 50) {
    console.warn('High perplexity!');
  }
}
```

---

## Agent Registry

```typescript
import { AgentRegistry } from '@holoscript/core/agents';

const registry = new AgentRegistry();

await registry.register({
  id: 'my_agent',
  capabilities: [{ type: 'analyze', domain: 'spatial' }],
});

const agents = await registry.discover({
  type: 'analyze',
});
```

---

## Essential Metrics

```typescript
interface AgentMetrics {
  llm_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  avg_perplexity: number;
  escalation_rate: number;
  cycles_completed: number;
  avg_compression_ratio: number;
}
```

---

## File Locations

| What           | Where                                                  |
| -------------- | ------------------------------------------------------ |
| LLMAgentTrait  | `packages/core/src/traits/LLMAgentTrait.ts`            |
| uAA2++ Types   | `packages/core/src/agents/AgentTypes.ts`               |
| Agent Registry | `packages/core/src/agents/AgentRegistry.ts`            |
| Choreography   | `packages/core/src/choreography/ChoreographyEngine.ts` |

---

## Full Docs

📖 [AI Traits Reference](./AI_TRAITS_REFERENCE.md) - Complete guide
📖 [Agent API Reference](./AGENT_API_REFERENCE.md) - All APIs
📖 [Traits Reference](./TRAITS_REFERENCE.md) - All 1,800+ traits

---

**Built for AI agents, by AI agents** 🤖✨
