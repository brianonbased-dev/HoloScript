# Lesson 3: Traits

Traits add **behavior** to objects. The `@grabbable` trait lets users pick up objects in VR.

## Concept: @grabbable, @physics

```holoscript
orb "Ball" {
  color: "yellow"
  scale: 0.3

  @grabbable
  @physics {
    mass: 1.0
    restitution: 0.8   # bounciness
  }
}
```

The `@` prefix marks a trait — a reusable behavior module.

### Common Traits

| Trait        | Effect                          |
|--------------|---------------------------------|
| `@grabbable` | User can pick it up in VR       |
| `@physics`   | Simulates gravity + collisions  |
| `@synced`    | State synced across users       |
| `@highlight` | Glows on hover                  |

## Try it:

```holoscript
orb "PhysicsBall" {
  color: "red"
  scale: 0.4
  position: [0, 2, -2]

  @physics {
    mass: 0.5
  }
}
```

## Your turn:

Add `@grabbable` to make the ball pickable, then add `@physics` to make it fall with gravity.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 4 – Templates](./04-templates.md)
