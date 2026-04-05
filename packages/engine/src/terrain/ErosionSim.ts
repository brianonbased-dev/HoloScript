/**
 * ErosionSim.ts
 *
 * Terrain erosion: hydraulic erosion (raindrop simulation),
 * thermal erosion, sediment transport, and iteration control.
 *
 * @module terrain
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ErosionConfig {
  iterations: number;
  rainAmount: number;
  solubility: number; // How much material water can carry
  evaporationRate: number;
  depositionRate: number;
  gravity: number;
  thermalAngle: number; // Max slope angle (degrees) for thermal erosion
  thermalRate: number;
  seed: number;
}

export interface ErosionResult {
  totalEroded: number;
  totalDeposited: number;
  iterations: number;
  maxDepthChange: number;
}

// =============================================================================
// EROSION SIM
// =============================================================================

export class ErosionSim {
  private config: ErosionConfig;

  constructor(config?: Partial<ErosionConfig>) {
    this.config = {
      iterations: 50000,
      rainAmount: 1,
      solubility: 0.01,
      evaporationRate: 0.02,
      depositionRate: 0.3,
      gravity: 4,
      thermalAngle: 45,
      thermalRate: 0.5,
      seed: 42,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Hydraulic Erosion (Raindrop)
  // ---------------------------------------------------------------------------

  hydraulicErode(heightmap: Float32Array, width: number, height: number): ErosionResult {
    let totalEroded = 0;
    let totalDeposited = 0;
    let maxDepthChange = 0;

    let rng = this.config.seed;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };

    for (let iter = 0; iter < this.config.iterations; iter++) {
      // Random raindrop position
      let x = rand() * (width - 2) + 1;
      let z = rand() * (height - 2) + 1;
      let water = this.config.rainAmount;
      let sediment = 0;
      let speed = 1;

      for (let step = 0; step < 64; step++) {
        const ix = Math.floor(x),
          iz = Math.floor(z);
        if (ix < 1 || ix >= width - 1 || iz < 1 || iz >= height - 1) break;

        const idx = iz * width + ix;
        const h = heightmap[idx];

        // Gradient (central difference)
        const gx = heightmap[idx + 1] - heightmap[idx - 1];
        const gz = heightmap[idx + width] - heightmap[idx - width];

        // Move downhill
        const gradLen = Math.sqrt(gx * gx + gz * gz) || 0.001;
        x -= gx / gradLen;
        z -= gz / gradLen;

        const newIx = Math.floor(x),
          newIz = Math.floor(z);
        if (newIx < 0 || newIx >= width || newIz < 0 || newIz >= height) break;

        const newH = heightmap[newIz * width + newIx];
        const dh = h - newH;

        // Carrying capacity
        const capacity = Math.max(dh, 0.01) * speed * water * this.config.solubility;

        if (sediment > capacity || dh < 0) {
          // Deposit
          const deposit =
            dh < 0 ? Math.min(sediment, -dh) : (sediment - capacity) * this.config.depositionRate;
          heightmap[idx] += deposit;
          sediment -= deposit;
          totalDeposited += deposit;
          maxDepthChange = Math.max(maxDepthChange, deposit);
        } else {
          // Erode
          const erosion = Math.min((capacity - sediment) * this.config.solubility, h * 0.1);
          heightmap[idx] -= erosion;
          sediment += erosion;
          totalEroded += erosion;
          maxDepthChange = Math.max(maxDepthChange, erosion);
        }

        speed = Math.sqrt(Math.max(0, speed * speed + dh * this.config.gravity));
        water *= 1 - this.config.evaporationRate;
        if (water < 0.001) break;
      }
    }

    return { totalEroded, totalDeposited, iterations: this.config.iterations, maxDepthChange };
  }

  // ---------------------------------------------------------------------------
  // Thermal Erosion
  // ---------------------------------------------------------------------------

  thermalErode(
    heightmap: Float32Array,
    width: number,
    height: number,
    iterations?: number
  ): ErosionResult {
    const maxSlope = Math.tan((this.config.thermalAngle * Math.PI) / 180);
    const iters = iterations ?? Math.floor(this.config.iterations / 10);
    let totalEroded = 0;
    let totalDeposited = 0;
    let maxDepthChange = 0;

    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (let iter = 0; iter < iters; iter++) {
      for (let z = 1; z < height - 1; z++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = z * width + x;
          const h = heightmap[idx];

          let maxDh = 0;
          let steepestIdx = -1;

          for (const [dx, dz] of offsets) {
            const nIdx = (z + dz) * width + (x + dx);
            const dh = h - heightmap[nIdx];
            if (dh > maxDh) {
              maxDh = dh;
              steepestIdx = nIdx;
            }
          }

          if (maxDh > maxSlope && steepestIdx >= 0) {
            const transfer = (maxDh - maxSlope) * this.config.thermalRate * 0.5;
            heightmap[idx] -= transfer;
            heightmap[steepestIdx] += transfer;
            totalEroded += transfer;
            totalDeposited += transfer;
            maxDepthChange = Math.max(maxDepthChange, transfer);
          }
        }
      }
    }

    return { totalEroded, totalDeposited, iterations: iters, maxDepthChange };
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<ErosionConfig>): void {
    Object.assign(this.config, config);
  }
  getConfig(): ErosionConfig {
    return { ...this.config };
  }
}

