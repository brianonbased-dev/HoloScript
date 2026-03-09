# Week 7: Water Erosion Simulation - Implementation Plan

**Goal:** Create a realistic water erosion simulation with sediment transport, terrain modification, and hydraulic erosion effects.

**Timeline:** 5-7 days
**Target:** 2,000+ implementation lines, 1,800+ test lines, 100+ tests

---

## 🎯 Objectives

1. **Water Flow Simulation** - Height-field based water simulation with flow calculation
2. **Sediment Transport** - Erosion, transport, and deposition of terrain material
3. **Terrain Modification** - Real-time heightmap updates from erosion/deposition
4. **Hydraulic Erosion** - Realistic erosion patterns (rills, gullies, river valleys)
5. **Interactive Demo** - Visualize water flow and terrain changes in real-time

---

## 📐 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ErosionDemoScene                         │
│  (Interactive demo with water source controls)              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   ErosionSimulation                         │
│  (CPU-GPU integration, performance monitoring)              │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌──────────────────────┐      ┌──────────────────────┐
│   WaterFlowSolver    │      │  SedimentTransport   │
│ (Height-field water) │      │ (Erosion/Deposition) │
└──────────────────────┘      └──────────────────────┘
           │                               │
           └───────────────┬───────────────┘
                           ▼
                ┌──────────────────────┐
                │  TerrainModifier     │
                │ (Heightmap updates)  │
                └──────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  HeightmapTerrain    │
                │ (Editable terrain)   │
                └──────────────────────┘
```

---

## 📅 Day-by-Day Plan

### Day 1: HeightmapTerrain (Foundation)

**File:** `HeightmapTerrain.ts` (500 lines)
**Tests:** `HeightmapTerrain.test.ts` (450 lines, 35 tests)

**Features:**

- Editable heightmap terrain
- Height query and modification
- Slope and normal calculation
- Bilinear interpolation
- Mesh regeneration after edits
- Undo/redo for terrain modifications

**Key Methods:**

```typescript
class HeightmapTerrain {
  getHeightAt(x: z): number;
  setHeightAt(x, z, height): void;
  modifyHeight(x, z, delta): void;
  getSlopeAt(x, z): number;
  getNormalAt(x, z): [number, number, number];
  regenerateMesh(): void;
  saveSnapshot(): void;
  restoreSnapshot(id): void;
}
```

### Day 2: WaterFlowSolver (Hydraulic Simulation)

**File:** `WaterFlowSolver.ts` (600 lines)
**Tests:** `WaterFlowSolver.test.ts` (550 lines, 40 tests)

**Features:**

- Height-field water simulation (shallow water equations)
- Water flow calculation (gradient-based)
- Water velocity and volume tracking
- Rain simulation (water sources)
- Evaporation
- Water pooling (local minima detection)

**Physics:**

- **Shallow Water Equations** (simplified):

  ```
  ∂h/∂t + ∇·(hv) = S  (continuity)
  ∂v/∂t + v·∇v = -g∇(z+h) - kv  (momentum)

  Where:
  h = water height
  v = water velocity
  z = terrain height
  g = gravity
  k = friction coefficient
  S = sources (rain)
  ```

- **Flow Calculation:**
  ```typescript
  flowDirection = -gradient(terrainHeight + waterHeight);
  flowVelocity = sqrt(2 * g * heightDifference);
  flowRate = waterHeight * flowVelocity * cellArea;
  ```

**Test Coverage:**

- Initialization
- Water addition/removal
- Flow calculation (downhill, uphill, flat)
- Velocity tracking
- Water pooling
- Evaporation
- Rain simulation
- Conservation of mass
- Edge cases (dry cells, overflow)

### Day 3: SedimentTransport (Erosion/Deposition)

**File:** `SedimentTransport.ts` (650 lines)
**Tests:** `SedimentTransport.test.ts` (600 lines, 42 tests)

**Features:**

- Sediment erosion from terrain
- Sediment transport by water flow
- Sediment deposition
- Sediment capacity calculation (based on water velocity)
- Thermal erosion (slope-based)
- Hydraulic erosion (water-based)

**Erosion Model:**

- **Hydraulic Erosion:**

  ```typescript
  sedimentCapacity = Kc * waterVelocity * waterVolume;
  erosion = Ks * (sedimentCapacity - currentSediment);

  if (erosion > 0) {
    // Erode terrain
    terrain.modifyHeight(x, z, -erosion);
    sediment += erosion;
  } else {
    // Deposit sediment
    deposition = min(-erosion * Kd, sediment);
    terrain.modifyHeight(x, z, deposition);
    sediment -= deposition;
  }
  ```

- **Thermal Erosion:**
  ```typescript
  if (slope > angleOfRepose) {
    erosionAmount = (slope - angleOfRepose) * thermalRate;
    // Redistribute to lower neighbors
  }
  ```

**Test Coverage:**

- Sediment capacity calculation
- Erosion from terrain
- Sediment transport
- Deposition
- Thermal erosion
- Hydraulic erosion
- Material hardness variation
- Statistics tracking

### Day 4: TerrainModifier & ErosionSimulation (Integration)

**File:** `TerrainModifier.ts` (400 lines) + `ErosionSimulation.ts` (450 lines)
**Tests:** `TerrainModifier.test.ts` (350 lines, 30 tests) + `ErosionSimulation.test.ts` (500 lines, 38 tests)

**TerrainModifier Features:**

- Apply erosion/deposition to heightmap
- Smooth terrain modifications
- Constraint enforcement (min/max height)
- Change tracking and visualization
- Erosion heatmap generation

**ErosionSimulation Features:**

- CPU-GPU integration layer
- Performance monitoring
- Simulation state management
- Multi-step update (water → erosion → deposition)
- Profiling and statistics

**Integration:**

```typescript
class ErosionSimulation {
  update(dt: number) {
    // 1. Water flow
    waterFlowSolver.update(dt);

    // 2. Sediment transport
    sedimentTransport.update(dt, waterFlowSolver.getWaterData());

    // 3. Terrain modification
    terrainModifier.applyChanges(sedimentTransport.getErosionMap());

    // 4. Update mesh
    terrain.regenerateMesh();
  }
}
```

### Day 5: ErosionDemoScene (Interactive Demo)

**File:** `ErosionDemoScene.ts` (550 lines)
**Tests:** `ErosionDemoScene.test.ts` (400 lines, 38 tests)

**Features:**

- Interactive water source placement (click to add rain)
- Erosion visualization (color-coded terrain changes)
- Water depth overlay
- Flow velocity vectors
- Time controls (play/pause/speed)
- Erosion statistics display
- Camera controls (same as avalanche demo)

**Visualization Modes:**

- **Terrain only** - Standard terrain rendering
- **Water overlay** - Blue tint for water depth
- **Erosion heatmap** - Red = erosion, Blue = deposition
- **Flow vectors** - Arrow field showing water flow direction

---

## 🧪 Testing Strategy

### Test Distribution Target

- **HeightmapTerrain:** 35 tests
- **WaterFlowSolver:** 40 tests
- **SedimentTransport:** 42 tests
- **TerrainModifier:** 30 tests
- **ErosionSimulation:** 38 tests
- **ErosionDemoScene:** 38 tests

**Total:** 223 tests

### Test Categories

1. **Unit Tests** - Individual component functionality
2. **Physics Tests** - Conservation laws (mass, energy)
3. **Integration Tests** - Component interaction
4. **Visual Tests** - Erosion pattern verification
5. **Performance Tests** - FPS, memory, scalability

---

## 🎯 Performance Targets

- **Terrain Size:** 128×128 heightmap (16,384 cells)
- **Update Rate:** 60 FPS
- **Water Cells:** Up to 10,000 active
- **Memory:** < 50 MB
- **Terrain Updates:** < 10ms per frame

---

## 📊 Key Algorithms

### 1. Water Flow (Downhill Simplex)

```typescript
function calculateFlow(cellX, cellZ) {
  const currentHeight = terrain.height[cellX][cellZ] + water.height[cellX][cellZ];

  // Check all 8 neighbors
  const neighbors = getNeighbors(cellX, cellZ);
  let totalFlow = 0;

  for (const neighbor of neighbors) {
    const neighborHeight =
      terrain.height[neighbor.x][neighbor.z] + water.height[neighbor.x][neighbor.z];

    if (neighborHeight < currentHeight) {
      const heightDiff = currentHeight - neighborHeight;
      const flow = calculateFlowRate(heightDiff, water.height[cellX][cellZ]);
      totalFlow += flow;

      // Transfer water
      water.transfer(cellX, cellZ, neighbor.x, neighbor.z, flow * dt);
    }
  }
}
```

### 2. Sediment Capacity

```typescript
function calculateSedimentCapacity(waterVelocity, waterVolume, slope) {
  const baseCapacity = Kc * waterVelocity * waterVolume;
  const slopeBonus = 1 + slope * Ks;
  return baseCapacity * slopeBonus;
}
```

### 3. Erosion/Deposition

```typescript
function updateSediment(cellX, cellZ, waterVelocity) {
  const capacity = calculateSedimentCapacity(waterVelocity, water[cellX][cellZ], slope);
  const currentSediment = sediment[cellX][cellZ];

  if (currentSediment < capacity) {
    // Erode
    const erosionAmount = min(Ke * (capacity - currentSediment), terrainHardness);
    terrain.modifyHeight(cellX, cellZ, -erosionAmount);
    sediment[cellX][cellZ] += erosionAmount;
  } else {
    // Deposit
    const depositionAmount = Kd * (currentSediment - capacity);
    terrain.modifyHeight(cellX, cellZ, depositionAmount);
    sediment[cellX][cellZ] -= depositionAmount;
  }
}
```

### 4. Thermal Erosion

```typescript
function applyThermalErosion(cellX, cellZ) {
  const slope = terrain.getSlopeAt(cellX, cellZ);

  if (slope > angleOfRepose) {
    const excessAngle = slope - angleOfRepose;
    const erosionAmount = excessAngle * thermalRate * dt;

    // Find lowest neighbor
    const lowestNeighbor = findLowestNeighbor(cellX, cellZ);

    // Transfer material
    terrain.modifyHeight(cellX, cellZ, -erosionAmount);
    terrain.modifyHeight(lowestNeighbor.x, lowestNeighbor.z, erosionAmount);
  }
}
```

---

## 🔬 Physics Parameters

```typescript
interface ErosionConfig {
  // Water flow
  gravity: number; // 9.8 m/s²
  waterFriction: number; // 0.1 (friction coefficient)
  evaporationRate: number; // 0.01 (water loss per second)

  // Sediment transport
  sedimentCapacityConstant: number; // Kc = 0.5
  erosionRate: number; // Ke = 0.3
  depositionRate: number; // Kd = 0.1

  // Thermal erosion
  angleOfRepose: number; // 45 degrees
  thermalRate: number; // 0.1

  // Material properties
  terrainHardness: number; // 1.0 (resistance to erosion)
  sedimentDensity: number; // 2000 kg/m³
}
```

---

## 📈 Expected Results

### Erosion Patterns

- **Rills** - Small channels from concentrated flow
- **Gullies** - Larger channels from sustained erosion
- **River Valleys** - Meandering patterns from long-term flow
- **Depositional Fans** - Sediment buildup at slope breaks
- **Terraces** - Stepped features from erosion levels

### Visual Quality

- Realistic water flow following terrain contours
- Natural-looking erosion patterns
- Smooth deposition zones
- Conservation of terrain volume (erosion = deposition)

---

## 🚀 Extensions (Future)

1. **Multi-material terrain** - Rock, soil, sand with different hardness
2. **Chemical dissolution** - Karst formation, caves
3. **Vegetation effects** - Root stabilization, canopy interception
4. **Freeze-thaw cycles** - Frost heave, ice wedging
5. **Landslides** - Slope failure and debris flows
6. **Real terrain data** - Import/export DEM files

---

## 📝 Success Criteria

- [ ] All 5 components implemented
- [ ] 223+ tests passing (100% success rate)
- [ ] 2,000+ implementation lines
- [ ] 1,800+ test lines
- [ ] Realistic erosion patterns visible
- [ ] 60 FPS performance at 128×128 resolution
- [ ] Conservation of mass verified
- [ ] Comprehensive documentation

---

## 🎓 References

- [Shallow Water Equations](https://en.wikipedia.org/wiki/Shallow_water_equations)
- [Hydraulic Erosion](https://en.wikipedia.org/wiki/Erosion#Hydraulic_action)
- [Sediment Transport](https://en.wikipedia.org/wiki/Sediment_transport)
- [Thermal Erosion](https://en.wikipedia.org/wiki/Erosion#Thermal)
- [Fast Hydraulic Erosion Simulation](https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf)

---

Ready to begin Day 1: HeightmapTerrain! 🌊
