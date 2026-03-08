# Language Reference

Comprehensive syntax references for all three HoloScript formats.

## Overview

HoloScript provides three file formats, each designed for different use cases:

- **`.hs`** - Basic syntax for simple scenes and prototyping
- **`.hsplus`** - Extended syntax with state management, templates, and events
- **`.holo`** - Advanced syntax for VR/AR with entity-trait architecture

## Quick Format Selection

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

### Use `.holo` when:
- Advanced trait-based configuration
- Complex spatial computing features
- VR/AR/XR experiences
- Fine-grained control over spatial primitives

## Format-Specific References

### Basic Syntax (`.hs`)

- [Basic Objects Reference](./reference-hs-basic) - Complete syntax guide for `.hs` format

### Extended Syntax (`.hsplus`)

- [Templates & Decorators](./reference-hsplus-templates) - Template definitions, @decorators
- [State & Actions](./reference-hsplus-state) - State management, actions, computed values
- [Event Handlers](./reference-hsplus-events) - All event types and handlers
- [Modules & Imports](./reference-hsplus-modules) - Module system and code organization

### Advanced Compositions (`.holo`)

- [Entity-Trait Pattern](./reference-holo-entity) - Entity declarations with traits
- [Object-Template Pattern](./reference-holo-object) - Alternative `.holo` syntax

## Cross-Format Comparisons

See the same functionality implemented in all three formats:

- [Comparison: Simple VR Scene](./comparison-simple-scene) - VR room with grabbable balls
- [Comparison: Interactive Game](./comparison-interactive-game) - Target practice game with state and events

## Feature Matrix

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

## For AI Agents

When generating HoloScript code:

1. **Detect format** - Check file extension (`.hs`/`.hsplus`/`.holo`)
2. **Use appropriate syntax** - Match the format's syntax patterns
3. **Reference examples** - Use these references as templates
4. **Validate** - Ensure generated code matches format rules
5. **Prefer simplest** - Use `.hs` for simple, `.hsplus` for medium, `.holo` for advanced

## Source Code

All examples are available in the [HoloScript repository](https://github.com/brianonbased-dev/Holoscript/tree/main/examples/language-reference).
