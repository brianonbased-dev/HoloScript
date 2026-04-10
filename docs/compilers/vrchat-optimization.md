# VRChat Optimization & Integration Guide (v3.5)

VRChat is a primary target for HoloScript environments. The v3.4 compiler target emits raw **UdonSharp (U#)** C# code, providing direct access to the VRChat SDK 3.x API. This guide covers how to optimize your scripts for the Udon VM and handle networked synchronization.

---

## 🏗️ Udon VM Mapping

HoloScript traits are mapped to specialized UdonSharp behaviors and VRC SDK components.

| HoloScript Trait | VRC Component / U# Behavior                            |
| :--------------- | :----------------------------------------------------- |
| `@grabbable`     | `VRC_Pickup` component + `OnPickup` / `OnDrop`         |
| `@throwable`     | `Rigidbody` + velocity calculation on `OnDrop`         |
| `@networked`     | `[UdonSynced]` variables with `RequestSerialization()` |
| `@portal`        | `VRC_PortalMarker` with `destination` mapping          |
| `@spatial_audio` | `VRC_SpatialAudioSource`                               |

---

## 📡 Networking & Synchronization

HoloScript's `@networked` attribute is highly efficient in VRChat, utilizing Udon's serialization system.

### Synced Variables

Variables marked with `@networked` are compiled to `[UdonSynced]` members.

```hsplus
// HoloScript
object ScoreDisplay @networked {
    var score: number = 0
}

// Resulting UdonSharp (simplified)
[UdonSynced] private float score;
```

### Manual vs Continuous Sync

By default, HoloScript uses **Manual Synchronization** for better performance. It calls `RequestSerialization()` only when a variable changes. To force continuous sync for high-frequency updates (e.g., real-time movement):

```holo
object MovingPlatform @networked(sync: "continuous") {
    // ...
}
```

---

## ⚡ Performance Optimization

### The "Udon Update" Cost

The Udon VM has overhead for every behavior with an `Update()` loop. HoloScript optimizes this by:

1. **Consolidating Updates**: Merging multiple script updates into a single `HoloManager` behavior.
2. **Event-Driven Interactions**: Preferring `OnVRCPickup` and `OnPlayerTrigger` over polling in `Update`.

### Memory Management

Udon has strict memory limits. Avoid creating many small objects dynamically. Instead, use HoloScript's `composition` blocks to define your scene statically at load time.

---

## 🛡️ Security & Anti-Cheat

- **Owner-Only Logic**: Crucial interactions are protected by checking `Networking.IsOwner(gameObject)`.
- **Validation**: HoloScript's `ConstitutionalValidator` (if enabled) runs locally on each client to prevent malicious script state from being processed.

---

## 🚀 Pro Tips

- **VRC_ObjectSync**: For purely physical objects, HoloScript automatically adds `VRC_ObjectSync` to handle physics reproduction across the network.
- **Layers**: Map your geometry to VRChat-specific layers (e.g., `Walkable`, `MirrorReflection`) for correct visual behavior.
