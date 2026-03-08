# Modules & Imports Reference (`.hsplus`)

Complete reference for the module system in `.hsplus` format.

## Basic Import/Export

### Exporting

```holoscript
// Export function
export function calculateDamage(baseDamage, armor) {
  return baseDamage * (1 - armor / (armor + 100));
}

// Export constant
export const MAX_PLAYERS = 8;

// Export template
export template "Weapon" {
  state {
    damage: 10
    durability: 100
  }

  geometry: "box"
}

// Default export
export default composition "MainGame" {
  // ...
}
```

### Importing

```holoscript
// Import entire module
import GameUtils from "./utils/game.hsplus";

// Import specific exports
import { calculateDamage, MAX_PLAYERS } from "./utils/helpers.hsplus";

// Import with alias
import { PlayerController as PC } from "./controllers/player.hsplus";

// Import types
import type { GameConfig } from "./types.hsplus";
```

## Module Patterns

### Utility Module

```holoscript
// File: utils/math.hsplus
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export const MathConstants = {
  PI: Math.PI,
  TAU: Math.PI * 2
};
```

### Component Library

```holoscript
// File: components/ui.hsplus
export template "Button" {
  type: "ui"
  uiType: "button"

  state {
    isHovered: false
  }

  on_pointer_enter() {
    this.state.isHovered = true;
  }
}

export template "ProgressBar" {
  type: "ui"
  uiType: "progressBar"

  state {
    value: 0
    max: 100
  }
}
```

## Using Imports

```holoscript
import { Button, ProgressBar } from "./components/ui.hsplus";
import { GameConfig } from "./config/game.hsplus";

composition "MyGame" {
  state {
    playerHealth: 100
  }

  object "HealthBar" using "ProgressBar" {
    position: { x: 10, y: 10 }

    bind: {
      value: "state.playerHealth",
      max: 100
    }
  }

  object "StartButton" using "Button" {
    text: "Start"
    position: { x: 10, y: 60 }
  }
}
```

## Dynamic Imports

```holoscript
composition "LevelLoader" {
  actions {
    async loadLevel(levelName) {
      const level = await import(`./levels/${levelName}.hsplus`);
      this.addComposition(level.default);
    }
  }
}
```

## Re-Exporting (Barrel Pattern)

```holoscript
// File: index.hsplus
export * from "./components/ui.hsplus";
export * from "./utils/math.hsplus";
export { GameConfig } from "./config/game.hsplus";
```

## Namespace Import

```holoscript
import * as MathUtils from "./utils/math.hsplus";

composition "Example" {
  actions {
    calculate() {
      const angle = MathUtils.randomRange(0, MathUtils.MathConstants.TAU);
      return MathUtils.lerp(0, 10, 0.5);
    }
  }
}
```

## Next Steps

- [State & Actions Reference](./reference-hsplus-state)
- [Event Handlers Reference](./reference-hsplus-events)
- [Templates & Decorators Reference](./reference-hsplus-templates)
