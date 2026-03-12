# Human-in-the-Loop (HITL) Traits

Human-in-the-Loop traits connect autonomous agent workflows to real humans — capturing feedback, routing decisions for human review, and incorporating biometric signals into scene logic. These traits bridge the gap between fully autonomous AI and human oversight.

---

## Trait Reference

### `@hitl`

Marks an object or action as requiring human confirmation before proceeding. The agent pauses, presents a review request to a designated human reviewer, and resumes only after approval.

```hsplus
object "DeployGate" @hitl {
  geometry: "cube"
  color: "orange"

  hitl: {
    reviewer: "ops-team@example.com"
    timeout_ms: 300_000       // 5 minutes — auto-reject on timeout
    message: "Review before deploying to production"
    urgency: "high"
    escalation: "cto@example.com"
  }

  onGrab: {
    // Pauses here until human approves
    const decision = await hitl.requestApproval({
      context: current_deployment,
      risk_score: agent.risk_assessment()
    })

    if (decision.approved) {
      deploy.toProduction()
    }
  }
}
```

### `@feedback_loop`

Captures structured human feedback on agent outputs and feeds it back into the agent's learning system. Supports thumbs-up/down, ratings, and free-form corrections.

```hsplus
object "AIResponseCard" @feedback_loop {
  geometry: "plane"
  scale: [1, 0.5, 1]

  feedback_loop: {
    modes: ["thumbs", "rating", "correction"]
    agent_id: "scene-generator-v2"
    store_to: "supabase"         // "local" | "supabase" | "s3"
    use_for_finetuning: true
  }

  onFeedback(feedback) {
    agent.recordFeedback(feedback)

    if (feedback.type === "correction") {
      agent.applyCorrection(feedback.correction)
      scene.rebuild()
    }
  }
}
```

### `@biofeedback`

Reads physiological signals from connected wearables (heart rate, EEG, GSR, eye tracking) and uses them as scene inputs. Adapts the experience in real-time based on user state.

```hsplus
composition "AdaptiveTraining" {
  object "StressMonitor" @biofeedback {
    biofeedback: {
      sources: ["heart_rate", "gsr", "eeg_alpha"]
      sampling_rate: 10         // Hz
      providers: ["polar_h10", "muse_2", "shimmer"]
    }

    onBiofeedbackUpdate(reading) {
      if (reading.stress_level > 0.8) {
        scene.setIntensity("calm")
        audio.play("breathing_guide.mp3")
      } else if (reading.stress_level < 0.2) {
        scene.setIntensity("challenge")
      }
    }
  }

  object "FlowDetector" @biofeedback {
    biofeedback: {
      sources: ["eeg_theta", "eeg_alpha"]
    }

    onBiofeedbackUpdate(reading) {
      if (reading.flow_state > 0.7) {
        // User is in flow — increase complexity
        scene.progression.advance()
      }
    }
  }
}
```

---

## HITL Workflow Pattern

```
Agent generates output
         │
         ▼
  @hitl pauses execution
         │
         ▼
  Human receives review request (email / Slack / in-scene UI)
         │
    ┌────┴────────────┐
    ▼                 ▼
 Approved          Rejected
    │                 │
    ▼                 ▼
Agent continues   Agent logs rejection,
                  requests rework
```

---

## Biofeedback Devices

| Device | Signals | Transport |
|--------|---------|-----------|
| Polar H10 | Heart rate, HRV | Bluetooth LE |
| Muse 2 | EEG (alpha, theta, beta) | Bluetooth LE |
| Shimmer3 GSR+ | Galvanic skin response, temperature | Bluetooth/USB |
| Tobii Eye Tracker | Gaze, pupil dilation | USB |
| Meta Quest (built-in) | Eye tracking, face tracking | OpenXR ET ext |

---

## Use Cases

| Domain | Trait | How |
|--------|-------|-----|
| **Medical training** | `@biofeedback` | Adapt simulation difficulty to trainee stress/engagement |
| **AI safety** | `@hitl` | Human confirmation before AI deploys changes |
| **Research** | `@feedback_loop` | Capture expert corrections to fine-tune models |
| **Accessibility** | `@biofeedback` | Detect fatigue and reduce cognitive load automatically |
| **Enterprise AI** | `@hitl` | Compliance gate for AI-generated decisions |

---

## Related

- [AI Behavior Traits](./ai-behavior)
- [AI Autonomous Traits](./ai-autonomous)
- [Agent Framework](../agents/)
- [uAA2++ Protocol](../agents/uaa2-protocol)
