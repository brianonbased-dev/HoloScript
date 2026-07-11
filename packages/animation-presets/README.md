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

## Package boundary & release posture

`@holoscript/animation-presets` targets **external, public, and agent framework** consumers who want ready-made `@animated` trait parameter sets instead of hand-tuning keyframes per character.

```bash
npm install @holoscript/animation-presets
```

The package boundary is metadata-only: it **does not ship** Mixamo clip assets, a character rig, or an animation runtime — you bring your own rig and Mixamo-sourced (or compatible) clip files, and point your renderer's `@animated` trait at a preset's `clips` output; this package only resolves preset names to timing/loop/blend/clip-mapping metadata.

**Known limitations (v0-preview):** the 15 canonical presets assume a standard Mixamo humanoid rig naming convention — non-Mixamo skeletons need caller-owned remapping. Run `pnpm test` to validate preset resolution output against your own registry overrides before shipping a character built on a custom preset.

## License

MIT
