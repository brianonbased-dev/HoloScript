/**
 * @fileoverview Business Quest Tools
 * @module @holoscript/partner-sdk
 *
 * PURPOSE:
 * Provides the partner SDK class `BusinessQuestTools` that enables physical businesses
 * to create, configure, and bind geo-anchored quests inside the VRR digital twin.
 */

import { getNarrativeQuestService, type QuestParams } from '@holoscript/llm-provider';

export interface QuestReward {
  type: 'x402_coupon' | 'nft' | 'in_game_item';
  value: string;
  redeem_irl: boolean;
}

export interface BusinessQuestStep {
  trigger: 'ar_scan' | 'vrr_hunt' | 'vr_taste' | 'geo_arrival';
  metadata: Record<string, any>;
}

export interface BusinessQuestConfig {
  quest_id: string;
  business_id: string;
  title: string;
  description: string;
  steps: BusinessQuestStep[];
  rewards: QuestReward[];
  geo_anchor?: { lat: number; lng: number };
}

export class BusinessQuestTools {
  private apiEndpoint: string;
  private apiKey: string;

  constructor(apiKey: string, apiEndpoint: string = 'https://api.hololand.io/quests') {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
  }

  /**
   * Generates a new template configuration for a local business quest
   * @param config The predefined parameters for the quest
   */
  createQuestTemplate(config: BusinessQuestConfig): string {
    return JSON.stringify({
      version: '1.0',
      ...config,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Registers a newly formulated quest with the Hololand Agent Economy
   * which delegates AI agents (story weavers) to populate the quest details.
   */
  async deployQuest(
    config: BusinessQuestConfig,
    injectNarrative = false
  ): Promise<{ success: boolean; url: string }> {
    try {
      const finalConfig = { ...config };

      if (injectNarrative) {
        const narrativeSvc = getNarrativeQuestService();
        const p: QuestParams = {
          locationName: config.title,
          theme: 'mystery',
          difficulty: 'medium',
          poiContext: config.description,
        };
        const story = await narrativeSvc.generateQuestNarrative(p);
        finalConfig.description = story.loreDescription;
      }

      const payload = this.createQuestTemplate(finalConfig);

      const response = await fetch(`${this.apiEndpoint}/deploy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`Deployment failed: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, url: data.quest_url };
    } catch (err) {
      console.error('[BusinessQuestTools] Failed to deploy quest:', err);
      return { success: false, url: '' };
    }
  }

  /**
   * Helper function to generate an AST HoloScript snippet for building the
   * twin's Quest Hub declaratively.
   */
  generateHoloScriptSnippet(config: BusinessQuestConfig): string {
    const geo = config.geo_anchor;
    return `
      object "${config.quest_id}" @quest_hub {
        title: "${config.title}"
        description: "${config.description}"
        ${geo ? `geo_coords: { lat: ${geo.lat}, lng: ${geo.lng} }` : ''}
        
        events {
          on "quest_start" {
            spawn_agent "${config.business_id}_concierge"
          }
        }
      }
    `;
  }
}

export default BusinessQuestTools;
