# Lesson 2: Properties

Properties give your orb its shape, position, and appearance.

## Concept: Position, scale, color

```holoscript
orb "Cube" {
  color: "orange"
  scale: 1.0
  position: [0, 1, -2]   # x, y, z in meters
  rotation: [0, 45, 0]   # degrees
}
```

| Property   | Type                 | Default     |
| ---------- | -------------------- | ----------- |
| `color`    | string (hex or name) | `"white"`   |
| `scale`    | number or [x,y,z]    | `1.0`       |
| `position` | [x, y, z]            | `[0, 0, 0]` |
| `rotation` | [x, y, z] deg        | `[0, 0, 0]` |

## Try it:

```holoscript
orb "Floating" {
  color: "#ff6600"
  scale: 0.5
  position: [0, 2, -3]
}
```

## Your turn:

Create a row of 3 orbs side by side — positions `[-2, 0, 0]`, `[0, 0, 0]`, and `[2, 0, 0]`.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 3 – Traits](./03-traits.md)
