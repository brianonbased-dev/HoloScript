/**
 * AvatarPersistence.ts
 *
 * Save/load avatar configurations: appearance, personality, IK mode,
 * tracking source. Uses an in-memory store (swappable backend).
 *
 * @module social
 */

import type {
  AvatarPersonality,
  AvatarTrackingSource,
  AvatarIKMode,
} from '@holoscript/core/traits';

// =============================================================================
// TYPES
// =============================================================================

export interface AvatarAppearance {
  modelUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accessories: string[];
  height: number;
}

export interface AvatarConfig {
  userId: string;
  displayName: string;
  appearance: AvatarAppearance;
  personality: AvatarPersonality;
  trackingSource: AvatarTrackingSource;
  ikMode: AvatarIKMode;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

export class AvatarPersistence {
  private store = new Map<string, string>(); // userId → JSON

  /**
   * Save an avatar configuration (deep-copy to storage).
   */
  save(config: AvatarConfig): void {
    if (!config.userId) throw new Error('userId is required');
    const toStore: AvatarConfig = {
      ...config,
      appearance: {
        ...config.appearance,
        accessories: [...config.appearance.accessories],
      },
      personality: { ...config.personality },
      updatedAt: Date.now(),
    };
    this.store.set(config.userId, JSON.stringify(toStore));
  }

  /**
   * Load an avatar configuration (returns a deep copy).
   */
  load(userId: string): AvatarConfig | null {
    const json = this.store.get(userId);
    if (!json) return null;
    return JSON.parse(json) as AvatarConfig;
  }

  /**
   * Delete a stored avatar configuration.
   */
  delete(userId: string): boolean {
    return this.store.delete(userId);
  }

  /**
   * List all stored user IDs.
   */
  list(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Clone a stored avatar config to a new userId.
   */
  clone(srcUserId: string, destUserId: string): AvatarConfig | null {
    const src = this.load(srcUserId);
    if (!src) return null;
    const cloned: AvatarConfig = {
      ...src,
      userId: destUserId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.save(cloned);
    return cloned;
  }

  /**
   * Number of stored avatars.
   */
  get size(): number {
    return this.store.size;
  }
}
