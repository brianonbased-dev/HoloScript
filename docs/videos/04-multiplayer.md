# Video 4: Multiplayer Basics (15 min)

**Target audience:** Intermediate — familiar with orbs and traits
**Goal:** Add real-time multiplayer to a HoloScript scene

---

## Script

### 0:00 — Intro (30s)

> "Multiplayer in VR normally means setting up WebSockets, authoritative
> servers, state reconciliation, and lag compensation. With HoloScript,
> you add one trait. Let me show you."

---

### 0:30 — The @synced Trait (150s)

```hsplus
orb "SharedBall" {
  color: "blue"
  scale: 0.4
  position: [0, 1, -2]

  @physics { mass: 1.0 }
  @grabbable
  @synced {
    properties: ["position", "rotation", "color"]
    authority: "last"
    rate: 20
  }
}
```

> "That's it. `@synced` automatically:
>
> - Broadcasts property changes to all connected users
> - Resolves conflicts with the authority strategy
> - Throttles updates to the rate you specify (20 updates/sec here)"

Authority strategies:
| Value | Behavior |
|---|---|
| `"last"` | Last writer wins (good for positioning) |
| `"owner"` | Only the object's owner can update |
| `"host"` | Only the session host can update |
| `"vote"` | Majority vote required (experimental) |

---

### 3:00 — Scene Manifest (90s)

```hsplus
@manifest {
  title: "Shared Sandbox"
  version: "1.0.0"
  maxPlayers: 8
  persistence: false    // Don't save state between sessions
  physics: "server"     // Server-authoritative physics
}
```

> "The manifest configures the session. Set maxPlayers, whether the
> state persists, and who runs the physics simulation."

---

### 4:30 — Networked vs Synced (120s)

Two traits, different use cases:

```hsplus
// @synced — automatic property sync
orb "ColorCube" {
  color: "purple"
  @synced { properties: ["color"] }

  logic "toggle" {
    on_click: () => {
      this.color = this.color === "purple" ? "orange" : "purple"
    }
  }
}

// @networked — full custom control
orb "SpawnPoint" {
  @networked {
    channel: "players"
    onJoin: (playerId) => {
      spawn("Avatar", { owner: playerId, position: this.position })
    }
    onLeave: (playerId) => {
      despawn("Avatar", { owner: playerId })
    }
  }
}
```

> "@synced is declarative — you list which properties to sync.
> @networked gives you callbacks for full control over network events."

---

### 6:30 — Avatars (180s)

```hsplus
template "Avatar" {
  scale: 0.3
  @physics { mass: 70  isKinematic: true }
  @collidable
}

orb "LocalPlayer" {
  ...Avatar
  color: "blue"
  position: [0, 1, 0]

  @networked {
    channel: "avatars"
    isLocalPlayer: true
    syncTransform: true
    rate: 30
  }
}

orb "HandLeft" {
  scale: 0.1
  parent: "LocalPlayer"
  @networked {
    channel: "hands"
    syncTransform: true
    rate: 60          // Higher rate for hand tracking
  }
}

orb "HandRight" {
  scale: 0.1
  parent: "LocalPlayer"
  @networked {
    channel: "hands"
    syncTransform: true
    rate: 60
  }
}
```

> "Hand tracking at 60Hz ensures smooth avatar representation.
> The parent-child relationship keeps hands relative to the body."

---

### 9:30 — Shared State with Events (120s)

```hsplus
orb "Scoreboard" {
  @synced {
    properties: ["scores"]
    authority: "host"
  }

  scores: { player1: 0  player2: 0 }

  logic "scoring" {
    on_score: (playerId, points) => {
      this.scores[playerId] += points
      // Automatically synced to all clients
    }
  }
}

orb "ScoreZone" {
  scale: [2, 2, 0.1]
  position: [0, 1, -5]
  opacity: 0.2
  color: "green"

  @collidable
  logic "detect" {
    on_collision: (other) => {
      if (other.hasTag("ball")) {
        Scoreboard.scoring.on_score(currentPlayer(), 1)
      }
    }
  }
}
```

---

### 12:00 — Testing Multiplayer Locally (90s)

```bash
holoscript dev --players=2
```

> "The dev server opens two browser windows side by side —
> one per simulated player. Changes in one immediately reflect in the other."

**[SCREEN: two browser windows, moving a ball in one appears in the other]**

For production deployment:

```bash
holoscript build --target=webxr src/scene.hsplus
holoscript deploy --platform=vercel
```

---

### 14:00 — Common Pitfalls (60s)

1. **Syncing too many properties** — sync only what changes, not everything

   ```hsplus
   // Bad: syncs all properties every frame
   @synced { properties: ["*"] rate: 60 }

   // Good: sync only position and color
   @synced { properties: ["position", "color"] rate: 20 }
   ```

2. **Forgetting authority** — without authority, all clients fight each other
3. **Physics conflicts** — use `physics: "server"` in @manifest for physics-heavy scenes

---

### 14:30 — Recap (30s)

> "Multiplayer in 4 steps:
> ✓ Add @manifest with maxPlayers
> ✓ Add @synced with the properties to sync
> ✓ Use @networked for avatar and event logic
> ✓ Test with holoscript dev --players=N"

Next: **Video 5 — Accessibility**

---

## Production Notes

- **Duration target:** 14:30–16:00
- **Thumbnail:** Two avatars facing each other with a glowing synced object between them
- **Key demo:** Side-by-side browser windows showing real-time sync (record locally with the dev server)
- **Technical note:** Record audio separately for both "players" in post to illustrate spatial audio
