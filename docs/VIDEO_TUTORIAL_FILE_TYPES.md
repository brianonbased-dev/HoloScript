# Video Tutorial: Understanding HoloScript File Types (8-10 min)

**Target:** New developers who want to understand the file system
**Goal:** Learn when to use `.holo`, `.hs`, `.hsplus`, and how they work together

---

## INTRO (0:00 - 0:30)

> [SCREEN: Four file icons: .holo, .hsplus, .hs, .ts]

"HoloScript uses a layered file architecture — and understanding it will make you 10x more productive. In this tutorial, you'll learn the difference between `.holo`, `.hsplus`, `.hs`, and `.ts` files, and when to use each one.

By the end, you'll understand how to organize projects like a pro."

---

## THE LAYERED ARCHITECTURE (0:30 - 2:00)

> [SCREEN: Animation showing three layers stacking]

"HoloScript isn't just one file type — it's a **three-layer architecture**:

**Layer 1: Composition** (`.holo` files)
- Complete scenes and worlds
- AI-friendly declarative syntax
- Entry point for compilation

**Layer 2: Presentation** (`.hsplus` files)
- 3D objects with visual traits
- Modules and templates
- TypeScript-like syntax

**Layer 3: Logic** (`.hs` files)
- Business logic and utilities
- State machines
- Reusable functions

**Infrastructure:** (`.ts` files)
- Parser implementations
- CLI tools
- NOT HoloScript code - this is the implementation OF HoloScript"

> [SCREEN: Diagram showing layers connecting]

"Think of it like MVC: Model (`.hs`), View (`.hsplus`), Controller (`.holo`)."

---

## .HOLO FILES - COMPOSITION LAYER (2:00 - 3:30)

> [SCREEN: Create new file `scene.holo`]

"Let's start with `.holo` files. These define complete scenes using a declarative syntax:"

```holo
composition "My VR Scene" {
  object "Cube" {
    @grabbable
    @physics

    geometry: "cube"
    position: [0, 1, 0]
    color: "#ff6347"
  }

  object "Ground" {
    @collidable

    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 1, 10]
  }
}
```

"Notice the `composition` wrapper — that's unique to `.holo` files. This is your entry point for compilation."

> [SCREEN: Terminal]

```bash
holoscript compile scene.holo --target unity
# ✅ Compiles to Unity
```

"**Use `.holo` when:** You're building a complete scene, working with AI generation, or need maximum compatibility."

---

## .HSPLUS FILES - PRESENTATION LAYER (3:30 - 5:00)

> [SCREEN: Create `components/button.hsplus`]

"Next, `.hsplus` files. These define reusable visual components with traits:"

```hsplus
// components/button.hsplus
template InteractiveButton {
  geometry: "cylinder"
  rotation: [90, 0, 0]
  scale: [0.3, 0.05, 0.3]
  color: "#4ecdc4"

  @clickable
  @pointable
  @glowing
  @audio(sound: "click.wav")
}
```

"Now import it into your `.holo` file:"

```holo
composition "Button Demo" {
  import { InteractiveButton } from "./components/button.hsplus"

  object "MyButton" {
    ...InteractiveButton  // Spread template
    position: [0, 1.5, -2]
  }
}
```

"The `...` syntax spreads all properties from the template."

"**Use `.hsplus` when:** Building component libraries, working with robotics (URDF/SDF), or need modules."

---

## .HS FILES - LOGIC LAYER (5:00 - 6:30)

> [SCREEN: Create `logic/scoring.hs`]

"Finally, `.hs` files handle pure logic:"

```hs
// logic/scoring.hs
function calculateScore(hits, time, accuracy) {
  base = hits * 10
  bonus = max(0, 100 - time)
  multiplier = accuracy / 100

  return (base + bonus) * multiplier
}
```

"Import and use it:"

```holo
composition "Game" {
  import { calculateScore } from "./logic/scoring.hs"

  state {
    score: 0
  }

  object "Target" {
    @clickable
    on_click: {
      state.score = calculateScore(10, 30, 85)
    }
  }
}
```

"**Use `.hs` when:** Defining reusable logic, state machines, or utility functions."

---

## HOW THEY WORK TOGETHER (6:30 - 8:00)

> [SCREEN: File tree of complete project]

```
my-vr-project/
├── main.holo              # Entry point
├── scenes/
│   ├── lobby.holo
│   └── game.holo
├── components/
│   ├── button.hsplus      # Visual templates
│   └── menu.hsplus
└── logic/
    ├── scoring.hs         # Business logic
    └── inventory.hs
```

> [SCREEN: Compilation flow animation]

"When you compile `main.holo`:
1. HoloScript parses it with `HoloCompositionParser`
2. Resolves imports from `.hs` and `.hsplus` files
3. Parses those with `HoloScriptPlusParser`
4. Generates a unified JSON AST
5. Compiles to your target platform"

"All three file types work together seamlessly."

---

## DECISION TREE (8:00 - 9:00)

> [SCREEN: Decision flowchart animation]

"Quick decision guide:

**Need to compile directly?**
→ Use `.holo` (compositions) or `.hsplus` (robotics)

**Building reusable components?**
→ Use `.hsplus` (visual) or `.hs` (logic)

**Working with AI generation?**
→ Use `.holo` (most AI-friendly)

**Need TypeScript integration?**
→ Use `.hsplus` (supports modules)

**Maximum portability?**
→ Use `.holo` (works everywhere)"

---

## PRACTICAL EXAMPLE (9:00 - 9:45)

> [SCREEN: Terminal, quick demo]

```bash
# Parse different file types
holoscript parse scene.holo        # ✅ Composition
holoscript parse button.hsplus     # ✅ Template
holoscript parse scoring.hs        # ✅ Logic

# Compile entry points
holoscript compile scene.holo --target unity    # ✅
holoscript compile button.hsplus --target urdf  # ✅
holoscript compile scoring.hs --target unity    # ❌ Not an entry point
```

"Notice: `.hs` files can't be compiled directly — they must be imported into a `.holo` file."

---

## OUTRO (9:45 - 10:00)

"You now understand HoloScript's layered architecture:
- `.holo` → Complete scenes
- `.hsplus` → Visual components & modules
- `.hs` → Pure logic
- `.ts` → Infrastructure (not HoloScript)

For more details, check the [File Types Guide](./FILE_TYPES.md).

In the next tutorial, we'll build a complete project using all three file types together. See you there!"

> [SCREEN: End card with links]

---

## B-ROLL SUGGESTIONS

- Animated diagram of three layers stacking
- Side-by-side code comparison of three file types
- Compilation flow visualization
- File tree of real project
- Terminal commands with color-coded output

---

## KEY TAKEAWAYS

1. **Four file types**: `.holo` (composition), `.hsplus` (presentation), `.hs` (logic), `.ts` (infrastructure)
2. **Layered architecture**: Think MVC — each layer has a distinct responsibility
3. **Import system**: Files can reference each other seamlessly
4. **Compilation**: `.holo` and `.hsplus` can compile directly; `.hs` must be imported
5. **Decision tree**: Choose based on what you're building (scene, component, or logic)

---

**Runtime:** 8-10 minutes
**Difficulty:** Beginner
**Prerequisites:** Basic HoloScript syntax
**Next Tutorial:** Building with the Layered Architecture
