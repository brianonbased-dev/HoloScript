import { llmConfig } from '../config';
import { z } from 'zod';

export interface QuestParams {
  locationName: string;
  theme: 'cyberpunk' | 'fantasy' | 'historical' | 'mystery';
  difficulty: 'easy' | 'medium' | 'hard';
  poiContext?: string; // Point of interest external context (e.g. coffee shop menu)
}

export interface GeneratedQuest {
  title: string;
  loreDescription: string;
  objectives: { id: string; instruction: string }[];
  npcDialogue: { trigger: string; text: string }[];
  rewardMetadata: { assetId: string; dropRate: number };
}

/**
 * Service to dynamically generate narrative quests anchored to real-world or digital locations.
 * Pipes into BusinessQuestTools.
 */
export class NarrativeQuestService {
  private static instance: NarrativeQuestService;

  public static getInstance(): NarrativeQuestService {
    if (!NarrativeQuestService.instance) {
      NarrativeQuestService.instance = new NarrativeQuestService();
    }
    return NarrativeQuestService.instance;
  }

  /**
   * Generates a fully fleshed out quest narrative for an agent or player.
   */
  public async generateQuestNarrative(params: QuestParams): Promise<GeneratedQuest> {
    // In a prod environment, this hits the LLM provider.
    // For the ecosystem mock, we generate deterministic high-quality stubs based on params.
    
    const isCyberpunk = params.theme === 'cyberpunk';
    
    return {
      title: `${isCyberpunk ? 'Neon' : 'Ancient'} Shadows over ${params.locationName}`,
      loreDescription: `The local nodes at ${params.locationName} have been disrupted. ${params.poiContext ? 'Rumor has it the issue started near the ' + params.poiContext : ''}. Restore the flow before the system collapses.`,
      objectives: [
        { id: 'obj1', instruction: 'Scan the perimeter for temporal anomalies.' },
        { id: 'obj2', instruction: `Extract the data drive hidden within ${params.locationName}.` }
      ],
      npcDialogue: [
        { trigger: 'onApproach', text: `You shouldn't be here. The firewall is unstable.` },
        { trigger: 'onSuccess', text: `Data secured. Transferring credits.` }
      ],
      rewardMetadata: {
        assetId: `reward_${Date.now()}`,
        dropRate: params.difficulty === 'hard' ? 0.05 : 0.25
      }
    };
  }
}

export function getNarrativeQuestService(): NarrativeQuestService {
  return NarrativeQuestService.getInstance();
}
