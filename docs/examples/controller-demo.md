# VR Controller Demo

Complete reference for reading VR controller input — buttons, triggers, thumbsticks, hand tracking, and haptic feedback.

## Full Source

```holo
composition "Controller Demo" {
  environment {
    skybox: "gradient"
    ambient_light: 0.5
  }

  // Visual hand representation
  object "RightHand" {
    @hand_tracked(hand: "right", joint: "palm")

    scale: [0.08, 0.08, 0.12]
    color: "#eeccaa"

    // Trigger held down — visualize with squeeze effect
    on_trigger_hold(pressure) {
      this.scale = [
        0.08 + pressure * 0.02,
        0.08 + pressure * 0.02,
        0.12
      ]
    }

    on_trigger_release {
      this.scale = [0.08, 0.08, 0.12]
    }
  }

  object "LeftHand" {
    @hand_tracked(hand: "left", joint: "palm")

    scale: [0.08, 0.08, 0.12]
    color: "#eeccaa"
  }

  // Pointer ray from right hand
  object "AimRay" {
    @hand_tracked(hand: "right", joint: "pointer")
    @laser_pointer

    color: "#00ffff"
    length: 5
    visible: false

    on_trigger_press {
      this.visible = true
    }

    on_trigger_release {
      this.visible = false
    }
  }

  // Display panel showing live input state
  object "InputDisplay" {
    @billboard
    @reactive

    position: [0, 2, -3]
    scale: [1.2, 0.8, 0.01]

    text: """
Right Trigger: ${Controllers.right.trigger_pressure:.0%}
Right Grip:    ${Controllers.right.grip ? "HELD" : "open"}
A Button:      ${Controllers.right.button_a ? "PRESSED" : "-"}
B Button:      ${Controllers.right.button_b ? "PRESSED" : "-"}
Right Stick:   [${Controllers.right.thumbstick.x:.2f}, ${Controllers.right.thumbstick.y:.2f}]

Left Trigger:  ${Controllers.left.trigger_pressure:.0%}
Left Grip:     ${Controllers.left.grip ? "HELD" : "open"}
X Button:      ${Controllers.left.button_x ? "PRESSED" : "-"}
Y Button:      ${Controllers.left.button_y ? "PRESSED" : "-"}
Left Stick:    [${Controllers.left.thumbstick.x:.2f}, ${Controllers.left.thumbstick.y:.2f}]
    """
  }

  // Color cube reacting to right trigger
  object "TriggerCube" {
    @collidable

    position: [1.5, 1.2, -3]
    scale: 0.3
    color: "#333333"

    on_trigger_hold("right", pressure) {
      // Color shifts from dark to bright cyan as trigger is pressed
      intensity = pressure * 255
      this.color = rgb(0, intensity, intensity)
      this.scale = 0.3 + pressure * 0.15
    }

    on_trigger_release("right") {
      this.color = "#333333"
      this.scale = 0.3
    }
  }

  // Thumbstick-driven movement target
  object "MoveTarget" {
    @physics
    @collidable
    @glowing

    position: [0, 0.3, -3]
    scale: 0.2
    color: "#ff6600"
    glow_color: "#ff6600"
    glow_intensity: 0.8

    every 16ms {
      stick = Controllers.right.thumbstick
      speed = 0.05

      if (stick.magnitude > 0.1) {
        this.position.x += stick.x * speed
        this.position.z -= stick.y * speed
        // Clamp to floor area
        this.position.x = clamp(this.position.x, -3, 3)
        this.position.z = clamp(this.position.z, -5, -1)
      }
    }
  }

  // A-button haptic burst
  object "HapticButton" {
    @clickable
    @hoverable
    @glowing

    position: [-1.5, 1.2, -3]
    scale: 0.3
    color: "#8844ff"
    text: "HAPTIC"

    on_hover_enter { this.glow_intensity = 1.5 }
    on_hover_exit  { this.glow_intensity = 0.4 }

    on_click {
      // Rumble both controllers in a pattern
      haptic_feedback("right", 0.8, 50ms)
      delay 80ms then haptic_feedback("right", 0.5, 50ms)
      delay 160ms then haptic_feedback("right", 0.3, 50ms)
      haptic_feedback("left", 0.4, 150ms)
    }
  }

  // Floor
  object "Floor" {
    @collidable
    position: [0, -0.1, -3]
    scale: [8, 0.2, 8]
    color: "#1a1a2e"
  }
}
```

## Input Reference

### Trigger

```holo
on_trigger_press  { /* fired once when trigger crosses threshold */ }
on_trigger_hold(pressure) { /* fired every frame while held, 0-1 */ }
on_trigger_release { /* fired once when trigger released */ }
```

### Grip

```holo
on_grip_press   { /* side grip button held */ }
on_grip_release { /* side grip button released */ }
```

### Face Buttons (Quest: A/B right, X/Y left)

```holo
on_button_a_press { /* A button */ }
on_button_b_press { /* B button */ }
on_button_x_press { /* X button (left controller) */ }
on_button_y_press { /* Y button (left controller) */ }
```

### Thumbstick

```holo
// Poll each frame
stick = Controllers.right.thumbstick
move_x = stick.x   // -1 (left) to 1 (right)
move_y = stick.y   // -1 (back) to 1 (forward)

// Or use events
on_thumbstick_move("right", x, y) {
  // fires when stick moves beyond dead zone
}

on_thumbstick_click("right") {
  // stick pressed down
}
```

### Hand Tracking

```holo
object "HandAnchor" {
  @hand_tracked(hand: "right", joint: "palm")
  // Joints: palm, wrist, index_tip, thumb_tip, pointer, ...
}
```

### Haptics

```holo
haptic_feedback("right", amplitude, duration)
// amplitude: 0.0–1.0
// duration: e.g. 50ms, 0.1s

haptic_feedback("both", 0.5, 100ms)  // both controllers
```

## Compile & Run

```bash
holoscript preview controller-demo.holo

holoscript compile controller-demo.holo --target threejs  # web preview
holoscript compile controller-demo.holo --target unity    # Unity XR
holoscript compile controller-demo.holo --target vrchat   # VRChat Udon
```

## See Also

- [Interactive Cube](/examples/interactive-cube) — use controller input to grab
- [Arena Game](/examples/arena-game) — trigger press for weapons
- [Traits: Interaction](/traits/interaction)
