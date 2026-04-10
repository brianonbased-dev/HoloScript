# AI Autonomous Traits

> Part of the HoloScript Traits reference. Browse: [AI & Behavior](/traits/ai-behavior) · [IoT](/traits/iot) · [All Traits](/traits/)

## AI/Autonomous Traits

### @mitosis

**Category:** AI/Sovereignty
**Tags:** mitosis, agent, spawn, delegation

Enables an object or agent to recursively spawn sub-compositions via specialized sub-agents.

```hsplus
object MasterBuilder @mitosis(strategy: "collaborative") {
  onInteraction: {
    mitotic_spawn "lighting" "Create a volumetric scene for this room"
  }
}
```

| Config     | Type   | Default         | Description                            |
| ---------- | ------ | --------------- | -------------------------------------- |
| `strategy` | string | 'collaborative' | 'collaborative', 'autonomous', 'gated' |
| `max_subs` | number | 5               | Maximum allowable sub-compositions     |

**Events:**

- `mitosis_spawned` - Sub-composition successfully loaded
- `mitosis_failed` - Delegation failure
- `mitosis_synced` - Child state merged with parent

```hsplus
object SensorDisplay @mqtt_source {
  broker: 'wss://mqtt.example.com'
  topic: 'sensors/temperature'
}
```

| Config     | Type   | Default | Description         |
| ---------- | ------ | ------- | ------------------- |
| `broker`   | string | ''      | MQTT broker URL     |
| `topic`    | string | ''      | Subscribe topic     |
| `qos`      | number | 0       | QoS level (0, 1, 2) |
| `username` | string | ''      | Auth username       |
| `password` | string | ''      | Auth password       |

**Events:**

- `mqtt_connected` - Connected to broker
- `mqtt_message` - Message received
- `mqtt_disconnected` - Disconnected

---

### @mqtt_sink

MQTT message publishing.

```hsplus
object ControlPanel @mqtt_sink {
  broker: 'wss://mqtt.example.com'
  topic: 'controls/light'
}
```

| Config   | Type    | Default | Description     |
| -------- | ------- | ------- | --------------- |
| `broker` | string  | ''      | MQTT broker URL |
| `topic`  | string  | ''      | Publish topic   |
| `qos`    | number  | 0       | QoS level       |
| `retain` | boolean | false   | Retain messages |

---

### @wot_thing

Web of Things thing description.

```hsplus
object SmartLight @wot_thing {
  thing_id: 'urn:dev:wot:light-001'
  actions: ['toggle', 'dim']
  properties: ['brightness', 'color']
}
```

| Config       | Type   | Default | Description           |
| ------------ | ------ | ------- | --------------------- |
| `thing_id`   | string | ''      | Thing identifier      |
| `td_url`     | string | ''      | Thing Description URL |
| `actions`    | Array  | []      | Available actions     |
| `properties` | Array  | []      | Observable properties |

---

### @digital_twin

Digital twin synchronization.

```hsplus
object FactoryMachine @digital_twin {
  twin_id: 'machine-001'
  sync_interval: 1000
}
```

| Config          | Type    | Default | Description     |
| --------------- | ------- | ------- | --------------- |
| `twin_id`       | string  | ''      | Twin identifier |
| `sync_interval` | number  | 1000    | Sync rate (ms)  |
| `bidirectional` | boolean | false   | Two-way sync    |

**Events:**

- `twin_sync` - State synchronized
- `twin_diverge` - State diverged

---

---

### @hitl

**Human-in-the-Loop** approval gates for autonomous AI actions. Any action your agents want to take can be routed through a human reviewer before execution, with full audit logging and rollback support.

```hsplus
object "AgentSupervisor" @hitl(
  approval_endpoint: "https://my-app.com/api/approve",
  timeout_seconds: 300,
  fallback_on_timeout: "reject"
) { }
```

| Config                 | Type   | Default    | Description                                            |
| ---------------------- | ------ | ---------- | ------------------------------------------------------ |
| `approval_endpoint`    | string | `""`       | **Required.** Webhook URL for approval requests.       |
| `timeout_seconds`      | number | `300`      | Seconds before a pending request is auto-decided.      |
| `fallback_on_timeout`  | string | `"reject"` | `"reject"` or `"approve"` when timeout expires.        |
| `require_reason`       | bool   | `false`    | Require reviewer to provide a reason string.           |
| `max_pending`          | number | `10`       | Max queued requests before new ones are auto-rejected. |
| `audit_log`            | bool   | `true`     | Persist all decisions to the audit log.                |
| `escalation_threshold` | number | `3`        | Auto-escalate after this many consecutive rejections.  |

**Events — Incoming:**

| Event              | Payload                                                   | Description                         |
| ------------------ | --------------------------------------------------------- | ----------------------------------- |
| `request_approval` | `{ action_id, action_type, payload, risk_level?, memo? }` | Queue an action for human review.   |
| `approve_action`   | `{ request_id, reviewer_id?, reason? }`                   | Programmatically approve a request. |
| `reject_action`    | `{ request_id, reviewer_id?, reason? }`                   | Programmatically reject a request.  |
| `rollback_action`  | `{ action_id }`                                           | Undo a previously approved action.  |

**Events — Outgoing:**

| Event                  | Payload                                                     | Description                        |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `approval_pending`     | `{ requestId, actionType, payload, expiresAt }`             | Request queued for review.         |
| `action_approved`      | `{ requestId, actionId, reviewerId?, reason?, executedAt }` | Action approved and executed.      |
| `action_rejected`      | `{ requestId, actionId, reviewerId?, reason? }`             | Action rejected by reviewer.       |
| `action_timed_out`     | `{ requestId, fallbackDecision }`                           | Request expired, fallback applied. |
| `action_rolled_back`   | `{ actionId, requestId }`                                   | Action successfully rolled back.   |
| `escalation_triggered` | `{ consecutiveRejections, escalationLevel }`                | Rejection threshold reached.       |

**Example — gate AI-generated scene changes:**

```hsplus
object "AIBuilder" @mitosis @hitl(
  approval_endpoint: "https://studio.example.com/approve",
  timeout_seconds: 120
) {
  on_spawn_ready(proposal) {
    emit "request_approval" {
      action_id: proposal.id,
      action_type: "scene_modification",
      payload: proposal,
      risk_level: "medium",
      memo: "AI wants to add 3 objects to the scene"
    }
  }
}

logic {
  on_event("action_approved", event) {
    apply_proposal(event.actionId)
  }

  on_event("action_rejected", event) {
    log("Rejected:", event.reason)
  }
}
```

**Risk Levels:** `"low"` (cosmetic), `"medium"` (structural), `"high"` (irreversible), `"critical"` (financial/data).

---

## See Also

- [AI & Behavior Traits](/traits/ai-behavior)
- [MCP Server Integration](/integrations/)
- [API Reference](/api/)
