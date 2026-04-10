# Visual Traits

> Part of the HoloScript Traits reference. Browse: [Physics](/traits/physics) · [Animation](/traits/advanced) · [All Traits](/traits/)

## Visual Traits

### @glowing

Adds emissive glow effect to objects.

```hsplus
object Crystal @glowing {
  geometry: 'crystal'
  color: '#00ffff'
}

object Crystal @glowing(intensity: 2.0, color: '#ff00ff') {
  geometry: 'crystal'
}
```

| Config      | Type    | Default      | Description                    |
| ----------- | ------- | ------------ | ------------------------------ |
| `intensity` | number  | 1.0          | Glow brightness (0-10)         |
| `color`     | string  | object color | Glow color (optional override) |
| `pulse`     | boolean | false        | Enable pulsing effect          |

---

### @transparent

Makes object semi-transparent with configurable opacity.

```hsplus
object GlassPane @transparent {
  geometry: 'plane'
  opacity: 0.5
}

object GlassPane @transparent(opacity: 0.3, refraction: true) {
  geometry: 'cube'
}
```

| Config       | Type    | Default | Description              |
| ------------ | ------- | ------- | ------------------------ |
| `opacity`    | number  | 0.5     | Transparency level (0-1) |
| `refraction` | boolean | false   | Enable light refraction  |

---

### @spinning

Continuous rotation animation on an axis.

```hsplus
object Fan @spinning {
  geometry: 'model/fan.glb'
}

object Fan @spinning(axis: 'y', speed: 2.0) {
  geometry: 'model/fan.glb'
}
```

| Config  | Type   | Default | Description                   |
| ------- | ------ | ------- | ----------------------------- |
| `axis`  | string | 'y'     | Rotation axis ('x', 'y', 'z') |
| `speed` | number | 1.0     | Rotations per second          |

---

### @floating

Gentle floating/bobbing animation effect.

```hsplus
object composition @floating {
  geometry: 'sphere'
}

object composition @floating(amplitude: 0.5, speed: 0.5) {
  geometry: 'sphere'
}
```

| Config      | Type   | Default | Description            |
| ----------- | ------ | ------- | ---------------------- |
| `amplitude` | number | 0.2     | Float height in meters |
| `speed`     | number | 1.0     | Float cycle speed      |

---

### @billboard

Always faces the camera/user.

```hsplus
object Label @billboard {
  geometry: 'plane'
  text: 'Hello'
}

object Label @billboard(lock_y: true) {
  geometry: 'plane'
}
```

| Config   | Type    | Default | Description           |
| -------- | ------- | ------- | --------------------- |
| `lock_y` | boolean | false   | Only rotate on Y axis |

---

### @pulse

Pulsing scale or color animation.

```hsplus
object Beacon @pulse {
  geometry: 'sphere'
  color: 'red'
}

object Beacon @pulse(property: 'scale', min: 0.8, max: 1.2) {
  geometry: 'sphere'
}
```

| Config     | Type   | Default | Description                                     |
| ---------- | ------ | ------- | ----------------------------------------------- |
| `property` | string | 'color' | Property to pulse ('scale', 'color', 'opacity') |
| `min`      | number | 0.5     | Minimum value                                   |
| `max`      | number | 1.0     | Maximum value                                   |
| `speed`    | number | 1.0     | Pulse cycles per second                         |

---

### @animated

Plays embedded animations from 3D model.

```hsplus
object Character @animated {
  geometry: 'model/character.glb'
  animation: 'idle'
}

object Character @animated(loop: true, blend: 0.3) {
  geometry: 'model/character.glb'
}
```

| Config      | Type    | Default | Description            |
| ----------- | ------- | ------- | ---------------------- |
| `animation` | string  | 'idle'  | Default animation name |
| `loop`      | boolean | true    | Loop animation         |
| `blend`     | number  | 0.2     | Blend time in seconds  |

**Events:**

- `animation_start` - Animation started
- `animation_end` - Animation completed (non-looping)

---

### @look_at

Object rotates to face a target.

```hsplus
object Turret @look_at {
  target: 'Player'
}

object Turret @look_at(target: 'Player', axis: 'y', speed: 2.0) {
  geometry: 'model/turret.glb'
}
```

| Config   | Type   | Default  | Description                  |
| -------- | ------ | -------- | ---------------------------- |
| `target` | string | 'camera' | Target object ID or 'camera' |
| `axis`   | string | 'all'    | Rotation constraint          |
| `speed`  | number | 5.0      | Rotation speed               |

---

### @outline

Adds outline/silhouette effect.

```hsplus
object Selected @outline {
  geometry: 'cube'
}

object Selected @outline(color: '#ff0', width: 3) {
  geometry: 'cube'
}
```

| Config  | Type   | Default | Description        |
| ------- | ------ | ------- | ------------------ |
| `color` | string | '#fff'  | Outline color      |
| `width` | number | 2       | Outline width (px) |

---

### @proximity

Triggers events when objects/players are nearby.

```hsplus
object Sensor @proximity {
  range: 5
}

object Sensor @proximity(range: 10, target: 'Player') {
  on_enter: { print('Player nearby') }
}
```

| Config   | Type   | Default | Description               |
| -------- | ------ | ------- | ------------------------- |
| `range`  | number | 5       | Detection radius (meters) |
| `target` | string | 'all'   | Target type to detect     |

**Events:**

- `proximity_enter` - Target entered range
- `proximity_exit` - Target left range

---

## See Also

- [Physics Traits](/traits/physics)
- [Media Traits](/traits/media)
- [API Reference](/api/)
