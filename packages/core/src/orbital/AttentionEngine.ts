/**
 * AttentionEngine
 *
 * Implements a heuristic-driven spatial culling and attention
 * scoring system to avoid O(N^2) perception processing.
 */

export interface AttendedEntity {
  id: string;
  position: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  saliencyBase?: number; // Pre-assigned visual/semantic weight
}

export interface AttentionScore {
  entityId: string;
  weight: number; // 0.0 to 1.0
}

export class AttentionEngine {
  /**
   * Calculates the attention weight of a target entity relative to an observer.
   * Incorporates 4 factors: Proximity, Movement, Base Saliency, and Recency (mocked).
   */
  static calculateWeight(
    observerPos: { x: number; y: number; z: number },
    target: AttendedEntity
  ): number {
    // 1. Proximity (Inverse squared distance approximation)
    const dx = target.position.x - observerPos.x;
    const dy = target.position.y - observerPos.y;
    const dz = target.position.z - observerPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Closer than 2 units is max proximity weight (1.0). Fades out to 0 at ~100 units.
    const proximityWeight = Math.max(0, 1.0 - distSq / 10000);

    // 2. Movement (Kinematic attention)
    let movementWeight = 0;
    if (target.velocity) {
      const speedSq = target.velocity.x ** 2 + target.velocity.y ** 2 + target.velocity.z ** 2;
      movementWeight = Math.min(1.0, speedSq / 100); // Caps out at high speeds
    }

    // 3. Base Saliency (Bright colors, explosions, VIP tags)
    const saliencyWeight = target.saliencyBase || 0.1;

    // 4. Recency (Mocked for temporal freshness)
    const recencyWeight = 0.5; // Baseline

    // Composite Score (Heavily biased towards proximity and movement)
    const total =
      proximityWeight * 0.5 + movementWeight * 0.3 + saliencyWeight * 0.1 + recencyWeight * 0.1;

    return Math.min(1.0, Math.max(0.0, total));
  }

  /**
   * Filters a massive array of entities down to strictly the top K most attended
   * objects around the observer to save inference/rendering payload.
   */
  static getTopKEntities(
    observerPos: { x: number; y: number; z: number },
    entities: AttendedEntity[],
    k: number
  ): string[] {
    if (entities.length <= k) return entities.map((e) => e.id);

    const scores: AttentionScore[] = entities.map((e) => ({
      entityId: e.id,
      weight: this.calculateWeight(observerPos, e),
    }));

    // Sort descending by weight
    scores.sort((a, b) => b.weight - a.weight);

    // Return top K ids
    return scores.slice(0, k).map((s) => s.entityId);
  }
}
