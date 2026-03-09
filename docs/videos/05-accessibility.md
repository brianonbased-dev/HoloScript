# Video 5: Accessibility in VR (12 min)

**Target audience:** All developers
**Goal:** Build inclusive VR experiences with HoloScript's accessibility traits

---

## Script

### 0:00 — Why Accessibility in VR Matters (60s)

> "One in four adults has a disability. In VR that number is higher,
> because VR adds motion sickness, controller requirements, and spatial
> hearing challenges on top of existing accessibility needs.
>
> HoloScript treats accessibility as a first-class feature —
> not an afterthought. The @accessible, @alt_text, @haptic,
> and @contrast traits give you a complete accessibility toolkit
> in just a few lines of code."

---

### 1:00 — @accessible: Screen Reader Support (150s)

```hsplus
orb "Button" {
  color: "#4caf50"
  scale: [0.6, 0.2, 0.05]
  position: [0, 1.5, -1.5]

  @accessible {
    role: "button"
    label: "Confirm order"
    description: "Confirms your current order and proceeds to checkout"
    keyboardShortcut: "enter"
    tabIndex: 1
  }
}
```

> "The role attribute matches ARIA roles — button, checkbox, slider,
> region, dialog. Screen readers in VR (like those on Vision Pro)
> read the label and description aloud when the user focuses the object."

Standard roles:

- `"button"` — activatable control
- `"checkbox"` — toggle with on/off state
- `"slider"` — numeric range control
- `"link"` — navigates to a resource
- `"region"` — landmark area of the scene
- `"artwork"` — museum/gallery piece
- `"alert"` — important notification

---

### 3:30 — @alt_text: Visual Descriptions (90s)

```hsplus
orb "ComplexViz" {
  color: "#2196f3"
  scale: [1.5, 1.0, 0.1]
  position: [0, 1.6, -2]

  @alt_text {
    description: "A bar chart showing monthly sales from January to December 2024. Peak in July at 42,000 units."
    context: "data-visualization"
    verbosity: "detailed"
  }
}
```

> "Alt text in VR is more nuanced than on the web.
> The context hint tells the screen reader how to present it —
> 'data-visualization' triggers a structured reading mode."

Context values:
| Context | How it's read |
|---|---|
| `"image"` | Short description |
| `"data-visualization"` | Structured data reading |
| `"artwork"` | Art description with artist intent |
| `"navigation"` | Directional guidance |
| `"decorative"` | Skipped entirely |

---

### 5:00 — @haptic: Touch Feedback (90s)

```hsplus
orb "VirtualKeyboard" {
  // ...

  @accessible { role: "application"  label: "Virtual keyboard" }
  @haptic {
    onHover:    { intensity: 0.1  duration: 50  pattern: "click" }
    onPress:    { intensity: 0.6  duration: 80  pattern: "firm" }
    onRelease:  { intensity: 0.2  duration: 30  pattern: "soft" }
    onError:    { intensity: 0.9  duration: 200  pattern: "error" }
  }
}
```

> "Haptic feedback is essential for users with low vision who rely on
> touch to navigate. HoloScript's @haptic trait abstracts over
> Meta Touch, Apple visionOS hands, and Valve Index knuckles."

Standard patterns:

- `"click"` — short confirmation
- `"firm"` — button press
- `"soft"` — hover confirmation
- `"pulse"` — repeated attention
- `"error"` — failure notification
- `"success"` — completion

---

### 6:30 — @contrast: Visual Accessibility (90s)

```hsplus
orb "ImportantUI" {
  color: "#ffffff"
  position: [0, 1.5, -1]

  @contrast {
    minimumRatio: 4.5      // WCAG AA standard
    preferHighContrast: true
    backgroundColor: "#000000"
    forceDarkMode: false
  }

  @highlight {
    color: "#ffff00"       // High-visibility yellow
    onFocus: true
    width: 3               // Focus ring thickness
    pulse: true            // Animated to draw attention
  }
}
```

> "@contrast enforces WCAG color contrast ratios at build time.
> If your color combination fails AA standards, you get a type error."

**[SCREEN: show VS Code error for low-contrast colors]**

---

### 8:00 — Motion and Comfort (90s)

```hsplus
@manifest {
  title: "Accessible Scene"
  comfort: {
    reducedMotion: true       // Respects OS preference
    teleportOnly: false       // Allow smooth locomotion
    snapTurn: true            // Snap rotation instead of smooth
    snapDegrees: 30           // 30° per snap
    vignette: true            // Comfort vignette during movement
    seatedMode: false         // Allow standing play
  }
}
```

> "The comfort manifest tells the runtime how to handle locomotion
> for users prone to motion sickness."

For `reducedMotion: true`, HoloScript automatically:

- Disables camera shake
- Reduces parallax effects
- Slows animation speeds
- Skips intro transitions

---

### 9:30 — Accessibility Audit (90s)

```bash
holoscript check --accessibility src/scene.hsplus
```

Output:

```
✓ All interactive objects have @accessible roles
✓ All non-decorative visuals have @alt_text
⚠ Button "Close" has contrast ratio 3.8 (WCAG AA requires 4.5)
⚠ Slider "Volume" missing @haptic feedback
✗ Dialog "Confirm" has no keyboard shortcut (required for non-VR users)

Accessibility score: 78/100 (B)
```

> "The accessibility checker runs at build time and gives you a score.
> Aim for 90+ before shipping."

---

### 11:00 — Full Accessible UI Example (60s)

```hsplus
orb "DialogBox" {
  color: "#1a1a2e"
  scale: [1.2, 0.8, 0.02]
  position: [0, 1.6, -1.2]

  @accessible {
    role: "dialog"
    label: "Confirm action"
    description: "Confirm or cancel your current action"
    modal: true
  }

  @contrast { minimumRatio: 7.0 }  // WCAG AAA
}

orb "ConfirmBtn" {
  color: "#4caf50"
  scale: [0.4, 0.15, 0.02]
  position: [-0.25, 1.5, -1.19]

  @accessible { role: "button"  label: "Confirm"  keyboardShortcut: "enter"  tabIndex: 1 }
  @haptic { onPress: { intensity: 0.6  pattern: "firm" } }
  @highlight { onFocus: true  pulse: false }
}

orb "CancelBtn" {
  color: "#f44336"
  scale: [0.4, 0.15, 0.02]
  position: [0.25, 1.5, -1.19]

  @accessible { role: "button"  label: "Cancel"  keyboardShortcut: "escape"  tabIndex: 2 }
  @haptic { onPress: { intensity: 0.4  pattern: "soft" } }
  @highlight { onFocus: true  pulse: false }
}
```

---

### 11:30 — Recap (30s)

> "HoloScript accessibility in 5 traits:
> ✓ @accessible — screen reader roles and labels
> ✓ @alt_text — rich visual descriptions
> ✓ @haptic — tactile feedback patterns
> ✓ @contrast — WCAG compliance enforcement
> ✓ @highlight — visible focus indicators
>
> Run `holoscript check --accessibility` before every release."

**[SCREEN: subscribe + link to accessibility docs]**

---

## Production Notes

- **Duration target:** 11:30–13:00
- **Thumbnail:** Accessibility icon overlaid on VR headset, bright high-contrast colors
- **Key moment:** 9:30 — live terminal showing accessibility audit output (pre-record, then present)
- **Captions:** This video especially must have accurate, manually-reviewed captions — it's about accessibility
- **Audio description track:** Record a separate audio description track for this video
- **Guest:** Consider inviting a screen reader user to demo the final UI (diversity and authenticity)
