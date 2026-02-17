# 2.4 Animation System

Bring your scenes to life with HoloScript's built-in animation system.

## Basic Keyframe Animation

```holoscript
orb spinning_cube {
  @animated
  geometry: "cube"
  color: "blue"

  animation "spin" {
    loop: true
    duration: 3.0
    keyframes: {
      0%:   { rotation: [0, 0, 0] }
      100%: { rotation: [0, 360, 0] }
    }
  }
}
```

## The `@animated` Trait

The `@animated` trait gives objects an animation controller.

| Property | Type | Description |
|----------|------|-------------|
| `auto_play` | string | Animation to play on spawn |
| `speed` | float | Global playback speed multiplier |
| `blend_time` | float | Cross-fade time between animations |

## Animation Blocks

Each `animation` block defines a named clip:

```holoscript
orb character {
  @animated
  auto_play: "idle"

  animation "idle" {
    loop: true
    duration: 2.0
    keyframes: {
      0%:   { position: [0, 0, 0] }
      50%:  { position: [0, 0.1, 0] }
      100%: { position: [0, 0, 0] }
    }
  }

  animation "jump" {
    loop: false
    duration: 0.8
    keyframes: {
      0%:   { position: [0, 0, 0] }
      40%:  { position: [0, 2, 0] }
      100%: { position: [0, 0, 0] }
    }
  }
}
```

## Triggering Animations

```holoscript
orb jump_button {
  @clickable
  on_click: {
    target: "character"
    play_animation: "jump"
  }
}
```

## Easing Functions

```holoscript
animation "bounce" {
  duration: 1.0
  easing: "ease-in-out-bounce"
  keyframes: {
    0%:   { position: [0, 0, 0] }
    100%: { position: [0, 5, 0] }
  }
}
```

Available easings:
- `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`
- `ease-in-bounce`, `ease-out-bounce`, `ease-in-out-bounce`
- `ease-in-elastic`, `ease-out-elastic`
- `ease-in-back`, `ease-out-back`

## Animating Multiple Properties

```holoscript
animation "pulse" {
  loop: true
  duration: 1.5
  keyframes: {
    0%:   { scale: [1, 1, 1],       color: "#ff0000", opacity: 1.0 }
    50%:  { scale: [1.3, 1.3, 1.3], color: "#ffff00", opacity: 0.7 }
    100%: { scale: [1, 1, 1],       color: "#ff0000", opacity: 1.0 }
  }
}
```

## Animation Events

Fire callbacks at specific points in an animation:

```holoscript
animation "door_open" {
  duration: 1.2
  keyframes: {
    0%:   { rotation: [0, 0, 0] }
    100%: { rotation: [0, 90, 0] }
  }
  events: {
    at: 0.0,  emit: "door_started_opening"
    at: 1.2,  emit: "door_fully_open"
  }
}
```

## Physics-Driven Animation

Combine with `@physics` for procedural motion:

```holoscript
orb pendulum {
  @physics
  @animated
  mass: 2.0
  gravity: true

  on_spawn: {
    apply_impulse: [5, 0, 0]
  }
}
```

## State Machine Animation

```holoscript
orb enemy {
  @animated
  @state_machine

  states: {
    "patrol": { animation: "walk", loop: true }
    "attack": { animation: "strike", loop: false }
    "die":    { animation: "death", loop: false }
  }

  transitions: {
    "patrol → attack": { condition: "player_nearby" }
    "attack → patrol": { condition: "player_far" }
    "* → die":         { condition: "health <= 0" }
  }
}
```

## Best Practices

- Keep individual animation clips short (< 5s) and compose them
- Use `blend_time: 0.2` for smooth transitions between states
- Separate physics and keyframe animations — don't mix on the same object
- Cache animation handles in `on_spawn` for performance

## Exercise

Create a "floating collectible coin" with:
1. Gentle up-and-down bob (looped)
2. Slow Y-axis rotation (looped)
3. Sparkle effect when collected
4. Disappear animation on pickup

```holoscript
orb coin {
  @animated
  @clickable
  @particle_emitter
  geometry: "coin"
  color: "gold"
  auto_play: "float"

  animation "float" {
    loop: true
    duration: 2.0
    easing: "ease-in-out"
    keyframes: {
      0%:   { position: [0, 0, 0], rotation: [0, 0, 0] }
      50%:  { position: [0, 0.3, 0], rotation: [0, 180, 0] }
      100%: { position: [0, 0, 0], rotation: [0, 360, 0] }
    }
  }

  animation "collect" {
    loop: false
    duration: 0.5
    keyframes: {
      0%:   { scale: [1, 1, 1], opacity: 1.0 }
      50%:  { scale: [2, 2, 2], opacity: 0.8 }
      100%: { scale: [0, 0, 0], opacity: 0.0 }
    }
    events: {
      at: 0.0, emit: "spawn_sparkles"
      at: 0.5, emit: "coin_collected"
    }
  }

  on_click: {
    play_animation: "collect"
  }
}
```
