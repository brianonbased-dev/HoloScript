# 2.6 State Management

Managing complex application state in HoloScript scenes.

## What is State?

State is data that changes over time — a player's health, a door being open or closed, game score, NPC dialogue progress. HoloScript provides several tools for managing state.

## Object State with Properties

The simplest state is a property on an object:

```holoscript
orb door {
  is_open: false
  open_angle: 0.0

  @clickable
  on_click: {
    toggle: "is_open"
    if is_open {
      animate: { open_angle: 90.0, duration: 0.8 }
    } else {
      animate: { open_angle: 0.0,  duration: 0.8 }
    }
  }
}
```

## Global State Store

For state shared across multiple objects, use `state_store`:

```holoscript
state_store "game" {
  score: 0
  level: 1
  health: 100
  lives: 3
  paused: false
}
```

Access and modify from anywhere:

```holoscript
orb coin {
  @clickable
  on_click: {
    game.score += 10
    emit: "score_changed"
  }
}

orb score_display {
  @ui_panel
  bind: { text: "Score: ${game.score}" }
}
```

## Reactive Bindings

The `bind` keyword creates a one-way reactive binding:

```holoscript
orb health_bar {
  @ui_panel
  bind: {
    value:            "game.health / 100"
    background_color: "game.health > 50 ? '#00ff00' : '#ff0000'"
  }
}
```

When `game.health` changes, the health bar automatically updates.

## State Machines

For objects with well-defined states, use `state_machine`:

```holoscript
orb traffic_light {
  @state_machine
  initial_state: "red"

  states: {
    "red": {
      color: "#ff0000"
      duration: 5.0
      next: "green"
    }
    "green": {
      color: "#00ff00"
      duration: 4.0
      next: "yellow"
    }
    "yellow": {
      color: "#ffff00"
      duration: 1.5
      next: "red"
    }
  }

  on_state_change: {
    emit: "light_changed"
    value: "$current_state"
  }
}
```

## Event-Driven State Changes

Use `emit` and `on_event` for decoupled state updates:

```holoscript
// Producer
orb enemy {
  health: 50

  on_damage: {
    health -= 10
    if health <= 0 {
      emit: "enemy_died"
      value: { id: "$id", position: "$position" }
    }
  }
}

// Consumer
orb score_manager {
  on_event "enemy_died": {
    game.score += 100
    emit: "score_changed"
  }
}
```

## Computed State

Derived values that update automatically:

```holoscript
state_store "player" {
  health: 100
  max_health: 100
  armor: 20

  computed: {
    health_percent: "health / max_health"
    is_low_health:  "health < 30"
    effective_hp:   "health + armor"
  }
}
```

## Persistent State (Save/Load)

```holoscript
state_store "save_data" {
  @persistent          // Survives session restarts
  @encrypted           // Store sensitive data safely

  player_name: ""
  high_score: 0
  unlocked_levels: []
  settings: {
    music_volume: 0.8
    sfx_volume: 1.0
  }
}

orb save_button {
  @clickable
  on_click: {
    save_data.high_score = max(save_data.high_score, game.score)
    persist: "save_data"
  }
}
```

## Networked State

For multiplayer, mark state as synchronized:

```holoscript
state_store "lobby" {
  @networked
  @owner_only_write    // Only the host can write

  player_count: 0
  game_started: false
  current_map: "arena_1"
}
```

## Debugging State

```holoscript
state_store "game" {
  @debug_overlay       // Shows state in VR debug panel
  score: 0
}
```

## Patterns and Anti-Patterns

### ✅ Good: Centralized score in a store

```holoscript
state_store "game" {
  score: 0
}

orb coin { on_click: { game.score += 10 } }
orb display { bind: { text: "Score: ${game.score}" } }
```

### ❌ Bad: Score spread across objects

```holoscript
orb coin_1 { score_contribution: 10 }
orb coin_2 { score_contribution: 10 }
orb display { // How do we sum them all? }
```

### ✅ Good: State machine for well-defined states

```holoscript
orb door { @state_machine states: { "closed": {...}, "opening": {...}, "open": {...} } }
```

### ❌ Bad: Boolean soup

```holoscript
orb door {
  is_closed: true
  is_opening: false
  is_open: false
  is_closing: false  // All four can never be true simultaneously — use state machine!
}
```

## Exercise

Build a complete "game loop" with state management:

```holoscript
state_store "game" {
  score: 0
  lives: 3
  level: 1
  is_playing: false
  high_score: 0

  computed: {
    game_over: "lives <= 0"
  }
}

orb start_button {
  @ui_panel
  @clickable
  text: "Start"

  on_click: {
    game.score = 0
    game.lives = 3
    game.is_playing = true
    emit: "game_started"
  }
}

orb score_display {
  @ui_panel
  bind: { text: "Score: ${game.score}  Lives: ${game.lives}" }
}

orb game_over_screen {
  @ui_panel
  @hidden
  bind: {
    visible: "game.game_over"
    text: "Game Over! Final Score: ${game.score}"
  }

  on_show: {
    if game.score > game.high_score {
      game.high_score = game.score
    }
  }
}
```

## Summary

In this lesson, you learned:

- Defining shared data with the `state {}` block
- Reactive UI that re-renders automatically when state changes
- Using `@persistent` to save state across sessions
- Separating local vs. global state with `@networked`
- Building a multi-screen game loop driven purely by state transitions

## Next Lesson

In [Lesson 2.7: Networking](./07-networking.md), you'll connect multiple players in real time — shared objects, host authority, and room-based multiplayer.

---

**Estimated time:** 45 minutes
**Difficulty:** ⭐⭐ Intermediate
