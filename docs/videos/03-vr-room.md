# Video 3: Building a VR Room (20 min)

**Target audience:** Intermediate — familiar with orbs, traits, templates
**Goal:** Build a complete, interactive VR room from scratch

---

## Script

### 0:00 — Project Setup (120s)

```bash
holoscript init vr-gallery
cd vr-gallery
code .
```

**[SCREEN: VS Code opens]**

Plan for this video:
1. Room structure (walls, floor, ceiling)
2. Furniture with physics
3. Lighting setup
4. Interactive objects (grabbable, physics)
5. Audio zones
6. Final polish + export

---

### 2:00 — Room Structure (180s)

`src/scene.hsplus`:

```hsplus
@manifest {
  title: "VR Gallery"
  version: "1.0.0"
  maxPlayers: 1
}

environment "Gallery" {
  ambientColor: "#f8f4ee"
  ambientIntensity: 0.4
  fog { density: 0.02  color: "#f8f4ee" }
}

template "Wall" {
  color: "#e8e0d5"
  castShadow: false
  receiveShadow: true
  @physics { isStatic: true }
  @collidable
}

// Floor
orb "Floor" {
  ...Wall
  color: "#c8b89a"
  scale: [10, 0.1, 10]
  position: [0, -0.05, 0]
}

// Ceiling
orb "Ceiling" {
  ...Wall
  scale: [10, 0.1, 10]
  position: [0, 3.05, 0]
}

// Walls
orb "WallFront"  { ...Wall  scale: [10, 3, 0.1]  position: [0, 1.5, -5] }
orb "WallBack"   { ...Wall  scale: [10, 3, 0.1]  position: [0, 1.5,  5] }
orb "WallLeft"   { ...Wall  scale: [0.1, 3, 10]  position: [-5, 1.5, 0] }
orb "WallRight"  { ...Wall  scale: [0.1, 3, 10]  position: [ 5, 1.5, 0] }
```

> "The template Wall handles the physics and collidable traits once.
> Each wall just overrides scale and position."

---

### 5:00 — Furniture (180s)

```hsplus
template "Furniture" {
  castShadow: true
  receiveShadow: true
  @physics { isStatic: true }
  @collidable
}

orb "Plinth1" {
  ...Furniture
  color: "#f0ebe4"
  scale: [0.6, 1.0, 0.6]
  position: [-3, 0.5, -3]
}

orb "Plinth2" {
  ...Furniture
  color: "#f0ebe4"
  scale: [0.6, 1.0, 0.6]
  position: [0, 0.5, -3]
}

orb "Plinth3" {
  ...Furniture
  color: "#f0ebe4"
  scale: [0.6, 1.0, 0.6]
  position: [3, 0.5, -3]
}

orb "Bench" {
  ...Furniture
  color: "#8B4513"
  scale: [2.0, 0.45, 0.5]
  position: [0, 0.225, 2]
}
```

---

### 8:00 — Lighting Setup (120s)

```hsplus
environment "Gallery" {
  ambientColor: "#f8f4ee"
  ambientIntensity: 0.4

  // Main directional light (simulates skylights)
  sun {
    direction: [0.1, -1, 0.3]
    intensity: 0.6
    castShadow: true
    shadowMapSize: 2048
  }

  // Accent spotlights over plinths
  spotlight "Light1" {
    position: [-3, 2.8, -3]
    target: [-3, 0, -3]
    intensity: 2.0
    color: "#fff8e7"
    angle: 0.3
    castShadow: true
  }

  spotlight "Light2" {
    position: [0, 2.8, -3]
    target: [0, 0, -3]
    intensity: 2.0
    color: "#fff8e7"
    angle: 0.3
  }

  spotlight "Light3" {
    position: [3, 2.8, -3]
    target: [3, 0, -3]
    intensity: 2.0
    color: "#fff8e7"
    angle: 0.3
  }
}
```

---

### 11:00 — Interactive Objects (180s)

Place sculptures on plinths:

```hsplus
orb "Sculpture1" {
  color: "#d4af37"         // gold
  scale: 0.35
  position: [-3, 1.35, -3]
  castShadow: true

  @physics { mass: 0.5  restitution: 0.2 }
  @grabbable
  @highlight { color: "#ffffff"  onHover: true }
  @accessible {
    role: "artwork"
    label: "Golden sphere — 2024"
  }
}

orb "Sculpture2" {
  color: "#a8a9ad"         // silver
  scale: [0.3, 0.5, 0.3]
  position: [0, 1.5, -3]
  castShadow: true

  @physics { mass: 0.8  restitution: 0.1 }
  @grabbable
  @highlight { color: "#aaaaff"  onHover: true }
  @accessible {
    role: "artwork"
    label: "Silver cylinder — 2024"
  }
}

orb "Sculpture3" {
  color: "#cd7f32"         // bronze
  scale: 0.4
  position: [3, 1.4, -3]
  castShadow: true

  @physics { mass: 1.2  restitution: 0.3 }
  @grabbable
  @highlight { color: "#ffcc88"  onHover: true }
  @accessible {
    role: "artwork"
    label: "Bronze sphere — 2024"
  }

  logic "reset" {
    on_tick: (dt) => {
      // Auto-return if dropped too far from plinth
      if (this.position.y < -0.5) {
        this.position = [3, 1.4, -3]
      }
    }
  }
}
```

---

### 15:00 — Audio Zones (120s)

```hsplus
@zones {
  zone "EntranceAmbience" {
    shape: "box"
    position: [0, 1.5, 3]
    scale: [10, 3, 4]
    audio {
      src: "audio/gallery-ambience.ogg"
      loop: true
      volume: 0.3
      spatialize: false
    }
  }

  zone "SculptureZone" {
    shape: "box"
    position: [0, 1.5, -2]
    scale: [10, 3, 6]
    audio {
      src: "audio/subtle-tone.ogg"
      loop: true
      volume: 0.15
    }
  }
}
```

> "Audio zones play ambient sound when the player enters.
> No JavaScript, no AudioContext setup — HoloScript handles it."

---

### 18:00 — Final Polish (90s)

```hsplus
// Info panel on wall
orb "InfoPanel" {
  color: "#1a1a2e"
  scale: [1.5, 0.8, 0.02]
  position: [0, 1.6, -4.9]

  @accessible {
    role: "region"
    label: "Gallery information panel"
  }
}

orb "InfoText" {
  position: [0, 1.6, -4.88]
  scale: [1.4, 0.7, 0.01]
  text: "HoloScript Gallery\nCollections 2024"
  textColor: "#ffffff"
  fontSize: 0.08
}
```

```bash
holoscript build --target=webxr src/scene.hsplus --out=dist/
holoscript preview dist/
```

---

### 19:30 — Recap (30s)

> "You built a complete VR gallery:
> ✓ Room structure with physics walls
> ✓ Lighting with spotlights and shadows
> ✓ Grabbable sculptures with physics
> ✓ Auto-return logic on drop
> ✓ Audio zones
> ✓ Accessibility annotations"

Next: **Video 4 — Multiplayer Basics**

---

## Production Notes

- **Duration target:** 19:00–21:00
- **Thumbnail:** VR gallery interior render, warm lighting, floating sculptures
- **Key moment:** Grab and drop sculpture (15:00) — use screen recording with Quest controller overlay
- **Music:** Soft ambient, no vocals (available on Epidemic Sound)
