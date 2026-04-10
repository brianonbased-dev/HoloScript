# Lesson 2.8: State Machines

In this lesson, you'll learn how to use the `state_machine` construct to manage complex object behaviors. Instead of writing messy `if/else` logic in your update loops, you can define clear, discrete states and the rules for moving between them.

## Learning Objectives

- Define a `state_machine` with an `initialState`.
- Create multiple states with unique `entry` and `exit` actions.
- Implement transitions triggered by `condition` or `event`.
- Build a logic-driven "Smart Door" project.

---

## What is a State Machine?

A State Machine (FSM) is a model of behavior that can be in exactly **one of a several finite states** at any given time.

| Concept        | Description                                                              |
| :------------- | :----------------------------------------------------------------------- |
| **State**      | A specific mode of behavior (e.g., `Idle`, `Walking`, `Open`, `Locked`). |
| **Transition** | The act of moving from one state to another.                             |
| **Trigger**    | What caused the transition (an `event` or a boolean `condition`).        |
| **Action**     | Code that runs when a state is entered (`entry`) or left (`exit`).       |

---

## Basic Syntax

In HoloScript+, `state_machine` is a top-level block that can be attached to any object.

```hsplus
state_machine "DoorSystem" {
    initialState: "Closed"

    states: {
        "Closed": {
            entry: { self.play_animation("door_close") }
            transitions: [
                { target: "Open", condition: self.is_unlocked && self.is_pushed }
            ]
        }

        "Open": {
            entry: { self.play_animation("door_open") }
            timeout: 5.0
            onTimeout: { self.transition("Closed") }
            transitions: [
                { target: "Closed", event: "force_close" }
            ]
        }
    }
}
```

### Key Components:

- **`entry`**: Executes a statement block exactly once when the state becomes active.
- **`exit`**: Executes when leaving the state.
- **`timeout`**: Automatically triggers `onTimeout` after a set duration in seconds.
- **`transitions`**: An array of rules. If a `condition` becomes true or an `event` is received, the system moves to the `target` state.

---

## Project: The Smart Security Door

Let's build a door that requires a key and automatically locks itself.

```hsplus
composition "Security Scene" {
    state {
        hasKey: false
    }

    object "Door" {
        @collidable
        geometry: "models/door.glb"

        state_machine "DoorLogic" {
            initialState: "Locked"

            states: {
                "Locked": {
                    entry: { self.color = "#FF0000" }
                    onInteraction: {
                        if (state.hasKey) {
                            self.transition("Unlocked")
                        } else {
                            emit "ui_notification" "You need a key!"
                        }
                    }
                }

                "Unlocked": {
                    entry: {
                        self.color = "#00FF00"
                        self.play_sound("unlock.wav")
                    }
                    transitions: [
                        { target: "Open", condition: self.proximity_distance < 1.0 }
                    ]
                }

                "Open": {
                    entry: { self.animate_rotation([0, 90, 0], 1.0) }
                    timeout: 3.0
                    onTimeout: { self.transition("Closed") }
                }

                "Closed": {
                    entry: { self.animate_rotation([0, 0, 0], 0.5) }
                    transitions: [
                        { target: "Locked", condition: true } // Auto-lock immediately
                    ]
                }
            }
        }
    }

    object "Key" {
        @grabbable
        onGrab: { state.hasKey = true; self.destroy() }
    }
}
```

---

## ⚡ Pro Tips for State Machines

1. **State Isolation**: Variables defined within a state's `entry` block are private to that state. Use the composition's `state` block for shared data.
2. **Visual Debugging**: The HoloHub debugger shows the active state of any `state_machine` in real-time.
3. **Compound Transitions**: You can use complex logic in conditions: `condition: (self.health < 20) && (self.stamina > 0)`.

---

## Summary

In this lesson, you learned:

- How to structure a `state_machine`.
- Using `entry`, `exit`, and `timeout` for state-specific behavior.
- Defining `transitions` to move between states based on events or data.

## Next Lesson

In [Lesson 2.9: NPCs & Behaviors](./09-npc-and-behaviors.md), we'll see how to apply these state machines to create intelligent AI characters.
