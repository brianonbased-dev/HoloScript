# Video 2: Core Concepts (15 min)

**Target audience:** Developers who completed Video 1
**Goal:** Deep understanding of orbs, properties, traits, and templates

---

## Script

### 0:00 — Intro (30s)

> "In the last video you built a simple orb. Today we go deeper.
> By the end of this video you'll understand every building block
> HoloScript gives you."

Topics:
1. Orbs — the building blocks
2. Properties — position, scale, color, and more
3. Traits — adding behavior in one line
4. Templates — reusable definitions

---

### 0:30 — Orbs: The Building Blocks (150s)

```hsplus
orb "Cube" {
  color: "red"
  scale: 1.0
  position: [0, 0, -3]
}
```

> "An orb is a named 3D object. The name is a string, and curly braces
> hold its properties. Everything in a HoloScript scene is an orb."

Multiple orbs:
```hsplus
orb "Floor" {
  color: "#888888"
  scale: [10, 0.1, 10]
  position: [0, -0.5, 0]
}

orb "Ball" {
  color: "orange"
  scale: 0.4
  position: [0, 2, -3]
}
```

> "Notice scale accepts either a single number for uniform scaling,
> or a vec3 array for non-uniform. HoloScript infers the type."

---

### 3:00 — Properties: The Full Reference (150s)

**Transform properties:**
```hsplus
orb "Object" {
  position:  [0, 1, -2]     // vec3: x, y, z (metres)
  rotation:  [0, 45, 0]     // vec3: euler degrees
  scale:     [2, 1, 0.5]    // vec3 or number
}
```

**Visual properties:**
```hsplus
orb "Object" {
  color:     "#ff6b6b"       // hex, rgb(), or named color
  opacity:   0.8             // 0.0 – 1.0
  castShadow: true
  receiveShadow: true
}
```

**Computed / inferred types:**
```hsplus
orb "Object" {
  count     = 0              // inferred: number
  label     = "Hello"        // inferred: string
  direction = [0, 1, 0]     // inferred: vec3
  active    = true           // inferred: boolean
}
```

> "HoloScript 3.12 adds full type inference — no explicit annotations needed.
> Hover over a property in VS Code to see its inferred type."

---

### 6:00 — Traits: Adding Behavior (150s)

> "Traits are the secret weapon of HoloScript. One annotation
> gives your orb a complete behavior system."

```hsplus
orb "Ball" {
  color: "orange"
  scale: 0.4
  position: [0, 2, -3]

  @physics { mass: 1.0  restitution: 0.7 }
  @grabbable
  @shadow
}
```

Trait categories:
| Category | Examples |
|---|---|
| Physics | `@physics`, `@collidable`, `@static` |
| Interaction | `@grabbable`, `@clickable`, `@hoverable` |
| Multiplayer | `@synced`, `@networked`, `@replicated` |
| Accessibility | `@accessible`, `@alt_text`, `@haptic` |
| Visual | `@shadow`, `@highlight`, `@outline` |

> "Traits also enforce rules on each other. If you add @physics
> without @collidable, the type checker tells you."

**[SCREEN: show VS Code error + suggestion]**

---

### 9:00 — Templates: Reusable Definitions (150s)

> "Templates solve copy-paste. Define once, spread everywhere."

```hsplus
template "Furniture" {
  castShadow: true
  receiveShadow: true
  @physics { isStatic: true }
  @collidable
}

orb "Chair" {
  ...Furniture
  color: "#8B4513"
  position: [-2, 0, -4]
  scale: [0.6, 0.8, 0.6]
}

orb "Table" {
  ...Furniture
  color: "#A0522D"
  position: [0, 0, -4]
  scale: [1.5, 0.7, 0.8]
}

orb "Bookshelf" {
  ...Furniture
  color: "#DEB887"
  position: [3, 0.5, -4]
  scale: [0.4, 2.0, 1.2]
}
```

> "The spread operator `...TemplateName` pulls in all properties
> and traits. You can override any property after the spread."

Override example:
```hsplus
orb "GlassTable" {
  ...Furniture
  color: "#88ccff"
  opacity: 0.3
  @physics { isStatic: false }  // Override template's isStatic
}
```

---

### 12:00 — Putting It Together (120s)

Build a complete living room:

```hsplus
@manifest {
  title: "Living Room Demo"
  version: "1.0.0"
}

environment "Room" {
  ambientColor: "#f5f0ea"
  ambientIntensity: 0.6
  sun {
    direction: [0.3, -1, 0.5]
    intensity: 0.8
    castShadow: true
  }
}

template "Furniture" {
  castShadow: true
  @physics { isStatic: true }
  @collidable
}

orb "Sofa" {
  ...Furniture
  color: "#4a5568"
  scale: [2.0, 0.8, 0.9]
  position: [0, 0.4, -3]
}

orb "CoffeeTable" {
  ...Furniture
  color: "#8B4513"
  scale: [1.0, 0.4, 0.6]
  position: [0, 0.2, -1.8]
}

orb "RemoteControl" {
  color: "#2d3748"
  scale: [0.15, 0.04, 0.35]
  position: [0.3, 0.45, -1.8]
  @grabbable
  @physics { mass: 0.1 }
}
```

---

### 14:30 — Recap (30s)

> "You now know every building block:
> ✓ Orbs — named 3D objects
> ✓ Properties — transform, visual, custom
> ✓ Traits — one-line behavior systems
> ✓ Templates — reusable definitions with spread"

Next: **Video 3 — Building a VR Room** (full project walkthrough)

---

## Production Notes

- **Duration target:** 14:30–15:30
- **Thumbnail:** Split screen — code on left, 3D living room on right
- **Key demo:** VS Code type inference hover — show inferred `vec3` tooltip
- **Captions:** Include trait pronunciation guide (@grabbable = "at-grabbable")
