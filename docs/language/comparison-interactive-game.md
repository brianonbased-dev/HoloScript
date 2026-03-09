# Cross-Format Comparison: Interactive Game

The same target practice game implemented in all three formats - demonstrates state management, events, and reactivity.

## Game Description

- 3 clickable/pokeable targets
- Score tracking
- 60-second timer
- Accuracy calculation
- Start/end game logic

## `.hs` - Basic Format (Limited)

```holoscript
// Cannot implement game logic in .hs

object "Target1" {
  geometry: "sphere"
  color: "#ff4444"
  radius: 0.4
  position: { x: -2, y: 1.5, z: -5 }
  onClick: "incrementScore"  // Just a string reference
}

object "ScoreText" {
  type: "ui"
  uiType: "text"
  text: "Score: 0"  // Static, doesn't update
}
```

**Cannot implement**:

- State management (no score/timer tracking)
- Actions (incrementScore is just a string)
- Reactive UI (text doesn't update)
- Game logic (no on_update loop)

## `.hsplus` - Extended Format (Full Implementation)

```holoscript
composition "TargetPracticeGame" {
  // State management
  state {
    score: 0
    timeRemaining: 60.0
    isGameActive: false
    targetHits: 0
    targetMisses: 0
  }

  // Computed values
  computed {
    accuracy: () => {
      const total = state.targetHits + state.targetMisses;
      if (total === 0) return 0;
      return ((state.targetHits / total) * 100).toFixed(1);
    }

    timeFormatted: () => {
      const minutes = Math.floor(state.timeRemaining / 60);
      const seconds = Math.floor(state.timeRemaining % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // Action functions
  actions {
    startGame() {
      state.isGameActive = true;
      state.score = 0;
      state.timeRemaining = 60.0;
    }

    hitTarget(targetName, points) {
      if (!state.isGameActive) return;
      state.score += points;
      state.targetHits += 1;
    }

    updateTimer(deltaTime) {
      if (!state.isGameActive) return;
      state.timeRemaining -= deltaTime;

      if (state.timeRemaining <= 0) {
        this.endGame();
      }
    }

    endGame() {
      state.isGameActive = false;
      console.log("Game Over! Score:", state.score);
    }
  }

  // Watchers
  watch {
    timeRemaining: (time) => {
      if (time <= 10 && time > 0) {
        console.log("WARNING: 10 seconds left!");
      }
    }
  }

  // Update loop
  on_update(deltaTime) {
    actions.updateTimer(deltaTime);
  }

  // Reusable target template
  template "ClickableTarget" {
    @interactive

    geometry: "sphere"
    radius: 0.4

    state {
      isActive: true
      hitCount: 0
    }

    on_click(event) {
      if (!this.state.isActive) return;
      if (!state.isGameActive) return;

      this.state.hitCount += 1;
      const points = 10 + (this.state.hitCount - 1) * 2;
      actions.hitTarget(this.name, points);

      // Cooldown
      this.state.isActive = false;
      setTimeout(() => {
        this.state.isActive = true;
      }, 500);
    }
  }

  // Targets
  object "RedTarget" using "ClickableTarget" {
    color: "#ff4444"
    position: { x: -2, y: 1.5, z: -5 }
  }

  object "GreenTarget" using "ClickableTarget" {
    color: "#44ff44"
    position: { x: 0, y: 1.5, z: -5 }
  }

  object "BlueTarget" using "ClickableTarget" {
    color: "#4444ff"
    position: { x: 2, y: 1.5, z: -5 }
  }

  // Reactive UI
  object "ScoreDisplay" {
    type: "ui"
    uiType: "text"

    bind: {
      text: "`Score: ${state.score}`"  // Updates automatically
    }
  }

  object "TimerDisplay" {
    type: "ui"
    uiType: "text"

    bind: {
      text: "`Time: ${computed.timeFormatted}`",
      color: "state.timeRemaining <= 10 ? '#ff0000' : '#ffffff'"
    }
  }
}
```

**Advantages**:

- ✅ Full state management
- ✅ Action functions
- ✅ Computed values
- ✅ Reactive UI bindings
- ✅ Template reusability
- ✅ Event handlers with full code
- ✅ Complete game logic

## `.holo` - Advanced Format (VR Version)

```holoscript
composition TargetPracticeGameVR {
  // Game controller entity
  entity GameController {
    game_state: {
      score: 0,
      time_remaining: 60.0,
      is_active: false,
      target_hits: 0,
      target_misses: 0,
      difficulty: 1.0
    }

    statistics: {
      total_games_played: 0,
      high_score: 0,
      average_accuracy: 0.0
    }

    save_state: {
      enabled: true,
      auto_save: true,
      include_fields: ["statistics", "high_score"]
    }

    on_update(deltaTime) {
      if (!this.game_state.is_active) return;

      this.game_state.time_remaining -= deltaTime;

      if (this.game_state.time_remaining <= 0) {
        this.endGame();
      }

      // Difficulty increases over time
      this.game_state.difficulty = 1.0 +
        (60.0 - this.game_state.time_remaining) / 60.0;
    }

    startGame() {
      this.game_state.is_active = true;
      this.game_state.score = 0;
      this.game_state.time_remaining = 60.0;
    }

    hitTarget(targetName, points) {
      if (!this.game_state.is_active) return;
      this.game_state.score += points;
      this.game_state.target_hits += 1;
    }

    endGame() {
      this.game_state.is_active = false;

      if (this.game_state.score > this.statistics.high_score) {
        this.statistics.high_score = this.game_state.score;
        console.log("NEW HIGH SCORE!");
      }
    }
  }

  // Interactive target entity
  entity RedTarget {
    mesh: {
      type: "sphere",
      radius: 0.4
    }

    advanced_pbr: {
      base_color: [1.0, 0.27, 0.27],
      metallic: 0.3,
      roughness: 0.5,
      emissive: [0.0, 0.0, 0.0],
      emissive_intensity: 0.0
    }

    transform: {
      position: [-2.0, 1.5, -5.0]
    }

    collider: {
      type: "sphere"
    }

    audio: {
      sound: "target_hit",
      volume: 0.8,
      spatial: true
    }

    particle_emitter: {
      enabled: false,
      particle_type: "burst",
      start_color: [1.0, 0.27, 0.27, 1.0]
    }

    target_state: {
      is_active: true,
      hit_count: 0
    }

    on_click(event) {
      this.handleHit(event);
    }

    on_poke_start(event) {
      // VR hand poke
      this.handleHit(event);

      if (event.controller) {
        event.controller.pulse(0.7, 150);
      }
    }

    handleHit(event) {
      if (!this.target_state.is_active) return;

      const gameController = this.composition.getEntity("GameController");
      if (!gameController.game_state.is_active) return;

      this.target_state.hit_count += 1;
      const points = Math.floor(
        (10 + (this.target_state.hit_count - 1) * 2) *
        gameController.game_state.difficulty
      );

      gameController.hitTarget("RedTarget", points);

      // Visual feedback
      this.advanced_pbr.emissive = [1.0, 0.27, 0.27];
      this.advanced_pbr.emissive_intensity = 2.0;
      this.particle_emitter.enabled = true;
      this.playSound("target_hit");

      // Cooldown
      this.target_state.is_active = false;
      setTimeout(() => {
        this.target_state.is_active = true;
        this.advanced_pbr.emissive = [0.0, 0.0, 0.0];
        this.particle_emitter.enabled = false;
      }, 500);
    }
  }

  // VR UI panel
  entity UIPanel {
    mesh: {
      type: "plane",
      width: 1.0,
      height: 0.6
    }

    transform: {
      position: [-3.0, 2.0, -4.0],
      rotation: [0.0, 25.0, 0.0]
    }

    ui_panel: {
      resolution: { width: 512, height: 307 },
      interactive: true,
      render_mode: "world_space"
    }

    on_update(deltaTime) {
      const gc = this.composition.getEntity("GameController");
      this.updateUIElement("score", `Score: ${gc.game_state.score}`);
    }
  }

  // VR Camera
  entity VRCamera {
    camera: {
      type: "vr",
      field_of_view: 90.0
    }

    vr_controllers: {
      left: { model: "oculus_touch_left", haptics_enabled: true },
      right: { model: "oculus_touch_right", haptics_enabled: true }
    }
  }
}
```

**Advantages**:

- ✅ Advanced trait system
- ✅ State persistence (`save_state`)
- ✅ Entity-component architecture
- ✅ VR-native (poke, haptics, world-space UI)
- ✅ Particle systems
- ✅ Spatial audio
- ✅ Dynamic difficulty
- ✅ Statistics tracking

## Key Differences Summary

| Feature           | `.hs` | `.hsplus` | `.holo`            |
| ----------------- | ----- | --------- | ------------------ |
| State management  | ✗     | ✓         | ✓ (traits)         |
| Actions           | ✗     | ✓         | ✓ (methods)        |
| Reactive UI       | ✗     | ✓ (bind)  | ✓ (on_update)      |
| Templates         | ✗     | ✓         | ✓ (object pattern) |
| VR interaction    | ✗     | ✓         | ✓ (advanced)       |
| Event handlers    | ✗     | ✓         | ✓                  |
| Particle effects  | ✗     | ✗         | ✓                  |
| State persistence | ✗     | ✓         | ✓ (trait)          |
| Lines of code     | ~60   | ~180      | ~280               |

## When to Use Each Format

- **`.hs`** - Cannot implement this game (too limited)
- **`.hsplus`** - Perfect for this game (state + events + UI)
- **`.holo`** - Best for VR version (haptics, world-space UI, particles)

## Next Steps

- [Simple Scene Comparison](./comparison-simple-scene)
- [State & Actions Reference](./reference-hsplus-state)
- [Entity-Trait Reference](./reference-holo-entity)
