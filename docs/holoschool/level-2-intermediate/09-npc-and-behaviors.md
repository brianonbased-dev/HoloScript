# Lesson 2.9: NPCs & Behaviors

In this lesson, you'll learn how to bring your scenes to life with Non-Player Characters (NPCs) and the Behavior Tree system.

## Learning Objectives

- Create an `npc` block with visual and logic properties.
- Define `behavior` blocks with `trigger` and `priority`.
- Use `behavior_actions` to control NPC movement and animations.
- Link an NPC to a `state_machine`.

---

## The `npc` Block

An `npc` is a specialized `object` that represents an intelligent entity in your world.

```hsplus
npc "TownGuard" {
    npcType: "guardian"
    model: "models/npc_guard.glb"
    dialogue_tree: "guard_dialogue_01"

    behavior "Patrol" {
        trigger: "idle"
        priority: 1
        actions: [
            { move: { target: [-5, 0, 5], speed: 2.0 } },
            { wait: 3.0 },
            { move: { target: [5, 0, -5], speed: 2.0 } }
        ]
    }
}
```

---

## Behavior Trees

Behaviors are declarative rules that the NPC's "brain" evaluates constantly.

### 1. Triggers

The `trigger` determines when a behavior should start.

- `idle`: Runs when no other higher-priority behavior is active.
- `on_damage`: Runs when the NPC is hit.
- `on_vision`: Runs when a target enters the NPC's field of view (requires `@perception` trait).

### 2. Priority

If multiple behaviors are triggered, the one with the **highest priority** (lower number) runs first.

---

## Controlling the NPC: Behavior Actions

Inside a `behavior`, you define an array of `actions`. These are sequential steps the NPC will take.

| Action      | Example                                     | Description                   |
| :---------- | :------------------------------------------ | :---------------------------- |
| **move**    | `{ move: { target: [x,y,z], speed: 1.5 } }` | Moves to a position.          |
| **face**    | `{ face: { target: "Player" } }`            | Rotates to face a target.     |
| **animate** | `{ animate: "wave" }`                       | Plays a named animation clip. |
| **wait**    | `{ wait: 2.0 }`                             | Pauses for X seconds.         |
| **call**    | `{ call: "someMethod()" }`                  | Executes a custom method.     |

---

## Linking to a State Machine

For truly complex AI, combine a `npc` with a `state_machine`.

```hsplus
npc "Merchant" {
    model: "models/merchant.glb"

    state_machine "Mood" {
        initialState: "Friendly"
        states: {
            "Friendly": {
                transitions: [{ target: "Annoyed", condition: self.interactions > 5 }]
            }
            "Annoyed": {
                entry: { self.play_animation("facepalm") }
                timeout: 10.0
                onTimeout: { self.transition("Friendly") }
            }
        }
    }

    behavior "Bargain" {
        trigger: "on_interact"
        condition: self.state_machine("Mood").state == "Friendly"
        actions: [
            { face: { target: "Player" } },
            { call: "open_shop()" }
        ]
    }
}
```

---

## ⚡ Performance: Cognitive Density

Every NPC has a "Cognitive Cost."

- **Low Cost**: Simple patrol with `idle` triggers.
- **High Cost**: Real-time pathfinding with `@perception` and high-priority behavior stacks.

**Tip**: Use `spatial_group` to group NPCs by location. The engine can then "cull" the AI of NPCs that are too far away from any player to be seen.

---

## Exercise: Build a Fearful NPC

Create an NPC that:

1. Patrols between two points.
2. If the player gets too close, it plays a "scared" animation and runs to a "SafetyPoint" object.
3. After 5 seconds, it returns to patrolling.

## Summary

In this lesson, you learned:

- How to define persistent AI characters with `npc`.
- Using `behavior` trees to automate NPC actions.
- The difference between `trigger`, `priority`, and `actions`.
- Integrating logic via `state_machine`.

## Next Lesson

In [Lesson 2.10: Biome Encounters](./10-biome-encounters.md), we'll see how to spawn these NPCs dynamically based on the environment.
