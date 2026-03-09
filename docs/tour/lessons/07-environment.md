# Lesson 7: Environment

Set up the world around your objects — lighting, sky, and fog.

## Concept: Lighting, skybox

```holoscript
environment "DaytimeForest" {
  skybox: "forest_day.hdr"
  ambientColor: "#b0c4d8"
  ambientIntensity: 0.6
  fog: { color: "#c8d8e8", near: 20, far: 80 }

  sun {
    direction: [0.3, -1, 0.5]
    color: "#fff5e0"
    intensity: 1.2
    castShadow: true
  }
}
```

### Environment properties

| Property           | Type   | Description              |
| ------------------ | ------ | ------------------------ |
| `skybox`           | string | HDR panorama path or URL |
| `ambientColor`     | color  | Global fill light color  |
| `ambientIntensity` | number | Fill light brightness    |
| `fog`              | object | Atmospheric depth cueing |

## Try it:

```holoscript
environment "Night" {
  skybox: "starry_night.hdr"
  ambientColor: "#0a0a2e"
  ambientIntensity: 0.2

  sun {
    direction: [0, -1, 0]
    color: "#ffffff"
    intensity: 0.1
  }
}
```

## Your turn:

Add a `fog` block to the Night environment that starts at `10m` and fully obscures at `50m`.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 8 – Networking](./08-networking.md)
