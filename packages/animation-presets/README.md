# @holoscript/animation-presets

> Pre-configured `@animated` trait parameter sets for common character behaviors with Mixamo clip mapping.

## Overview

Provides ready-to-use animation preset configurations for the `@animated` trait. Each preset maps to standard Mixamo clips and can be applied to any humanoid character.

## Usage

```holo
object "Guard" {
  @animated { preset: "idle_guard" }
}
```

```typescript
import { getAnimationPreset, listPresets } from '@holoscript/animation-presets';

const preset = getAnimationPreset('idle_guard');
// → { clips: ['Idle', 'LookAround'], blend: 0.3, loop: true }

const all = listPresets();
// → ['idle_guard', 'walk_patrol', 'run_chase', 'attack_melee', ...]
```

## Presets

| Preset         | Clips            | Use Case         |
| -------------- | ---------------- | ---------------- |
| `idle_guard`   | Idle, LookAround | Stationary NPC   |
| `walk_patrol`  | Walk, Turn       | Patrol routes    |
| `run_chase`    | Run, Sprint      | Pursuit behavior |
| `attack_melee` | Slash, Stab      | Combat           |
| `dance_casual` | Dance, Sway      | Social VR        |

## Related

- [`@holoscript/core` traits](../core/) — Base `@animated` trait
- [Mixamo](https://www.mixamo.com/) — Source animation clips

## License

MIT
