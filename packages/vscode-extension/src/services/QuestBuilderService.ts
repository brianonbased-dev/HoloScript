/**
 * QuestBuilderService — Business quest creation and management
 *
 * Provides no-code quest builder functionality for creating AR/VRR/VR
 * quests with objectives, rewards, and AI-generated narratives.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type {
  QuestDefinition,
  QuestConfig,
  QuestProgress,
  QuestCompletion,
  QuestObjective,
  QuestReward,
} from '../../../core/src/plugins/HololandTypes';
import { StoryWeaverAIService } from './StoryWeaverAIService';

export class QuestBuilderService {
  private outputChannel: vscode.OutputChannel;
  private quests: Map<string, QuestDefinition> = new Map();
  private questProgress: Map<string, QuestProgress[]> = new Map();
  private storyWeaverService?: StoryWeaverAIService;

  constructor(storyWeaverService?: StoryWeaverAIService) {
    this.outputChannel = vscode.window.createOutputChannel('Quest Builder');
    this.storyWeaverService = storyWeaverService;
  }

  /**
   * Create a new quest
   */
  async createQuest(config: QuestConfig): Promise<string> {
    this.outputChannel.appendLine(`Creating quest: ${config.title}`);

    const questId = `quest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Generate AI narrative if requested
    let narrative: string | undefined = config.description;
    if (config.aiGenerate && this.storyWeaverService) {
      this.outputChannel.appendLine('Generating AI narrative...');
      try {
        const aiQuest = await this.storyWeaverService.generateQuest(
          config.businessId,
          config.difficulty
        );
        narrative = aiQuest.narrative;
      } catch (error) {
        this.outputChannel.appendLine(`AI generation failed: ${error}`);
        vscode.window.showWarningMessage(
          'AI generation failed. Using provided description.'
        );
      }
    }

    const quest: QuestDefinition = {
      id: questId,
      businessId: config.businessId,
      title: config.title,
      description: config.description,
      narrative,
      objectives: config.objectives.map((obj, idx) => ({
        id: `${questId}_obj${idx}`,
        ...obj,
      })),
      rewards: config.rewards,
      layer: config.layer,
      difficulty: config.difficulty,
      estimatedDuration: this.estimateDuration(config.objectives.length),
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.quests.set(questId, quest);
    this.outputChannel.appendLine(`✅ Quest created: ${questId}`);

    vscode.window.showInformationMessage(
      `Quest "${config.title}" created successfully`,
      'View Quest'
    ).then((action) => {
      if (action === 'View Quest') {
        this.showQuestDetails(questId);
      }
    });

    return questId;
  }

  /**
   * Get quest by ID
   */
  getQuest(questId: string): QuestDefinition | undefined {
    return this.quests.get(questId);
  }

  /**
   * Get all quests
   */
  getAllQuests(): QuestDefinition[] {
    return Array.from(this.quests.values());
  }

  /**
   * Get quests by business ID
   */
  getQuestsByBusiness(businessId: string): QuestDefinition[] {
    return Array.from(this.quests.values()).filter(
      (q) => q.businessId === businessId
    );
  }

  /**
   * Update quest progress for a player
   */
  updateQuestProgress(
    questId: string,
    playerId: string,
    objectiveId: string,
    progress: number
  ): void {
    const quest = this.quests.get(questId);
    if (!quest) {
      throw new Error(`Quest not found: ${questId}`);
    }

    // Find or create progress entry
    let progressEntries = this.questProgress.get(questId) || [];
    let playerProgress = progressEntries.find((p) => p.playerId === playerId);

    if (!playerProgress) {
      playerProgress = {
        questId,
        playerId,
        status: 'in_progress',
        objectiveProgress: {},
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };
      progressEntries.push(playerProgress);
      this.questProgress.set(questId, progressEntries);
    }

    // Update objective progress
    playerProgress.objectiveProgress[objectiveId] = progress;
    playerProgress.lastUpdatedAt = Date.now();

    // Check if quest is completed
    if (this.isQuestCompleted(quest, playerProgress)) {
      playerProgress.status = 'completed';
      playerProgress.completedAt = Date.now();
      this.outputChannel.appendLine(
        `Quest completed by player ${playerId}: ${quest.title}`
      );
    }

    this.outputChannel.appendLine(
      `Progress updated: ${questId} - ${objectiveId}: ${progress}`
    );
  }

  /**
   * Complete a quest and distribute rewards
   */
  async completeQuest(questId: string, playerId: string): Promise<QuestCompletion> {
    const quest = this.quests.get(questId);
    if (!quest) {
      throw new Error(`Quest not found: ${questId}`);
    }

    const completion: QuestCompletion = {
      questId,
      playerId,
      completedAt: Date.now(),
      rewards: quest.rewards,
    };

    this.outputChannel.appendLine(
      `Quest completed: ${quest.title} by player ${playerId}`
    );
    this.outputChannel.appendLine(`Rewards: ${JSON.stringify(quest.rewards)}`);

    vscode.window.showInformationMessage(
      `🎉 Quest completed: ${quest.title}!`,
      'View Rewards'
    );

    return completion;
  }

  /**
   * Check if a quest is completed
   */
  private isQuestCompleted(
    quest: QuestDefinition,
    progress: QuestProgress
  ): boolean {
    const requiredObjectives = quest.objectives.filter((obj) => obj.required);

    return requiredObjectives.every((obj) => {
      const currentProgress = progress.objectiveProgress[obj.id] || 0;
      return currentProgress >= obj.targetValue;
    });
  }

  /**
   * Estimate quest duration based on objectives
   */
  private estimateDuration(objectiveCount: number): number {
    // Simple estimation: 5 minutes per objective
    return objectiveCount * 5;
  }

  /**
   * Show quest details in output channel
   */
  showQuestDetails(questId: string): void {
    const quest = this.quests.get(questId);
    if (!quest) {
      vscode.window.showErrorMessage(`Quest not found: ${questId}`);
      return;
    }

    this.outputChannel.show();
    this.outputChannel.appendLine('\n================================');
    this.outputChannel.appendLine(`Quest: ${quest.title}`);
    this.outputChannel.appendLine('================================');
    this.outputChannel.appendLine(`ID: ${quest.id}`);
    this.outputChannel.appendLine(`Business: ${quest.businessId}`);
    this.outputChannel.appendLine(`Layer: ${quest.layer}`);
    this.outputChannel.appendLine(`Difficulty: ${quest.difficulty}`);
    this.outputChannel.appendLine(`Duration: ~${quest.estimatedDuration} minutes`);
    this.outputChannel.appendLine(`Active: ${quest.active}`);
    this.outputChannel.appendLine('\nDescription:');
    this.outputChannel.appendLine(quest.description);
    if (quest.narrative) {
      this.outputChannel.appendLine('\nNarrative:');
      this.outputChannel.appendLine(quest.narrative);
    }
    this.outputChannel.appendLine('\nObjectives:');
    quest.objectives.forEach((obj, idx) => {
      this.outputChannel.appendLine(
        `  ${idx + 1}. [${obj.type}] ${obj.description} ${obj.required ? '(required)' : '(optional)'}`
      );
    });
    this.outputChannel.appendLine('\nRewards:');
    quest.rewards.forEach((reward, idx) => {
      this.outputChannel.appendLine(
        `  ${idx + 1}. ${reward.type}: ${reward.value} - ${reward.description}`
      );
    });
    this.outputChannel.appendLine('================================\n');
  }

  /**
   * Delete a quest
   */
  deleteQuest(questId: string): boolean {
    const deleted = this.quests.delete(questId);
    if (deleted) {
      this.questProgress.delete(questId);
      this.outputChannel.appendLine(`Quest deleted: ${questId}`);
    }
    return deleted;
  }

  /**
   * Export all quests
   */
  exportQuests(): string {
    const quests = Array.from(this.quests.values());
    return JSON.stringify(quests, null, 2);
  }

  /**
   * Import quests from JSON
   */
  importQuests(json: string): number {
    try {
      const quests: QuestDefinition[] = JSON.parse(json);
      let imported = 0;
      for (const quest of quests) {
        this.quests.set(quest.id, quest);
        imported++;
      }
      this.outputChannel.appendLine(`Imported ${imported} quests`);
      return imported;
    } catch (error) {
      this.outputChannel.appendLine(`Import failed: ${error}`);
      throw error;
    }
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.quests.clear();
    this.questProgress.clear();
    this.outputChannel.dispose();
  }
}
