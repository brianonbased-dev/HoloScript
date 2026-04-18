/**
 * GrassRenderer.ts
 *
 * Grass blade generation: procedural blade mesh,
 * LOD with billboarding, color variation, and density control.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export interface GrassBlade {
  position: [number, number, number];
  height: number;
  width: number;
  bendFactor: number;
  color: { r: number; g: number; b: number };
  lodLevel: number;
  isBillboard: boolean;
}

export interface GrassConfig {
  baseHeight: number;
  heightVariation: number;
  baseWidth: number;
  widthVariation: number;
  baseColor: { r: number; g: number; b: number };
  tipColor: { r: number; g: number; b: number };
  colorVariation: number; // 0-1
  billboardDistance: number; // Distance at which blades become billboards
  cullDistance: number;
  bendRange: number; // Max bend factor
  bladesPerUnit: number;
}

// =============================================================================
// GRASS RENDERER
// =============================================================================

export class GrassRenderer {
  private config: GrassConfig;
  private blades: GrassBlade[] = [];

  constructor(config?: Partial<GrassConfig>) {
    this.config = {
      baseHeight: 0.3,
      heightVariation: 0.15,
      baseWidth: 0.02,
      widthVariation: 0.01,
      baseColor: { r: 0.2, g: 0.6, b: 0.1 },
      tipColor: { r: 0.5, g: 0.8, b: 0.2 },
      colorVariation: 0.1,
      billboardDistance: 30,
      cullDistance: 60,
      bendRange: 0.3,
      bladesPerUnit: 10,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(bounds: { x: number; z: number; w: number; h: number }, seed = 123): void {
    this.blades = [];
    const area = bounds.w * bounds.h;
    const count = Math.floor(area * this.config.bladesPerUnit);

    let rng = seed;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };

    for (let i = 0; i < count; i++) {
      const x = bounds.x + rand() * bounds.w;
      const z = bounds.z + rand() * bounds.h;

      const heightMul = 1 - this.config.heightVariation + rand() * this.config.heightVariation * 2;
      const widthMul =
        1 -
        this.config.widthVariation / this.config.baseWidth +
        rand() * (this.config.widthVariation / this.config.baseWidth) * 2;

      const colorVar = (rand() - 0.5) * 2 * this.config.colorVariation;

      this.blades.push({
        position: [x, 0, z],
        height: this.config.baseHeight * heightMul,
        width: this.config.baseWidth * Math.max(0.5, widthMul),
        bendFactor: rand() * this.config.bendRange,
        color: {
          r: Math.max(0, Math.min(1, this.config.baseColor.r + colorVar)),
          g: Math.max(0, Math.min(1, this.config.baseColor.g + colorVar)),
          b: Math.max(0, Math.min(1, this.config.baseColor.b + colorVar)),
        },
        lodLevel: 0,
        isBillboard: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Update LOD
  // ---------------------------------------------------------------------------

  updateLOD(cameraPos: [number, number, number] | { x: number; z: number; y?: number }): void {
    const cx = Array.isArray(cameraPos) ? cameraPos[0] : cameraPos.x;
    const cz = Array.isArray(cameraPos) ? cameraPos[2] : cameraPos.z;
    for (const blade of this.blades) {
      const dx = blade.position[0] - cx;
      const dz = blade.position[2] - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > this.config.cullDistance) {
        blade.lodLevel = -1; // culled
        blade.isBillboard = false;
      } else if (dist > this.config.billboardDistance) {
        blade.lodLevel = 2;
        blade.isBillboard = true;
      } else if (dist > this.config.billboardDistance * 0.5) {
        blade.lodLevel = 1;
        blade.isBillboard = false;
      } else {
        blade.lodLevel = 0;
        blade.isBillboard = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBladeCount(): number {
    return this.blades.length;
  }

  getVisibleBlades(): GrassBlade[] {
    return this.blades.filter((b) => b.lodLevel >= 0);
  }

  getBillboardCount(): number {
    return this.blades.filter((b) => b.isBillboard).length;
  }

  getConfig(): GrassConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<GrassConfig>): void {
    Object.assign(this.config, config);
  }
}
