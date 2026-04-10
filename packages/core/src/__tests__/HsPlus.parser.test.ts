/**
 * .hsplus Parser Tests — Agent Behavior Patterns
 *
 * Coverage:
 *   - @behavior trait patterns
 *   - @state and @reactive objects
 *   - @event and @action handlers
 *   - @networked/@synced trait combinations
 *   - Agent-specific I/O traits (@mqtt_bridge, @sensor, @actuator)
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from '../parser/HoloCompositionParser';

const parser = { parse: parseHolo };

// ============================================================================
// @behavior trait patterns
// ============================================================================

describe('.hsplus – Agent behavior patterns', () => {
  it('parses @behavior trait on object', () => {
    const code = `
composition "AgentDemo" {
  object "SearchAgent" {
    @behavior(type: "patrol")
    geometry: "cube"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
    const obj = result.ast?.objects?.[0];
    expect(obj?.traits?.some((trait) => trait.name === 'behavior')).toBe(true);
  });

  it('parses @behavior with named patrol route', () => {
    const code = `
composition "Patrol" {
  object "Guard" {
    @behavior(type: "patrol", route: "perimeter")
    geometry: "humanoid"
    position: [0, 0, 0]
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @behavior chase with target', () => {
    const code = `
composition "Chase" {
  object "Predator" {
    @behavior(type: "chase", targetTag: "prey")
    @physics(mass: 2)
    geometry: "sphere"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @behavior with fsm (finite state machine) transitions', () => {
    const code = `
composition "FSM" {
  object "NPC" {
    @behavior(
      type: "fsm",
      states: ["idle", "walking", "running", "alert"],
      initial: "idle"
    )
    geometry: "humanoid"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// @state and @reactive objects
// ============================================================================

describe('.hsplus – State management in agents', () => {
  it('parses object with @state properties', () => {
    const code = `
composition "StatefulAgent" {
  object "Agent" {
    @state
    state {
      health: 100
      energy: 50
      isAlive: true
    }
    geometry: "cube"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @reactive trait for automatic recomputation', () => {
    const code = `
composition "ReactiveAgent" {
  object "Agent" {
    @reactive
    @state
    state {
      position: [0, 0, 0]
      direction: [0, 0, 1]
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @observable for state change publication', () => {
    const code = `
composition "ObservableAgent" {
  object "Agent" {
    @observable
    state {
      targetFound: false
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// @event and @action handlers
// ============================================================================

describe('.hsplus – Event and action handlers', () => {
  it('parses @event handlers for agent messages', () => {
    const code = `
composition "EventAgent" {
  logic {
    on_order_received(order) {
      state.currentOrder = order
    }

    on_target_sighted(position) {
      state.targetPos = position
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @action handlers for behavioral execution', () => {
    const code = `
composition "ActionAgent" {
  template "AgentBehavior" {
    @action("move")
    action move(target) {
      this.position = target
      this.state.isMoving = true
    }

    @action("attack")
    action attack(enemy) {
      enemy.state.health -= 10
    }
  }

  object "Agent" using "AgentBehavior" {
    geometry: "humanoid"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// @networked / @synced patterns (agent collaboration)
// ============================================================================

describe('.hsplus – Network sync for multi-agent scenarios', () => {
  it('parses @networked + @synced for agent state replication', () => {
    const code = `
composition "MultiAgentScene" {
  object "NetworkedAgent" {
    @networked
    @synced
    @state
    state {
      position: [0, 0, 0]
      rotation: [0, 0, 0]
      action: "idle"
    }
    geometry: "humanoid"
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @owned trait for ownership-based sync', () => {
    const code = `
composition "OwnedAgent" {
  object "Agent" {
    @networked
    @owned(by: "controller")
    state {
      velocity: [1, 0, 0]
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @replicated for broadcast without ownership', () => {
    const code = `
composition "ReplicatedAgent" {
  object "NPC" {
    @networked
    @replicated
    state {
      animation: "walking"
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// IoT / Sensor traits (agent integration with physical systems)
// ============================================================================

describe('.hsplus – Agent I/O: sensors and actuators', () => {
  it('parses @iot_sensor trait for environment sensing', () => {
    const code = `
composition "SensorAgent" {
  object "TemperatureSensor" {
    @iot_sensor(type: "temperature")
    state {
      reading: 22.5
      unit: "celsius"
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @mqtt_bridge for real-time agent-to-device communication', () => {
    const code = `
composition "MQTTAgent" {
  object "RobotController" {
    @mqtt_bridge(topic: "robot/command")
    @networked
    state {
      command: "stop"
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @actuator for agent output control', () => {
    const code = `
composition "Actuator" {
  object "Motor" {
    @actuator(type: "stepper", pin: 5)
    state {
      position: 0
      speed: 100
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses @digital_twin for bidirectional physical sync', () => {
    const code = `
composition "DigitalTwin" {
  object "RobotTwin" {
    @digital_twin(physical_id: "robot_001")
    @networked
    @synced
    state {
      position: [0, 0, 0]
      jointAngles: [0, 0, 0]
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Complex agent compositions
// ============================================================================

describe('.hsplus – Complex agent compositions', () => {
  it('parses multi-agent scene with behavior composition', () => {
    const code = `
composition "MultiAgentEcosystem" {
  object "Predator" {
    @behavior(type: "hunt")
    @networked
    @state

    state {
      health: 100
      prey: null
    }

    attack(target) {
      target.state.health -= 20
    }
  }

  object "Prey" {
    @behavior(type: "flee")
    @networked
    @reactive
    state {
      health: 50
      threat: null
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });

  it('parses agent with nested state and trait configs', () => {
    const code = `
composition "ComplexAgent" {
  object "Agent" {
    @behavior(type: "utility", considerations: ["health", "ammo", "distance"])
    @state
    @reactive
    @iot_sensor(type: "lidar")
    @mqtt_bridge(topic: "agent/data")
    @networked
    @synced(rate: 20)

    state {
      perception: { range: 50, fov: 120 }
      memory: { enemies: [], items: [] }
      strategy: "aggressive"
    }

    decide() {
      // Agent decision logic
    }
  }
}
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});
