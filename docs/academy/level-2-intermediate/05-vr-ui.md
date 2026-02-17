# 2.5 User Interface in VR

Building interfaces that feel native in 3D space.

## Why VR UI is Different

Traditional flat-screen UIs don't translate to VR. HoloScript's UI system is designed for:
- **Diegetic UI** — interfaces embedded in the world (e.g., a floating holographic panel)
- **Gaze targeting** — looking at an element to focus it
- **Hand/controller interaction** — pointing and pinching instead of mouse clicks
- **Comfortable reading distance** — typically 0.5–2m from the user

## Holographic Panels

```holoscript
orb hud_panel {
  @ui_panel
  @grabbable
  width: 0.5
  height: 0.3
  position: [0, 1.6, -0.8]

  ui {
    layout: "vertical"
    padding: 0.02

    label "title" {
      text: "Health: 100"
      font_size: 0.04
      color: "#00ff88"
    }

    progress_bar "hp_bar" {
      value: 1.0
      color: "#00ff88"
      background: "#333333"
    }
  }
}
```

## `@ui_panel` Trait

| Property | Type | Description |
|----------|------|-------------|
| `width` | float (meters) | Panel width in world space |
| `height` | float (meters) | Panel height |
| `opacity` | float (0–1) | Panel transparency |
| `billboard` | bool | Always face the user |
| `gaze_open` | bool | Show panel when user looks at it |
| `follow_head` | bool | Panel follows head movement |

## UI Elements

### Labels

```holoscript
label "score_text" {
  text: "Score: 0"
  font_size: 0.05
  color: "white"
  bold: true
  align: "center"
}
```

### Buttons

```holoscript
button "start_btn" {
  text: "Start Game"
  width: 0.2
  height: 0.06
  background: "#007bff"
  color: "white"
  border_radius: 0.01

  on_press: {
    emit: "game_start"
  }

  on_hover: {
    background: "#0056b3"
  }
}
```

### Sliders

```holoscript
slider "volume_slider" {
  label: "Volume"
  min: 0.0
  max: 1.0
  value: 0.8
  step: 0.05

  on_change: {
    target: "music_player"
    set_property: { volume: "$value" }
  }
}
```

### Toggle / Checkbox

```holoscript
toggle "shadows_toggle" {
  label: "Enable Shadows"
  checked: true

  on_change: {
    emit: "toggle_shadows"
    value: "$checked"
  }
}
```

### Image

```holoscript
image "logo" {
  src: "textures/logo.png"
  width: 0.15
  height: 0.06
  fit: "contain"
}
```

## Layouts

```holoscript
ui {
  layout: "vertical"   // or "horizontal", "grid"
  gap: 0.01
  padding: 0.02
  align: "center"      // start | center | end | stretch
  justify: "center"
}
```

### Grid Layout

```holoscript
ui {
  layout: "grid"
  columns: 3
  gap: 0.02

  // 9 buttons auto-fill the grid
  button "btn_1" { text: "1" }
  button "btn_2" { text: "2" }
  // ...
}
```

## World-Space Menus

```holoscript
orb pause_menu {
  @ui_panel
  @hidden
  width: 0.4
  height: 0.5
  billboard: true

  ui {
    layout: "vertical"
    align: "center"
    gap: 0.015

    label "title" { text: "PAUSED" font_size: 0.07 bold: true }

    button "resume" {
      text: "Resume"
      on_press: { emit: "resume_game" }
    }

    button "settings" {
      text: "Settings"
      on_press: { show: "settings_panel" }
    }

    button "quit" {
      text: "Quit"
      background: "#dc3545"
      on_press: { emit: "quit_game" }
    }
  }
}
```

## Gaze-Based Interaction

```holoscript
orb info_tooltip {
  @ui_panel
  @gaze_target
  gaze_open: true
  gaze_delay: 1.5     // seconds of gaze before opening
  billboard: true

  ui {
    label "info" {
      text: "This is an ancient artifact."
      font_size: 0.03
      word_wrap: true
      max_width: 0.3
    }
  }
}
```

## Accessibility

```holoscript
orb accessible_panel {
  @ui_panel
  @accessible

  ui_accessibility: {
    high_contrast: true
    font_scale: 1.5
    screen_reader: true
    label: "Main menu panel"
  }
}
```

## Best Practices

- Keep text `font_size` between `0.03–0.06` meters for readability at arm's length
- Use `billboard: true` for panels that users need to read from any angle
- Always provide `on_hover` feedback on interactive elements
- Avoid placing UI closer than `0.5m` to the user (causes eye strain)
- Use `opacity: 0.85` with a dark background for readability over bright scenes

## Exercise

Build a VR inventory panel:

```holoscript
orb inventory {
  @ui_panel
  @grabbable
  width: 0.6
  height: 0.4
  billboard: true
  position: [0.4, 1.4, -0.6]
  opacity: 0.9

  ui {
    layout: "vertical"
    padding: 0.02

    label "inv_title" {
      text: "Inventory"
      font_size: 0.05
      bold: true
      color: "#ffd700"
      align: "center"
    }

    ui {
      layout: "grid"
      columns: 4
      gap: 0.01

      button "slot_1" { width: 0.12 height: 0.12 background: "#2a2a2a" border: "#555" }
      button "slot_2" { width: 0.12 height: 0.12 background: "#2a2a2a" border: "#555" }
      button "slot_3" { width: 0.12 height: 0.12 background: "#2a2a2a" border: "#555" }
      button "slot_4" { width: 0.12 height: 0.12 background: "#2a2a2a" border: "#555" }
    }

    slider "zoom_level" {
      label: "Item Zoom"
      min: 1.0
      max: 3.0
      value: 1.0
    }
  }
}
```

## Summary

In this lesson, you learned:

- Creating `@billboard` and `@panel` UI elements in 3D space
- Building buttons, toggles, sliders, and dropdown menus
- Anchoring menus to the player's hands with `@hand_tracked`
- Reactive `text` bindings that update automatically from state
- Layout containers for organizing multi-element UIs

## Next Lesson

In [Lesson 2.6: State Management](./06-state-management.md), you'll master the `state {}` block — sharing data between objects, persisting across sessions, and syncing over the network.

---

**Estimated time:** 45 minutes
**Difficulty:** ⭐⭐ Intermediate
