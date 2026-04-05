/**
 * ProjectorLight.ts
 *
 * Cookie projection: frustum-shaped light that projects
 * a texture pattern onto surfaces. Supports intensity,
 * falloff, and color.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectorConfig {
  id: string;
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  cookieTextureId: string;
  fov: number; // degrees
  aspectRatio: number;
  nearClip: number;
  farClip: number;
  intensity: number;
  color: { r: number; g: number; b: number };
  falloff: 'none' | 'linear' | 'quadratic';
  enabled: boolean;
}

// =============================================================================
// PROJECTOR LIGHT
// =============================================================================

let _projId = 0;

export class ProjectorLight {
  private projectors: Map<string, ProjectorConfig> = new Map();

  // ---------------------------------------------------------------------------
  // Management
  // ---------------------------------------------------------------------------

  create(config: Omit<ProjectorConfig, 'id'> & { id?: string }): ProjectorConfig {
    const id = config.id ?? `proj_${_projId++}`;
    const proj: ProjectorConfig = { ...config, id };
    this.projectors.set(id, proj);
    return proj;
  }

  remove(id: string): boolean {
    return this.projectors.delete(id);
  }
  get(id: string): ProjectorConfig | undefined {
    return this.projectors.get(id);
  }
  getCount(): number {
    return this.projectors.size;
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  setPosition(id: string, x: number, y: number, z: number): void {
    const p = this.projectors.get(id);
    if (p) p.position = { x, y, z };
  }

  setDirection(id: string, x: number, y: number, z: number): void {
    const p = this.projectors.get(id);
    if (p) p.direction = { x, y, z };
  }

  setIntensity(id: string, intensity: number): void {
    const p = this.projectors.get(id);
    if (p) p.intensity = Math.max(0, intensity);
  }

  setColor(id: string, r: number, g: number, b: number): void {
    const p = this.projectors.get(id);
    if (p) p.color = { r, g, b };
  }

  setEnabled(id: string, enabled: boolean): void {
    const p = this.projectors.get(id);
    if (p) p.enabled = enabled;
  }

  // ---------------------------------------------------------------------------
  // Frustum
  // ---------------------------------------------------------------------------

  getFrustumPlanes(id: string): { near: number; far: number; fov: number; aspect: number } | null {
    const p = this.projectors.get(id);
    if (!p) return null;
    return { near: p.nearClip, far: p.farClip, fov: p.fov, aspect: p.aspectRatio };
  }

  isPointInFrustum(id: string, point: { x: number; y: number; z: number }): boolean {
    const p = this.projectors.get(id);
    if (!p || !p.enabled) return false;

    // Simplified frustum test: project point into projector space
    const dx = point.x - p.position.x;
    const dy = point.y - p.position.y;
    const dz = point.z - p.position.z;

    // Dot with direction = depth
    const dirLen =
      Math.sqrt(
        p.direction.x * p.direction.x +
          p.direction.y * p.direction.y +
          p.direction.z * p.direction.z
      ) || 1;
    const nx = p.direction.x / dirLen,
      ny = p.direction.y / dirLen,
      nz = p.direction.z / dirLen;
    const depth = dx * nx + dy * ny + dz * nz;

    if (depth < p.nearClip || depth > p.farClip) return false;

    // Lateral offset check (simplified, using fov and aspect)
    const halfFovRad = (p.fov / 2) * (Math.PI / 180);
    const maxHalfWidth = depth * Math.tan(halfFovRad);

    // Project to perpendicular plane (simplified: use remaining components)
    const perpX = dx - depth * nx;
    const perpY = dy - depth * ny;
    const perpZ = dz - depth * nz;
    const lateralDist = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);

    return lateralDist <= maxHalfWidth;
  }

  // ---------------------------------------------------------------------------
  // Attenuation
  // ---------------------------------------------------------------------------

  computeAttenuation(id: string, distance: number): number {
    const p = this.projectors.get(id);
    if (!p) return 0;

    const range = p.farClip - p.nearClip;
    const d = Math.max(0, distance - p.nearClip);

    switch (p.falloff) {
      case 'none':
        return p.intensity;
      case 'linear':
        return p.intensity * Math.max(0, 1 - d / range);
      case 'quadratic':
        return p.intensity / (1 + (d / range) * (d / range));
      default:
        return p.intensity;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getActive(): ProjectorConfig[] {
    return [...this.projectors.values()].filter((p) => p.enabled);
  }
}

