# Lesson 2.10: Project - Biome Encounters

In this final lesson of Level 2, we’ll combine everything you’ve learned—traits, state, logic, NPCs, and zones—to create a dynamic environment that changes its inhabitants based on where you are.

## The Goal

Build an environment with two biomes: a **Lush Forest** and a **Dead Desert**.

- Entering the Forest biome spawns "Deer" NPCs.
- Entering the Desert biome spawns "Scorpion" NPCs.
- The player's movement speed decreases in the Desert.

---

## Step 1: Define the Biome Zones

We use the `zone` block to define physical areas and the `state` block to track the current active biome.

```hsplus
composition "Biome Demo" {
    state {
        currentBiome: "none"
    }

    // Forest Zone
    zone "ForestBiome" {
        position: [-20, 0, 0]
        size: [20, 10, 20]
        color: "#228B22"

        on_enter {
            state.currentBiome = "forest"
            emit "ui_overlay" "Entering Lush Forest"
        }
    }

    // Desert Zone
    zone "DesertBiome" {
        position: [20, 0, 0]
        size: [20, 10, 20]
        color: "#EDC9AF"

        on_enter {
            state.currentBiome = "desert"
            emit "ui_overlay" "Entering Scorched Desert"
            Player.walkSpeed = 1.0  // Slow down
        }
        on_exit {
            Player.walkSpeed = 2.0  // Resume speed
        }
    }
}
```

---

## Step 2: Create the Dynamic Spawner

We'll use a `logic` block with an `on_tick` or a custom event to spawn NPCs based on the `state.currentBiome`.

```hsplus
logic {
    on_biome_pulse() {
        if (state.currentBiome == "forest") {
            spawn_npc("Deer", random_pos_in_zone("ForestBiome"))
        } else if (state.currentBiome == "desert") {
            spawn_npc("Scorpion", random_pos_in_zone("DesertBiome"))
        }
    }

    // Run every 5 seconds
    timeline "SpawnerTimer" {
        autoplay: true
        loop: true
        5.0: { call: "on_biome_pulse()" }
    }
}
```

---

## Step 3: Define the NPCs

We need to define the templates for our NPCs so the engine knows what to create.

```hsplus
template "Deer" {
    @spatial_agent @passive
    model: "models/deer.glb"

    behavior "Wander" {
        trigger: "idle"
        actions: [{ move: { target: random_pos(10), speed: 1.0 } }, { wait: 2.0 }]
    }
}

template "Scorpion" {
    @spatial_agent @hostile
    model: "models/scorpion.glb"

    behavior "Hunt" {
        trigger: "on_vision"
        target: "Player"
        actions: [{ move: { target: "Player", speed: 2.5 } }]
    }
}
```

---

## Step 4: Adding Environmental Effects

To make the biomes feel real, add `environment` properties that change with the state.

```hsplus
environment {
    @bind(state.currentBiome, "getBiomeColor") : backgroundColor
}

// In your helper scripts:
function getBiomeColor(biome) {
    if (biome == "forest") return "#1a3300";
    if (biome == "desert") return "#5a4d00";
    return "#80c5de"; // default sky
}
```

---

## Summary

By completing this project, you’ve mastered:

- **Spatial Awareness**: Using `zone` to trigger logic based on player location.
- **Global State**: Tracking environment states across multiple objects.
- **Dynamic Entities**: Spawning `npc` templates via `logic` and `timeline`.
- **Environmental Feedback**: Changing player stats and visuals based on the biome.

---

## 🎉 Congratulations!

You have completed **Academy Level 2 (Intermediate)**.

### What's Next?

In **Level 3 (Advanced)**, we will dive into:

- Custom Shader Traits (`@shader`).
- Cross-Domain Logic Federation.
- Decentralized World Management with ZK-Privacy.

Keep building!

## Next Lesson

In [Lesson 2.11: Publishing to HoloHub](./11-publishing-holohub.md), you'll package your compositions for the HoloHub registry — metadata traits, versioning, and portfolio scenes.

---

**Estimated time:** 60 minutes
**Difficulty:** ⭐⭐⭐ Intermediate+
