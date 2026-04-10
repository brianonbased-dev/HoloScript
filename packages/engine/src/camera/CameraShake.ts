/**
 * CameraShake.ts
 *
 * Trauma-based camera shake: Perlin noise sampling,
 * configurable decay, multi-layer shake, and intensity control.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ShakeLayer {
  id: string;
  trauma: number; // 0-1
  decay: number; // Per second
  frequency: number; // Noise sample rate
  amplitude: number; // Max displacement
  rotationAmount: number; // Max rotation (radians)
}

export interface ShakeOutput {
  offsetX: number;
  offsetY: number;
  rotation: number;
}

// =============================================================================
// CAMERA SHAKE
// =============================================================================

export class CameraShake {
  private layers: Map<string, ShakeLayer> = new Map();
  private time = 0;

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  addLayer(id: string, config?: Partial<ShakeLayer>): void {
    this.layers.set(id, {
      id,
      trauma: 0,
      decay: 1,
      frequency: 15,
      amplitude: 10,
      rotationAmount: 0.05,
      ...config,
    });
  }

  removeLayer(id: string): void {
    this.layers.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Trauma
  // ---------------------------------------------------------------------------

  addTrauma(layerId: string, amount: number): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.trauma = Math.min(1, layer.trauma + amount);
  }

  setTrauma(layerId: string, amount: number): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.trauma = Math.max(0, Math.min(1, amount));
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): ShakeOutput {
    this.time += dt;
    let totalX = 0,
      totalY = 0,
      totalRot = 0;

    for (const layer of this.layers.values()) {
      if (layer.trauma <= 0) continue;

      const shake = layer.trauma * layer.trauma; // Quadratic for feel
      const t = this.time * layer.frequency;

      // Perlin-like noise approximation
      totalX += shake * layer.amplitude * this.noise(t, 0);
      totalY += shake * layer.amplitude * this.noise(t, 100);
      totalRot += shake * layer.rotationAmount * this.noise(t, 200);

      // Decay
      layer.trauma = Math.max(0, layer.trauma - layer.decay * dt);
    }

    return { offsetX: totalX, offsetY: totalY, rotation: totalRot };
  }

  // ---------------------------------------------------------------------------
  // Noise (simplified)
  // ---------------------------------------------------------------------------

  private noise(x: number, seed: number): number {
    const n = Math.sin((x + seed) * 12.9898) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1; // -1 to 1
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTrauma(layerId: string): number {
    return this.layers.get(layerId)?.trauma ?? 0;
  }
  isShaking(): boolean {
    return [...this.layers.values()].some((l) => l.trauma > 0);
  }
}

