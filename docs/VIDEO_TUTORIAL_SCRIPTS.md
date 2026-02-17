# HoloScript Video Tutorial Scripts

4 production-ready video tutorial scripts covering the complete HoloScript developer journey.

---

## Tutorial 1: Getting Started with HoloScript (5 min)

**Target:** First-time users, no prior experience required
**Goal:** Install HoloScript, write first scene, see it rendered

---

### INTRO (0:00 - 0:20)

> [SCREEN: HoloScript logo + tagline "Write once. Run everywhere."]

"Welcome to HoloScript — the AI-native spatial computing language that compiles your code to 18 platforms, from WebXR to Unity to robotics simulations.

In the next 5 minutes, you'll install HoloScript, write your first VR scene, and compile it to a live WebXR experience. Let's go."

---

### INSTALLATION (0:20 - 1:00)

> [SCREEN: Terminal window]

"First, let's install the HoloScript CLI. Open your terminal and run:"

```bash
npm install -g @holoscript/cli
```

> [SHOW: npm installing, progress bar]

"That's it. Let's verify it works:"

```bash
holoscript --version
# HoloScript CLI v3.4.0
```

"Perfect. Now let's write our first scene."

---

### FIRST SCENE (1:00 - 2:30)

> [SCREEN: Create new file, VS Code opens]

"Create a new file called `hello.holo`."

```bash
touch hello.holo
code hello.holo
```

"Now let's write our scene. HoloScript uses a simple, declarative syntax."

> [SCREEN: Typing in VS Code with syntax highlighting]

```holoscript
// hello.holo — My first HoloScript scene

scene {
  // A red sphere floating at eye level
  sphere {
    @color(red)
    @position(0, 1.5, -2)  // 2 meters in front, eye height
    @scale(0.3, 0.3, 0.3)  // 30cm diameter
    @glowing                 // Makes it glow!
  }

  // A floor to stand on
  plane {
    @color(#808080)
    @position(0, 0, 0)
    @scale(10, 1, 10)
  }

  // Some ambient lighting
  ambient_light {
    @color(white)
    @intensity(0.6)
  }
}
```

"This is the HoloScript syntax. Objects contain **traits** — those `@` prefixed decorators that define behavior. `@color` sets the material, `@position` places it in 3D space, `@glowing` adds an emission effect."

---

### COMPILE AND RUN (2:30 - 3:30)

> [SCREEN: Terminal]

"Let's compile this to WebXR:"

```bash
holoscript compile hello.holo --target webxr --output hello.html
```

> [SHOW: Compilation output]
```
✓ Parsing... OK
✓ Validating traits... OK
✓ Generating WebXR... OK
→ Output: hello.html (12.3 KB)
```

"Done! Let's open it in the browser:"

```bash
holoscript preview hello.html
# Opening http://localhost:3000...
```

> [SCREEN: Browser showing 3D scene with glowing red sphere]

"There's our scene! The glowing sphere is floating at eye level, ready for VR."

---

### VR INTERACTION (3:30 - 4:20)

> [SCREEN: Add @grabbable]

"Let's make it interactive. Back in `hello.holo`, add `@grabbable` to the sphere:"

```holoscript
sphere {
  @color(red)
  @position(0, 1.5, -2)
  @scale(0.3, 0.3, 0.3)
  @glowing
  @grabbable   // ← add this!
  @throwable   // ← and this!
}
```

```bash
holoscript compile hello.holo --target webxr --output hello.html
holoscript preview hello.html
```

> [SCREEN: VR headset view, hand reaching and grabbing sphere]

"Now you can grab and throw the sphere with your VR controllers. Two traits, fully functional physics interaction."

---

### MULTI-PLATFORM EXPORT (4:20 - 4:50)

> [SCREEN: Terminal — multiple compiles]

"The same HoloScript file compiles to any platform:"

```bash
holoscript compile hello.holo --target unity   # Unity prefab
holoscript compile hello.holo --target urdf    # ROS robotics
holoscript compile hello.holo --target gltf    # 3D interchange
holoscript compile hello.holo --target godot   # Godot engine
```

"One source, 18 targets. That's HoloScript."

---

### OUTRO (4:50 - 5:00)

"You've written, compiled, and run your first HoloScript scene. In the next tutorial, we'll build a complete interactive VR environment. Links in the description — see you there!"

---

---

## Tutorial 2: Building Interactive VR Scenes (10 min)

**Target:** Developers comfortable with tutorial 1
**Goal:** Build a physics-based VR scene with networking, interactions

---

### INTRO (0:00 - 0:30)

> [SCREEN: Final demo — VR scene with multiple interactive objects]

"In this tutorial, we're building a complete multiplayer VR physics scene with grabbable objects, spatial audio, and real-time sync — in about 50 lines of HoloScript.

You'll learn: physics traits, networking, audio, and nested objects."

---

### PROJECT SETUP (0:30 - 1:00)

```bash
mkdir vr-playground
cd vr-playground
holoscript init     # Creates project structure
```

```
vr-playground/
├── scenes/
│   └── main.holo
├── assets/
│   └── sounds/
└── holoscript.config.json
```

---

### BUILDING THE SCENE (1:00 - 5:30)

> [SCREEN: VS Code, scenes/main.holo]

"Let's build our scene step by step."

**Step 1: The environment**

```holoscript
scene {
  // Sky
  environment {
    @sky(sunset)
    @fog(density=0.01, color=orange)
  }

  // Ground
  plane {
    @color(#2a4a2a)          // Dark green
    @position(0, 0, 0)
    @scale(20, 1, 20)
    @collidable               // Things can land on it
    @physics(static=true)
  }
```

**Step 2: Interactive objects**

```holoscript
  // A stack of physics cubes
  cube {
    @color(red)
    @position(0, 0.5, -2)
    @physics                  // Full physics simulation
    @grabbable                // VR grab
    @throwable                // Can throw with velocity
    @collidable               // Collides with ground and other objects
    @spatial_audio(sound=whoosh, trigger=grab)
  }

  cube {
    @color(blue)
    @position(0.2, 1.5, -2)
    @physics
    @grabbable
    @throwable
    @collidable
  }

  sphere {
    @color(yellow)
    @position(-1, 0.3, -2)
    @physics
    @grabbable
    @throwable
    @collidable
    @glowing
    @spatial_audio(sound=bounce, trigger=collision)
  }
```

**Step 3: Networked table (persistent)**

```holoscript
  // A table where objects stay when placed
  table {
    @color(#8B4513)           // Brown wood
    @position(0, 0, -3)
    @scale(2, 0.8, 1)
    @collidable
    @physics(static=true)
    @persistent               // Object positions saved across sessions
    @networked                // Synced to all players
  }
```

**Step 4: Ambient environment**

```holoscript
  // Directional light
  directional_light {
    @color(#FFF8E7)            // Warm sunset
    @rotation(-30, 45, 0)
    @intensity(0.8)
    @shadow
  }

  // Ambient sound
  audio_zone {
    @ambient(src=forest_ambience.ogg, volume=0.3, loop=true)
    @spatial_audio(radius=10)
  }
}
```

---

### ADDING MULTIPLAYER (5:30 - 7:00)

> [SCREEN: Add @networked and @synced traits]

"Now let's make everything multiplayer. In HoloScript, networking is just two traits:"

```holoscript
cube {
  @color(red)
  @position(0, 0.5, -2)
  @physics
  @grabbable
  @throwable
  @collidable
  @networked           // ← Sync this object across all clients
  @owned               // ← The grabbing player takes ownership
}
```

"The `@networked` trait handles all the complexity: state synchronization, conflict resolution, and lag compensation. `@owned` ensures only the player holding an object can move it."

---

### COMPILING AND TESTING (7:00 - 9:00)

```bash
holoscript compile scenes/main.holo --target webxr
holoscript preview --port 3000
```

"Open two browser tabs at localhost:3000. You'll see both players in the same scene, with shared physics."

> [SCREEN: Split screen showing two browser tabs, objects moving in sync]

---

### OUTRO (9:00 - 10:00)

"You've built a complete multiplayer VR physics scene. Key concepts: physics traits, interaction traits, networking traits — all composable, all declarative.

Next tutorial: Building custom traits for specialized behaviors. Link below."

---

---

## Tutorial 3: Custom Traits for Spatial Computing (15 min)

**Target:** Intermediate developers
**Goal:** Build and publish a custom trait package

---

### INTRO (0:00 - 0:40)

"HoloScript ships with 1,800+ traits, but your project probably needs something specific. Maybe a health system, a sensor visualization, or custom physics.

In this tutorial, we'll build a complete `@health_system` trait package from scratch — with tests, TypeScript types, and npm publishing."

---

### PROJECT SETUP (0:40 - 2:00)

```bash
mkdir holoscript-health-traits
cd holoscript-health-traits
pnpm init
pnpm add -D @holoscript/core typescript vitest tsup
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "declaration": true
  }
}
```

---

### BUILDING THE TRAIT (2:00 - 7:00)

> [SCREEN: src/HealthTrait.ts]

```typescript
import type { TraitHandler, TraitContext } from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';

export interface HealthConfig {
  maxHealth: number;
  regenRate: number;       // HP per second
  invincibleTime: number;  // Seconds after taking damage
  deathEffect: string;     // Particle effect name
}

export const HealthTrait: TraitHandler<HealthConfig> = {
  name: '@health',
  defaultConfig: {
    maxHealth: 100,
    regenRate: 0,
    invincibleTime: 0.5,
    deathEffect: 'explosion'
  },

  onAttach(node: HSPlusNode, config: HealthConfig, context: TraitContext) {
    node.userData.health = config.maxHealth;
    node.userData.invincibleTimer = 0;
    node.userData.isDead = false;

    console.log(`[Health] Attached to ${node.id}, HP: ${config.maxHealth}`);
  },

  onUpdate(node: HSPlusNode, config: HealthConfig, context: TraitContext, delta: number) {
    if (node.userData.isDead) return;

    // Countdown invincibility
    if (node.userData.invincibleTimer > 0) {
      node.userData.invincibleTimer -= delta;
    }

    // Regenerate health
    if (config.regenRate > 0 && node.userData.health < config.maxHealth) {
      const regen = config.regenRate * delta;
      node.userData.health = Math.min(config.maxHealth, node.userData.health + regen);
      context.emit('health_changed', {
        nodeId: node.id,
        health: node.userData.health,
        maxHealth: config.maxHealth
      });
    }
  },

  onEvent(node: HSPlusNode, config: HealthConfig, context: TraitContext, event: any) {
    if (event.type === 'damage') {
      // Skip if invincible
      if (node.userData.invincibleTimer > 0) return;

      const damage = event.payload as number;
      node.userData.health = Math.max(0, node.userData.health - damage);
      node.userData.invincibleTimer = config.invincibleTime;

      context.emit('health_changed', {
        nodeId: node.id,
        health: node.userData.health,
        maxHealth: config.maxHealth,
        damageTaken: damage
      });

      // Death
      if (node.userData.health <= 0 && !node.userData.isDead) {
        node.userData.isDead = true;
        context.emit('death', {
          nodeId: node.id,
          effect: config.deathEffect
        });
      }
    }

    if (event.type === 'heal') {
      const amount = event.payload as number;
      node.userData.health = Math.min(config.maxHealth, node.userData.health + amount);
      context.emit('health_changed', {
        nodeId: node.id,
        health: node.userData.health,
        maxHealth: config.maxHealth,
        healed: amount
      });
    }

    if (event.type === 'revive') {
      node.userData.isDead = false;
      node.userData.health = config.maxHealth;
      context.emit('revived', { nodeId: node.id });
    }
  },

  onDetach(node: HSPlusNode, config: HealthConfig, context: TraitContext) {
    console.log(`[Health] Detached from ${node.id}`);
  }
};
```

---

### WRITING TESTS (7:00 - 10:00)

```typescript
// src/__tests__/HealthTrait.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HealthTrait } from '../HealthTrait';

function makeNode() {
  return { id: 'test-node', userData: {} };
}

function makeContext() {
  return { emit: vi.fn(), getState: vi.fn(() => ({})), setState: vi.fn() };
}

describe('HealthTrait', () => {
  it('initializes with max health', () => {
    const node = makeNode();
    const config = { ...HealthTrait.defaultConfig };
    const context = makeContext();

    HealthTrait.onAttach!(node as any, config, context as any);

    expect(node.userData.health).toBe(100);
    expect(node.userData.isDead).toBe(false);
  });

  it('applies damage correctly', () => {
    const node = makeNode();
    const config = { ...HealthTrait.defaultConfig };
    const context = makeContext();

    HealthTrait.onAttach!(node as any, config, context as any);
    HealthTrait.onEvent!(node as any, config, context as any,
      { type: 'damage', payload: 30 });

    expect(node.userData.health).toBe(70);
    expect(context.emit).toHaveBeenCalledWith('health_changed', expect.any(Object));
  });

  it('triggers death at 0 HP', () => {
    const node = makeNode();
    const config = { ...HealthTrait.defaultConfig };
    const context = makeContext();

    HealthTrait.onAttach!(node as any, config, context as any);
    HealthTrait.onEvent!(node as any, config, context as any,
      { type: 'damage', payload: 100 });

    expect(node.userData.isDead).toBe(true);
    expect(context.emit).toHaveBeenCalledWith('death', expect.any(Object));
  });

  it('cannot be damaged while invincible', () => {
    const node = makeNode();
    const config = { ...HealthTrait.defaultConfig, invincibleTime: 1.0 };
    const context = makeContext();

    HealthTrait.onAttach!(node as any, config, context as any);
    // First hit (no invincibility)
    HealthTrait.onEvent!(node as any, config, context as any,
      { type: 'damage', payload: 20 });
    expect(node.userData.health).toBe(80);

    // Second hit (invincible!)
    HealthTrait.onEvent!(node as any, config, context as any,
      { type: 'damage', payload: 20 });
    expect(node.userData.health).toBe(80); // Unchanged
  });
});
```

"Run the tests:"

```bash
pnpm test
# ✓ HealthTrait > initializes with max health
# ✓ HealthTrait > applies damage correctly
# ✓ HealthTrait > triggers death at 0 HP
# ✓ HealthTrait > cannot be damaged while invincible
# 4 passed
```

---

### PUBLISHING (10:00 - 13:00)

**package.json:**
```json
{
  "name": "@myorg/holoscript-health",
  "version": "1.0.0",
  "keywords": ["holoscript", "trait", "health", "game"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

**src/index.ts:**
```typescript
export { HealthTrait, type HealthConfig } from './HealthTrait';

// Auto-register when imported
import { registerTrait } from '@holoscript/core';
registerTrait(HealthTrait);
```

```bash
pnpm run build
npm publish --access public
```

"Now anyone can use your trait:"

```bash
npm install @myorg/holoscript-health
```

```holoscript
import '@myorg/holoscript-health';

enemy {
  @health(maxHealth=200, regenRate=5)
  @character
}
```

---

### OUTRO (13:00 - 15:00)

"You've built, tested, and published a custom HoloScript trait. This pattern scales to any domain — robotics, simulation, game mechanics, AR experiences.

Next: Publishing to the HoloScript Trait Registry for community discovery."

---

---

## Tutorial 4: AI-Powered Scene Generation (10 min)

**Target:** Developers interested in AI + spatial computing
**Goal:** Use MCP server + Claude to generate and validate HoloScript scenes

---

### INTRO (0:00 - 0:30)

"HoloScript is designed for AI collaboration. The MCP server gives any AI agent — Claude, GPT, Gemini — full access to HoloScript's 34 tools.

In this tutorial, we'll connect Claude to HoloScript and generate, validate, and execute AI-created scenes safely."

---

### MCP SERVER SETUP (0:30 - 2:00)

```bash
npm install -g @holoscript/mcp-server
```

**Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "holoscript": {
      "command": "holoscript-mcp",
      "args": []
    }
  }
}
```

> [SCREEN: Claude Desktop with HoloScript tools visible]

"Restart Claude Desktop. You'll see 34 HoloScript tools available."

---

### GENERATING SCENES WITH CLAUDE (2:00 - 5:00)

> [SCREEN: Claude Desktop conversation]

**Prompt to Claude:**
"Generate a HoloScript scene for a haunted mansion entrance with spooky atmosphere, fog, and interactive ghost objects that players can interact with in VR."

> [SCREEN: Claude using generate_scene tool]

**Claude's response using MCP:**
```
I'll use the generate_scene tool to create a haunted mansion scene...

[Using generate_scene with params: {
  "theme": "haunted_mansion",
  "mood": "spooky",
  "objects": ["fog", "ghost", "candles", "iron_fence"],
  "interactive": true
}]
```

> [SCREEN: Generated HoloScript code]

```holoscript
scene "Haunted Mansion Entrance" {
  environment {
    @sky(night)
    @fog(density=0.05, color=#1a0a2e)
    @ambient_light(color=#2d1b69, intensity=0.2)
  }

  iron_fence {
    @position(0, 1, -5)
    @scale(8, 2, 0.1)
    @color(#1a1a1a)
    @emissive(color=#ff4400, intensity=0.1)
  }

  ghost {
    @position(2, 1.8, -3)
    @color(#e8f4ff)
    @transparent(0.7)
    @glowing(color=white, intensity=0.5)
    @hoverable
    @clickable
    @animated(idle=float, trigger=click, action=flee)
    @spatial_audio(sound=ghost_moan, trigger=hover, radius=3)
  }

  candle {
    @position(-2, 0.8, -4)
    @particle_system(type=fire, size=small)
    @spatial_audio(sound=flame_crackle, radius=1)
    @point_light(color=#ff7700, intensity=0.8, range=3)
  }
}
```

---

### VALIDATING AI-GENERATED CODE (5:00 - 7:00)

> [SCREEN: Terminal / code editor]

"AI models can hallucinate — generating invalid traits or syntax. That's why we built `@holoscript/ai-validator`:"

```typescript
import { AIValidator } from '@holoscript/ai-validator';

const validator = new AIValidator({
  provider: 'anthropic',
  hallucinationThreshold: 50
});

const claudeOutput = `/* ... the generated scene code ... */`;
const result = await validator.validate(claudeOutput);

if (result.valid) {
  console.log(`✓ Valid! Hallucination score: ${result.metadata.hallucinationScore}/100`);
} else {
  // Send errors back to Claude for regeneration
  const feedback = result.errors.map(e => e.message).join('\n');
  console.log('Errors to fix:\n', feedback);
}
```

> [SCREEN: Running validation]

```
✓ Valid! Hallucination score: 12/100
Traits validated: 14
Warnings: 0
```

---

### SAFE EXECUTION (7:00 - 9:00)

```typescript
import { HoloScriptSandbox } from '@holoscript/security-sandbox';

const sandbox = new HoloScriptSandbox({
  timeout: 5000,
  enableLogging: true
});

// Execute in isolated VM
const result = await sandbox.executeHoloScript(claudeOutput, {
  source: 'ai-generated'
});

if (result.success) {
  renderScene(result.data);
  console.log(`Executed in ${result.metadata.executionTime}ms`);
} else {
  console.error('Execution failed:', result.error);
}
```

---

### COMPLETE PIPELINE (9:00 - 9:40)

```typescript
// The complete AI → Validate → Sandbox → Render pipeline
async function generateAndRender(prompt: string) {
  // 1. Generate with Claude via MCP
  const generated = await claudeMCP.callTool('generate_scene', { prompt });

  // 2. Validate (AI hallucination detection)
  const validation = await validator.validate(generated.code);
  if (!validation.valid) {
    throw new Error('Invalid code: ' + validation.errors[0].message);
  }

  // 3. Execute safely
  const result = await sandbox.executeHoloScript(generated.code, {
    source: 'ai-generated'
  });

  // 4. Render
  return renderScene(result.data);
}
```

---

### OUTRO (9:40 - 10:00)

"You now have a complete AI-driven HoloScript pipeline: generation, validation, sandboxing, and rendering.

This is the future of spatial computing — AI co-creation with safety guardrails built in. More advanced examples in our GitHub. See you there!"

---

## Production Notes

### Recording Setup
- **Resolution:** 4K (3840×2160), downscaled to 1080p
- **Screen recording:** OBS Studio with lossless capture
- **Terminal font:** JetBrains Mono 16px
- **Editor theme:** GitHub Dark
- **Microphone:** Condenser, noise-gated

### Post-Production
- Add captions for accessibility
- Chapter markers at each major section
- Timestamp descriptions in video

### Distribution
- Primary: YouTube with full descriptions
- Secondary: HoloScript docs site (embedded)
- Shorts: Extract 60-second clips from each tutorial

---

*Last updated: 2026-02-16 | HoloScript v3.4.0*
