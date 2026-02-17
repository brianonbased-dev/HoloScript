# Interaction Traits

> Part of the HoloScript Traits reference. Browse: [Physics](/traits/physics) · [AI & Behavior](/traits/ai-behavior) · [Audio](/traits/audio) · [All Traits](/traits/)

## Interaction Traits

### @grabbable

**Category:** Interaction
**Tags:** physics, hands, grab, movement

Hand-based grab interactions for VR objects.

```hsplus
object Ball @grabbable {
  geometry: 'sphere'
}

object Ball @grabbable(grab_distance: 0.5, require_trigger: true) {
  geometry: 'sphere'
}
```

| Config               | Type    | Default   | Description                     |
| -------------------- | ------- | --------- | ------------------------------- |
| `grab_distance`      | number  | 0.3       | Maximum grab distance in meters |
| `require_trigger`    | boolean | true      | Require trigger press to grab   |
| `allow_remote_grab`  | boolean | false     | Allow grabbing from distance    |
| `highlight_on_hover` | boolean | true      | Visual feedback on hover        |
| `two_hand_mode`      | string  | 'average' | 'average', 'dominant', 'scale'  |

**Events:**

- `grab_start` - Object grabbed
- `grab_end` - Object released
- `grab_switch_hand` - Transferred between hands

---

### @throwable

**Category:** Interaction
**Tags:** physics, throw, velocity, ballistic

Physics-based throwing when released from grab.

```hsplus
object Ball @grabbable @throwable {
  geometry: 'sphere'
}

object Ball @throwable(velocity_multiplier: 1.5, spin_enabled: true) {
  geometry: 'sphere'
}
```

| Config                   | Type    | Default | Description           |
| ------------------------ | ------- | ------- | --------------------- |
| `velocity_multiplier`    | number  | 1.0     | Throw velocity scale  |
| `max_velocity`           | number  | 20.0    | Maximum throw speed   |
| `spin_enabled`           | boolean | true    | Allow spin on release |
| `angular_velocity_scale` | number  | 1.0     | Rotation speed scale  |

**Events:**

- `throw_start` - Object thrown with velocity data
- `throw_end` - Object stopped moving

---

### @pointable

Laser pointer/ray interaction.

```hsplus
object Button @pointable {
  geometry: 'cube'

  onPoint: {
    self.color = 'green'
  }
}
```

| Config             | Type   | Default   | Description            |
| ------------------ | ------ | --------- | ---------------------- |
| `pointer_distance` | number | 10.0      | Max raycast distance   |
| `highlight_color`  | string | '#00ff00' | Hover highlight color  |
| `cursor_type`      | string | 'dot'     | 'dot', 'ring', 'arrow' |

**Events:**

- `point_enter` - Pointer enters object
- `point_exit` - Pointer leaves object
- `point_click` - Pointer activated on object

---

### @hoverable

Hover state and visual feedback.

```hsplus
object MenuItem @hoverable {
  geometry: 'plane'

  onHoverEnter: { self.scale *= 1.1 }
  onHoverExit: { self.scale /= 1.1 }
}
```

| Config        | Type   | Default | Description            |
| ------------- | ------ | ------- | ---------------------- |
| `hover_scale` | number | 1.0     | Scale change on hover  |
| `hover_color` | string | null    | Color change on hover  |
| `hover_sound` | string | null    | Sound to play on hover |

**Events:**

- `hover_enter` - Pointer/hand enters
- `hover_exit` - Pointer/hand exits

---

### @draggable

Continuous drag movement on surfaces.

```hsplus
object Slider @draggable(constrain_axis: 'x') {
  geometry: 'cube'
}
```

| Config           | Type    | Default | Description                     |
| ---------------- | ------- | ------- | ------------------------------- |
| `constrain_axis` | string  | null    | 'x', 'y', 'z', or null for free |
| `surface_only`   | boolean | false   | Constrain to surface            |
| `snap_to_grid`   | number  | 0       | Grid snap size (0 = off)        |

**Events:**

- `drag_start` - Drag initiated
- `drag_move` - Position updated
- `drag_end` - Drag released

---

### @scalable

Two-handed scaling gestures.

```hsplus
object Model @grabbable @scalable {
  geometry: 'model/object.glb'
}

object Model @scalable(min_scale: 0.5, max_scale: 3.0) {
  geometry: 'model/object.glb'
}
```

| Config          | Type    | Default | Description            |
| --------------- | ------- | ------- | ---------------------- |
| `min_scale`     | number  | 0.1     | Minimum scale limit    |
| `max_scale`     | number  | 10.0    | Maximum scale limit    |
| `uniform_scale` | boolean | true    | Scale all axes equally |

**Events:**

- `scale_start` - Scaling gesture started
- `scale_change` - Scale value changed
- `scale_end` - Scaling gesture ended

---


## See Also
- [Physics Traits](/traits/physics)
- [AI & Behavior Traits](/traits/ai-behavior)
- [Extending Traits](/traits/extending)
- [API Reference](/api/)
