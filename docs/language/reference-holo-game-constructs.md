# Game Constructs Reference (`.holo`)

Reference for the game and MMO constructs supported by the `.holo` composition parser.
These are first-class keywords — not traits — declared at composition scope alongside
`object`, `template`, `light`, etc.

**Source of truth:** `packages/core/src/parser/HoloCompositionTypes.ts` and
`packages/core/src/parser/HoloCompositionParser.ts`.

---

## Table of Contents

- [NPCs](#npcs)
- [Behaviors](#behaviors)
- [Quests](#quests)
- [Abilities](#abilities)
- [Dialogue](#dialogue)
- [State Machines](#state-machines)
- [Achievements](#achievements)
- [Talent Trees](#talent-trees)
- [Loot Tables](#loot-tables)
- [Spawn Points](#spawn-points)
- [Game Triggers](#game-triggers)
- [Movement Paths](#movement-paths)
- [Reaction Triggers](#reaction-triggers)
- [World Chunks](#world-chunks)
- [World Layers](#world-layers)
- [Dungeon Instances](#dungeon-instances)
- [World Shards](#world-shards)

---

## NPCs

`npc` declares a named AI character. It anchors a position, references a model, links a
dialogue tree, and may carry an agent-brain attachment for LLM/behavior-tree control.
Behavior logic lives in `behavior` sub-blocks inside the npc body.

### Syntax

```holoscript
npc "NpcName" {
  type: "merchant"           // npc role/type string (free-form)
  model: "/models/foo.glb"   // asset path
  position: [x, y, z]        // world position (array or object)
  dialogue_tree: "dialog_id" // reference to a dialogue block
  brain_ref: "BrainSkillId"  // shorthand brain ref (maps to brain.brainRef)

  // or structured brain attachment:
  brain: {
    type: "llm"              // llm | behavior-tree | state-machine | scripted | hybrid | remote
    autonomy: "autonomous"   // reactive | deliberative | autonomous | supervised
    ref: "BrainSkillId"      // .hsplus brain skill id
    tools: ["ability_a"]     // permitted tool names
  }

  state {
    gold: 500
    inventory: []
  }

  behavior "on_player_approach" {
    trigger: "player_near"
    priority: 10
    actions: [
      { emit: "greeting" }
    ]
  }
}
```

### Properties

| Property           | Type        | Required | Description                                                     |
| ------------------ | ----------- | -------- | --------------------------------------------------------------- |
| `type`             | `string`    | No       | Role/type label (e.g. `"merchant"`, `"guard"`, `"quest_giver"`) |
| `model`            | `string`    | No       | Asset path for the NPC mesh                                     |
| `position`         | `[x, y, z]` | No       | World-space position                                            |
| `dialogue_tree`    | `string`    | No       | ID of the `dialogue` block this NPC opens by default            |
| `brain_ref`        | `string`    | No       | Shorthand reference to a `.hsplus` brain skill                  |
| `brain`            | object      | No       | Structured agent-brain attachment (see below)                   |
| `state { }`        | block       | No       | NPC-local reactive state                                        |
| `behavior "…" { }` | sub-block   | No       | Repeatable; each defines one behavior                           |

#### `brain` sub-object fields

| Field      | Type     | Values                                                             | Description                           |
| ---------- | -------- | ------------------------------------------------------------------ | ------------------------------------- |
| `type`     | string   | `llm` `behavior-tree` `state-machine` `scripted` `hybrid` `remote` | Brain kind                            |
| `autonomy` | string   | `reactive` `deliberative` `autonomous` `supervised`                | Action envelope                       |
| `ref`      | string   | —                                                                  | `.hsplus` brain skill id              |
| `tools`    | string[] | —                                                                  | Ability/tool names the brain may call |

### Minimal example

```holoscript
composition "TavernScene" {

  npc "Greta" {
    type: "merchant"
    model: "/models/npcs/tavern_keeper.glb"
    position: [4, 0, -2.5]
    dialogue_tree: "greta_greeting"
  }

}
```

### Example with brain attachment

```holoscript
npc "BrittneyNPC" {
  type: "companion"
  model: "/models/brittney.glb"
  position: [0, 0, 2]
  brain: {
    type: "llm"
    autonomy: "autonomous"
    ref: "BRITTNEY_BRAIN"
    tools: ["move", "emit", "dialogue_say"]
  }
  state {
    mood: "curious"
  }
}
```

---

## Behaviors

`behavior` sub-blocks live **inside** an `npc` body. Each behavior fires when its
`trigger` condition is met.

### Syntax

```holoscript
npc "GuardNPC" {
  // ...

  behavior "patrol" {
    trigger: "idle"            // string event name
    priority: 1                // higher = runs first when multiple fire
    timeout: 30                // seconds before behavior auto-exits (optional)
    condition: patrol_enabled  // expression guard (optional)
    actions: [
      { move: { target: "next_waypoint", speed: 2 } },
      { wait: { duration: 1 } },
      { animate: { clip: "survey" } }
    ]
  }

  behavior "alert" {
    trigger: "player_spotted"
    priority: 10
    actions: [
      { face: { target: "player" } },
      { emit: { event: "alert_triggered" } },
      { call: { method: "draw_weapon" } }
    ]
  }
}
```

### Behavior properties

| Property    | Type       | Required | Description                                                   |
| ----------- | ---------- | -------- | ------------------------------------------------------------- |
| `trigger`   | `string`   | Yes      | Event name that activates this behavior                       |
| `priority`  | `number`   | No       | Execution priority (higher wins when multiple behaviors fire) |
| `timeout`   | `number`   | No       | Seconds until the behavior auto-exits                         |
| `condition` | expression | No       | Guard expression — behavior only runs when truthy             |
| `actions`   | array      | Yes      | Array of action objects                                       |

### Action types

Each element of `actions` is an object with exactly one key matching an action type:

| Key       | Description            | Config keys                |
| --------- | ---------------------- | -------------------------- |
| `move`    | Move the NPC           | `target`, `speed`, `path`  |
| `animate` | Play an animation clip | `clip`, `loop`             |
| `face`    | Rotate toward a target | `target`                   |
| `damage`  | Apply damage           | `target`, `amount`, `type` |
| `heal`    | Apply healing          | `target`, `amount`         |
| `spawn`   | Spawn an entity        | `template`, `position`     |
| `emit`    | Fire a game event      | `event`, (data)            |
| `wait`    | Pause execution        | `duration`                 |
| `call`    | Call a named method    | `method`, `args`           |

---

## Quests

`quest` declares a named quest with typed objectives, rewards, and optional branching.
Prerequisites are quest names that must be completed first.

### Syntax

```holoscript
quest "QuestName" {
  giver: "NpcName"           // NPC who gives the quest
  level: 5                   // recommended level
  type: "fetch"              // fetch | defeat | discover | escort | deliver | custom
  prerequisites: ["quest_a", "quest_b"]

  objectives: [
    {
      id: "obj1"
      description: "Defeat the goblin chief"
      type: "defeat"          // discover | defeat | collect | deliver | interact | survive
      target: "goblin_chief"
      count: 1
    },
    {
      id: "obj2"
      description: "Collect 5 goblin ears"
      type: "collect"
      target: "goblin_ear"
      count: 5
      optional: true
    }
  ]

  rewards: {
    experience: 500
    gold: 100
    items: [
      { id: "iron_sword", count: 1, rarity: "uncommon" }
    ]
    reputation: { ironveil_guild: 10 }
    unlocks: ["next_quest_id"]
  }

  branches: [
    {
      condition: player.level >= 10
      text: "Expert path taken"
      rewardMultiplier: 1.5
      nextQuest: "advanced_followup"
    }
  ]
}
```

### Quest properties

| Property        | Type       | Required | Description                                                 |
| --------------- | ---------- | -------- | ----------------------------------------------------------- |
| `giver`         | `string`   | No       | NPC name who gives/owns this quest                          |
| `level`         | `number`   | No       | Recommended player level                                    |
| `type`          | `string`   | No       | `fetch` `defeat` `discover` `escort` `deliver` `custom`     |
| `prerequisites` | `string[]` | No       | Quest names that must be completed first                    |
| `objectives`    | array      | Yes      | Ordered list of objective objects                           |
| `rewards`       | object     | Yes      | Reward block (experience, gold, items, reputation, unlocks) |
| `branches`      | array      | No       | Conditional outcome branches                                |

### Objective fields

| Field         | Type      | Required | Description                                                  |
| ------------- | --------- | -------- | ------------------------------------------------------------ |
| `id`          | `string`  | Yes      | Unique objective identifier                                  |
| `description` | `string`  | Yes      | Player-visible description                                   |
| `type`        | `string`  | Yes      | `discover` `defeat` `collect` `deliver` `interact` `survive` |
| `target`      | `string`  | Yes      | Target entity id or type name                                |
| `count`       | `number`  | No       | Required count (default `1`)                                 |
| `optional`    | `boolean` | No       | Whether the objective is optional                            |

### Reward fields

| Field        | Type                     | Description                          |
| ------------ | ------------------------ | ------------------------------------ |
| `experience` | `number`                 | XP awarded on completion             |
| `gold`       | `number`                 | Currency awarded                     |
| `items`      | array                    | Item rewards `{ id, count, rarity }` |
| `reputation` | `Record<string, number>` | Faction reputation changes           |
| `unlocks`    | `string[]`               | Quest ids unlocked on completion     |

### Branch fields

| Field              | Type       | Description                          |
| ------------------ | ---------- | ------------------------------------ |
| `condition`        | expression | Guard — branch applies when truthy   |
| `text`             | `string`   | Optional label for this branch       |
| `rewardMultiplier` | `number`   | Multiply base rewards by this factor |
| `nextQuest`        | `string`   | Quest id to chain after this branch  |

### Minimal example

```holoscript
quest "retrieve_the_gem" {
  giver: "Elder_Nira"
  type: "fetch"

  objectives: [
    { id: "find_cave", description: "Find the Crystal Cave", type: "discover", target: "crystal_cave" },
    { id: "get_gem", description: "Retrieve the Sunstone", type: "collect", target: "sunstone", count: 1 }
  ]

  rewards: {
    experience: 300
    gold: 50
    unlocks: ["main_chapter_2"]
  }
}
```

---

## Abilities

`ability` declares a combat skill or spell. Stats, scaling coefficients, effects
(impact VFX/audio, damage type, buffs, debuffs), and optional projectile are all
typed sub-blocks.

### Syntax

```holoscript
ability "AbilityName" {
  type: "spell"          // spell | skill | passive | ultimate
  class: "mage"          // optional class restriction
  level: 3               // minimum level to use

  stats: {
    manaCost: 40
    staminaCost: 0
    cooldown: 8          // seconds
    castTime: 1.2        // seconds
    range: 20            // metres
    radius: 5            // AoE radius in metres
    duration: 5          // effect duration in seconds
  }

  scaling: {
    baseDamage: 80
    spellPower: 0.75     // coefficient multiplied by spell power stat
    attackPower: 0.0
    levelScale: 1.1      // per-level multiplier
  }

  effects: {
    impact: {
      animation: "cast_anim"
      particle: "fire_explosion"
      sound: "fire_blast.ogg"
      shake: { intensity: 0.4, duration: 0.3 }
    }
    damage: {
      damageType: "fire"   // physical | fire | ice | lightning | arcane | holy | shadow
      canCrit: true
      critMultiplier: 2.0
    }
    debuff: {
      effect: "burn"       // slow | stun | silence | root | burn | freeze | poison
      duration: 3
      magnitude: 0.2
    }
    buff: {
      stat: "attack_speed"
      amount: 0.25
      duration: 5
      stacks: 3
    }
  }

  projectile: {
    model: "/models/fireball.glb"
    speed: 25
    lifetime: 3
    trail: "fire_trail"
    homing: false
  }
}
```

### Ability properties

| Property     | Type     | Required               | Description                          |
| ------------ | -------- | ---------------------- | ------------------------------------ |
| `type`       | `string` | No (default `"skill"`) | `spell` `skill` `passive` `ultimate` |
| `class`      | `string` | No                     | Class restriction                    |
| `level`      | `number` | No                     | Minimum level                        |
| `stats`      | block    | Yes                    | Combat statistics                    |
| `scaling`    | block    | No                     | Damage/heal scaling coefficients     |
| `effects`    | block    | Yes                    | Visual and mechanical effects        |
| `projectile` | block    | No                     | Projectile behaviour                 |

#### `stats` fields

| Field         | Type     | Description                |
| ------------- | -------- | -------------------------- |
| `manaCost`    | `number` | Mana consumed on use       |
| `staminaCost` | `number` | Stamina consumed on use    |
| `cooldown`    | `number` | Cooldown in seconds        |
| `castTime`    | `number` | Cast time in seconds       |
| `range`       | `number` | Maximum range in metres    |
| `radius`      | `number` | AoE radius in metres       |
| `duration`    | `number` | Effect duration in seconds |

#### `scaling` fields

| Field         | Type     | Description                     |
| ------------- | -------- | ------------------------------- |
| `baseDamage`  | `number` | Flat damage before coefficients |
| `spellPower`  | `number` | Spell-power coefficient         |
| `attackPower` | `number` | Attack-power coefficient        |
| `levelScale`  | `number` | Per-level multiplier            |

#### `effects` sub-block fields

| Field    | Type  | Description                                                     |
| -------- | ----- | --------------------------------------------------------------- |
| `impact` | block | VFX/audio on impact (`animation`, `particle`, `sound`, `shake`) |
| `damage` | block | Damage type and crit config                                     |
| `buff`   | block | Stat buff applied (`stat`, `amount`, `duration`, `stacks`)      |
| `debuff` | block | Status debuff applied (`effect`, `duration`, `magnitude`)       |

#### Damage types

`physical` `fire` `ice` `lightning` `arcane` `holy` `shadow`

#### Debuff effects

`slow` `stun` `silence` `root` `burn` `freeze` `poison`

### Minimal example

```holoscript
ability "fireball" {
  type: "spell"
  stats: {
    manaCost: 30
    cooldown: 6
    range: 30
    radius: 4
  }
  effects: {
    damage: {
      damageType: "fire"
      canCrit: true
      critMultiplier: 1.8
    }
  }
}
```

---

## Dialogue

`dialogue` declares a single node in a conversation tree. Options point to the next
node by id. Chains of dialogue nodes form a full dialogue tree.

### Syntax

```holoscript
dialogue "dialog_id" {
  character: "NpcName"
  emotion: "friendly"       // friendly | angry | sad | neutral | excited | mysterious
  content: "Hello, traveler. How can I help you?"
  condition: player.level >= 1  // optional — node only shown when truthy
  nextDialogue: "other_id"      // linear next node (no options required)

  options: [
    {
      text: "Tell me about the dungeon."
      next: "dialog_dungeon_info"
      emotion: "curious"
      unlocked: player.has_map == true    // option hidden when falsy
    },
    {
      text: "Buy something."
      next: "dialog_shop"
    },
    {
      text: "[Leave]"
      next: "end"
      action: { emit("conversation_ended") }
    }
  ]
}
```

### Dialogue properties

| Property       | Type       | Required | Description                                               |
| -------------- | ---------- | -------- | --------------------------------------------------------- |
| `character`    | `string`   | No       | NPC speaker name                                          |
| `emotion`      | `string`   | No       | `friendly` `angry` `sad` `neutral` `excited` `mysterious` |
| `content`      | `string`   | Yes      | The dialogue text shown to the player                     |
| `condition`    | expression | No       | Node is hidden when falsy                                 |
| `nextDialogue` | `string`   | No       | Id of the next node when no options are shown             |
| `options`      | array      | No       | Player response choices                                   |

### Dialogue option fields

| Field      | Type            | Required | Description                                      |
| ---------- | --------------- | -------- | ------------------------------------------------ |
| `text`     | `string`        | Yes      | Displayed choice text                            |
| `next`     | `string`        | No       | Id of the dialogue node to load on selection     |
| `emotion`  | `string`        | No       | Option-specific emotion override                 |
| `unlocked` | expression      | No       | Option hidden when falsy                         |
| `action`   | statement block | No       | Statements executed when this option is selected |

### Minimal example

```holoscript
composition "TavernScene" {

  dialogue "greta_greeting" {
    character: "Greta"
    emotion: "friendly"
    content: "Welcome to the Hearthstone! What can I get you?"
    options: [
      { text: "Buy something.", next: "greta_shop" },
      { text: "Any news from the road?", next: "greta_rumors" },
      { text: "Just passing through.", next: "end" }
    ]
  }

  dialogue "greta_shop" {
    character: "Greta"
    emotion: "excited"
    content: "Take a look at my wares!"
  }

}
```

---

## State Machines

`state_machine` declares an explicit finite-state machine with named states, entry/exit
hooks, transition rules, and optional timeout transitions. Used for NPC combat phases,
boss mechanics, door states, etc.

Two declaration styles are accepted:

1. **Named keyword:** `state_machine "name" { state "s1" { ... } ... }`
2. **Decorator:** `@state_machine { state "s1" { ... } ... }` (attached to the previous
   object — stored in `composition.stateMachines`)

### Syntax (keyword form)

```holoscript
state_machine "BossPhases" {
  initial: "phase_one"      // or initialState: "phase_one"

  state "phase_one" {
    entry: {
      emit("boss_intro_played")
      this.state.speed = 3
    }
    exit: {
      emit("phase_one_ended")
    }
    actions: [
      { animate: { clip: "charge_attack" } }
    ]
    transitions: [
      { target: "phase_two", condition: this.state.health < 500 },
      { target: "enraged",   event: "player_used_fire" }
    ]
    timeout: 120
    onTimeout: {
      emit("enrage_timer")
    }
  }

  state "phase_two" {
    entry: {
      this.state.speed = 6
    }
    actions: [
      { animate: { clip: "aoe_spin" } }
    ]
    transitions: [
      { target: "dead", condition: this.state.health <= 0 }
    ]
  }

  state "enraged" {
    actions: [
      { animate: { clip: "berserk" } },
      { emit: { event: "boss_enraged" } }
    ]
    transitions: [
      { target: "dead", condition: this.state.health <= 0 }
    ]
  }

  state "dead" {
    entry: {
      emit("boss_defeated")
    }
    actions: []
    transitions: []
  }
}
```

### State machine properties

| Property                   | Type      | Required | Description                |
| -------------------------- | --------- | -------- | -------------------------- |
| `initial` / `initialState` | `string`  | Yes      | Name of the starting state |
| `state "name" { }`         | sub-block | Yes (≥1) | State declaration          |

### State fields

| Field                | Type               | Description                                         |
| -------------------- | ------------------ | --------------------------------------------------- |
| `entry` / `on_entry` | statement block    | Runs once when the state is entered                 |
| `exit` / `on_exit`   | statement block    | Runs once when the state is exited                  |
| `actions`            | `BehaviorAction[]` | Repeating actions while in this state               |
| `transitions`        | array              | Conditions or events that trigger a state change    |
| `timeout`            | `number`           | Seconds before `onTimeout` fires                    |
| `onTimeout`          | statement block    | Executed when `timeout` elapses                     |
| `onDamage`           | statement block    | Executed when the entity takes damage in this state |

### Transition fields

| Field       | Type       | Description                              |
| ----------- | ---------- | ---------------------------------------- |
| `target`    | `string`   | State name to transition to              |
| `condition` | expression | Transition fires when truthy             |
| `event`     | `string`   | Event name that triggers this transition |

### Minimal example

```holoscript
state_machine "DoorFSM" {
  initial: "closed"

  state "closed" {
    transitions: [
      { target: "open", event: "player_interact" }
    ]
  }

  state "open" {
    entry: {
      emit("door_opened")
    }
    timeout: 10
    onTimeout: {
      emit("door_auto_close")
    }
    transitions: [
      { target: "closed", event: "door_auto_close" }
    ]
  }
}
```

---

## Achievements

`achievement` declares a named unlock triggered when its `condition` expression
becomes truthy. An optional `progress` expression tracks partial completion.

### Syntax

```holoscript
achievement "AchievementName" {
  description: "Defeat 100 enemies."
  points: 50
  hidden: false          // hidden achievements don't appear until unlocked
  condition: player.totalKills >= 100
  progress: player.totalKills / 100
  reward: {
    title: "Centurion"
    badge: "/badges/centurion.png"
    bonus: { gold: 500, xp: 1000 }
    unlocks: ["elite_mode"]
  }
}
```

### Achievement properties

| Property      | Type       | Required | Description                            |
| ------------- | ---------- | -------- | -------------------------------------- |
| `description` | `string`   | Yes      | Player-visible achievement text        |
| `points`      | `number`   | No       | Achievement point value                |
| `hidden`      | `boolean`  | No       | Hide from UI until unlocked            |
| `condition`   | expression | Yes      | Unlocks when truthy                    |
| `progress`    | expression | No       | `0.0–1.0` progress fraction expression |
| `reward`      | block      | No       | Optional reward on unlock              |

#### `reward` fields

| Field     | Type                     | Description                           |
| --------- | ------------------------ | ------------------------------------- |
| `title`   | `string`                 | Title awarded to the player           |
| `badge`   | `string`                 | Badge asset path                      |
| `bonus`   | `Record<string, number>` | Resource bonuses (gold, xp, etc.)     |
| `unlocks` | `string[]`               | Additional feature/quest ids unlocked |

### Minimal example

```holoscript
achievement "first_blood" {
  description: "Win your first combat encounter."
  points: 10
  condition: player.wins >= 1
}
```

---

## Talent Trees

`talent_tree` declares a class talent system with tiers (rows) and individual nodes.
Nodes may require other nodes and apply typed effects.

### Syntax

```holoscript
talent_tree "TreeName" {
  class: "warrior"       // optional class restriction

  rows: [
    {
      tier: 1
      nodes: [
        {
          id: "sword_mastery"
          name: "Sword Mastery"
          description: "Increases sword damage by 10% per point."
          points: 1         // current points invested
          maxPoints: 5      // cap
          icon: "/icons/sword.png"
          effect: {
            effectType: "passive"   // spell | upgrade | passive | unlock
            target: "sword_damage"
            bonus: { sword_damage: 0.1 }
          }
        }
      ]
    },
    {
      tier: 2
      nodes: [
        {
          id: "whirlwind"
          name: "Whirlwind"
          description: "Unlocks the Whirlwind ability."
          points: 0
          maxPoints: 1
          requires: ["sword_mastery"]    // node ids that must be maxed first
          effect: {
            effectType: "unlock"
            target: "whirlwind_ability"
          }
        }
      ]
    }
  ]
}
```

### Talent tree properties

| Property | Type     | Required | Description        |
| -------- | -------- | -------- | ------------------ |
| `class`  | `string` | No       | Class restriction  |
| `rows`   | array    | Yes      | Array of tier rows |

### Row fields

| Field   | Type     | Required | Description                 |
| ------- | -------- | -------- | --------------------------- |
| `tier`  | `number` | Yes      | Tier number (1 = first row) |
| `nodes` | array    | Yes      | Talent nodes in this tier   |

### Node fields

| Field         | Type       | Required | Description               |
| ------------- | ---------- | -------- | ------------------------- |
| `id`          | `string`   | Yes      | Unique node identifier    |
| `name`        | `string`   | Yes      | Display name              |
| `description` | `string`   | No       | Tooltip description       |
| `points`      | `number`   | Yes      | Current invested points   |
| `maxPoints`   | `number`   | No       | Maximum investable points |
| `requires`    | `string[]` | No       | Prerequisite node ids     |
| `icon`        | `string`   | No       | Icon asset path           |
| `effect`      | block      | Yes      | Effect definition         |

### Effect fields

| Field        | Type                     | Description                                  |
| ------------ | ------------------------ | -------------------------------------------- |
| `effectType` | `string`                 | `spell` `upgrade` `passive` `unlock`         |
| `target`     | `string`                 | Stat name or ability id affected             |
| `bonus`      | `Record<string, number>` | Numeric bonuses applied (`{ stat: amount }`) |

### Minimal example

```holoscript
talent_tree "MageTalents" {
  class: "mage"
  rows: [
    {
      tier: 1
      nodes: [
        {
          id: "arcane_focus"
          name: "Arcane Focus"
          points: 0
          maxPoints: 3
          effect: { effectType: "passive", target: "spell_power", bonus: { spell_power: 5 } }
        }
      ]
    }
  ]
}
```

---

## Loot Tables

`loot_table` declares a weighted drop table. Each `entry` is a named drop with an
item reference, weight, optional quantity range, rarity, and condition. A `guaranteed`
block defines items that always drop regardless of roll.

### Syntax

```holoscript
loot_table goblin_drops {          // name can be bare identifier or quoted string
  entry common_coin {
    item: "gold_coin"
    qty: "1..5"                    // range string or plain number
    weight: 60
  }
  entry iron_shard {
    item: "iron_shard"
    qty: "1..2"
    weight: 25
    rarity: "uncommon"             // common | uncommon | rare | epic | legendary
  }
  entry shadow_amulet {
    item: "shadow_amulet"
    qty: 1
    weight: 5
    rarity: "rare"
    condition: "player.level >= 10"
  }
  entry nothing {
    weight: 10
  }

  guaranteed {
    item: "goblin_ear"
    qty: 1
  }

  // top-level properties for global modifiers
  multiplier_on_faction_hostile: "ironveil * 1.5"
}
```

### Loot table properties

| Property               | Type      | Description                                  |
| ---------------------- | --------- | -------------------------------------------- |
| `entry name { }`       | sub-block | A single drop entry (repeatable)             |
| `guaranteed { }`       | sub-block | Items that always drop                       |
| Any other `key: value` | —         | Global modifier properties passed to runtime |

### Entry fields

| Field       | Type                 | Required | Description                                              |
| ----------- | -------------------- | -------- | -------------------------------------------------------- |
| `item`      | `string`             | No       | Item reference id                                        |
| `weight`    | `number`             | Yes      | Relative drop weight (higher = more common)              |
| `qty`       | `string` or `number` | No       | Drop quantity; range form `"min..max"` or a fixed number |
| `rarity`    | `string`             | No       | `common` `uncommon` `rare` `epic` `legendary`            |
| `condition` | `string`             | No       | Expression string — entry only eligible when truthy      |

### Minimal example

```holoscript
loot_table cave_chest {
  entry gold { item: "gold_coin" qty: "5..20" weight: 70 }
  entry gem  { item: "ruby"      qty: 1       weight: 10 rarity: "rare" }
  entry nothing { weight: 20 }
  guaranteed { item: "iron_key" qty: 1 }
}
```

---

## Spawn Points

`spawn_point` marks a position where players or NPCs respawn after death. An optional
`faction` restricts who can use the point.

### Syntax

```holoscript
spawn_point village_entry {        // name can be bare identifier or quoted
  faction: "neutral"               // free-form faction tag
  max_count: 10                    // max concurrent entities at this point
  respawn_radius: 5                // metres — random offset applied to position
  position: [10, 0, 10]           // world position (array)
}
```

### Spawn point properties

| Property         | Type        | Required | Description                                                       |
| ---------------- | ----------- | -------- | ----------------------------------------------------------------- |
| `faction`        | `string`    | No       | Faction tag that may use this point (e.g. `"horde"`, `"neutral"`) |
| `max_count`      | `number`    | No       | Maximum concurrent entities spawned here                          |
| `respawn_radius` | `number`    | No       | Metres of random spread around `position`                         |
| `position`       | `[x, y, z]` | No       | World-space spawn origin                                          |

Any other `key: value` pairs are collected in `properties` for runtime use.

### Minimal example

```holoscript
spawn_point main_spawn {
  faction: "alliance"
  max_count: 20
  respawn_radius: 3
  position: [0, 0, 0]
}
```

---

## Game Triggers

`game_trigger` (keyword: `trigger` in source comments, parsed as `game_trigger`) is
a sphere-shaped interaction volume that fires `on_enter` and `on_exit` handlers when
entities enter or leave the radius. An optional `faction_filter` restricts which
factions trigger it.

### Syntax

```holoscript
game_trigger dungeon_entrance {
  radius: 3                              // detection sphere radius in metres
  faction_filter: ["alliance", "neutral"]
  position: [50, 0, -30]

  on_enter {
    emit("dungeon_enter")
    player.state.in_dungeon = true
  }
  on_exit {
    emit("dungeon_exit")
    player.state.in_dungeon = false
  }
}
```

### Game trigger properties

| Property         | Type        | Required | Description                                            |
| ---------------- | ----------- | -------- | ------------------------------------------------------ |
| `radius`         | `number`    | Yes      | Detection radius in metres                             |
| `faction_filter` | `string[]`  | No       | Only fire for entities in these factions (empty = all) |
| `position`       | `[x, y, z]` | No       | World-space center of the trigger                      |
| `on_enter { }`   | handler     | No       | Statements executed when an entity enters              |
| `on_exit { }`    | handler     | No       | Statements executed when an entity exits               |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
game_trigger boss_room_entry {
  radius: 5
  on_enter {
    emit("seal_boss_room")
  }
}
```

---

## Movement Paths

`movement_path` declares a named locomotion route — a sequence of waypoints with a
travel mode and easing. NPCs reference this path by name via the `LocomotionTrait`
or a `move` behavior action.

### Syntax

```holoscript
movement_path patrol_route {
  mode: "patrol"                         // patrol | follow | path | orbit | snap
  loop: true
  speed: 2.5                             // metres per second
  waypoints: [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 10]
  ]
  easing: "linear"                       // linear | ease_in | ease_out | ease_in_out | spring
}
```

### Movement path properties

| Property    | Type          | Required | Description                                          |
| ----------- | ------------- | -------- | ---------------------------------------------------- |
| `mode`      | `string`      | No       | `patrol` `follow` `path` `orbit` `snap`              |
| `loop`      | `boolean`     | No       | Restart from the beginning after the last waypoint   |
| `speed`     | `number`      | No       | Travel speed in metres per second                    |
| `waypoints` | `[x, y, z][]` | No       | Ordered waypoint array                               |
| `easing`    | `string`      | No       | `linear` `ease_in` `ease_out` `ease_in_out` `spring` |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
movement_path guard_beat {
  mode: "patrol"
  loop: true
  speed: 1.8
  waypoints: [[-5, 0, 0], [5, 0, 0], [5, 0, 5], [-5, 0, 5]]
}
```

---

## Reaction Triggers

`reaction_trigger` is a declarative scene-level event wire: when `target` enters the
defined area (or a named event fires), `on_activate` handlers run. When the target
leaves, `on_deactivate` handlers run. An optional `cooldown` prevents rapid re-firing.

### Syntax

```holoscript
reaction_trigger on_player_enter_shrine {
  target: "player"                       // entity type or id
  condition: "player.level >= 5"         // optional guard expression string
  cooldown: 2.0                          // seconds before can re-fire

  on_activate {
    emit("shrine_activated")
    shrine.state.glowing = true
  }
  on_deactivate {
    shrine.state.glowing = false
  }
}
```

### Reaction trigger properties

| Property            | Type     | Required | Description                                                     |
| ------------------- | -------- | -------- | --------------------------------------------------------------- |
| `target`            | `string` | No       | Entity type or id to react to (e.g. `"player"`, `"@npc_guard"`) |
| `condition`         | `string` | No       | Guard expression — trigger only fires when truthy               |
| `cooldown`          | `number` | No       | Seconds before this trigger can fire again                      |
| `on_activate { }`   | handler  | No       | Statements executed on activation                               |
| `on_deactivate { }` | handler  | No       | Statements executed on deactivation                             |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
reaction_trigger door_proximity {
  target: "player"
  cooldown: 1.0
  on_activate {
    emit("door_open")
  }
  on_deactivate {
    emit("door_close")
  }
}
```

---

## World Chunks

`world_chunk` declares an AABB section of a large open world for streaming. Each chunk
carries a priority hint, biome, LOD distances, an NPC roster, and a `streaming`
sub-block for load/unload radii and memory budgets.

### Syntax

```holoscript
world_chunk dockside {
  priority: "high"                       // high | medium | low | number
  biome: "coastal_urban"
  lod_distances: [50, 150, 400]
  npc_roster: ["merchant_alva", "harbor_guard_01"]
  streaming {
    load_radius: 300
    unload_radius: 500
    budget_kb: 32768
  }
}
```

### World chunk properties

| Property         | Type                 | Required | Description                                                        |
| ---------------- | -------------------- | -------- | ------------------------------------------------------------------ |
| `priority`       | `string` or `number` | No       | Streaming priority (`"high"` `"medium"` `"low"` or numeric)        |
| `biome`          | `string`             | No       | Biome identifier (free-form string)                                |
| `lod_distances`  | `number[]`           | No       | LOD switch distances in metres                                     |
| `npc_roster`     | `string[]`           | No       | NPC names present in this chunk (references to `npc` declarations) |
| `spawn_points`   | `[x,y,z][]`          | No       | Spawn positions within the chunk                                   |
| `asset_manifest` | `string[]`           | No       | Asset paths declared in the chunk                                  |
| `streaming { }`  | sub-block            | No       | Load/unload radii and memory budget                                |

Any other `key: value` pairs are collected in `properties`.

#### `streaming` sub-block fields

| Field           | Type     | Description                                 |
| --------------- | -------- | ------------------------------------------- |
| `load_radius`   | `number` | Metres from camera at which the chunk loads |
| `unload_radius` | `number` | Metres at which the chunk unloads           |
| `budget_kb`     | `number` | Maximum memory budget in KB                 |

### Minimal example

```holoscript
world_chunk forest_north {
  priority: "medium"
  biome: "temperate_forest"
  lod_distances: [100, 300]
  streaming {
    load_radius: 250
    unload_radius: 400
    budget_kb: 16384
  }
}
```

---

## World Layers

`world_layer` gates content (NPCs and objects) to players whose quest state matches
a predicate. The same world coordinates host different content depending on whether a
named quest is completed — the "phased world" pattern.

The `questId` in the predicate is compile-validated against declared quests in the
same composition. An unknown quest is a compile error.

### Syntax

```holoscript
// Visible AFTER completing the quest
world_layer post_awakening {
  requires_quest: "main_chapter_1"
  npcs: ["restored_keeper", "vigilant_guard"]
  objects: ["healed_shrine"]
}

// Visible BEFORE completing the quest (inverse)
world_layer pre_awakening {
  forbids_quest: "main_chapter_1"
  npcs: ["wounded_keeper"]
  objects: ["broken_shrine"]
}
```

### World layer properties

| Property         | Type       | Required       | Description                                       |
| ---------------- | ---------- | -------------- | ------------------------------------------------- |
| `requires_quest` | `string`   | One of the two | Layer visible only AFTER this quest is completed  |
| `forbids_quest`  | `string`   | One of the two | Layer visible only BEFORE this quest is completed |
| `npcs`           | `string[]` | No             | NPC names gated to this layer                     |
| `objects`        | `string[]` | No             | Object names gated to this layer                  |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
quest "rescue_the_keeper" {
  objectives: [{ id: "rescue", description: "Free the keeper", type: "interact", target: "keeper_cage" }]
  rewards: { experience: 200 }
}

world_layer keeper_freed {
  requires_quest: "rescue_the_keeper"
  npcs: ["free_keeper"]
}
```

---

## Dungeon Instances

`dungeon_instance` declares per-party instanced content. The runtime spins up one live
instance per party (up to `max_instances`). On completion, a receipt is sealed against
the party and the `completion_quest` flag is set.

The `completion_quest` is compile-validated against declared quests.

### Syntax

```holoscript
dungeon_instance shadowfen_keep {
  max_instances: 10            // concurrent instance cap
  party_size: 5                // players per instance
  reset_timer: 3600            // seconds an empty instance lingers before release
  completion_quest: "shadowfen_cleared"   // quest id set on completion
  npcs: ["dungeon_boss", "shadow_acolyte"]
  objects: ["boss_chest", "arcane_barrier"]
}
```

### Dungeon instance properties

| Property           | Type       | Required          | Description                                  |
| ------------------ | ---------- | ----------------- | -------------------------------------------- |
| `max_instances`    | `number`   | Yes (default `1`) | Pool cap — max concurrent live instances     |
| `party_size`       | `number`   | Yes (default `1`) | Players per instance                         |
| `reset_timer`      | `number`   | Yes (default `0`) | Seconds before an empty instance is released |
| `completion_quest` | `string`   | No                | Quest id set when the instance is cleared    |
| `npcs`             | `string[]` | No                | NPC names that populate the instance         |
| `objects`          | `string[]` | No                | Object names that populate the instance      |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
dungeon_instance goblin_warren {
  max_instances: 20
  party_size: 3
  reset_timer: 1800
  completion_quest: "warren_cleared"
  npcs: ["goblin_warlord", "goblin_shaman"]
}
```

---

## World Shards

`world_shard` partitions a single large world into AABB rooms, each hosted as its own
server room. When a player crosses into a neighbor shard's bounds, the runtime
receipt-seals a handoff to the target shard. The handoff is validated (target must be
a declared neighbor and the player position must be inside its bounds — anti-teleport).

Neighbor names are compile-validated: all `neighbors` entries must refer to other
`world_shard` declarations in the same composition.

### Syntax

```holoscript
world_shard north_province {
  min: [-1000, 0, -1000]      // AABB minimum corner [x, y, z]
  max: [0, 256, 1000]         // AABB maximum corner [x, y, z]
  neighbors: ["south_province", "east_province"]
  max_players: 200
  handoff: "seamless"          // seamless | loading
}

world_shard south_province {
  min: [0, 0, -1000]
  max: [1000, 256, 1000]
  neighbors: ["north_province"]
  max_players: 150
  handoff: "seamless"
}
```

### World shard properties

| Property      | Type        | Required                  | Description                                                      |
| ------------- | ----------- | ------------------------- | ---------------------------------------------------------------- |
| `min`         | `[x, y, z]` | Yes                       | AABB minimum corner                                              |
| `max`         | `[x, y, z]` | Yes                       | AABB maximum corner                                              |
| `neighbors`   | `string[]`  | Yes                       | Adjacent shard names a player may cross into (compile-validated) |
| `max_players` | `number`    | No (default `100`)        | Player cap for this shard's room                                 |
| `handoff`     | `string`    | No (default `"seamless"`) | `"seamless"` or `"loading"`                                      |

Any other `key: value` pairs are collected in `properties`.

### Minimal example

```holoscript
world_shard city_center {
  min: [-500, 0, -500]
  max: [500, 200, 500]
  neighbors: ["city_east_district"]
  max_players: 300
  handoff: "seamless"
}

world_shard city_east_district {
  min: [500, 0, -500]
  max: [1500, 200, 500]
  neighbors: ["city_center"]
  max_players: 150
  handoff: "seamless"
}
```

---

## Complete Example

The following composition shows all game construct types together in a single scene:

```holoscript
composition "AdventureZone" {

  // ── World structure ──────────────────────────────────────────────────────

  spawn_point village_gate {
    faction: "neutral"
    max_count: 20
    respawn_radius: 3
    position: [0, 0, 0]
  }

  game_trigger dungeon_mouth {
    radius: 4
    position: [50, 0, -30]
    on_enter {
      emit("entered_dungeon_zone")
    }
  }

  movement_path guard_beat {
    mode: "patrol"
    loop: true
    speed: 2
    waypoints: [[-10, 0, 0], [10, 0, 0], [10, 0, 10], [-10, 0, 10]]
  }

  reaction_trigger gate_proximity {
    target: "player"
    cooldown: 2
    on_activate { emit("open_gate") }
    on_deactivate { emit("close_gate") }
  }

  // ── NPCs ────────────────────────────────────────────────────────────────

  npc "Elder_Nira" {
    type: "quest_giver"
    model: "/models/elder.glb"
    position: [5, 0, 3]
    dialogue_tree: "nira_intro"
  }

  // ── Quests ──────────────────────────────────────────────────────────────

  quest "clear_the_cave" {
    giver: "Elder_Nira"
    level: 3
    type: "defeat"
    objectives: [
      { id: "kill_boss", description: "Defeat the Cave Troll", type: "defeat", target: "cave_troll", count: 1 }
    ]
    rewards: {
      experience: 500
      gold: 75
      unlocks: ["cave_cleared"]
    }
  }

  // ── Loot ────────────────────────────────────────────────────────────────

  loot_table cave_troll_drops {
    entry bone_club { item: "bone_club" qty: 1 weight: 30 rarity: "uncommon" }
    entry troll_hide { item: "troll_hide" qty: "1..3" weight: 50 }
    entry nothing { weight: 20 }
    guaranteed { item: "troll_tooth" qty: 1 }
  }

  // ── Abilities ───────────────────────────────────────────────────────────

  ability "ground_slam" {
    type: "skill"
    stats: {
      staminaCost: 20
      cooldown: 10
      radius: 5
    }
    effects: {
      damage: { damageType: "physical", canCrit: false }
      debuff: { effect: "stun", duration: 2 }
    }
  }

  // ── Dialogue ────────────────────────────────────────────────────────────

  dialogue "nira_intro" {
    character: "Elder_Nira"
    emotion: "mysterious"
    content: "Dark creatures stir in the cave below. Will you help us?"
    options: [
      { text: "I'll do it.", next: "nira_accept" },
      { text: "Not now.", next: "end" }
    ]
  }

  // ── State machine ────────────────────────────────────────────────────────

  state_machine "BossPhases" {
    initial: "idle"

    state "idle" {
      transitions: [
        { target: "enraged", condition: player.proximity < 10 }
      ]
    }

    state "enraged" {
      entry: { emit("boss_aggro") }
      transitions: [
        { target: "defeated", condition: this.state.health <= 0 }
      ]
    }

    state "defeated" {
      entry: { emit("boss_dead") }
      transitions: []
    }
  }

  // ── Achievement ──────────────────────────────────────────────────────────

  achievement "troll_slayer" {
    description: "Defeat the Cave Troll."
    points: 25
    condition: player.kills["cave_troll"] >= 1
    reward: { title: "Troll Slayer", bonus: { gold: 100 } }
  }

  // ── Talent tree ──────────────────────────────────────────────────────────

  talent_tree "WarriorTalents" {
    class: "warrior"
    rows: [
      {
        tier: 1
        nodes: [
          {
            id: "toughness"
            name: "Toughness"
            points: 0
            maxPoints: 5
            effect: { effectType: "passive", target: "max_health", bonus: { max_health: 50 } }
          }
        ]
      }
    ]
  }

  // ── Open-world constructs ────────────────────────────────────────────────

  world_layer after_quest {
    requires_quest: "clear_the_cave"
    npcs: ["grateful_villager"]
    objects: ["quest_reward_chest"]
  }

  dungeon_instance cave_instance {
    max_instances: 10
    party_size: 4
    reset_timer: 3600
    completion_quest: "cave_cleared"
    npcs: ["cave_troll"]
  }

  world_chunk village_area {
    priority: "high"
    biome: "temperate_village"
    npc_roster: ["Elder_Nira"]
    streaming { load_radius: 200 unload_radius: 350 budget_kb: 8192 }
  }

}
```
