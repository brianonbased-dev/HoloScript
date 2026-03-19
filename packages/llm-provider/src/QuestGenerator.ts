/**
 * @fileoverview Quest Generator
 * @module @holoscript/llm-provider
 *
 * PURPOSE:
 * Uses configured LLMs to dynamically generate business quest narratives, NPC
 * dialogues, and localized hooks based on a business's geo-anchor context.
 */

import { LLMProviderManager } from './provider-manager';

export interface QuestNarrativeRequest {
  business_name: string;
  business_type: string;
  location: string;
  theme?: string;
  target_audience?: string;
}

export interface QuestNarrativeResponse {
  title: string;
  description: string;
  npc_greeting: string;
  success_message: string;
}

export class QuestGenerator {
  private llmManager: LLMProviderManager;

  constructor(manager: LLMProviderManager) {
    this.llmManager = manager;
  }

  /**
   * Generates a complete narrative suite for a new Business Quest
   * @param request The parameters for the business and location
   */
  async generateQuestNarrative(request: QuestNarrativeRequest): Promise<QuestNarrativeResponse> {
    const prompt = `
      You are an expert game designer architecting mixed-reality quests.
      Generate a compelling, short, engaging quest for a real-world business in Hololand.
      
      Business Name: ${request.business_name}
      Business Type: ${request.business_type}
      Location: ${request.location}
      Theme: ${request.theme || 'modern adventure'}
      
      Output exactly and only a valid JSON response with the following keys:
      - title: A catchy quest title (max 5 words)
      - description: A short hook explaining what the user must do (max 2 sentences)
      - npc_greeting: What the digital twin NPC says when the user starts the quest
      - success_message: The message shown when the quest is completed
    `;

    try {
      const completion = await this.llmManager.complete({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 500,
      });

      // Simple extraction of JSON from Markdown blocks if present
      let content = completion.content;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        content = jsonMatch[1];
      }

      const parsed = JSON.parse(content);
      return {
        title: parsed.title || `${request.business_name} Quest`,
        description: parsed.description || 'Discover the secrets of the digital twin.',
        npc_greeting: parsed.npc_greeting || 'Welcome, traveler!',
        success_message: parsed.success_message || 'Quest Complete!',
      };
    } catch (err) {
      console.error('[QuestGenerator] Failed to generate narrative:', err);
      // Fallback
      return {
        title: `${request.business_name} Discovery`,
        description: `Explore the ${request.location} digital twin for rewards!`,
        npc_greeting: `Welcome to ${request.business_name}. We need your help!`,
        success_message: `You did it! Here is your reward.`,
      };
    }
  }
}

export default QuestGenerator;
