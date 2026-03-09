# HoloScript Native Assets

3D models built entirely from HoloScript geometric primitives — no external files needed.
The `.holo` file IS the asset.

## Asset Library

| Asset              | File                                         | Primitives | Techniques                                                        |
| ------------------ | -------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| 🤖 Robot           | [robot.holo](robot.holo)                     | ~35        | Joints, emissive eyes, reactor core, template reuse               |
| 🚀 Starfighter     | [starfighter.holo](starfighter.holo)         | ~30        | Swept wings, thrust glow, transparent cockpit, nav lights         |
| 🏰 Medieval Castle | [medieval-castle.holo](medieval-castle.holo) | ~35        | Walls, towers, conical roofs, gatehouse, lit windows, battlements |
| 🌲 Pine Tree       | [pine-tree.holo](pine-tree.holo)             | ~15        | Layered cones, trunk roots, semi-transparent snow caps            |
| 🏮 Street Lamp     | [street-lamp.holo](street-lamp.holo)         | ~25        | Torus rings, glass panes, emissive bulb, volumetric halo          |
| 🛸 Space Station   | [space-station.holo](space-station.holo)     | ~25        | Habitat torus, radial spokes, solar panels, docking bay           |

## How It Works

Objects can nest inside objects. The parser serializes children as JSON
(`children_json` in WIT), and the R3F compiler renders them as a recursive
scene tree.

```holo
object "Robot" @physics {
  geometry: "cube"
  object "Head" {
    geometry: "sphere"
    position: [0, 1.5, 0]
    object "Eye" {
      geometry: "sphere"
      position: [0.1, 0.1, 0.4]
      scale: [0.08, 0.08, 0.04]
      material: { emissive: "#00ffff", emissiveIntensity: 2.0 }
    }
  }
}
```

## Geometry Types

| Type       | Shape     | Best For                     |
| ---------- | --------- | ---------------------------- |
| `cube`     | Box       | Buildings, plates, panels    |
| `sphere`   | Ball      | Heads, eyes, orbs, planets   |
| `cylinder` | Tube      | Poles, arms, trunks, barrels |
| `cone`     | Pointed   | Roofs, trees, noses, thrust  |
| `torus`    | Ring      | Rings, halos, orbits         |
| `capsule`  | Pill      | Bodies, limbs                |
| `plane`    | Flat      | Floors, walls, screens       |
| `ring`     | Flat ring | Halos, UI elements           |

## Tips

- **Emissive materials** create glow effects without point lights
- **Low opacity** creates glass, haze, and volumetric effects
- **Template reuse** (`using "JointBall"`) reduces repetition for repeated parts
- **Deep nesting** creates local coordinate spaces — child positions are relative to parent
