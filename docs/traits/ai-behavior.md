# AI & Behavior Traits

> Part of the HoloScript Traits reference. Browse: [Interaction](/traits/interaction) · [AI Autonomous](/traits/ai-autonomous) · [All Traits](/traits/)

## AI/Behavior Traits

### @llm_agent

**Category:** AI
**Tags:** llm, agent, processing, autonomy, brain

LLM-powered decision-making with tool calling.

```hsplus
object NPC @llm_agent(model: 'gpt-4', temperature: 0.7) {
  system_prompt: "You are a helpful shopkeeper..."
  tools: ['get_inventory', 'sell_item', 'buy_item']
}
```

| Config                  | Type    | Default | Description                |
| ----------------------- | ------- | ------- | -------------------------- |
| `model`                 | string  | 'gpt-4' | LLM model identifier       |
| `system_prompt`         | string  | ''      | System message             |
| `temperature`           | number  | 0.7     | Creativity (0-1)           |
| `context_window`        | number  | 8192    | Max tokens                 |
| `tools`                 | Array   | []      | Available tool definitions |
| `max_actions_per_turn`  | number  | 3       | Action limit per turn      |
| `bounded_autonomy`      | boolean | true    | Limit autonomous actions   |
| `escalation_conditions` | Array   | []      | When to escalate           |
| `rate_limit_ms`         | number  | 1000    | Min time between requests  |

**State:**

- `conversationHistory` - Message history
- `isProcessing` - Currently processing
- `pendingToolCalls` - Pending tool invocations

**Events:**

- `llm_message` - Message received
- `llm_response` - Response generated
- `llm_tool_call` - Tool invoked
- `llm_escalate` - Escalation triggered

---

### @behavior_tree

**Category:** AI
**Tags:** bt, logic, decision, npc, state

Behavior tree AI with node-based logic.

```hsplus
object Guard @behavior_tree {
  root: sequence [
    condition 'can_see_player',
    action 'chase_player',
    action 'attack'
  ]
}
```

| Config                         | Type    | Default | Description         |
| ------------------------------ | ------- | ------- | ------------------- |
| `tick_rate`                    | number  | 10      | Updates per second  |
| `debug_mode`                   | boolean | false   | Show node execution |
| `interrupt_on_higher_priority` | boolean | true    | Priority interrupts |

**Events:**

- `bt_node_enter` - Node started
- `bt_node_success` - Node succeeded
- `bt_node_failure` - Node failed
- `bt_tree_complete` - Full tree evaluated

---

### @goal_oriented

Goal-oriented action planning (GOAP).

```hsplus
object Worker @goal_oriented {
  goals: ['gather_resources', 'build_shelter']
  actions: ['chop_wood', 'mine_stone', 'craft']
}
```

| Config            | Type   | Default | Description               |
| ----------------- | ------ | ------- | ------------------------- |
| `planning_depth`  | number | 5       | Max action chain length   |
| `replan_interval` | number | 1000    | Replanning frequency (ms) |

**Events:**

- `goal_selected` - New goal chosen
- `goal_achieved` - Goal completed
- `action_started` - Action begun
- `action_completed` - Action finished

---

### @perception

**Category:** AI
**Tags:** vision, hearing, sense, detection, npc

Sensory perception with line-of-sight and detection.

```hsplus
object Sentry @perception(view_angle: 90, view_distance: 20) {
  detect_tags: ['player', 'enemy']
}
```

| Config            | Type   | Default | Description               |
| ----------------- | ------ | ------- | ------------------------- |
| `view_angle`      | number | 120     | Field of view (degrees)   |
| `view_distance`   | number | 10      | Max sight distance        |
| `hearing_radius`  | number | 5       | Sound detection radius    |
| `memory_duration` | number | 5000    | How long to remember (ms) |

**State:**

- `visibleTargets` - Currently visible entities
- `heardSounds` - Recent sounds detected
- `memory` - Remembered but not visible

**Events:**

- `perception_spotted` - Target spotted
- `perception_lost` - Target lost
- `perception_heard` - Sound detected

---

### @emotion

Emotional state machine with expressions.

```hsplus
object Pet @emotion {
  emotions: ['happy', 'sad', 'angry', 'neutral']
  default_emotion: 'neutral'
}
```

| Config                  | Type   | Default | Description            |
| ----------------------- | ------ | ------- | ---------------------- |
| `decay_rate`            | number | 0.1     | How fast emotions fade |
| `expression_blend_time` | number | 500     | Blend duration (ms)    |

**State:**

- `currentEmotion` - Active emotion
- `emotionIntensity` - Intensity (0-1)
- `emotionHistory` - Recent emotions

**Events:**

- `emotion_changed` - Emotion transitioned
- `emotion_triggered` - Emotion stimulus received

---

### @memory

Long-term memory and recall for NPCs.

```hsplus
object Historian @memory(capacity: 100, consolidation_interval: 60000) {
  memory_types: ['events', 'conversations', 'locations']
}
```

| Config                   | Type   | Default | Description            |
| ------------------------ | ------ | ------- | ---------------------- |
| `capacity`               | number | 100     | Max memories stored    |
| `consolidation_interval` | number | 60000   | Memory cleanup (ms)    |
| `importance_threshold`   | number | 0.3     | Min importance to keep |

**Events:**

- `memory_store` - Memory saved
- `memory_recall` - Memory retrieved
- `memory_forget` - Memory discarded

---


## See Also
- [AI Autonomous Traits](/traits/ai-autonomous)
- [MCP Server Integration](/integrations/)
- [API Reference](/api/)
