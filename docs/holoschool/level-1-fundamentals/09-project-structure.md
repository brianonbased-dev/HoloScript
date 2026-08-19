# Project Structure

Welcome to Lesson 1.9! In this lesson, you'll learn how to organize larger HoloScript projects for maintainability and collaboration.

## Standard Project Layout

Here's the recommended structure for HoloScript projects:

```
my-vr-project/
├── holoscript.config.json     # Project configuration
├── package.json               # npm dependencies
├── README.md                  # Project documentation
├── src/
│   ├── main.holo              # Entry point
│   ├── scenes/                # Scene definitions
│   │   ├── menu.holo
│   │   ├── level1.holo
│   │   └── level2.holo
│   ├── templates/             # Reusable templates
│   │   ├── ui/
│   │   │   ├── Button.hs
│   │   │   └── Panel.hs
│   │   ├── characters/
│   │   │   ├── Player.hs
│   │   │   └── Enemy.hs
│   │   └── props/
│   │       ├── Weapon.hs
│   │       └── Furniture.hs
│   ├── logic/                 # Game logic
│   │   ├── GameManager.hs
│   │   └── ScoreSystem.hs
│   └── utils/                 # Utilities
│       └── helpers.hs
├── assets/
│   ├── models/                # 3D models (.glb, .gltf)
│   ├── textures/              # Images and textures
│   ├── audio/                 # Sound files
│   └── fonts/                 # Custom fonts
├── tests/                     # Test files
│   └── templates.test.hs
└── dist/                      # Build output (generated)
```

## Configuration File

The `holoscript.config.json` file controls project settings:

```json
{
  "name": "my-vr-project",
  "version": "1.0.0",
  "description": "An immersive VR experience",
  "entry": "src/main.holo",
  "targets": ["web", "oculus", "steamvr"],

  "compiler": {
    "strictMode": true,
    "optimizations": true,
    "sourceMaps": true,
    "target": "es2020"
  },

  "linter": {
    "rules": {
      "no-unused": "warn",
      "no-console": "off",
      "require-geometry": "error"
    }
  },

  "formatter": {
    "tabWidth": 2,
    "useTabs": false,
    "printWidth": 100
  },

  "assets": {
    "publicPath": "/assets/",
    "compress": true,
    "textureCompression": "etc2"
  },

  "server": {
    "port": 3000,
    "hot": true,
    "https": false
  }
}
```

## Entry Point

The entry file (`src/main.holo`) bootstraps your application:

```holo
// main.holo - Application entry point

import { MenuScene } from "./scenes/menu.holo"
import { Level1 } from "./scenes/level1.holo"
import { GameManager } from "./logic/GameManager.hs"

// Initialize game systems
GameManager.init({
  startScene: "menu",
  debug: false
})

// Register scenes
scene.register("menu", MenuScene)
scene.register("level1", Level1)

// Start with menu
scene.load("menu")
```

## Organizing Scenes

### Scene Files

Each scene is a composition:

```holo
// scenes/menu.holo

import { Button, Panel } from "../templates/ui"

export composition MenuScene {
  environment {
    skybox: "sunset"
    ambient_light: 0.5
  }

  object menuPanel using Panel {
    position: [0, 1.5, -2]

    object startButton using Button {
      label: "Start Game"
      onClick: { scene.load("level1") }
    }

    object optionsButton using Button {
      label: "Options"
      onClick: { scene.load("options") }
    }

    object quitButton using Button {
      label: "Quit"
      onClick: { app.quit() }
    }
  }
}
```

### Scene Dependencies

Scenes can share resources:

```holo
// scenes/level1.holo

import { Player } from "../templates/characters/Player"
import { Enemy } from "../templates/characters/Enemy"
import { Weapon } from "../templates/props/Weapon"
import { ScoreSystem } from "../logic/ScoreSystem"

export composition Level1 {
  environment {
    skybox: "night"
    fog: { color: "#1a1a2e", near: 10, far: 50 }
  }

  // Shared state
  ScoreSystem.init()

  object player using Player {
    position: [0, 0, 0]
    health: 100
  }

  group enemies {
    object enemy1 using Enemy { position: [5, 0, 10] }
    object enemy2 using Enemy { position: [-5, 0, 10] }
    object enemy3 using Enemy { position: [0, 0, 15] }
  }
}
```

## Template Organization

### Folder by Category

```
templates/
├── ui/                    # User interface
│   ├── Button.hs
│   ├── Slider.hs
│   ├── Panel.hs
│   └── index.hs           # Re-exports
├── characters/            # Characters
│   ├── Player.hs
│   ├── Enemy.hs
│   ├── NPC.hs
│   └── index.hs
├── props/                 # Props and items
│   ├── Weapon.hs
│   ├── Furniture.hs
│   └── index.hs
└── effects/               # Visual effects
    ├── Particles.hs
    ├── Lighting.hs
    └── index.hs
```

### Index Files for Clean Imports

```hs
// templates/ui/index.hs

export { Button } from "./Button.hs"
export { Slider } from "./Slider.hs"
export { Panel } from "./Panel.hs"
export { Modal } from "./Modal.hs"
```

Now import cleanly:

```hs
import { Button, Slider, Panel } from "../templates/ui"
```

## Asset Management

### Asset References

Keep assets organized and reference them relatively:

```hs
composition character {
  geometry: "model/characters/hero.glb"
  material: {
    map: "textures/characters/hero_diffuse.png"
    normalMap: "textures/characters/hero_normal.png"
  }
}

composition ambient {
  @spatial_audio
  sound: "audio/ambient/forest.mp3"
}
```

### Asset Loading

Preload assets for better performance:

```hs
// Preload common assets
assets.preload([
  "models/player.glb",
  "textures/environment.jpg",
  "audio/music.mp3"
])

// Wait for loading before showing scene
assets.onReady(() => {
  loading.hide()
  scene.show()
})
```

## Module Patterns

### Logic Modules

Separate logic from scene definitions:

```hs
// logic/GameManager.hs

export const GameManager = {
  score: 0,
  lives: 3,
  level: 1,

  init(config) {
    this.score = 0
    this.lives = config.startLives || 3
  },

  addScore(points) {
    this.score += points
    events.emit("scoreChanged", this.score)
  },

  loseLife() {
    this.lives -= 1
    if (this.lives <= 0) {
      this.gameOver()
    }
  },

  gameOver() {
    events.emit("gameOver")
    scene.load("gameover")
  }
}
```

### Event-Driven Architecture

Use events for loose coupling:

```hs
// logic/ScoreSystem.hs

export const ScoreSystem = {
  score: 0,
  multiplier: 1,

  init() {
    events.on("enemyKilled", (enemy) => {
      this.add(enemy.points * this.multiplier)
    })

    events.on("powerupCollected", (powerup) => {
      if (powerup.type === "multiplier") {
        this.multiplier = 2
        setTimeout(() => this.multiplier = 1, 10000)
      }
    })
  },

  add(points) {
    this.score += points
    events.emit("scoreUpdated", this.score)
  }
}
```

## Environment-Specific Config

Use different configs for development and production:

```json
// holoscript.config.json
{
  "environments": {
    "development": {
      "debug": true,
      "logging": "verbose",
      "optimizations": false
    },
    "production": {
      "debug": false,
      "logging": "error",
      "optimizations": true,
      "minify": true
    }
  }
}
```

Run with environment:

```bash
holoscript dev                    # Uses development
holoscript build --env production # Uses production
```

## Monorepo Support

For larger projects, use a monorepo:

```
my-vr-platform/
├── packages/
│   ├── shared-ui/             # Shared UI components
│   │   ├── package.json
│   │   └── src/
│   ├── game-core/             # Core game logic
│   │   ├── package.json
│   │   └── src/
│   └── vr-app/                # Main application
│       ├── package.json
│       ├── holoscript.config.json
│       └── src/
├── package.json               # Root package.json
└── pnpm-workspace.yaml        # Workspace config
```

## Quiz

1. What file is the main entry point?
2. Where should 3D models be stored?
3. How do you create an index file for cleaner imports?
4. What's the purpose of the `holoscript.config.json` file?
5. How should templates be organized?

<details>
<summary>Answers</summary>

1. `src/main.holo` (configured in holoscript.config.json)
2. `assets/models/`
3. Create an `index.hs` that re-exports: `export { X } from "./X.hs"`
4. Project configuration: compiler settings, linter rules, build options
5. By category in folders (ui, characters, props, effects)

</details>

---

**Estimated time:** 20 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.10 - Building & Deploying](./10-building.md)
