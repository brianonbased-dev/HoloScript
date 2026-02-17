# Advanced Traits

> Part of the HoloScript Traits reference. Browse: [Visual](/traits/visual) · [AI Autonomous](/traits/ai-autonomous) · [All Traits](/traits/)

## Advanced Traits

### @teleport

Enables teleportation locomotion.

```hsplus
object TeleportPad @teleport {
  geometry: 'cylinder'
  destination: [10, 0, 10]
}

object TeleportPad @teleport(fade_duration: 0.5) {
  destination: 'SpawnPoint'
}
```

| Config          | Type         | Default | Description           |
| --------------- | ------------ | ------- | --------------------- |
| `destination`   | array/string | null    | Target position or ID |
| `fade_duration` | number       | 0.3     | Fade transition time  |

---

### @ui_panel

Creates an interactive 2D UI panel in 3D space.

```hsplus
object Menu @ui_panel {
  width: 400
  height: 300
}

object Menu @ui_panel(curved: true, follow_gaze: true) {
  content: 'ui/menu.html'
}
```

| Config        | Type    | Default | Description          |
| ------------- | ------- | ------- | -------------------- |
| `width`       | number  | 512     | Panel width (px)     |
| `height`      | number  | 512     | Panel height (px)    |
| `curved`      | boolean | false   | Curved panel surface |
| `follow_gaze` | boolean | false   | Panel follows user   |

---

### @particle_system

Attaches a particle emitter to the object.

```hsplus
object Fire @particle_system {
  preset: 'fire'
}

object Fire @particle_system(rate: 100, lifetime: 2.0) {
  texture: 'particles/spark.png'
}
```

| Config     | Type   | Default | Description             |
| ---------- | ------ | ------- | ----------------------- |
| `preset`   | string | null    | Built-in preset name    |
| `rate`     | number | 50      | Particles per second    |
| `lifetime` | number | 1.0     | Particle lifetime (sec) |

---

### @weather

Applies weather effects to a zone.

```hsplus
object WeatherZone @weather {
  type: 'rain'
}

object WeatherZone @weather(type: 'snow', intensity: 0.8) {
  radius: 50
}
```

| Config      | Type   | Default | Description                    |
| ----------- | ------ | ------- | ------------------------------ |
| `type`      | string | 'clear' | 'rain', 'snow', 'fog', 'clear' |
| `intensity` | number | 0.5     | Weather intensity (0-1)        |
| `radius`    | number | 100     | Effect radius (meters)         |

---

### @day_night

Day/night cycle controller.

```hsplus
object Sun @day_night {
  cycle_duration: 600
}

object Sun @day_night(start_time: 12, speed: 1.0) {
  geometry: 'sphere'
}
```

| Config           | Type   | Default | Description            |
| ---------------- | ------ | ------- | ---------------------- |
| `cycle_duration` | number | 1200    | Full cycle time (sec)  |
| `start_time`     | number | 6       | Starting hour (0-24)   |
| `speed`          | number | 1.0     | Cycle speed multiplier |

---

### @lod

Level of detail switching based on distance.

```hsplus
object Building @lod {
  levels: ['high.glb', 'med.glb', 'low.glb']
  distances: [10, 30, 60]
}
```

| Config      | Type  | Default      | Description               |
| ----------- | ----- | ------------ | ------------------------- |
| `levels`    | array | []           | Model paths per LOD       |
| `distances` | array | [10, 30, 60] | Switch distances (meters) |

---

### @hand_tracking

Enables hand tracking gesture interaction.

```hsplus
object Interactive @hand_tracking {
  gestures: ['pinch', 'grab', 'point']
}
```

| Config     | Type  | Default           | Description         |
| ---------- | ----- | ----------------- | ------------------- |
| `gestures` | array | ['pinch', 'grab'] | Recognized gestures |

**Events:**

- `gesture_detected` - Gesture recognized
- `hand_enter` - Hand entered object bounds
- `hand_exit` - Hand left object bounds

---

### @haptic

Triggers haptic feedback on controller.

```hsplus
object Button @haptic {
  intensity: 0.5
  duration: 100
}

object Button @haptic(pattern: 'pulse', intensity: 0.8) {
  on_click: { haptic.play() }
}
```

| Config      | Type   | Default  | Description               |
| ----------- | ------ | -------- | ------------------------- |
| `intensity` | number | 0.5      | Vibration strength (0-1)  |
| `duration`  | number | 100      | Duration in milliseconds  |
| `pattern`   | string | 'single' | 'single', 'pulse', 'buzz' |

---

### @portal

Creates a portal to another scene.

```hsplus
object Portal @portal {
  destination: 'LobbyScene'
}

object Portal @portal(preview: true, destination: 'GameWorld') {
  geometry: 'torus'
}
```

| Config        | Type    | Default | Description              |
| ------------- | ------- | ------- | ------------------------ |
| `destination` | string  | null    | Target scene name        |
| `preview`     | boolean | true    | Show destination preview |

---

### @mirror

Creates a real-time reflective surface.

```hsplus
object Mirror @mirror {
  geometry: 'plane'
}

object Mirror @mirror(quality: 0.5, blur: 0.1) {
  geometry: 'plane'
  scale: [2, 3, 1]
}
```

| Config    | Type   | Default | Description            |
| --------- | ------ | ------- | ---------------------- |
| `quality` | number | 1.0     | Reflection resolution  |
| `blur`    | number | 0       | Reflection blur amount |

---


## See Also
- [Extending Traits](/traits/extending)
- [API Reference](/api/)
