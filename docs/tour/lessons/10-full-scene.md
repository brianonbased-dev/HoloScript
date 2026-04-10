# Lesson 10: Full Scene

Put everything together — build a complete, multiplayer, accessible VR gallery.

## Your full scene:

```holoscript
@manifest {
  title: "HoloScript Gallery"
  version: "1.0.0"
  author: "You!"
  maxPlayers: 4
}

@zones {
  lobby:  { bounds: [[-5, 0, -5],  [5,  4, 5]]  }
  gallery:{ bounds: [[-10, 0, -20],[10, 4, 5]]  }
}

environment "Gallery" {
  skybox: "gallery_lighting.hdr"
  ambientColor: "#f5f0ea"
  ambientIntensity: 0.8
  sun { direction: [0.2, -1, 0.4]  intensity: 0.6  castShadow: true }
}

template "Artwork" {
  scale: [0.8, 1.0, 0.05]
  @accessible { role: "artwork" }
  @synced { properties: ["color"] authority: "server" }
}

orb "PaintingA" {
  ...Artwork
  color: "#e63946"
  position: [-4, 1.5, -9]
  @alt_text { description: "Abstract red composition, bold brushstrokes" }
}

orb "PaintingB" {
  ...Artwork
  color: "#2a9d8f"
  position: [4, 1.5, -9]
  @alt_text { description: "Serene teal seascape at dusk" }
}

orb "Ball" {
  color: "gold"
  scale: 0.25
  position: [0, 1, 0]
  @physics { mass: 0.3  restitution: 0.9 }
  @grabbable
  @synced { properties: ["position", "rotation"] authority: "owner" }
}
```

## What you've learned:

1. ✅ `orb` — create 3D objects
2. ✅ Properties — position, scale, color
3. ✅ Traits — `@grabbable`, `@physics`, `@synced`
4. ✅ Templates — reusable blueprints with `...spread`
5. ✅ Logic blocks — `on_click`, `on_tick`
6. ✅ Directives — `@manifest`, `@zones`
7. ✅ Environment — lighting, skybox, fog
8. ✅ Networking — `@synced`, `@networked`
9. ✅ Accessibility — `@accessible`, `@alt_text`
10. ✅ Full scene — combining everything

## 🎉 You've completed the HoloScript Language Tour!

Your completion badge has been saved. Share your scene via the playground URL!

[Export Scene] [Share URL] [View Certificate]
