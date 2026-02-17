# Lesson 8: Networking

Synchronize objects across multiple users with `@synced` and `@networked`.

## Concept: @synced, @networked

```holoscript
@manifest {
  title: "Multiplayer Sandbox"
  maxPlayers: 8
}

orb "SharedBall" {
  color: "yellow"
  scale: 0.3
  position: [0, 1, -2]

  @synced {
    properties: ["position", "rotation", "color"]
    authority: "owner"       # only the owner can move it
    interpolation: "linear"  # smooth movement for other players
  }

  @grabbable
  @physics { mass: 0.5 }
}
```

### Sync strategies

| Strategy   | Use case                           |
|------------|------------------------------------|
| `"owner"`  | One player controls, others watch  |
| `"last"`   | Last writer wins                   |
| `"server"` | Server-authoritative (anti-cheat)  |

## Try it:

```holoscript
orb "SharedCube" {
  color: "magenta"
  @synced { properties: ["color"] authority: "last" }
  logic "colorSync" {
    on_click: () => {
      this.color = this.color === "magenta" ? "cyan" : "magenta"
    }
  }
}
```

## Your turn:

Add `@networked` to the SharedCube to enable WebRTC peer-to-peer connectivity.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 9 – Accessibility](./09-accessibility.md)
