# Layered Architecture Demo

**A complete example demonstrating `.holo`, `.hsplus`, and `.hs` working together**

This example shows the **three-layer architecture** in action:
- `.hs` files define reusable logic (scoring system)
- `.hsplus` files define visual components with traits (interactive button)
- `.holo` files compose everything into a complete scene

---

## 📁 Project Structure

```
layered-architecture-demo/
├── main.holo              # Entry point - composition layer
├── components/
│   └── button.hsplus      # Presentation layer - visual component
└── logic/
    └── scoring.hs         # Logic layer - game logic
```

---

## 🎯 File Breakdown

### `logic/scoring.hs` (Logic Layer)

Defines the scoring system logic - pure business logic, no visuals:

```hs
// Scoring system logic
function calculateScore(hits, time, accuracy) {
  base_score = hits * 10
  time_bonus = max(0, 100 - time)
  accuracy_multiplier = accuracy / 100

  return (base_score + time_bonus) * accuracy_multiplier
}

function updateHighScore(current_score, high_score) {
  if (current_score > high_score) {
    return current_score
  }
  return high_score
}
```

### `components/button.hsplus` (Presentation Layer)

Defines an interactive button with visual traits and 3D properties:

```hsplus
// Interactive button component with traits
template InteractiveButton {
  geometry: "cylinder"
  rotation: [90, 0, 0]
  scale: [0.3, 0.05, 0.3]
  color: "#4ecdc4"

  @clickable
  @pointable
  @glowing
  @audio(sound: "click.wav", trigger: "on_click")
}
```

### `main.holo` (Composition Layer)

Composes everything into a complete interactive scene:

```holo
// Complete scene composition
composition "Layered Architecture Demo" {
  // Import logic from .hs file
  import { calculateScore } from "./logic/scoring.hs"

  // Import visual component from .hsplus file
  import { InteractiveButton } from "./components/button.hsplus"

  // Scene state
  state {
    score: 0
    clicks: 0
  }

  // Ground
  object "Ground" {
    @collidable
    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 1, 10]
    color: "#2c3e50"
  }

  // Button 1 - Uses imported template
  object "Button1" {
    ...InteractiveButton
    position: [-1, 1.5, -2]

    on_click: {
      state.clicks = state.clicks + 1
      state.score = calculateScore(state.clicks, 30, 85)
    }
  }

  // Button 2 - Uses imported template
  object "Button2" {
    ...InteractiveButton
    position: [1, 1.5, -2]
    color: "#e74c3c"

    on_click: {
      state.clicks = state.clicks + 1
      state.score = calculateScore(state.clicks, 30, 85)
    }
  }

  // Score display
  object "ScorePanel" {
    @glowing
    geometry: "plane"
    position: [0, 2.5, -3]
    scale: [2, 0.5, 1]
    color: "#000000"

    text: "Score: ${state.score}"
  }
}
```

---

## 🚀 How to Use

### Compile to Unity

```bash
holoscript compile main.holo --target unity -o dist/unity/
```

### Compile to WebXR

```bash
holoscript compile main.holo --target threejs -o dist/webxr/
```

### Compile to VRChat

```bash
holoscript compile main.holo --target vrchat -o dist/vrchat/
```

---

## 🎓 Learning Points

### 1. Separation of Concerns

Each layer has a distinct responsibility:
- **Logic** (`.hs`): Pure business logic, reusable across scenes
- **Presentation** (`.hsplus`): Visual components with traits
- **Composition** (`.holo`): Complete scene assembly with state

### 2. Import System

Files can reference each other:
```holo
import { function } from "./logic/file.hs"
import { template } from "./components/file.hsplus"
```

### 3. Template Spreading

The `...TemplateName` syntax spreads template properties:
```holo
object "MyButton" {
  ...InteractiveButton  // Inherits all properties
  position: [0, 1, 0]   // Override specific properties
}
```

### 4. Reactivity

State changes automatically update bound properties:
```holo
state { score: 0 }

object "Display" {
  text: "Score: ${state.score}"  // Updates automatically
}
```

---

## 🔄 Compilation Flow

```
1. Parse main.holo with HoloCompositionParser
   ↓
2. Resolve imports from scoring.hs and button.hsplus
   ↓
3. Parse imported files with HoloScriptPlusParser
   ↓
4. Generate unified JSON AST
   ↓
5. Compile to target platform (Unity/Unreal/WebXR/etc.)
   ↓
6. Output platform-specific code
```

---

## 📊 Why This Architecture?

### Maintainability
- Change scoring logic in one place (`scoring.hs`)
- Reuse button across multiple scenes
- Easy to find where things are defined

### AI-Friendliness
- `.holo` files are easy for LLMs to generate
- Clear structure makes automation possible
- Declarative syntax reduces errors

### Scalability
- Add new logic files without touching scenes
- Create component libraries in `.hsplus`
- Build complex worlds from simple parts

---

**Next Steps**: Try modifying the scoring formula in `scoring.hs` or the button appearance in `button.hsplus` and see how it affects the final scene!
