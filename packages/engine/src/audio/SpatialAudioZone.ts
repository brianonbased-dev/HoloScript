/**
 * SpatialAudioZone.ts
 *
 * Region-based audio environments: reverb zones, ambient areas,
 * and audio portals for zone transitions.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ReverbPreset {
  name: string;
  decay: number; // Reverb decay time in seconds
  density: number; // 0-1, reflection density
  diffusion: number; // 0-1, late reverb spread
  wetLevel: number; // 0-1, mix of reverb signal
  earlyReflections: number; // ms delay for early reflections
}

export interface AudioZoneConfig {
  id: string;
  shape: 'box' | 'sphere';
  position: [number, number, number];
  size: { x: number; y: number; z: number }; // half-extents for box, radius in x for sphere
  reverb: ReverbPreset;
  ambientClipId?: string;
  ambientVolume?: number;
  priority: number; // Higher priority overrides lower
  fadeDistance: number; // Blend distance at zone boundary
}

export interface AudioPortal {
  id: string;
  position: [number, number, number];
  normal: { x: number; y: number; z: number };
  width: number;
  height: number;
  fromZoneId: string;
  toZoneId: string;
  attenuation: number; // 0-1, how much sound passes through
}

export interface ZoneState {
  zoneId: string;
  blendWeight: number; // 0-1, how much this zone affects the listener
  isInside: boolean;
}

// =============================================================================
// REVERB PRESETS
// =============================================================================

export const REVERB_PRESETS: Record<string, ReverbPreset> = {
  outdoor: {
    name: 'outdoor',
    decay: 0.3,
    density: 0.2,
    diffusion: 0.1,
    wetLevel: 0.1,
    earlyReflections: 5,
  },
  room: {
    name: 'room',
    decay: 0.8,
    density: 0.5,
    diffusion: 0.5,
    wetLevel: 0.3,
    earlyReflections: 10,
  },
  hall: {
    name: 'hall',
    decay: 2.0,
    density: 0.7,
    diffusion: 0.8,
    wetLevel: 0.5,
    earlyReflections: 20,
  },
  cathedral: {
    name: 'cathedral',
    decay: 4.5,
    density: 0.9,
    diffusion: 0.9,
    wetLevel: 0.7,
    earlyReflections: 40,
  },
  cave: {
    name: 'cave',
    decay: 3.0,
    density: 0.8,
    diffusion: 0.6,
    wetLevel: 0.6,
    earlyReflections: 30,
  },
  underwater: {
    name: 'underwater',
    decay: 1.5,
    density: 1.0,
    diffusion: 1.0,
    wetLevel: 0.9,
    earlyReflections: 5,
  },
};

// =============================================================================
// SPATIAL AUDIO ZONE SYSTEM
// =============================================================================

export class SpatialAudioZoneSystem {
  private zones: Map<string, AudioZoneConfig> = new Map();
  private portals: Map<string, AudioPortal> = new Map();
  private activeZones: Map<string, ZoneState> = new Map();
  private listenerPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // ---------------------------------------------------------------------------
  // Zone Management
  // ---------------------------------------------------------------------------

  addZone(config: AudioZoneConfig): void {
    this.zones.set(config.id, config);
  }

  removeZone(zoneId: string): void {
    this.zones.delete(zoneId);
    this.activeZones.delete(zoneId);
  }

  getZone(zoneId: string): AudioZoneConfig | undefined {
    return this.zones.get(zoneId);
  }

  getZoneCount(): number {
    return this.zones.size;
  }

  // ---------------------------------------------------------------------------
  // Portals
  // ---------------------------------------------------------------------------

  addPortal(portal: AudioPortal): void {
    this.portals.set(portal.id, portal);
  }

  removePortal(portalId: string): void {
    this.portals.delete(portalId);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  updateListenerPosition(pos: { x: number; y: number; z: number }): void {
    this.listenerPos = { ...pos };
    this.recalculate();
  }

  private recalculate(): void {
    this.activeZones.clear();

    for (const [id, zone] of this.zones) {
      const distance = this.distanceToZone(zone);
      const isInside = distance <= 0;

      // Blend weight: 1 inside, fading in the fadeDistance band
      let blendWeight = 0;
      if (isInside) {
        blendWeight = 1;
      } else if (distance < zone.fadeDistance) {
        blendWeight = 1 - distance / zone.fadeDistance;
      }

      if (blendWeight > 0) {
        this.activeZones.set(id, { zoneId: id, blendWeight, isInside });
      }
    }
  }

  private distanceToZone(zone: AudioZoneConfig): number {
    const dx = this.listenerPos.x - zone.position.x;
    const dy = this.listenerPos.y - zone.position.y;
    const dz = this.listenerPos.z - zone.position.z;

    if (zone.shape === 'sphere') {
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return Math.max(0, dist - zone.size.x); // size.x = radius
    }

    // Box: signed distance to AABB
    const cx = Math.max(0, Math.abs(dx) - zone.size.x);
    const cy = Math.max(0, Math.abs(dy) - zone.size.y);
    const cz = Math.max(0, Math.abs(dz) - zone.size.z);
    return Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getActiveZones(): ZoneState[] {
    return [...this.activeZones.values()].sort((a, b) => {
      const za = this.zones.get(a.zoneId)!;
      const zb = this.zones.get(b.zoneId)!;
      return zb.priority - za.priority;
    });
  }

  /**
   * Returns the highest-priority active reverb preset, blended by weight.
   */
  getEffectiveReverb(): ReverbPreset | null {
    const active = this.getActiveZones();
    if (active.length === 0) return null;

    // Simple priority-weighted blend of top 2
    const primary = active[0];
    const zone = this.zones.get(primary.zoneId)!;

    if (active.length === 1 || primary.blendWeight >= 1) {
      return { ...zone.reverb };
    }

    // Blend top 2
    const secondary = active[1];
    const zone2 = this.zones.get(secondary.zoneId)!;
    const w = primary.blendWeight;

    return {
      name: `${zone.reverb.name}+${zone2.reverb.name}`,
      decay: zone.reverb.decay * w + zone2.reverb.decay * (1 - w),
      density: zone.reverb.density * w + zone2.reverb.density * (1 - w),
      diffusion: zone.reverb.diffusion * w + zone2.reverb.diffusion * (1 - w),
      wetLevel: zone.reverb.wetLevel * w + zone2.reverb.wetLevel * (1 - w),
      earlyReflections: zone.reverb.earlyReflections * w + zone2.reverb.earlyReflections * (1 - w),
    };
  }

  isListenerInsideZone(zoneId: string): boolean {
    return this.activeZones.get(zoneId)?.isInside ?? false;
  }

  /**
   * Get portal attenuation between two zones.
   */
  getPortalAttenuation(fromZone: string, toZone: string): number {
    for (const portal of this.portals.values()) {
      if (
        (portal.fromZoneId === fromZone && portal.toZoneId === toZone) ||
        (portal.fromZoneId === toZone && portal.toZoneId === fromZone)
      ) {
        return portal.attenuation;
      }
    }
    return 0; // No portal = fully blocked
  }
}
