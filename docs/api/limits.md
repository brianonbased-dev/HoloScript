# Limits & Constraints

Understanding HoloScript's runtime limits helps you build performant applications.

## Runtime Limits (All Formats)

These limits apply regardless of which file format you use:

| Constraint         | Value        | Notes                  |
| ------------------ | ------------ | ---------------------- |
| **Max Nodes**      | 1,000        | **THE critical limit** |
| Max Execution Time | 5 seconds    | Per frame/update       |
| Max Depth          | 50 levels    | Nesting depth          |
| Max Call Stack     | 100          | Function call depth    |
| Max Particles      | 1,000/system | Per particle system    |

::: warning Critical Limit
The **1,000 node limit** is the primary constraint. Design around lazy loading and object pooling to maximize capability.
:::

---

## Individual Format Limits

### .hs Limits

| Limit             | Value          |
| ----------------- | -------------- |
| Max File Size     | 50KB code      |
| Max Blocks        | 100 per file   |
| Max Nesting Depth | 10 levels      |
| Keywords          | 100+ available |

### .hsplus Limits

| Limit           | Value                         |
| --------------- | ----------------------------- |
| VR Traits       | 57 implemented (119+ defined) |
| Lifecycle Hooks | 80+ available                 |
| Scale Range     | 0.1x - 10x                    |
| Inventory Stack | 10 items                      |

### .holo Limits

| Limit        | Value      |
| ------------ | ---------- |
| Compositions | 1 per file |
| Templates    | Unlimited  |
| Objects      | Unlimited  |
| Nesting      | Unlimited  |

---

## Combined Power

When using all formats together:

| Capability        | Combined Value                  |
| ----------------- | ------------------------------- |
| VR Traits         | 1,800+ (stackable - 20+ per object) |
| Lifecycle Hooks   | 80+ (combinable)                |
| Builtin Functions | 90+                             |
| Import Chains     | Unlimited                       |
| Nesting Depth     | Unlimited (AST level)           |

### The Power Formula

```
COMBINED = .holo(∞ scene) × .hsplus(2,000+ traits + 80 hooks) × .ts(logic)
PRACTICAL_CAP = 1,000 nodes OR 5 seconds (whichever hits first)
```

---

## Optimization Strategies

### Stay Under Node Limit

```holo
// ❌ Bad: Creates 10,000 nodes at once
@for x in range(0, 100) {
  @for y in range(0, 100) {
    object "Tile_${x}_${y}" { position: [x, 0, y] }
  }
}

// ✅ Good: Lazy loading with chunks
spatial_group "World" {
  @lazy_load(chunk_size: 100, view_distance: 50)

  @for x in range(0, 100) {
    @for y in range(0, 100) {
      object "Tile_${x}_${y}" { position: [x, 0, y] }
    }
  }
}
```

### Object Pooling

```hsplus
// Create a pool of reusable objects
@pool("Bullet", capacity: 50)

function fire() {
  let bullet = pool_get("Bullet")
  bullet.position = gun.position
  bullet.velocity = aim_direction * 100

  delay 3s then {
    pool_return("Bullet", bullet)
  }
}
```

### Level of Detail (LOD)

```holo
object "DetailedBuilding" {
  @lod(
    near: { model: "building_high.glb", max_distance: 20 },
    mid: { model: "building_med.glb", max_distance: 100 },
    far: { model: "building_low.glb", max_distance: 500 },
    cull: { min_distance: 500 }
  )
}
```

### Disable Distant Physics

```hsplus
composition distantObject {
  @physics(enabled: distance_to_player < 50)
  @collidable(enabled: distance_to_player < 30)
}
```

---

## Performance Monitoring

### Built-in Stats

```hsplus
@debug_overlay {
  show_node_count: true
  show_frame_time: true
  show_memory: true
}
```

### Profiling

```holo
logic {
  @profile("SpawnWave") {
    spawn_wave()
  }

  when node_count > 800 {
    warn("Approaching node limit!")
    cleanup_distant_objects()
  }
}
```

---

## Platform-Specific Limits

| Platform  | Recommended Nodes | Notes            |
| --------- | ----------------- | ---------------- |
| Quest 2   | 500               | Mobile GPU       |
| Quest 3   | 700               | Better GPU       |
| PCVR      | 1,000             | Full limit       |
| Web       | 800               | Browser overhead |
| Mobile AR | 400               | Battery/thermal  |

---

## Memory Considerations

| Resource    | Typical Size | Limit  |
| ----------- | ------------ | ------ |
| Scene graph | 1-10 MB      | 50 MB  |
| Textures    | 5-50 MB      | 200 MB |
| Audio       | 1-20 MB      | 50 MB  |
| Models      | 5-100 MB     | 500 MB |

### Texture Guidelines

```holo
// Recommended texture sizes
object "Optimized" {
  // Mobile/Quest
  texture: "texture_1k.jpg"   // 1024x1024

  // PCVR
  texture: "texture_2k.jpg"   // 2048x2048

  // Use compressed formats
  texture: "texture.ktx2"     // GPU-compressed
}
```

---

## Key Takeaway

> **The 1,000 node runtime limit is the only practical constraint.** Everything else (imports, nesting, traits) is unlimited or very high. Design around lazy loading and object pooling to maximize capability.
