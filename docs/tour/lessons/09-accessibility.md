# Lesson 9: Accessibility

Make your VR scenes usable by everyone with `@accessible` and `@alt_text`.

## Concept: @accessible, @alt_text

```holoscript
orb "InfoPanel" {
  color: "white"
  scale: [0.8, 0.5, 0.05]
  position: [0, 1.5, -2]

  @accessible {
    role: "button"
    label: "Open gallery menu"
    keyboardShortcut: "g"
  }

  @alt_text {
    description: "A white rectangular panel showing gallery navigation"
    context: "ui-element"
  }
}
```

### Accessibility traits

| Trait         | Purpose                                  |
| ------------- | ---------------------------------------- |
| `@accessible` | Assigns ARIA-like roles and keyboard nav |
| `@alt_text`   | Screen-reader description for the object |
| `@haptic`     | Tactile feedback when interacting        |
| `@contrast`   | Ensures visible contrast ratios          |

## Try it:

```holoscript
orb "Door" {
  color: "#8B4513"
  scale: [1, 2, 0.1]

  @accessible {
    role: "door"
    label: "Gallery entrance door"
  }
}
```

## Your turn:

Add `@alt_text` with a meaningful description to the Door orb above.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 10 – Full Scene](./10-full-scene.md)
