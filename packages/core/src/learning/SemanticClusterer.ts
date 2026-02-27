import { EpisodicEvent } from './MemoryScorer';

/**
 * SemanticClusterer
 * 
 * Compresses raw temporal Episodic buffers into distilled arrays.
 * Native distillation drops repeating trivial structures mapping them into aggregated 
 * density nodes explicitly reducing database storage loads across vector boundaries.
 */
export class SemanticClusterer {

    /**
     * Actively squash sequentially repeating abstract patterns mapping out semantic arrays.
     */
    static distill(events: EpisodicEvent[]): EpisodicEvent[] {
        if (events.length === 0) return [];

        const distilled: EpisodicEvent[] = [];
        let currentSequence: EpisodicEvent = { ...events[0] };
        let repetitonCount = 1;

        for (let i = 1; i < events.length; i++) {
            const ev = events[i];

            // If the Action and Target align, we squash them and increment the density metrics
            if (this.isSimilar(currentSequence, ev)) {
                repetitonCount++;
                currentSequence.outcome = `Repeated action successfully (${repetitonCount} times)`;
                
                // Track total time span passed over the squash boundary
                if (!currentSequence.context.timeSpanStarted) {
                    currentSequence.context.timeSpanStarted = currentSequence.timestamp;
                }
                currentSequence.context.timeSpanEnded = ev.timestamp;
            } else {
                // Similarity broken. Push distilled sequence array and begin anew.
                if (repetitonCount > 1) {
                    currentSequence.action = `${currentSequence.action}_Aggregated`;
                }
                distilled.push({ ...currentSequence });
                
                currentSequence = { ...ev };
                repetitonCount = 1;
            }
        }

        // Push final buffer
        if (repetitonCount > 1) {
            currentSequence.action = `${currentSequence.action}_Aggregated`;
        }
        distilled.push(currentSequence);

        return distilled;
    }

    /**
     * Determines heuristic thresholds to squash logic natively offline without LLM.
     */
    private static isSimilar(a: EpisodicEvent, b: EpisodicEvent): boolean {
        if (a.action !== b.action) return false;
        
        const aTarget = a.context?.target || a.context?.location;
        const bTarget = b.context?.target || b.context?.location;
        
        return aTarget === bTarget;
    }
}
