export const SAMPLE_A = `composition "Dragon Lair" {
  object "Dragon" {
    @grabbable
    @animated

    geometry: "mesh"
    position: [0, 2, -5]
    scale: 1.5
    color: "#ff4400"
  }

  object "TreasureChest" {
    @interactive

    geometry: "box"
    position: [3, 0, -4]
    scale: 0.8
    color: "#ffd700"
  }
}`;

export const SAMPLE_B = `composition "Dragon Lair" {
  object "Dragon" {
    @grabbable
    @animated
    @glowing

    geometry: "mesh"
    position: [0, 3, -5]
    scale: 2.0
    color: "#ff6600"
    emissive: "#ff2200"
  }

  object "TreasureChest" {
    @interactive

    geometry: "box"
    position: [3, 0, -4]
    scale: 0.8
    color: "#ffd700"
  }

  object "FirePit" {
    @particles
    @glowing

    geometry: "cylinder"
    position: [-2, 0, -3]
    scale: 0.5
    color: "#ff3300"
  }
}`;
