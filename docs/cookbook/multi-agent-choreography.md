# Multi-Agent Choreography

Build a synchronized multi-agent dance sequence demonstrating
HoloScript's agent orchestration and trait composition.

## Full Example

```hsplus
// Define the choreography manager
object "ChoreographyDirector" {
  @networked { authority: "server" }
  
  agents: []
  currentBeat: 0
  bpm: 120
  
  function addAgent(agent) {
    this.agents.push(agent)
  }
  
  function onBeat() {
    this.currentBeat += 1
    for (agent in this.agents) {
      agent.emit("beat", { beat: this.currentBeat, bpm: this.bpm })
    }
  }
}

// AI-driven dancer with personality
object "Dancer_Alpha" {
  @avatar_embodiment {
    tracking_source: "ai",
    ik_mode: "full_body",
    personality: {
      expressiveness: 0.9,
      energy: 0.8,
      sociability: 0.7
    }
  }
  @grabbable { physics: true }
  @spatial_audio { radius: 5.0 }
  
  position: { x: -2, y: 0, z: 0 }
  
  on beat(data) {
    // Choose animation based on beat number and personality
    if (data.beat % 4 == 0) {
      this.playAnimation("spin_flourish", { speed: data.bpm / 120 })
    } else if (data.beat % 2 == 0) {
      this.playAnimation("side_step", { mirror: true })
    } else {
      this.playAnimation("head_bob")
    }
  }
}

// Second dancer that mirrors the first
object "Dancer_Beta" {
  @avatar_embodiment {
    tracking_source: "ai",
    ik_mode: "full_body",
    personality: {
      expressiveness: 0.6,
      energy: 0.9,
      warmth: 0.8
    }
  }
  @networked { sync: "position,rotation" }
  
  position: { x: 2, y: 0, z: 0 }
  mirrorTarget: "Dancer_Alpha"
  
  on beat(data) {
    // Mirror the other dancer's position with a 1-beat delay
    let target = scene.find(this.mirrorTarget)
    if (target) {
      this.playAnimation(target.currentAnimation, { mirror: true, delay: 60 / data.bpm })
    }
  }
}

// Wire up the choreography
connect ChoreographyDirector to Dancer_Alpha as "choreography"
connect ChoreographyDirector to Dancer_Beta as "choreography"
```

## Key Concepts

| Concept | Trait/API | Purpose |
|---------|-----------|---------|
| Agent coordination | `@networked` | Sync beat state across clients |
| AI embodiment | `@avatar_embodiment` | Full-body IK with personality |
| Spatial audio | `@spatial_audio` | Position-based sound |
| Event system | `on beat()` | Real-time choreography sync |

## Running

```bash
holoscript run choreography.hsplus --platform webxr --agents 2
```
