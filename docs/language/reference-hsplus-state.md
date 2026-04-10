# State & Actions Reference (`.hsplus`)

Complete reference for state management, actions, computed values, and reactive systems in `.hsplus` format.

## State Block

Declare reactive state variables:

```holoscript
composition "Game" {
  state {
    score: 0
    playerHealth: 100
    isGameActive: false
    position: { x: 0, y: 0, z: 0 }
    inventory: []
  }
}
```

## Actions Block

Define functions that modify state:

```holoscript
composition "Game" {
  state {
    score: 0
    health: 100
  }

  actions {
    incrementScore(points) {
      state.score += points;
      console.log("Score:", state.score);
    }

    takeDamage(amount) {
      state.health -= amount;

      if (state.health <= 0) {
        this.gameOver();
      }
    }

    gameOver() {
      console.log("Game Over! Final score:", state.score);
    }
  }
}
```

## Computed Values

Derive values from state:

```holoscript
composition "Game" {
  state {
    playerHealth: 100
  }

  computed {
    healthPercent: () => {
      return (state.playerHealth / 100) * 100;
    }

    isPlayerAlive: () => {
      return state.playerHealth > 0;
    }
  }
}
```

## Watchers

React to state changes:

```holoscript
composition "Game" {
  state {
    playerHealth: 100
    score: 0
  }

  watch {
    playerHealth: (newValue, oldValue) => {
      console.log("Health changed from", oldValue, "to", newValue);

      if (newValue < 25 && oldValue >= 25) {
        console.log("WARNING: Low health!");
      }
    }

    // Watch with options
    score: {
      immediate: true,
      handler: (score) => {
        console.log("Current score:", score);
      }
    }
  }
}
```

## Reactive UI Bindings

Bind UI to state:

```holoscript
composition "Game" {
  state {
    score: 0
    health: 100
  }

  object "ScoreDisplay" {
    type: "ui"
    uiType: "text"
    position: { x: 10, y: 10 }

    bind: {
      text: "`Score: ${state.score}`"
    }
  }

  object "HealthBar" {
    type: "ui"
    uiType: "progressBar"
    position: { x: 10, y: 40 }

    bind: {
      value: "state.health",
      max: 100,
      color: "state.health < 25 ? '#ff0000' : '#00ff00'"
    }
  }
}
```

## Local Object State

Objects can have their own state:

```holoscript
template "Enemy" {
  state {
    health: 50
    isAlive: true
  }

  actions {
    takeDamage(amount) {
      this.state.health -= amount;

      if (this.state.health <= 0) {
        this.die();
      }
    }

    die() {
      this.state.isAlive = false;
      this.destroy();
    }
  }

  geometry: "box"
  color: "red"
}
```

## State Persistence

```holoscript
composition "Game" {
  state {
    score: 0
    inventory: []
  }

  persist {
    include: ["score", "inventory"]
    storage: "localStorage"
    key: "game_save"
    autoSave: true
    autoSaveInterval: 30000  // 30 seconds
  }
}
```

## Complete Example

```holoscript
composition "TargetPractice" {
  state {
    score: 0
    timeRemaining: 60.0
    isGameActive: false
    hits: 0
    misses: 0
  }

  computed {
    accuracy: () => {
      const total = state.hits + state.misses;
      if (total === 0) return 0;
      return ((state.hits / total) * 100).toFixed(1);
    }

    timeFormatted: () => {
      const minutes = Math.floor(state.timeRemaining / 60);
      const seconds = Math.floor(state.timeRemaining % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  actions {
    startGame() {
      state.isGameActive = true;
      state.score = 0;
      state.timeRemaining = 60.0;
      state.hits = 0;
      state.misses = 0;
    }

    hitTarget(points) {
      if (!state.isGameActive) return;

      state.score += points;
      state.hits += 1;
    }

    missedShot() {
      if (!state.isGameActive) return;
      state.misses += 1;
    }

    updateTimer(deltaTime) {
      if (!state.isGameActive) return;

      state.timeRemaining -= deltaTime;

      if (state.timeRemaining <= 0) {
        state.timeRemaining = 0;
        this.endGame();
      }
    }

    endGame() {
      state.isGameActive = false;
      console.log("Game Over! Score:", state.score);
      console.log("Accuracy:", computed.accuracy + "%");
    }
  }

  watch {
    timeRemaining: (time) => {
      if (time <= 10 && time > 0) {
        console.log("WARNING: Only", Math.floor(time), "seconds left!");
      }
    }
  }

  on_update(deltaTime) {
    actions.updateTimer(deltaTime);
  }

  // UI with reactive bindings
  object "ScoreUI" {
    type: "ui"
    uiType: "text"
    position: { x: 10, y: 10 }

    bind: {
      text: "`Score: ${state.score}`"
    }
  }

  object "TimerUI" {
    type: "ui"
    uiType: "text"
    position: { x: 10, y: 40 }

    bind: {
      text: "`Time: ${computed.timeFormatted}`",
      color: "state.timeRemaining <= 10 ? '#ff0000' : '#ffffff'"
    }
  }
}
```

## Key Concepts

- **State**: Reactive data that triggers updates
- **Actions**: Functions that modify state
- **Computed**: Derived values from state
- **Watch**: Side effects on state changes
- **Bind**: Connect UI to state reactively
- **Persist**: Save state to storage

## Next Steps

- [Event Handlers Reference](./reference-hsplus-events)
- [Modules & Imports Reference](./reference-hsplus-modules)
- [Interactive Game Comparison](./comparison-interactive-game)
