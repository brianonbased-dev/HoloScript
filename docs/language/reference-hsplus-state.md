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

## Outcome kinds on actions

An action inside `logic { }` can say which answers it gives, and what kind each answer is:

- **accepted**: the answer has `allowed: true`. The action may change state and announce events.
- **refused**: the answer has `allowed: false`. The action changes nothing and announces nothing.

Write the lists after the action's inputs. Each list is optional, and they can come in either order or sit on their own lines:

```hsplus
composition "Bike Share" {
  state {
    bikesOut: 0
    fineOwed: 0
  }

  logic {
    action rent(count) accepted(rented) refused(fine_unpaid, bad_count, over_limit) {
      if (state.fineOwed > 0) {
        return { allowed: false, outcome: "fine_unpaid" }
      }
      if (count < 1) {
        return { allowed: false, outcome: "bad_count" }
      }
      if (state.bikesOut + count > 2) {
        return { allowed: false, outcome: "over_limit" }
      }
      state.bikesOut += count
      emit("bikes_rented", { count: count })
      return { allowed: true, outcome: "rented" }
    }
  }
}
```

The checker reads the action's own statements and refuses the file when:

| Code     | When                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HSP500` | A list is written twice, is empty, names an outcome twice, names one outcome as both kinds, or writes a name in quotes.                            |
| `HSP501` | An answer names an outcome the action does not declare.                                                                                            |
| `HSP502` | An answer's `allowed` does not match its outcome's kind (for example `allowed: true` with a refused outcome).                                      |
| `HSP503` | A refused outcome is answered after the action changed state or announced an event on the way there.                                               |
| `HSP504` | An answer cannot be checked: it is not an object written in place, `allowed` is not written as `true` or `false`, or `outcome` depends on a value. |
| `HSP505` | One action in the `logic` block declares its outcomes and another action that answers with `allowed`/`outcome` does not.                           |
| `HSP506` | (warning) A declared outcome is never answered. The file is still valid.                                                                           |

An `outcome` may also be a choice between quoted names, such as `outcome: degrees < 18 ? "heating" : "idle"`; the checker treats it as every name it can be. An action that declares no outcomes, in a `logic` block where no action declares them, is read exactly as before.

`holoscript validate`, the `.holo` reader, and the deterministic headless runtime all run the same checker, so they accept and refuse the same files. The runtime also checks each answer as it happens. A program that declares its outcomes is enough to write its back-translation interface card (`interfaceCardSpecFromSource` in `@holoscript/core/testing`); the card no longer has to be written by hand.

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
- **Outcome kinds**: Each action answer declared accepted (may change state) or refused (changes nothing), checked before anything runs
- **Computed**: Derived values from state
- **Watch**: Side effects on state changes
- **Bind**: Connect UI to state reactively
- **Persist**: Save state to storage

## Next Steps

- [Event Handlers Reference](./reference-hsplus-events)
- [Modules & Imports Reference](./reference-hsplus-modules)
- [Interactive Game Comparison](./comparison-interactive-game)
