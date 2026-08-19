# Lesson 1.3: Your First Scene

Now that you have HoloScript installed, let's create your first VR scene! By the end of this lesson, you'll have a working VR experience with interactive objects.

## Learning Objectives

By the end of this lesson, you will:

- Create a new HoloScript project
- Build a simple scene with multiple objects
- Add interactivity with traits and event handlers
- Preview your scene in VR

## Creating a New Project

Open your terminal and run:

```bash
# Create a new project
holoscript init my-vr-room

# Navigate to the project
cd my-vr-room

# Open in VS Code (optional)
code .
```

This creates the following structure:

```
my-vr-room/
├── src/
│   └── main.hsplus      # Your main scene file
├── assets/              # 3D models, textures, audio
├── holoscript.config.ts # Configuration
└── package.json
```

## Your First Scene

Open `src/main.hsplus` and replace the contents with:

```hsplus
// My First VR Room
// A simple scene with interactive objects

composition "My VR Room" {
  @manifest {
    title: "My First VR Room"
    version: "1.0.0"
    author: "Your Name"
  }

  // Environment settings
  environment {
    @skybox { preset: "sunset" }
    @ambient_light { intensity: 0.5, color: "#FFE4B5" }
  }

  // A floating welcome orb
  composition welcomecomposition {
    @grabbable
    @glowing { color: "#4A90D9", intensity: 0.6 }

    position: [0, 1.5, -2]
    scale: 0.15
    color: "#4A90D9"

    onGrab: {
      this.scale = 0.2
      console.log("Welcome to your VR room!")
    }

    onRelease: {
      this.scale = 0.15
    }
  }

  // A physics-enabled cube
  composition physicsCube {
    @grabbable
    @physics {
      mass: 1.0
      friction: 0.5
    }
    @collidable

    position: [1, 1, -2]
    scale: 0.2
    color: "#E74C3C"
    geometry: "cube"

    onCollision: (other) => {
      console.log("Collided with:", other.name)
    }
  }

  // A clickable button
  composition button {
    @clickable
    @hoverable

    position: [-1, 1.2, -2]
    scale: [0.3, 0.1, 0.1]
    color: "#27AE60"
    geometry: "cube"

    onHoverEnter: {
      this.color = "#2ECC71"
    }

    onHoverExit: {
      this.color = "#27AE60"
    }

    onClick: {
      // Change the welcome orb's color
      welcomeOrb.color = randomColor()
    }
  }

  // Floor
  composition floor {
    @collidable

    position: [0, 0, 0]
    scale: [10, 0.1, 10]
    color: "#34495E"
    geometry: "cube"
  }
}

// Helper function
function randomColor() {
  const colors = ["#E74C3C", "#9B59B6", "#3498DB", "#1ABC9C", "#F39C12"]
  return colors[Math.floor(Math.random() * colors.length)]
}
```

## Understanding the Code

### The Composition

```hsplus
composition "My VR Room" {
  // Everything inside is part of this scene
}
```

The composition is your scene container. The name appears in VR headset menus.

### The Environment

```hsplus
environment {
  @skybox { preset: "sunset" }
  @ambient_light { intensity: 0.5 }
}
```

Environment settings affect the entire scene - lighting, skybox, fog, etc.

### Interactive Orbs

Each composition has:

- **Traits** (`@grabbable`, `@physics`) - behaviors
- **Properties** (`position`, `scale`, `color`) - visual attributes
- **Event handlers** (`onGrab`, `onClick`) - interactivity

## Running Your Scene

Start the development server:

```bash
holoscript dev
```

This opens:

- **Browser preview** at `http://localhost:3000`
- **VR mode** accessible via headset browser

### Keyboard Controls (Desktop Preview)

| Key   | Action       |
| ----- | ------------ |
| WASD  | Move         |
| Mouse | Look around  |
| E     | Grab/Release |
| Click | Interact     |

## Adding More Objects

Let's add a table with objects on it:

```hsplus
// Add inside the composition, after the floor

group table {
  position: [0, 0, -3]

  // Table top
  composition top {
    position: [0, 0.8, 0]
    scale: [1.5, 0.05, 0.8]
    color: "#8B4513"
    geometry: "cube"
  }

  // Table leg 1
  composition leg1 {
    position: [-0.6, 0.4, 0.3]
    scale: [0.1, 0.8, 0.1]
    color: "#8B4513"
    geometry: "cube"
  }

  // ... more legs

  // Items on table
  composition vase {
    @grabbable
    @physics { mass: 0.5 }

    position: [0, 1.1, 0]
    scale: [0.15, 0.3, 0.15]
    color: "#3498DB"
    geometry: "cylinder"
  }
}
```

## Exercise: Customize Your Room

1. **Add a light switch** - Create an composition that toggles the ambient light on/off
2. **Create a bouncy ball** - Use `@physics { restitution: 0.9 }` for bounciness
3. **Add a teleport spot** - On click, move the player to a new position

### Solution: Light Switch

```hsplus
composition lightSwitch {
  @clickable

  position: [-3, 1.2, 0]
  scale: [0.1, 0.15, 0.05]
  color: "#ECF0F1"
  geometry: "cube"

  state: {
    lightsOn: true
  }

  onClick: {
    this.state.lightsOn = !this.state.lightsOn
    environment.ambient_light.intensity = this.state.lightsOn ? 0.5 : 0.1
    this.color = this.state.lightsOn ? "#ECF0F1" : "#2C3E50"
  }
}
```

## Common Issues

### Objects Fall Through Floor

Make sure the floor has `@collidable`:

```hsplus
composition floor {
  @collidable  // Required for physics interactions
  // ...
}
```

### Objects Not Grabbable

Ensure you have:

1. `@grabbable` trait on the object
2. Correct collision bounds (scale matters!)

### Performance Issues

Keep the number of physics objects reasonable (~50 max for smooth VR).

## Summary

In this lesson, you:

- Created a new HoloScript project
- Built a scene with multiple interactive objects
- Used traits for physics, interaction, and visuals
- Added event handlers for interactivity
- Ran the development server

## Next Lesson

In [Lesson 1.4: Understanding Compositions](./04-understanding-compositions.md), we'll take a deeper look at composition types, geometries, and properties.

---

**Time to complete:** ~30 minutes
**Difficulty:** Beginner
**Prerequisites:** Lesson 1.2 (Installation)
