# HoloScript Language Reference Examples

Comprehensive examples demonstrating all language features across the three HoloScript formats (`.hs`, `.hsplus`, `.holo`).

**Purpose:**
- Developer learning and onboarding
- AI agent grounding for code generation
- Systematic coverage of all syntax constructs

## File Organization

### 1. Format-Specific References

**Basic Syntax (`.hs`)**

- ✅ `01-basic-objects.hs` - Complete reference: object declarations, properties, geometries, colors, materials, animations, physics

**Extended Syntax (`.hsplus`)**

- ✅ `01-templates-decorators.hsplus` - Complete reference: template definitions, @decorators, composition syntax
- ✅ `02-state-actions.hsplus` - Complete reference: state blocks, actions, computed values, watchers, reactive bindings
- ✅ `03-event-handlers.hsplus` - Complete reference: lifecycle, collision, input, VR, proximity, gaze, animation, audio, network events
- ✅ `04-modules-imports.hsplus` - Complete reference: module system, import/export, dynamic imports, re-exporting, namespacing

**Advanced Compositions (`.holo`)**

- ✅ `01-entity-trait-pattern.holo` - Complete reference: entity declarations with trait configurations
- ✅ `02-object-template-pattern.holo` - Complete reference: object + template pattern (alternative .holo syntax)

### 2. Cross-Format Comparisons

**Same Feature, Three Formats:**

- ✅ `comparison-01-simple-scene.{hs,hsplus,holo}` - VR room with grabbable balls - shows basic differences
- ✅ `comparison-02-interactive-game.{hs,hsplus,holo}` - Target practice game - shows state, events, and advanced features

### 3. Feature Matrix

| Feature | `.hs` | `.hsplus` | `.holo` (entity) | `.holo` (object) |
|---------|-------|-----------|------------------|------------------|
| Basic objects | ✓ | ✓ | ✓ | ✓ |
| Templates | ✗ | ✓ | ✗ | ✓ |
| Decorators (@) | ✗ | ✓ | ✗ | ✓ |
| State blocks | ✗ | ✓ | ✗ | ✓ |
| Actions | ✗ | ✓ | ✗ | ✓ |
| Event handlers | ✗ | ✓ | ✓ | ✓ |
| Trait configs | ✗ | ✗ | ✓ | ✗ |
| Modules | ✗ | ✓ | ✗ | ✗ |
| Panels/UI | ✗ | ✓ | ✓ | ✓ |

## Format Selection Guide

### Use `.hs` when:
- Learning HoloScript basics
- Creating simple static scenes
- Prototyping quickly
- No interactivity needed

### Use `.hsplus` when:
- Need templates/reusability
- State management required
- Event-driven interactions
- Building games/apps
- Modular code organization

### Use `.holo` (entity pattern) when:
- Advanced trait-based configuration
- Complex spatial computing features
- VR/AR/XR experiences
- Fine-grained control over spatial primitives

### Use `.holo` (object pattern) when:
- Need both templates AND traits
- Migrating from .hsplus
- Complex scenes with many objects
- Hybrid approach needed

## AI Agent Grounding Notes

For AI agents generating HoloScript code:

1. **Start with format detection** - Check file extension (.hs/.hsplus/.holo)
2. **Use appropriate syntax** - Match the format's syntax patterns
3. **Reference these examples** - Use as templates for generation
4. **Validate against format** - Ensure generated code matches format rules
5. **Prefer simplest format** - Use .hs for simple, .hsplus for medium, .holo for advanced

## Quick Reference

**Minimal .hs example:**
```holoscript
object "Cube" {
  geometry: "box"
  color: "red"
  position: { x: 0, y: 1, z: 0 }
}
```

**Minimal .hsplus example:**
```holoscript
composition "Scene" {
  template "Interactive" {
    @grabbable
    @throwable
    geometry: "sphere"
  }

  object "Ball" using "Interactive" {
    position: { x: 0, y: 2, z: 0 }
  }
}
```

**Minimal .holo (entity) example:**
```holoscript
composition SimpleScene {
  entity PhysicsObject {
    rigidbody: {
      mass: 1.0,
      gravity_enabled: true
    }

    mesh: {
      type: "sphere",
      radius: 0.5
    }
  }
}
```

**Minimal .holo (object) example:**
```holoscript
composition "Scene" {
  template "Base" {
    @collidable
    geometry: "box"
  }

  object "Cube" using "Base" {
    position: [0, 1, 0]
  }
}
```
