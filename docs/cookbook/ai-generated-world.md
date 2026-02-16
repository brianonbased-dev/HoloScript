# AI-Generated World

Use Brittney (or any MCP-connected LLM) to generate, validate,
and iteratively refine HoloScript worlds through natural language.

## Prompt → World Pipeline

```
┌──────────┐     ┌───────────┐     ┌────────────────┐     ┌──────────┐
│  Prompt  │ ──▶ │  LLM      │ ──▶ │ AIOutputValidator│ ──▶ │ Runtime  │
│ (user)   │     │ (Brittney)│     │ (safety check)  │     │ (render) │
└──────────┘     └───────────┘     └────────────────┘     └──────────┘
                                          │
                                    ❌ rejected
                                          ▼
                                   Feedback loop
```

## Example Prompt

> "Create a cozy forest cabin with a fireplace, bookshelves,
>  and a window looking out at mountains. Make it interactive
>  — I want to grab books and throw logs into the fire."

## Generated Output

```hsplus
// AI-generated: Forest Cabin
// Validated by AIOutputValidator — confidence: 0.95

object "Cabin" {
  @physics { fixed: true }
  
  // Warm wooden floor
  object "Floor" {
    geometry: { type: "box", size: { x: 6, y: 0.1, z: 5 } }
    material: { color: "#8B5E3C", roughness: 0.7, texture: "wood_planks" }
  }
  
  // Stone fireplace
  object "Fireplace" {
    @physics { fixed: true, collider: "mesh" }
    geometry: { type: "box", size: { x: 1.5, y: 2, z: 0.8 } }
    material: { color: "#555555", roughness: 0.9, texture: "stone" }
    position: { x: 0, y: 1, z: -2.3 }
    
    // Fire particle system
    object "Fire" {
      @particles {
        rate: 200,
        lifetime: { min: 0.5, max: 1.5 },
        color: { start: "#FF6600", end: "#FF0000" },
        size: { start: 0.1, end: 0.02 },
        velocity: { y: { min: 0.5, max: 1.5 } },
        warmth: true
      }
      @spatial_audio { sound: "fire_crackle", radius: 5.0 }
      position: { x: 0, y: 0.3, z: 0 }
    }
  }
  
  // Bookshelf with grabbable books
  object "Bookshelf" {
    @physics { fixed: true, collider: "box" }
    geometry: { type: "box", size: { x: 1.2, y: 2.2, z: 0.35 } }
    material: { color: "#5D3A1A", texture: "dark_wood" }
    position: { x: -2.5, y: 1.1, z: -2 }
    
    // Spawn 12 grabbable books
    for (i in 0..12) {
      object "Book_${i}" {
        @physics { mass: 0.3, collider: "box" }
        @grabbable { physics: true }
        @haptic_feedback { onGrab: 0.1 }
        geometry: { type: "box", size: { x: 0.15, y: 0.22, z: 0.03 } }
        material: { color: randomBookColor() }
        position: {
          x: -0.4 + (i % 4) * 0.2,
          y: -0.8 + floor(i / 4) * 0.3,
          z: 0
        }
      }
    }
  }
  
  // Throwable fire logs
  for (i in 0..3) {
    object "Log_${i}" {
      @physics { mass: 2.0, collider: "cylinder" }
      @grabbable { physics: true, throwable: true }
      @haptic_feedback { onGrab: 0.4, intensity: 0.3 }
      geometry: { type: "cylinder", radius: 0.06, height: 0.4 }
      material: { color: "#6B4226", texture: "bark" }
      position: { x: 1.5, y: 0.2, z: -1.5 + i * 0.2 }
      
      on collide(other) {
        if (other.name == "Fire") {
          // Log catches fire when thrown into fireplace
          this.addTrait("particles", {
            rate: 50, color: { start: "#FFAA00", end: "#FF3300" },
            lifetime: { min: 0.3, max: 0.8 }
          })
          // Increase fire intensity
          other.config.rate += 50
        }
      }
    }
  }
  
  // Window with mountain view
  object "Window" {
    geometry: { type: "box", size: { x: 1.5, y: 1.2, z: 0.05 } }
    material: { color: "#87CEEB", opacity: 0.3, emissive: 0.2 }
    position: { x: 2.9, y: 1.5, z: -0.5 }
  }
}
```

## Validation Integration

```typescript
import { validateAIOutput } from '@holoscript/core/ai/AIOutputValidator';

const aiCode = await brittney.generate(prompt);
const result = validateAIOutput(aiCode, {
  maxLines: 2000,
  maxNesting: 10,
  allowedTraits: ['physics', 'grabbable', 'particles', 'spatial_audio', 'haptic_feedback'],
  blockDangerousPatterns: true,
});

if (result.valid && result.confidence > 0.7) {
  runtime.execute(aiCode);
} else {
  console.warn('AI output rejected:', result.issues);
  // Feed issues back to LLM for correction
}
```

## Safety Guardrails

| Check | What it catches |
|-------|----------------|
| Dangerous patterns | `eval()`, `require()`, `process.*` |
| Brace balancing | Unclosed objects / syntax errors |
| Nesting limit | Runaway recursive generation |
| Trait allowlist | Hallucinated trait names |
| Confidence score | Low confidence → human review |
