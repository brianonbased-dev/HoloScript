# Lesson 3.1: Custom Trait Development

In this advanced lesson, you'll learn how to create your own traits - extending HoloScript's capabilities to meet your specific needs.

## Learning Objectives

By the end of this lesson, you will:

- Understand the trait system architecture
- Create custom traits from scratch
- Implement trait lifecycle methods
- Publish traits for others to use

## Trait Architecture

Traits in HoloScript follow a component-based architecture:

```
┌─────────────────────────────────────────────┐
│                   composition │
├─────────────────────────────────────────────┤
│  @trait1  │  @trait2  │  @trait3  │  ...    │
├───────────┼───────────┼───────────┼─────────┤
│  state    │  state    │  state    │         │
│  methods  │  methods  │  methods  │         │
│  events   │  events   │  events   │         │
└───────────┴───────────┴───────────┴─────────┘
```

Each trait:

- Has its own **state** (configuration and runtime data)
- Implements **lifecycle methods** (init, update, destroy)
- Can emit and listen to **events**
- Can access the **host orb** and other traits

## Creating Your First Custom Trait

Let's create a `@health` trait for damageable objects:

### Step 1: Define the Trait

Create `src/traits/HealthTrait.ts`:

```typescript
import { TraitDefinition, TraitContext, TraitConfig, TraitEvent } from '@holoscript/core';

// Configuration schema
interface HealthConfig extends TraitConfig {
  maxHealth: number;
  currentHealth?: number;
  regeneration?: number;
  invulnerableTime?: number;
}

// Trait state
interface HealthState {
  currentHealth: number;
  maxHealth: number;
  isDead: boolean;
  isInvulnerable: boolean;
  lastDamageTime: number;
}

// Events this trait emits
interface HealthEvents {
  'health:damaged': { amount: number; source?: string; newHealth: number };
  'health:healed': { amount: number; newHealth: number };
  'health:died': { killer?: string };
  'health:revived': { health: number };
}

export const HealthTrait: TraitDefinition<HealthConfig, HealthState, HealthEvents> = {
  name: 'health',
  version: '1.0.0',

  // Default configuration
  defaultConfig: {
    maxHealth: 100,
    currentHealth: undefined, // Defaults to maxHealth
    regeneration: 0, // HP per second
    invulnerableTime: 0.5, // Seconds after damage
  },

  // Initialize the trait
  init(ctx: TraitContext<HealthConfig>): HealthState {
    const config = ctx.config;

    return {
      currentHealth: config.currentHealth ?? config.maxHealth,
      maxHealth: config.maxHealth,
      isDead: false,
      isInvulnerable: false,
      lastDamageTime: 0,
    };
  },

  // Update called every frame
  update(ctx: TraitContext<HealthConfig>, state: HealthState, deltaTime: number): void {
    // Handle invulnerability
    if (state.isInvulnerable) {
      const timeSinceDamage = ctx.time - state.lastDamageTime;
      if (timeSinceDamage >= ctx.config.invulnerableTime) {
        state.isInvulnerable = false;
      }
    }

    // Handle regeneration
    if (ctx.config.regeneration > 0 && !state.isDead) {
      const regenAmount = ctx.config.regeneration * deltaTime;
      if (state.currentHealth < state.maxHealth) {
        state.currentHealth = Math.min(state.maxHealth, state.currentHealth + regenAmount);
      }
    }
  },

  // Public methods exposed to HoloScript
  methods: {
    damage(ctx, state, amount: number, source?: string): number {
      if (state.isDead || state.isInvulnerable) {
        return 0;
      }

      const actualDamage = Math.min(amount, state.currentHealth);
      state.currentHealth -= actualDamage;
      state.lastDamageTime = ctx.time;
      state.isInvulnerable = true;

      ctx.emit('health:damaged', {
        amount: actualDamage,
        source,
        newHealth: state.currentHealth,
      });

      if (state.currentHealth <= 0) {
        state.isDead = true;
        ctx.emit('health:died', { killer: source });
      }

      return actualDamage;
    },

    heal(ctx, state, amount: number): number {
      if (state.isDead) {
        return 0;
      }

      const actualHeal = Math.min(amount, state.maxHealth - state.currentHealth);
      state.currentHealth += actualHeal;

      ctx.emit('health:healed', {
        amount: actualHeal,
        newHealth: state.currentHealth,
      });

      return actualHeal;
    },

    revive(ctx, state, healthPercent: number = 0.5): void {
      if (!state.isDead) return;

      state.isDead = false;
      state.currentHealth = state.maxHealth * healthPercent;
      state.isInvulnerable = true;
      state.lastDamageTime = ctx.time;

      ctx.emit('health:revived', { health: state.currentHealth });
    },

    getHealth(ctx, state): number {
      return state.currentHealth;
    },

    getHealthPercent(ctx, state): number {
      return state.currentHealth / state.maxHealth;
    },

    isDead(ctx, state): boolean {
      return state.isDead;
    },
  },

  // Cleanup when trait is removed
  destroy(ctx: TraitContext<HealthConfig>, state: HealthState): void {
    // Cleanup resources if needed
  },
};

export default HealthTrait;
```

### Step 2: Register the Trait

In your project's `holoscript.config.ts`:

```typescript
import { defineConfig } from '@holoscript/cli';
import { HealthTrait } from './src/traits/HealthTrait';

export default defineConfig({
  traits: [HealthTrait],
});
```

### Step 3: Use Your Trait

```hsplus
composition "Combat Demo" {
  composition enemy {
    @health {
      maxHealth: 50
      regeneration: 2
      invulnerableTime: 0.3
    }

    @collidable

    position: [0, 1, -3]
    color: "#E74C3C"

    // Listen to health events
    on_health_damaged: (event) => {
      console.log(`Took ${event.amount} damage! HP: ${event.newHealth}`)

      // Flash red
      this.color = "#FF0000"
      setTimeout(() => { this.color = "#E74C3C" }, 100)
    }

    on_health_died: (event) => {
      console.log("Enemy defeated!")
      this.visible = false
    }
  }

  // Weapon that deals damage
  composition sword {
    @grabbable

    position: [1, 1, -2]
    scale: [0.1, 0.5, 0.02]
    color: "#C0C0C0"
    geometry: "cube"

    onCollision: (other) => {
      if (other.hasTrait("health")) {
        other.damage(10, "sword")
      }
    }
  }
}
```

## Advanced Trait Patterns

### Trait Dependencies

Require other traits:

```typescript
export const ArmorTrait: TraitDefinition = {
  name: 'armor',
  requires: ['health'], // Must have @health trait

  init(ctx) {
    // Access health trait
    const healthTrait = ctx.getTrait('health');

    // Intercept damage
    ctx.intercept('health:damage', (amount, source) => {
      const reduction = ctx.config.damageReduction;
      return amount * (1 - reduction);
    });
  },
};
```

### Trait Communication

Traits can communicate via the host orb:

```typescript
// In HealthTrait
methods: {
  damage(ctx, state, amount, source) {
    // Check for shield trait
    const shield = ctx.getTrait('shield');
    if (shield && shield.isActive()) {
      amount = shield.absorbDamage(amount);
    }

    // Continue with damage logic...
  }
}
```

### Networked Traits

Make trait state sync across network:

```typescript
export const HealthTrait: TraitDefinition = {
  name: 'health',

  // Define which state syncs
  networked: {
    syncState: ['currentHealth', 'isDead'],
    ownerAuthority: true, // Only owner can modify
    interpolate: true,
  },

  // Network-specific methods
  onNetworkSync(ctx, state, remoteState) {
    // Smooth interpolation
    state.currentHealth = lerp(state.currentHealth, remoteState.currentHealth, 0.1);
  },
};
```

## Publishing Your Trait

### Package Structure

```
my-traits/
├── src/
│   ├── HealthTrait.ts
│   ├── ArmorTrait.ts
│   └── index.ts
├── package.json
└── README.md
```

### package.json

```json
{
  "name": "@myteam/combat-traits",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "holoscript": {
    "traits": ["health", "armor", "shield"]
  },
  "peerDependencies": {
    "@holoscript/core": "^2.0.0"
  }
}
```

### Publishing

```bash
# Build
npm run build

# Publish to HoloScript registry
holoscript publish
```

### Using Published Traits

```bash
# Install the package
holoscript add @myteam/combat-traits
```

```hsplus
// Automatically available after install
composition player {
  @health { maxHealth: 100 }
  @armor { damageReduction: 0.2 }
}
```

## Exercise: Create a "Collectible" Trait

Build a `@collectible` trait that:

1. Makes objects collectible by the player
2. Plays a collection sound
3. Adds to an inventory system
4. Has a respawn timer

### Requirements

- Config: `respawnTime`, `value`, `soundClip`
- Events: `collected`, `respawned`
- Methods: `collect()`, `forceRespawn()`

## Summary

In this lesson, you learned:

- The trait architecture and lifecycle
- Creating traits with TypeScript
- Implementing state, methods, and events
- Trait dependencies and communication
- Publishing traits for reuse

## Next Lesson

In [Lesson 3.2: Plugin Architecture](./02-plugin-architecture.md), we'll explore the broader plugin system for extending HoloScript.

---

**Time to complete:** ~60 minutes
**Difficulty:** Advanced
**Prerequisites:** Level 2 Complete, TypeScript knowledge
