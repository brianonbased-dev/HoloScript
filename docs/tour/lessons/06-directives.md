# Lesson 6: Directives

Directives configure your entire scene — metadata, zones, and imports.

## Concept: @manifest, @zones

```holoscript
@manifest {
  title: "My Gallery"
  version: "1.0.0"
  author: "Alice"
  description: "An art gallery in VR"
}

@zones {
  entrance: { bounds: [[-5, 0, -5], [5, 5, 5]] }
  gallery:  { bounds: [[-10, 0, -15], [10, 5, 5]] }
}

orb "WelcomeSign" {
  color: "white"
  position: [0, 2, -4]
}
```

### Common Directives

| Directive    | Purpose                              |
|--------------|--------------------------------------|
| `@manifest`  | Scene metadata (title, version, etc.)|
| `@zones`     | Define spatial regions for chunking  |
| `@import`    | Import external HoloScript modules   |
| `@physics_world` | Global physics settings          |

## Try it:

```holoscript
@manifest {
  title: "My First Scene"
  version: "0.1.0"
}

orb "Floor" {
  scale: [10, 0.1, 10]
  color: "#888"
  position: [0, -0.05, 0]
  @physics { isStatic: true }
}
```

## Your turn:

Add an `@zones` directive with a `"play_area"` zone bounded by `[[-3,-1,-3],[3,3,3]]`.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 7 – Environment](./07-environment.md)
