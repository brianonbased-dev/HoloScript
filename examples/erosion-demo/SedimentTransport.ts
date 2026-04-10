/**
 * SedimentTransport.ts
 *
 * Sediment erosion, transport, and deposition for water erosion simulation.
 * Implements both thermal (slope-based) and hydraulic (water-based) erosion.
 *
 * Week 7: Water Erosion - Day 3
 */

import type { HeightmapTerrain } from './HeightmapTerrain';
import type { WaterFlowSolver } from './WaterFlowSolver';

export interface SedimentConfig {
  /** Sediment capacity coefficient (how much sediment water can carry) */
  sedimentCapacity: number;
  /** Erosion rate (how fast terrain erodes) */
  erosionRate: number;
  /** Deposition rate (how fast sediment deposits) */
  depositionRate: number;
  /** Minimum water height for hydraulic erosion */
  minWaterHeight: number;
  /** Thermal erosion rate (slope-based) */
  thermalErosionRate: number;
  /** Angle of repose (radians) - maximum stable slope */
  angleOfRepose: number;
  /** Solubility (how easily terrain material erodes) */
  solubility: number;
  /** Evaporation leaves sediment behind */
  evaporationDeposit: boolean;
}

export interface SedimentCell {
  /** Amount of suspended sediment */
  suspended: number;
  /** Amount of deposited sediment */
  deposited: number;
}

export interface SedimentStatistics {
  /** Total suspended sediment */
  totalSuspended: number;
  /** Total deposited sediment */
  totalDeposited: number;
  /** Average suspended sediment per cell */
  avgSuspended: number;
  /** Average deposited sediment per cell */
  avgDeposited: number;
  /** Maximum suspended sediment */
  maxSuspended: number;
  /** Maximum deposited sediment */
  maxDeposited: number;
  /** Total erosion this frame */
  erosionAmount: number;
  /** Total deposition this frame */
  depositionAmount: number;
}

/**
 * Sediment transport system for erosion simulation
 */
export class SedimentTransport {
  private terrain: HeightmapTerrain;
  private water: WaterFlowSolver;
  public readonly config: SedimentConfig;
  private sediment: SedimentCell[];
  private resolution: number;
  private lastErosionAmount = 0;
  private lastDepositionAmount = 0;

  constructor(
    terrain: HeightmapTerrain,
    water: WaterFlowSolver,
    config: Partial<SedimentConfig> = {}
  ) {
    this.terrain = terrain;
    this.water = water;

    // Default config
    this.config = {
      sedimentCapacity: 0.5,
      erosionRate: 0.3,
      depositionRate: 0.1,
      minWaterHeight: 0.01,
      thermalErosionRate: 0.1,
      angleOfRepose: Math.PI / 6, // 30 degrees
      solubility: 1.0,
      evaporationDeposit: true,
      ...config,
    };

    this.resolution = terrain.config.resolution;
    const size = this.resolution * this.resolution;
    this.sediment = new Array(size);

    // Initialize sediment cells
    for (let i = 0; i < size; i++) {
      this.sediment[i] = {
        suspended: 0,
        deposited: 0,
      };
    }
  }

  /**
   * Get sediment at grid coordinates
   */
  public getSedimentAt(gridX: number, gridZ: number): SedimentCell | null {
    if (gridX < 0 || gridX >= this.resolution || gridZ < 0 || gridZ >= this.resolution) {
      return null;
    }

    return this.sediment[gridZ * this.resolution + gridX];
  }

  /**
   * Add suspended sediment at grid coordinates
   */
  public addSuspendedSediment(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getSedimentAt(gridX, gridZ);
    if (cell) {
      cell.suspended += amount;
    }
  }

  /**
   * Add deposited sediment at grid coordinates
   */
  public addDepositedSediment(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getSedimentAt(gridX, gridZ);
    if (cell) {
      cell.deposited += amount;
    }
  }

  /**
   * Set suspended sediment at grid coordinates
   */
  public setSuspendedSediment(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getSedimentAt(gridX, gridZ);
    if (cell) {
      cell.suspended = Math.max(0, amount);
    }
  }

  /**
   * Set deposited sediment at grid coordinates
   */
  public setDepositedSediment(gridX: number, gridZ: number, amount: number): void {
    const cell = this.getSedimentAt(gridX, gridZ);
    if (cell) {
      cell.deposited = Math.max(0, amount);
    }
  }

  /**
   * Update sediment transport for one time step
   */
  public update(dt: number): void {
    this.lastErosionAmount = 0;
    this.lastDepositionAmount = 0;

    // Skip if no time has passed
    if (dt <= 0) {
      return;
    }

    // Step 1: Thermal erosion (slope-based)
    this.applyThermalErosion(dt);

    // Step 2: Hydraulic erosion (water-based)
    this.applyHydraulicErosion(dt);

    // Step 3: Transport sediment with water flow
    this.transportSediment(dt);

    // Step 4: Deposit sediment where water is slow
    this.depositSediment(dt);
  }

  /**
   * Apply thermal erosion (slope-based material movement)
   */
  private applyThermalErosion(dt: number): void {
    const { resolution } = this;
    const { thermalErosionRate, angleOfRepose } = this.config;

    // Create temporary array to avoid feedback
    const heightChanges = new Float32Array(resolution * resolution);

    for (let z = 1; z < resolution - 1; z++) {
      for (let x = 1; x < resolution - 1; x++) {
        const idx = z * resolution + x;
        const height = this.terrain.getHeightAtGrid(x, z);
        const slope = this.terrain.getSlopeAtGrid(x, z);

        // Only erode if slope exceeds angle of repose
        if (slope > angleOfRepose) {
          const excessSlope = slope - angleOfRepose;
          const erosionAmount = thermalErosionRate * excessSlope * dt;

          // Erode from current cell
          heightChanges[idx] -= erosionAmount;
          this.lastErosionAmount += erosionAmount;

          // Distribute to lower neighbors
          const neighbors: Array<[number, number]> = [
            [x - 1, z],
            [x + 1, z],
            [x, z - 1],
            [x, z + 1],
          ];

          let lowerNeighbors = 0;
          for (const [nx, nz] of neighbors) {
            const neighborHeight = this.terrain.getHeightAtGrid(nx, nz);
            if (neighborHeight < height) {
              lowerNeighbors++;
            }
          }

          if (lowerNeighbors > 0) {
            const amountPerNeighbor = erosionAmount / lowerNeighbors;
            for (const [nx, nz] of neighbors) {
              const neighborHeight = this.terrain.getHeightAtGrid(nx, nz);
              if (neighborHeight < height) {
                const nidx = nz * resolution + nx;
                heightChanges[nidx] += amountPerNeighbor;
              }
            }
          }
        }
      }
    }

    // Apply height changes
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        if (Math.abs(heightChanges[idx]) > 0.0001) {
          this.terrain.modifyHeightAtGrid(x, z, heightChanges[idx]);
        }
      }
    }
  }

  /**
   * Apply hydraulic erosion (water-based)
   */
  private applyHydraulicErosion(dt: number): void {
    const { resolution } = this;
    const { erosionRate, minWaterHeight, solubility, sedimentCapacity } = this.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const waterCell = this.water.getWaterAt(x, z);
        if (!waterCell || waterCell.height < minWaterHeight) {
          continue;
        }

        const sedimentCell = this.getSedimentAt(x, z);
        if (!sedimentCell) {
          continue;
        }

        // Calculate sediment capacity based on water velocity
        const velocityMagnitude = Math.sqrt(
          waterCell.velocity[0] * waterCell.velocity[0] +
            waterCell.velocity[1] * waterCell.velocity[1]
        );

        const capacity = sedimentCapacity * velocityMagnitude * waterCell.height;

        // Erode if below capacity
        if (sedimentCell.suspended < capacity) {
          const erosionAmount = erosionRate * solubility * (capacity - sedimentCell.suspended) * dt;

          // Erode terrain
          const terrainHeight = this.terrain.getHeightAtGrid(x, z);
          const actualErosion = Math.min(erosionAmount, terrainHeight * 0.1); // Max 10% per step

          if (actualErosion > 0) {
            this.terrain.modifyHeightAtGrid(x, z, -actualErosion);
            sedimentCell.suspended += actualErosion;
            this.lastErosionAmount += actualErosion;
          }
        }
      }
    }
  }

  /**
   * Transport suspended sediment with water flow
   */
  private transportSediment(dt: number): void {
    const { resolution } = this;
    const newSediment: SedimentCell[] = new Array(resolution * resolution);

    // Initialize new sediment array
    for (let i = 0; i < newSediment.length; i++) {
      newSediment[i] = {
        suspended: 0,
        deposited: this.sediment[i].deposited, // Keep deposited sediment
      };
    }

    // Transport suspended sediment
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const waterCell = this.water.getWaterAt(x, z);
        const sedimentCell = this.getSedimentAt(x, z);

        if (!waterCell || !sedimentCell || sedimentCell.suspended <= 0) {
          continue;
        }

        const velocity = waterCell.velocity;
        const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1]);

        if (speed < 0.001) {
          // No flow, sediment stays here
          newSediment[z * resolution + x].suspended += sedimentCell.suspended;
          continue;
        }

        // Calculate target position
        const targetX = x + velocity[0] * dt;
        const targetZ = z + velocity[1] * dt;

        // Clamp to grid
        const gridX = Math.max(0, Math.min(resolution - 1, Math.round(targetX)));
        const gridZ = Math.max(0, Math.min(resolution - 1, Math.round(targetZ)));

        // Move sediment
        newSediment[gridZ * resolution + gridX].suspended += sedimentCell.suspended;
      }
    }

    // Copy back
    this.sediment = newSediment;
  }

  /**
   * Deposit sediment where water is slow or evaporating
   */
  private depositSediment(dt: number): void {
    const { resolution } = this;
    const { depositionRate, sedimentCapacity, evaporationDeposit } = this.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const waterCell = this.water.getWaterAt(x, z);
        const sedimentCell = this.getSedimentAt(x, z);

        if (!sedimentCell || sedimentCell.suspended <= 0) {
          continue;
        }

        let depositionAmount = 0;

        if (!waterCell || waterCell.height < this.config.minWaterHeight) {
          // No water or very little water - deposit all sediment
          depositionAmount = sedimentCell.suspended;
        } else {
          // Calculate capacity
          const velocityMagnitude = Math.sqrt(
            waterCell.velocity[0] * waterCell.velocity[0] +
              waterCell.velocity[1] * waterCell.velocity[1]
          );

          const capacity = sedimentCapacity * velocityMagnitude * waterCell.height;

          // Deposit if above capacity
          if (sedimentCell.suspended > capacity) {
            depositionAmount = depositionRate * (sedimentCell.suspended - capacity) * dt;
          }

          // Evaporation causes deposition
          if (evaporationDeposit && waterCell.height > 0) {
            const evaporationFactor = 1.0 - Math.pow(1.0 - this.water.config.evaporationRate, dt);
            depositionAmount += sedimentCell.suspended * evaporationFactor * 0.5;
          }
        }

        if (depositionAmount > 0) {
          depositionAmount = Math.min(depositionAmount, sedimentCell.suspended);

          // Deposit sediment
          sedimentCell.suspended -= depositionAmount;
          sedimentCell.deposited += depositionAmount;

          // Raise terrain
          this.terrain.modifyHeightAtGrid(x, z, depositionAmount);
          this.lastDepositionAmount += depositionAmount;
        }
      }
    }
  }

  /**
   * Apply deposited sediment to terrain permanently
   */
  public applyDepositedSediment(): void {
    const { resolution } = this;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const sedimentCell = this.getSedimentAt(x, z);
        if (sedimentCell && sedimentCell.deposited > 0) {
          // Already applied to terrain height during deposition
          // This just resets the deposited counter
          sedimentCell.deposited = 0;
        }
      }
    }
  }

  /**
   * Get sediment capacity at grid coordinates
   */
  public getSedimentCapacityAt(gridX: number, gridZ: number): number {
    const waterCell = this.water.getWaterAt(gridX, gridZ);
    if (!waterCell) {
      return 0;
    }

    const velocityMagnitude = Math.sqrt(
      waterCell.velocity[0] * waterCell.velocity[0] + waterCell.velocity[1] * waterCell.velocity[1]
    );

    return this.config.sedimentCapacity * velocityMagnitude * waterCell.height;
  }

  /**
   * Get sediment saturation (suspended / capacity) at grid coordinates
   */
  public getSedimentSaturationAt(gridX: number, gridZ: number): number {
    const sedimentCell = this.getSedimentAt(gridX, gridZ);
    if (!sedimentCell) {
      return 0;
    }

    const capacity = this.getSedimentCapacityAt(gridX, gridZ);
    if (capacity <= 0) {
      return 0;
    }

    return sedimentCell.suspended / capacity;
  }

  /**
   * Calculate sediment statistics
   */
  public getStatistics(): SedimentStatistics {
    let totalSuspended = 0;
    let totalDeposited = 0;
    let maxSuspended = 0;
    let maxDeposited = 0;

    for (const cell of this.sediment) {
      totalSuspended += cell.suspended;
      totalDeposited += cell.deposited;
      maxSuspended = Math.max(maxSuspended, cell.suspended);
      maxDeposited = Math.max(maxDeposited, cell.deposited);
    }

    const cellCount = this.sediment.length;

    return {
      totalSuspended,
      totalDeposited,
      avgSuspended: totalSuspended / cellCount,
      avgDeposited: totalDeposited / cellCount,
      maxSuspended,
      maxDeposited,
      erosionAmount: this.lastErosionAmount,
      depositionAmount: this.lastDepositionAmount,
    };
  }

  /**
   * Reset all sediment
   */
  public reset(): void {
    for (const cell of this.sediment) {
      cell.suspended = 0;
      cell.deposited = 0;
    }

    this.lastErosionAmount = 0;
    this.lastDepositionAmount = 0;
  }

  /**
   * Clear suspended sediment only
   */
  public clearSuspended(): void {
    for (const cell of this.sediment) {
      cell.suspended = 0;
    }
  }

  /**
   * Clear deposited sediment only
   */
  public clearDeposited(): void {
    for (const cell of this.sediment) {
      cell.deposited = 0;
    }
  }

  /**
   * Add sediment uniformly across terrain
   */
  public addUniformSediment(suspended: number, deposited: number = 0): void {
    for (const cell of this.sediment) {
      cell.suspended += suspended;
      cell.deposited += deposited;
    }
  }

  /**
   * Add sediment in a region
   */
  public addSedimentToRegion(
    centerX: number,
    centerZ: number,
    radius: number,
    suspended: number,
    deposited: number = 0
  ): void {
    const { resolution } = this;

    // Handle zero or negative radius - add only to center cell
    if (radius <= 0) {
      const cell = this.getSedimentAt(centerX, centerZ);
      if (cell) {
        cell.suspended += suspended;
        cell.deposited += deposited;
      }
      return;
    }

    const radiusSq = radius * radius;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distSq = dx * dx + dz * dz;

        if (distSq <= radiusSq) {
          const cell = this.getSedimentAt(x, z);
          if (cell) {
            // Falloff based on distance
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            cell.suspended += suspended * falloff;
            cell.deposited += deposited * falloff;
          }
        }
      }
    }
  }

  /**
   * Erode terrain at specific location
   */
  public erodeAt(gridX: number, gridZ: number, amount: number): void {
    const sedimentCell = this.getSedimentAt(gridX, gridZ);
    if (!sedimentCell) {
      return;
    }

    const terrainHeight = this.terrain.getHeightAtGrid(gridX, gridZ);
    const actualErosion = Math.min(amount, terrainHeight);

    if (actualErosion > 0) {
      this.terrain.modifyHeightAtGrid(gridX, gridZ, -actualErosion);
      sedimentCell.suspended += actualErosion;
      this.lastErosionAmount += actualErosion;
    }
  }

  /**
   * Deposit sediment at specific location
   */
  public depositAt(gridX: number, gridZ: number, amount: number): void {
    const sedimentCell = this.getSedimentAt(gridX, gridZ);
    if (!sedimentCell) {
      return;
    }

    const actualDeposition = Math.min(amount, sedimentCell.suspended);

    if (actualDeposition > 0) {
      sedimentCell.suspended -= actualDeposition;
      sedimentCell.deposited += actualDeposition;
      this.terrain.modifyHeightAtGrid(gridX, gridZ, actualDeposition);
      this.lastDepositionAmount += actualDeposition;
    }
  }

  /**
   * Get total sediment mass
   */
  public getTotalMass(): number {
    let total = 0;
    for (const cell of this.sediment) {
      total += cell.suspended + cell.deposited;
    }
    return total;
  }

  /**
   * Simulate erosion for multiple steps
   */
  public simulate(dt: number, steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.update(dt);
    }
  }
}
