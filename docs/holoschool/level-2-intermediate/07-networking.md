# Networking Basics

Welcome to Lesson 2.7! In this lesson, you'll learn how to create multiplayer VR experiences with HoloScript's networking system.

## Networking Overview

HoloScript provides built-in networking for multiplayer experiences:

- **Automatic state sync** - Objects sync position, rotation, and properties
- **Ownership model** - Control who can modify objects
- **Room-based** - Players join shared rooms
- **Low latency** - Optimized for VR

## Basic Multiplayer Setup

### Enable Networking

```holo
composition "Multiplayer Room" {

  // Configure networking
  network {
    maxPlayers: 8
    tickRate: 30        // Updates per second
    mode: "peer-to-peer" // or "dedicated"
  }

  // Networked objects are synced automatically
  composition sharedBall {
    @networked
    @grabbable
    @physics

    geometry: "sphere"
    position: [0, 1, 0]
  }
}
```

### The @networked Trait

Make any object sync across clients:

```hs
composition syncedCube {
  @networked  // Position, rotation, scale sync automatically
  @grabbable

  geometry: "cube"
  color: "#ff0000"
}
```

### Sync Specific Properties

Choose what to sync:

```hs
composition player {
  @networked {
    sync: ["position", "rotation", "health", "score"]
    rate: 20  // Updates per second
  }

  health: 100
  score: 0

  geometry: "capsule"
}
```

## Network Ownership

### Automatic Ownership

```hs
composition grabbableItem {
  @networked
  @grabbable

  // Ownership transfers automatically when grabbed
  onGrab: {
    // Now this client controls the object
    console.log("I own this object!")
  }
}
```

### Request Ownership

```hs
composition sharedResource {
  @networked { ownership: "request" }

  onClick: {
    if (!network.isOwner(this)) {
      network.requestOwnership(this)
    }
  }

  onOwnershipGranted: {
    this.color = "#00ff00"
    console.log("Ownership granted!")
  }

  onOwnershipDenied: {
    console.log("Ownership denied")
  }
}
```

### Host-Only Objects

```hs
composition gameManager {
  @networked
  @host_only  // Only host can modify

  gameState: "waiting"

  function startGame(): {
    if (network.isHost) {
      this.gameState = "playing"
    }
  }
}
```

## Player Management

### Player Spawning

```hs
template PlayerAvatar {
  params {
    playerId: string
    playerName: string
  }

  @networked { owner: params.playerId }

  geometry: "capsule"
  scale: [0.3, 0.9, 0.3]

  composition nameTag {
    @billboard
    text: params.playerName
    position: [0, 1.2, 0]
  }

  composition leftHand {
    @networked
    geometry: "sphere"
    scale: 0.1
  }

  composition rightHand {
    @networked
    geometry: "sphere"
    scale: 0.1
  }
}

// In scene
network.onPlayerJoined(player => {
  spawn(PlayerAvatar, {
    playerId: player.id,
    playerName: player.name,
    position: [0, 0, 0]
  })
})

network.onPlayerLeft(player => {
  const avatar = scene.find(`player_${player.id}`)
  avatar?.destroy()
})
```

### Player List

```hs
composition playerList {
  @networked

  onUpdate: {
    const players = network.getPlayers()
    console.log(`${players.length} players connected`)

    players.forEach(p => {
      console.log(`- ${p.name} (${p.id})`)
    })
  }
}
```

## Room Management

### Creating and Joining Rooms

```hs
// Create a room
async function createRoom(): {
  const room = await network.createRoom({
    name: "My Game Room",
    maxPlayers: 4,
    isPrivate: false
  })

  console.log("Room created:", room.code)
}

// Join a room
async function joinRoom(code): {
  try {
    await network.joinRoom(code)
    console.log("Joined room!")
  } catch (error) {
    console.log("Failed to join:", error.message)
  }
}

// List public rooms
async function listRooms(): {
  const rooms = await network.listRooms()
  rooms.forEach(room => {
    console.log(`${room.name}: ${room.playerCount}/${room.maxPlayers}`)
  })
}
```

### Room Events

```hs
network.onRoomJoined(room => {
  console.log("Joined:", room.name)
  ui.showLobby()
})

network.onRoomLeft(reason => {
  console.log("Left room:", reason)
  scene.load("menu")
})

network.onRoomFull(() => {
  console.log("Room is full!")
})
```

## Remote Procedure Calls (RPCs)

### Define RPCs

```hs
composition gameController {
  @networked

  // RPC that runs on all clients
  @rpc("all")
  function announceScore(playerName, score): {
    ui.showMessage(`${playerName} scored ${score} points!`)
    audio.play("score.mp3")
  }

  // RPC that runs only on host
  @rpc("host")
  function requestSpawn(position): {
    spawn(Enemy, { position })
  }

  // RPC that runs on specific player
  @rpc("target")
  function sendDamage(targetId, amount): {
    const target = scene.find(`player_${targetId}`)
    target?.takeDamage(amount)
  }
}
```

### Call RPCs

```hs
composition trigger {
  @clickable

  onClick: {
    // Call on all clients
    gameController.rpc.announceScore(player.name, 100)

    // Call on host only
    gameController.rpc.requestSpawn([0, 0, 5])

    // Call on specific player
    gameController.rpc.sendDamage("player123", 25)
  }
}
```

## State Synchronization

### Snapshot Interpolation

```hs
composition smoothObject {
  @networked {
    interpolation: true
    interpolationDelay: 100  // ms
  }

  // Position updates are smoothly interpolated
}
```

### Prediction

```hs
composition playerBall {
  @networked {
    prediction: true
    reconciliation: true  // Correct mispredictions
  }
  @physics

  // Client predicts movement, server authoritative
}
```

## Combat Example

```holo
composition "Combat Arena" {

  network {
    maxPlayers: 8
    mode: "dedicated"
    tickRate: 60
  }

  template Projectile {
    @networked { owner: "shooter" }
    @physics { mass: 0.1 }

    geometry: "sphere"
    scale: 0.1
    color: "#ffff00"
    damage: 10
    lifetime: 3

    onCreate: {
      setTimeout(() => this.destroy(), this.lifetime * 1000)
    }

    onCollision(event): {
      if (event.other.tag === "player") {
        // Only owner processes hits
        if (network.isOwner(this)) {
          event.other.rpc.takeDamage(this.damage)
        }
        this.destroy()
      }
    }
  }

  template Player {
    @networked { sync: ["position", "rotation", "health"] }
    @collidable

    tag: "player"
    health: 100

    geometry: "capsule"

    @rpc("owner")
    function takeDamage(amount): {
      this.health -= amount
      haptic.feedback("strong")

      if (this.health <= 0) {
        this.respawn()
      }
    }

    function shoot(): {
      if (network.isOwner(this)) {
        const proj = spawn(Projectile, {
          position: this.position.add(this.forward),
          velocity: this.forward.multiply(20),
          shooter: network.localPlayerId
        })
      }
    }

    function respawn(): {
      this.health = 100
      this.position = getSpawnPoint()
    }
  }

  // Spawn players
  network.onPlayerJoined(player => {
    spawn(Player, {
      name: `player_${player.id}`,
      owner: player.id,
      position: getSpawnPoint()
    })
  })
}
```

## Best Practices

### 1. Minimize Network Traffic

```hs
// Bad - syncing unnecessary data
@networked { sync: ["*"] }

// Good - sync only what's needed
@networked { sync: ["position", "health"] }
```

### 2. Use Authority Properly

```hs
// Client predicts, server validates
composition ball {
  @networked {
    authority: "host"
    prediction: true
  }
}
```

### 3. Handle Disconnections

```hs
network.onDisconnected(reason => {
  ui.showMessage("Disconnected: " + reason)
  scene.load("reconnect")
})

network.onReconnected(() => {
  ui.showMessage("Reconnected!")
})
```

## Quiz

1. What trait makes an object sync across clients?
2. How do you call a function on all clients?
3. What's the difference between host and peer-to-peer mode?
4. How do you transfer ownership of an object?
5. What's interpolation used for?

<details>
<summary>Answers</summary>

1. `@networked`
2. Use `@rpc("all")` decorator and call via `.rpc.functionName()`
3. Host mode has a single authority; peer-to-peer distributes ownership
4. Grab the object (automatic) or use `network.requestOwnership()`
5. Smoothing movement between network updates to reduce jitter

</details>

---

**Estimated time:** 45 minutes  
**Difficulty:** ⭐⭐ Intermediate  
**Next:** [Lesson 2.8 - State Machines](./08-state-machines.md)
