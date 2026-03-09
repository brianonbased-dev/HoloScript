# HoloScript Component Library

Reusable `.holo` templates for building VR/AR experiences. Import any component into your scene composition.

## Categories

### NPCs (`npcs/`)

| Component                           | Description                        | Key Traits                                           |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| [warrior.holo](npcs/warrior.holo)   | Melee fighter with patrol AI       | `@collidable` `@physics` `@spatial_audio`            |
| [mage.holo](npcs/mage.holo)         | Spellcaster with mana system       | `@spatial_audio` `@glowing` `@emissive`              |
| [scout.holo](npcs/scout.holo)       | Stealth/ranged unit with detection | `@collidable` `@spatial_audio`                       |
| [merchant.holo](npcs/merchant.holo) | Shop NPC with buy/sell system      | `@clickable` `@hoverable` `@spatial_audio`           |
| [boss.holo](npcs/boss.holo)         | Multi-phase boss with loot         | `@collidable` `@physics` `@spatial_audio` `@glowing` |

### Weapons (`weapons/`)

| Component                          | Description                       | Key Traits                                            |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------- |
| [sword.holo](weapons/sword.holo)   | Melee weapon with durability      | `@grabbable` `@throwable` `@equippable` `@collidable` |
| [bow.holo](weapons/bow.holo)       | Ranged weapon with ammo system    | `@grabbable` `@equippable` `@spatial_audio`           |
| [staff.holo](weapons/staff.holo)   | Magic staff with spell casting    | `@grabbable` `@equippable` `@glowing` `@emissive`     |
| [hammer.holo](weapons/hammer.holo) | Heavy AOE weapon with ground slam | `@grabbable` `@throwable` `@equippable` `@collidable` |
| [spear.holo](weapons/spear.holo)   | Long-range melee with sweep       | `@grabbable` `@throwable` `@equippable` `@collidable` |

### UI (`ui/`)

| Component                             | Description                                     | Key Traits                             |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| [health-bar.holo](ui/health-bar.holo) | Reactive health display with smooth transitions | `@billboard` `@reactive`               |
| [inventory.holo](ui/inventory.holo)   | Grid inventory with stacking                    | `@billboard` `@clickable` `@draggable` |
| [chat.holo](ui/chat.holo)             | Multiplayer chat with channels                  | `@billboard` `@clickable`              |
| [menu.holo](ui/menu.holo)             | Pause menu with settings                        | `@billboard` `@clickable`              |
| [hud.holo](ui/hud.holo)               | Full HUD with health/mana/compass/minimap       | `@billboard` `@reactive`               |

### Environmental (`environmental/`)

| Component                                | Description                           | Key Traits                                         |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| [portal.holo](environmental/portal.holo) | Teleport portal with paired linking   | `@collidable` `@glowing` `@animated`               |
| [door.holo](environmental/door.holo)     | Lockable door with key system         | `@collidable` `@clickable` `@animated`             |
| [trap.holo](environmental/trap.holo)     | Spike/fire/poison/net traps           | `@collidable` `@trigger` `@animated`               |
| [fire.holo](environmental/fire.holo)     | Campfire with fuel and warmth radius  | `@collidable` `@trigger` `@glowing` `@animated`    |
| [water.holo](environmental/water.holo)   | Water body with buoyancy and currents | `@collidable` `@trigger` `@reflective` `@animated` |

### Game Systems (`game-systems/`)

| Component                                         | Description                               | Key Traits                              |
| ------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| [dialogue.holo](game-systems/dialogue.holo)       | Branching dialogue tree system            | —                                       |
| [quest.holo](game-systems/quest.holo)             | Quest tracker with objectives and rewards | —                                       |
| [achievement.holo](game-systems/achievement.holo) | Achievement/trophy system with stats      | —                                       |
| [save.holo](game-systems/save.holo)               | Save/load with auto-save and migration    | —                                       |
| [crafting.holo](game-systems/crafting.holo)       | Recipe-based crafting with stations       | `@clickable` `@hoverable` `@collidable` |

## Usage

Import a component template into your scene:

```holo
composition "My Game" {
  import "npcs/warrior" as WarriorTemplate
  import "weapons/sword" as SwordTemplate
  import "game-systems/quest" as QuestSystem
  import "ui/hud" as HUD

  object "Guard_1" using WarriorTemplate {
    position: [10, 0, 5]
    state { health: 200, attackPower: 30 }
  }

  object "Sword_1" using SwordTemplate {
    position: [2, 1, 0]
  }

  object "QuestManager" using QuestSystem {}
  object "PlayerHUD" using HUD {}
}
```

## Design Principles

1. **Self-contained** — Each component includes all state, actions, and children
2. **Configurable** — Override state values when instantiating
3. **Event-driven** — Components communicate via `events.emit()` / `events.on()`
4. **VR-ready** — Appropriate traits for spatial interaction
5. **AI-friendly** — Clear `.holo` syntax for agent generation

## Total: 25 Components

- 5 NPCs, 5 Weapons, 5 UI, 5 Environmental, 5 Game Systems
