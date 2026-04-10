# Procedural Generation

Welcome to Lesson 3.4! In this advanced lesson, you'll learn how to generate VR worlds, objects, and content procedurally using HoloScript.

## Why Procedural Generation?

Procedural generation allows you to:

- Create infinite unique content
- Reduce asset creation time
- Enable emergent gameplay
- Adapt content to player actions

## Random Number Generation

### Seeded Randomness

Use seeds for reproducible results:

```hs
// Create deterministic random generator
const rng = random.create({ seed: 12345 })

console.log(rng.float())      // Always same sequence
console.log(rng.int(0, 100))  // Reproducible

// World seed for consistent generation
const worldSeed = "my-world-42"
const worldRng = random.create({ seed: worldSeed })
```

### Random Utilities

```hs
// Random float [0, 1)
random.float()

// Random integer [min, max]
random.int(1, 10)

// Random from array
random.pick(["red", "green", "blue"])

// Weighted random
random.weighted([
  { value: "common", weight: 70 },
  { value: "rare", weight: 25 },
  { value: "legendary", weight: 5 }
])

// Random point in sphere
random.insideSphere(radius)

// Random on sphere surface
random.onSphere(radius)
```

## Noise Functions

### Perlin Noise

```hs
const noise = new PerlinNoise({ seed: 42 })

// 1D noise
const value1d = noise.noise1D(x)

// 2D noise (terrain heightmaps)
const value2d = noise.noise2D(x, z)

// 3D noise (caves, clouds)
const value3d = noise.noise3D(x, y, z)
```

### Fractal Noise (FBM)

```hs
const fbm = new FractalNoise({
  seed: 42,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0
})

const height = fbm.noise2D(x, z)
```

## Terrain Generation

### Height-based Terrain

```hs
function generateTerrain(width, depth, resolution) {
  const noise = new FractalNoise({ seed: worldSeed })
  const vertices = []

  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const nz = z / depth

      // Multi-layered noise for natural terrain
      const height =
        noise.noise2D(nx * 2, nz * 2) * 20 +       // Hills
        noise.noise2D(nx * 8, nz * 8) * 5 +        // Details
        noise.noise2D(nx * 32, nz * 32) * 1        // Micro details

      vertices.push([
        x * resolution,
        height,
        z * resolution
      ])
    }
  }

  return createMesh(vertices, width, depth)
}

composition terrain {
  geometry: generateTerrain(100, 100, 1)
  material: {
    map: "textures/terrain_diffuse.jpg"
    normalMap: "textures/terrain_normal.jpg"
  }
}
```

### Biome Distribution

```hs
const biomes = {
  ocean: { minHeight: -10, maxHeight: 0, color: "#0066aa" },
  beach: { minHeight: 0, maxHeight: 2, color: "#ffdd88" },
  grass: { minHeight: 2, maxHeight: 20, color: "#44aa44" },
  mountain: { minHeight: 20, maxHeight: 50, color: "#888888" },
  snow: { minHeight: 50, maxHeight: 100, color: "#ffffff" }
}

function getBiome(height, moisture) {
  // Temperature decreases with height
  const temperature = 1 - (height / 100)

  if (height < 0) return biomes.ocean
  if (height < 2) return biomes.beach
  if (temperature > 0.6) return biomes.grass
  if (temperature > 0.3) return biomes.mountain
  return biomes.snow
}
```

## Dungeon Generation

### Room-Based Generation

```hs
class DungeonGenerator {
  constructor(seed) {
    this.rng = random.create({ seed })
    this.rooms = []
    this.corridors = []
  }

  generate(config) {
    const { width, height, roomCount, minRoomSize, maxRoomSize } = config

    // Generate rooms
    for (let i = 0; i < roomCount; i++) {
      const room = this.generateRoom(width, height, minRoomSize, maxRoomSize)
      if (room && !this.overlapsExisting(room)) {
        this.rooms.push(room)
      }
    }

    // Connect rooms with corridors
    this.connectRooms()

    return { rooms: this.rooms, corridors: this.corridors }
  }

  generateRoom(mapWidth, mapHeight, minSize, maxSize) {
    const w = this.rng.int(minSize, maxSize)
    const h = this.rng.int(minSize, maxSize)
    const x = this.rng.int(1, mapWidth - w - 1)
    const y = this.rng.int(1, mapHeight - h - 1)

    return { x, y, width: w, height: h, center: [x + w/2, y + h/2] }
  }

  connectRooms() {
    // Minimum spanning tree for room connections
    const connected = [this.rooms[0]]
    const unconnected = this.rooms.slice(1)

    while (unconnected.length > 0) {
      let minDist = Infinity
      let closestPair = null

      for (const roomA of connected) {
        for (const roomB of unconnected) {
          const dist = this.distance(roomA.center, roomB.center)
          if (dist < minDist) {
            minDist = dist
            closestPair = [roomA, roomB]
          }
        }
      }

      if (closestPair) {
        this.corridors.push(this.createCorridor(closestPair[0], closestPair[1]))
        connected.push(closestPair[1])
        unconnected.splice(unconnected.indexOf(closestPair[1]), 1)
      }
    }
  }
}

// Generate and spawn dungeon
const dungeon = new DungeonGenerator(worldSeed).generate({
  width: 50,
  height: 50,
  roomCount: 10,
  minRoomSize: 4,
  maxRoomSize: 10
})

dungeon.rooms.forEach((room, i) => {
  spawn(Room, {
    name: `room_${i}`,
    position: [room.x, 0, room.y],
    scale: [room.width, 3, room.height]
  })
})
```

## Wave Function Collapse

Advanced procedural generation using constraints:

```hs
class WFCGenerator {
  constructor(tiles, adjacencyRules) {
    this.tiles = tiles
    this.rules = adjacencyRules
  }

  generate(width, height) {
    // Initialize grid with all possibilities
    const grid = new Array(width * height).fill(null).map(() =>
      new Set(this.tiles.map(t => t.id))
    )

    while (!this.isCollapsed(grid)) {
      // Find cell with lowest entropy
      const cell = this.findLowestEntropy(grid)

      // Collapse to single tile
      this.collapse(grid, cell)

      // Propagate constraints
      this.propagate(grid, cell)
    }

    return grid.map(cell => [...cell][0])
  }

  findLowestEntropy(grid) {
    let minEntropy = Infinity
    let candidates = []

    grid.forEach((possibilities, index) => {
      if (possibilities.size > 1) {
        if (possibilities.size < minEntropy) {
          minEntropy = possibilities.size
          candidates = [index]
        } else if (possibilities.size === minEntropy) {
          candidates.push(index)
        }
      }
    })

    return random.pick(candidates)
  }
}
```

## Object Scattering

### Natural Object Placement

```hs
function scatterObjects(template, config) {
  const {
    count,
    bounds,
    minSpacing,
    heightMap,
    slopeLimit,
    alignToNormal
  } = config

  const placed = []
  const attempts = count * 10  // Allow some failures

  for (let i = 0; i < attempts && placed.length < count; i++) {
    const x = random.float(bounds.min.x, bounds.max.x)
    const z = random.float(bounds.min.z, bounds.max.z)
    const y = heightMap.getHeight(x, z)
    const normal = heightMap.getNormal(x, z)
    const slope = Math.acos(normal.y) * (180 / Math.PI)

    // Check slope
    if (slope > slopeLimit) continue

    // Check minimum spacing
    const tooClose = placed.some(p =>
      Math.hypot(p.x - x, p.z - z) < minSpacing
    )
    if (tooClose) continue

    // Place object
    const rotation = alignToNormal
      ? calculateAlignmentRotation(normal)
      : [0, random.float(0, 360), 0]

    spawn(template, {
      position: [x, y, z],
      rotation,
      scale: random.float(0.8, 1.2)
    })

    placed.push({ x, z })
  }

  return placed
}

// Scatter trees
scatterObjects(TreeTemplate, {
  count: 100,
  bounds: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
  minSpacing: 3,
  heightMap: terrain,
  slopeLimit: 30,
  alignToNormal: false
})
```

### Poisson Disk Sampling

More natural distribution than pure random:

```hs
function poissonDiskSampling(width, height, minDistance, maxAttempts = 30) {
  const cellSize = minDistance / Math.sqrt(2)
  const gridWidth = Math.ceil(width / cellSize)
  const gridHeight = Math.ceil(height / cellSize)
  const grid = new Array(gridWidth * gridHeight).fill(null)

  const points = []
  const active = []

  // Start with random point
  const initial = [random.float(0, width), random.float(0, height)]
  points.push(initial)
  active.push(initial)

  while (active.length > 0) {
    const idx = random.int(0, active.length - 1)
    const point = active[idx]
    let found = false

    for (let i = 0; i < maxAttempts; i++) {
      const angle = random.float(0, Math.PI * 2)
      const distance = random.float(minDistance, minDistance * 2)
      const candidate = [
        point[0] + Math.cos(angle) * distance,
        point[1] + Math.sin(angle) * distance
      ]

      if (isValid(candidate, grid, points, minDistance, width, height)) {
        points.push(candidate)
        active.push(candidate)
        addToGrid(candidate, grid, cellSize, gridWidth)
        found = true
        break
      }
    }

    if (!found) {
      active.splice(idx, 1)
    }
  }

  return points
}
```

## Level of Detail (LOD)

```hs
function generateWithLOD(position, playerPosition) {
  const distance = position.distanceTo(playerPosition)

  if (distance < 50) {
    // Full detail
    return spawn(DetailedTree, { position })
  } else if (distance < 200) {
    // Medium detail
    return spawn(MediumTree, { position })
  } else if (distance < 500) {
    // Low detail billboard
    return spawn(TreeBillboard, { position })
  } else {
    // Too far, don't spawn
    return null
  }
}

// Update LOD as player moves
onPlayerMove(newPosition => {
  worldChunks.forEach(chunk => {
    chunk.updateLOD(newPosition)
  })
})
```

## Infinite World Chunks

```hs
class ChunkManager {
  constructor(chunkSize, viewDistance) {
    this.chunkSize = chunkSize
    this.viewDistance = viewDistance
    this.loadedChunks = new Map()
  }

  update(playerPosition) {
    const playerChunk = this.getChunkCoord(playerPosition)

    // Load new chunks
    for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
      for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
        const coord = [playerChunk[0] + dx, playerChunk[1] + dz]
        const key = `${coord[0]},${coord[1]}`

        if (!this.loadedChunks.has(key)) {
          this.loadChunk(coord)
        }
      }
    }

    // Unload distant chunks
    for (const [key, chunk] of this.loadedChunks) {
      const coord = key.split(',').map(Number)
      const dist = Math.max(
        Math.abs(coord[0] - playerChunk[0]),
        Math.abs(coord[1] - playerChunk[1])
      )

      if (dist > this.viewDistance + 1) {
        this.unloadChunk(key)
      }
    }
  }

  loadChunk(coord) {
    const seed = `${worldSeed}_${coord[0]}_${coord[1]}`
    const chunk = new Chunk(coord, this.chunkSize, seed)
    chunk.generate()
    this.loadedChunks.set(`${coord[0]},${coord[1]}`, chunk)
  }
}
```

## Quiz

1. Why use seeded random number generators?
2. What is Perlin noise used for?
3. How does Wave Function Collapse work?
4. What's the advantage of Poisson disk sampling?
5. How do you handle infinite worlds?

<details>
<summary>Answers</summary>

1. For reproducible procedural generation - same seed produces same world
2. Creating smooth, natural-looking variations (terrain, clouds, textures)
3. Collapses possibilities based on adjacency constraints, propagating changes
4. More natural distribution than pure random - guaranteed minimum spacing
5. Chunk-based loading/unloading based on player position

</details>

---

**Estimated time:** 50 minutes  
**Difficulty:** ⭐⭐⭐ Advanced  
**Next:** [Lesson 3.5 - Agent Choreography](./05-agent-choreography.md)
