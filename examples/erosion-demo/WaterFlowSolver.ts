/**
 * WaterFlowSolver.ts
 *
 * Height-field water simulation using shallow water equations.
 * Handles water flow, rain, evaporation, and pooling.
 *
 * Week 7: Water Erosion - Day 2
 */

import type { HeightmapTerrain } from './HeightmapTerrain';

export interface WaterFlowConfig {
  /** Gravity constant (m/s²) */
  gravity: number;
  /** Water friction coefficient */
  frictionCoefficient: number;
  /** Evaporation rate (fraction per second) */
  evaporationRate: number;
  /** Minimum water height to consider (m) */
  minWaterHeight: number;
  /** Maximum water velocity (m/s) */
  maxVelocity: number;
}

export interface WaterCell {
  /** Water height (m) */
  height: number;
  /** Water velocity [vx, vz] (m/s) */
  velocity: [number, number];
  /** Previous water height (for flow calculation) */
  prevHeight: number;
}

export interface WaterStatistics {
  /** Total water volume (m³) */
  totalVolume: number;
  /** Number of wet cells */
  wetCellCount: number;
  /** Average water height */
  avgHeight: number;
  /** Maximum water height */
  maxHeight: number;
  /** Average water velocity */
  avgVelocity: number;
  /** Maximum water velocity */
  maxVelocity: number;
}

/**
 * Water flow solver using height-field simulation
 */
export class WaterFlowSolver {
  private terrain: HeightmapTerrain;
  private config: WaterFlowConfig;
  private resolution: number;
  private cellSizeX: number;
  private cellSizeZ: number;
  private water: WaterCell[];
  private flowBuffer: Float32Array; // Temporary buffer for flow calculations

  constructor(terrain: HeightmapTerrain, config: WaterFlowConfig) {
    this.terrain = terrain;
    this.config = config;
    this.resolution = terrain.config.resolution;

    this.cellSizeX = terrain.config.width / (this.resolution - 1);
    this.cellSizeZ = terrain.config.depth / (this.resolution - 1);

    // Initialize water cells
    const cellCount = this.resolution * this.resolution;
    this.water = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      this.water[i] = {
        height: 0,
        velocity: [0, 0],
        prevHeight: 0,
      };
    }

    this.flowBuffer = new Float32Array(cellCount * 4); // [flowNorth, flowEast, flowSouth, flowWest]
  }

  /**
   * Get water cell at grid coordinates
   */
  public getWaterAt(gridX: number, gridZ: number): WaterCell | null {
    if (gridX < 0 || gridX >= this.resolution || gridZ < 0 || gridZ >= this.resolution) {
      return null;
    }

    return this.water[gridZ * this.resolution + gridX];
  }

  /**
   * Add water at grid coordinates
   */
  public addWaterAt(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getWaterAt(gridX, gridZ);
    if (cell) {
      cell.height += amount;
    }
  }

  /**
   * Remove water at grid coordinates
   */
  public removeWaterAt(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getWaterAt(gridX, gridZ);
    if (cell) {
      cell.height = Math.max(0, cell.height - amount);
    }
  }

  /**
   * Set water height at grid coordinates
   */
  public setWaterAt(gridX: number, gridZ: number, height: number): void {
    const cell = this.getWaterAt(gridX, gridZ);
    if (cell) {
      cell.height = Math.max(0, height);
    }
  }

  /**
   * Add rain to entire terrain
   */
  public addRain(amount: number): void {
    for (let i = 0; i < this.water.length; i++) {
      this.water[i].height += amount;
    }
  }

  /**
   * Add rain to specific region
   */
  public addRainToRegion(centerX: number, centerZ: number, radius: number, amount: number): void {
    const radiusSquared = radius * radius;

    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distSquared = dx * dx + dz * dz;

        if (distSquared <= radiusSquared) {
          this.water[z * this.resolution + x].height += amount;
        }
      }
    }
  }

  /**
   * Calculate water flow for a single cell
   */
  private calculateCellFlow(gridX: number, gridZ: number, dt: number): void {
    const idx = gridZ * this.resolution + gridX;
    const cell = this.water[idx];

    if (cell.height < this.config.minWaterHeight) {
      // Not enough water to flow
      this.flowBuffer[idx * 4 + 0] = 0; // North
      this.flowBuffer[idx * 4 + 1] = 0; // East
      this.flowBuffer[idx * 4 + 2] = 0; // South
      this.flowBuffer[idx * 4 + 3] = 0; // West
      return;
    }

    const terrainHeight = this.terrain.getHeightAtGrid(gridX, gridZ);
    const waterSurface = terrainHeight + cell.height;

    // Check all four neighbors (North, East, South, West)
    const neighbors = [
      { x: gridX, z: gridZ - 1, idx: 0 }, // North
      { x: gridX + 1, z: gridZ, idx: 1 }, // East
      { x: gridX, z: gridZ + 1, idx: 2 }, // South
      { x: gridX - 1, z: gridZ, idx: 3 }, // West
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.x >= this.resolution ||
        neighbor.z < 0 ||
        neighbor.z >= this.resolution
      ) {
        // Out of bounds
        this.flowBuffer[idx * 4 + neighbor.idx] = 0;
        continue;
      }

      const neighborTerrainHeight = this.terrain.getHeightAtGrid(neighbor.x, neighbor.z);
      const neighborWaterHeight = this.water[neighbor.z * this.resolution + neighbor.x].height;
      const neighborWaterSurface = neighborTerrainHeight + neighborWaterHeight;

      const heightDiff = waterSurface - neighborWaterSurface;

      if (heightDiff > 0) {
        // Water flows downhill
        const flowVelocity = Math.sqrt(2 * this.config.gravity * heightDiff);
        const flowRate = Math.min(
          flowVelocity * cell.height * dt,
          cell.height * 0.5 // Maximum 50% of water per timestep
        );

        this.flowBuffer[idx * 4 + neighbor.idx] = flowRate;
      } else {
        this.flowBuffer[idx * 4 + neighbor.idx] = 0;
      }
    }
  }

  /**
   * Apply water flow to update cell heights
   */
  private applyFlow(_dt: number): void {
    // Create temporary array to accumulate changes
    const deltaHeight = new Float32Array(this.water.length);

    // Calculate outflow and inflow for each cell
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const idx = z * this.resolution + x;

        // Outflow (subtract)
        const outflowNorth = this.flowBuffer[idx * 4 + 0];
        const outflowEast = this.flowBuffer[idx * 4 + 1];
        const outflowSouth = this.flowBuffer[idx * 4 + 2];
        const outflowWest = this.flowBuffer[idx * 4 + 3];
        const totalOutflow = outflowNorth + outflowEast + outflowSouth + outflowWest;

        deltaHeight[idx] -= totalOutflow;

        // Inflow from neighbors (add)
        // North neighbor's south outflow
        if (z > 0) {
          const northIdx = (z - 1) * this.resolution + x;
          deltaHeight[idx] += this.flowBuffer[northIdx * 4 + 2];
        }

        // East neighbor's west outflow
        if (x < this.resolution - 1) {
          const eastIdx = z * this.resolution + (x + 1);
          deltaHeight[idx] += this.flowBuffer[eastIdx * 4 + 3];
        }

        // South neighbor's north outflow
        if (z < this.resolution - 1) {
          const southIdx = (z + 1) * this.resolution + x;
          deltaHeight[idx] += this.flowBuffer[southIdx * 4 + 0];
        }

        // West neighbor's east outflow
        if (x > 0) {
          const westIdx = z * this.resolution + (x - 1);
          deltaHeight[idx] += this.flowBuffer[westIdx * 4 + 1];
        }
      }
    }

    // Apply changes
    for (let i = 0; i < this.water.length; i++) {
      this.water[i].height = Math.max(0, this.water[i].height + deltaHeight[i]);
    }
  }

  /**
   * Update water velocities based on flow
   */
  private updateVelocities(dt: number): void {
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const idx = z * this.resolution + x;
        const cell = this.water[idx];

        if (cell.height < this.config.minWaterHeight) {
          cell.velocity = [0, 0];
          continue;
        }

        const _terrainHeight = this.terrain.getHeightAtGrid(x, z);

        // Calculate gradient of water surface
        let gradX = 0;
        let gradZ = 0;

        if (x > 0 && x < this.resolution - 1) {
          const westHeight =
            this.terrain.getHeightAtGrid(x - 1, z) +
            this.water[z * this.resolution + (x - 1)].height;
          const eastHeight =
            this.terrain.getHeightAtGrid(x + 1, z) +
            this.water[z * this.resolution + (x + 1)].height;
          gradX = (eastHeight - westHeight) / (2 * this.cellSizeX);
        }

        if (z > 0 && z < this.resolution - 1) {
          const northHeight =
            this.terrain.getHeightAtGrid(x, z - 1) +
            this.water[(z - 1) * this.resolution + x].height;
          const southHeight =
            this.terrain.getHeightAtGrid(x, z + 1) +
            this.water[(z + 1) * this.resolution + x].height;
          gradZ = (southHeight - northHeight) / (2 * this.cellSizeZ);
        }

        // Update velocity (negative gradient for downhill flow)
        const accelX = -this.config.gravity * gradX;
        const accelZ = -this.config.gravity * gradZ;

        // Apply friction
        const friction = this.config.frictionCoefficient;
        cell.velocity[0] += (accelX - friction * cell.velocity[0]) * dt;
        cell.velocity[1] += (accelZ - friction * cell.velocity[1]) * dt;

        // Clamp velocity
        const speed = Math.sqrt(
          cell.velocity[0] * cell.velocity[0] + cell.velocity[1] * cell.velocity[1]
        );

        if (speed > this.config.maxVelocity) {
          cell.velocity[0] = (cell.velocity[0] / speed) * this.config.maxVelocity;
          cell.velocity[1] = (cell.velocity[1] / speed) * this.config.maxVelocity;
        }
      }
    }
  }

  /**
   * Apply evaporation
   */
  private applyEvaporation(dt: number): void {
    const evaporationFactor = 1.0 - this.config.evaporationRate * dt;

    for (let i = 0; i < this.water.length; i++) {
      this.water[i].height *= evaporationFactor;

      if (this.water[i].height < this.config.minWaterHeight) {
        this.water[i].height = 0;
        this.water[i].velocity = [0, 0];
      }
    }
  }

  /**
   * Update water simulation
   */
  public update(dt: number): void {
    // Store previous heights
    for (let i = 0; i < this.water.length; i++) {
      this.water[i].prevHeight = this.water[i].height;
    }

    // Calculate flow for all cells
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        this.calculateCellFlow(x, z, dt);
      }
    }

    // Apply flow
    this.applyFlow(dt);

    // Update velocities
    this.updateVelocities(dt);

    // Apply evaporation
    this.applyEvaporation(dt);
  }

  /**
   * Get water statistics
   */
  public getStatistics(): WaterStatistics {
    const cellArea = this.cellSizeX * this.cellSizeZ;
    let totalVolume = 0;
    let wetCellCount = 0;
    let sumHeight = 0;
    let maxHeight = 0;
    let sumVelocity = 0;
    let maxVelocity = 0;

    for (const cell of this.water) {
      if (cell.height > this.config.minWaterHeight) {
        totalVolume += cell.height * cellArea;
        wetCellCount++;
        sumHeight += cell.height;
        maxHeight = Math.max(maxHeight, cell.height);

        const speed = Math.sqrt(
          cell.velocity[0] * cell.velocity[0] + cell.velocity[1] * cell.velocity[1]
        );
        sumVelocity += speed;
        maxVelocity = Math.max(maxVelocity, speed);
      }
    }

    return {
      totalVolume,
      wetCellCount,
      avgHeight: wetCellCount > 0 ? sumHeight / wetCellCount : 0,
      maxHeight,
      avgVelocity: wetCellCount > 0 ? sumVelocity / wetCellCount : 0,
      maxVelocity,
    };
  }

  /**
   * Find pools (local minima where water accumulates)
   */
  public findPools(): number[][] {
    const pools: number[][] = [];
    const visited = new Set<number>();

    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const idx = z * this.resolution + x;

        if (visited.has(idx)) continue;
        if (this.water[idx].height < this.config.minWaterHeight) continue;

        // Check if this is a local minimum
        const terrainHeight = this.terrain.getHeightAtGrid(x, z);
        const waterSurface = terrainHeight + this.water[idx].height;

        let isLocalMin = true;
        const neighbors = [
          [x, z - 1], // North
          [x + 1, z], // East
          [x, z + 1], // South
          [x - 1, z], // West
        ];

        for (const [nx, nz] of neighbors) {
          if (nx < 0 || nx >= this.resolution || nz < 0 || nz >= this.resolution) {
            continue;
          }

          const neighborHeight =
            this.terrain.getHeightAtGrid(nx, nz) + this.water[nz * this.resolution + nx].height;

          if (neighborHeight < waterSurface) {
            isLocalMin = false;
            break;
          }
        }

        if (isLocalMin) {
          // Flood fill to find entire pool
          const pool = this.floodFillPool(x, z, visited);
          if (pool.length > 0) {
            pools.push(pool);
          }
        }
      }
    }

    return pools;
  }

  /**
   * Flood fill to find connected pool cells
   */
  private floodFillPool(startX: number, startZ: number, visited: Set<number>): number[] {
    const pool: number[] = [];
    const queue: [number, number][] = [[startX, startZ]];
    const terrainThreshold = 0.1; // Small height difference tolerance

    while (queue.length > 0) {
      const [x, z] = queue.shift()!;
      const idx = z * this.resolution + x;

      if (visited.has(idx)) continue;
      visited.add(idx);

      if (this.water[idx].height < this.config.minWaterHeight) continue;

      pool.push(idx);

      const currentHeight = this.terrain.getHeightAtGrid(x, z) + this.water[idx].height;

      // Check neighbors
      const neighbors = [
        [x, z - 1],
        [x + 1, z],
        [x, z + 1],
        [x - 1, z],
      ];

      for (const [nx, nz] of neighbors) {
        if (nx < 0 || nx >= this.resolution || nz < 0 || nz >= this.resolution) {
          continue;
        }

        const nidx = nz * this.resolution + nx;
        if (visited.has(nidx)) continue;

        const neighborHeight = this.terrain.getHeightAtGrid(nx, nz) + this.water[nidx].height;

        if (Math.abs(neighborHeight - currentHeight) < terrainThreshold) {
          queue.push([nx, nz]);
        }
      }
    }

    return pool;
  }

  /**
   * Reset all water
   */
  public reset(): void {
    for (let i = 0; i < this.water.length; i++) {
      this.water[i].height = 0;
      this.water[i].velocity = [0, 0];
      this.water[i].prevHeight = 0;
    }
  }

  /**
   * Get all water data (for rendering or export)
   */
  public getWaterData(): WaterCell[] {
    return this.water;
  }
}
