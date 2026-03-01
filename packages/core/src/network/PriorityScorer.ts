import { StateDelta } from './DeltaCompressor';

export interface ScoredDelta extends StateDelta {
    priority: number; // 0 (Critical) to 100 (Low Priority)
}

/**
 * PriorityScorer
 * 
 * Analyzes state deltas and scores them dynamically to determine
 * if they should be dropped, delayed, or expedited under heavy network load.
 */
export class PriorityScorer {
    
    /**
     * Scores a raw delta based on simulated heuristics returning a priority class.
     * Lower is more important.
     */
    static score(delta: StateDelta): ScoredDelta {
        let basePriority = 50; // Medium

        // Saliency heuristics
        // Positional/Transform updates are extremely high priority to prevent physics desync
        if (delta.field === 'x' || delta.field === 'y' || delta.field === 'z') {
            basePriority -= 40; // High Priority (10)
        }
        
        // Critical status effects like health or 'dead' are maximal priority
        if (delta.field === 'health' || delta.field === 'status') {
            basePriority -= 50; // Critical Priority (0)
        }

        // Cosmetic or string-heavy updates are lower priority
        if (typeof delta.newValue === 'string' && delta.newValue.length > 50) {
            basePriority += 30; // Low Priority (80)
        }

        // Clip 0-100
        basePriority = Math.max(0, Math.min(100, basePriority));

        return {
            ...delta,
            priority: basePriority
        };
    }
}
