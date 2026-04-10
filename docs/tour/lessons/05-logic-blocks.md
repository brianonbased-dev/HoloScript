# Lesson 5: Logic Blocks

Logic blocks let objects **react** to events — clicks, ticks, collisions.

## Concept: on_click, on_tick

```holoscript
orb "Counter" {
  color: "purple"
  scale: 0.5

  @grabbable

  logic "interactions" {
    let count = 0

    on_click: () => {
      count += 1
      this.color = count % 2 === 0 ? "purple" : "orange"
    }

    on_tick: (dt) => {
      this.rotation.y += 30 * dt   # rotate 30°/s
    }
  }
}
```

### Event handlers

| Handler      | Trigger                               |
| ------------ | ------------------------------------- |
| `on_click`   | User clicks / selects the object      |
| `on_tick`    | Every frame (receives delta time dt)  |
| `on_grab`    | User picks up (requires @grabbable)   |
| `on_release` | User drops the object                 |
| `on_collide` | Physics collision (requires @physics) |

## Try it:

```holoscript
orb "SpinBox" {
  color: "cyan"
  logic "spin" {
    on_tick: (dt) => {
      this.rotation.y += 90 * dt
    }
  }
}
```

## Your turn:

Make the box change color to `"red"` when clicked and back to `"cyan"` when clicked again.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 6 – Directives](./06-directives.md)
