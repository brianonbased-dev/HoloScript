# Lesson 2.12: Spatial Discovery & Sub-Orbs

In this final lesson of the HoloHub track, we'll explore how to create truly interconnected worlds using spatial discovery and the "Sub-Orb" pattern.

## Learning Objectives

- Use the `@portal` and `@hologram` traits for asset discovery.
- Implement Composition-in-Composition loading.
- Create transitions between different HoloHub scenes.
- Build a "Hub Portal" that dynamically loads remote content.

---

## The Spatial Discovery Pattern

Instead of choosing scenes from a 2D menu, users in Hololand discover content by interacting with physical objects in the world.

### 1. The `@hologram` Trait

A hologram is a non-physical, visual-only representation of an asset. It allows users to "peek" at a scene without leaving their current world.

```hsplus
object "CityPreview" {
    @hologram
    geometry: "holohub://smart-city-nexus"
    scale: [0.1, 0.1, 0.1] // Miniature view
}
```

### 2. The `@portal` Trait

A portal is an interaction point that triggers a composition swap or a sub-orb load.

```hsplus
object "GateToCity" {
    @portal(sceneId: "smart-city-nexus")
    @interaction
    geometry: "models/gate.glb"

    onInteraction: {
        self.transition_to_composition("smart-city-nexus")
    }
}
```

---

## Sub-Orbs: Nested Environments

A "Sub-Orb" is a composition that runs inside a specific `object` or `zone` of a parent world. This allows you to build "worlds within worlds."

```hsplus
composition "MainWorld" {
    object "WorkshopRoom" {
        geometry: "box"
        scale: [10, 5, 10]

        // Loads another scene inside this room
        sub_orb "DisplayScene" {
            source: "holohub://neon-combat-arena"
            position: [0, 0, 0]
        }
    }
}
```

---

## Project: The Voyager's Gate

Let's build a gate that pulls random featured scenes from HoloHub.

```hsplus
composition "Voyager Terminal" {
    state {
        activePreview: ""
    }

    object "PortalArch" {
        @hologram
        geometry: "models/arch.glb"

        logic {
            on_state_change(state.activePreview) {
                // Instantiates the hub scene into the arch center
                self.load_sub_orb(state.activePreview)
            }
        }
    }

    object "DiscoveryDashboard" {
        @interaction
        geometry: "models/console.glb"

        onInteraction: {
            // Call the spatial registry bridge
            state.activePreview = holohub.getRandomFeaturedScene().id
            emit "ui_overlay" "Source synced: " + state.activePreview
        }
    }
}
```

---

## ⚡ Pro Tip: Proxy State

When using sub-orbs, the children cannot access the parent's `state` block directly. Instead, use the `@networked` trait on shared variables to synchronize state across orb boundaries.

---

## Summary

In this lesson, you learned:

- How to spatialize asset discovery via `@hologram`.
- The mechanics of `@portal` transitions.
- How to nest compositions using the `sub_orb` pattern.

## 🎉 Congratulations!

You have completed the entire **Intermediate Academy** track. You are now a certified **HoloScript Architect**, capable of building decentralized, interconnected spatial ecosystems.

Next, sharpen your skills in **Level 3: Protocol Evolution**, where we explore **ZK-Privacy** and **Custom Compiler Targets**.

## Next Lesson

In [Lesson 2.13: The Universal Coordination Layer](./13-coordination-layer.md), the final Level 2 lesson, we zoom out to see HoloScript as a universal connective layer for AI, IoT, and humans.

---

**Estimated time:** 25 minutes
**Difficulty:** ⭐⭐ Intermediate
