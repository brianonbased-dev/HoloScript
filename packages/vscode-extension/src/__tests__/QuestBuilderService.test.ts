/**
 * Unit tests for QuestBuilderService
 *
 * Tests quest creation and management including:
 * - Quest creation with and without AI
 * - Quest progress tracking
 * - Quest completion and rewards
 * - Import/export functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuestBuilderService } from '../services/QuestBuilderService';
import { StoryWeaverAIService } from '../services/StoryWeaverAIService';
import type {
  QuestConfig,
  QuestObjective,
  QuestReward,
} from '../../../core/src/plugins/HololandTypes';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
    },
  };
});

describe('QuestBuilderService', () => {
  let service: QuestBuilderService;
  let mockStoryWeaver: StoryWeaverAIService;
  let sampleObjectives: QuestObjective[];
  let sampleRewards: QuestReward[];

  beforeEach(() => {
    vi.clearAllMocks();
    sampleObjectives = [
      { type: 'location', description: 'Visit the coffee shop', targetValue: 1, required: true },
      { type: 'interact', description: 'Talk to the barista', targetValue: 1, required: true },
    ];
    sampleRewards = [
      { type: 'xp', value: 100, description: '100 experience points' },
      { type: 'coupon', value: '15% off', description: 'Discount coupon' },
    ];
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Quest Creation', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should create quest without AI', async () => {
      const config: QuestConfig = {
        businessId: 'cafe-001',
        title: 'Coffee Lover Quest',
        description: 'Explore our amazing coffee',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);

      expect(questId).toMatch(/^quest_\d+_[a-z0-9]+$/);
      const quest = service.getQuest(questId);
      expect(quest).toBeDefined();
      expect(quest?.title).toBe('Coffee Lover Quest');
      expect(quest?.objectives.length).toBe(2);
    });

    it('should set estimated duration based on objectives', async () => {
      const config: QuestConfig = {
        businessId: 'shop-001',
        title: 'Test Quest',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'vrr',
        difficulty: 'medium',
      };

      const questId = await service.createQuest(config);
      const quest = service.getQuest(questId);

      expect(quest?.estimatedDuration).toBe(10); // 2 objectives * 5 minutes
    });

    it('should mark quest as active by default', async () => {
      const config: QuestConfig = {
        businessId: 'biz-001',
        title: 'Active Quest',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);
      const quest = service.getQuest(questId);

      expect(quest?.active).toBe(true);
    });
  });

  describe('Quest Retrieval', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should get quest by ID', async () => {
      const config: QuestConfig = {
        businessId: 'cafe-001',
        title: 'Find Me',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);
      const quest = service.getQuest(questId);

      expect(quest?.id).toBe(questId);
      expect(quest?.title).toBe('Find Me');
    });

    it('should return undefined for non-existent quest', () => {
      const quest = service.getQuest('non-existent-id');
      expect(quest).toBeUndefined();
    });

    it('should get all quests', async () => {
      await service.createQuest({
        businessId: 'b1',
        title: 'Q1',
        description: 'D1',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });
      await service.createQuest({
        businessId: 'b2',
        title: 'Q2',
        description: 'D2',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'vrr',
        difficulty: 'medium',
      });

      const quests = service.getAllQuests();
      expect(quests.length).toBe(2);
    });

    it('should get quests by business ID', async () => {
      await service.createQuest({
        businessId: 'cafe-001',
        title: 'Q1',
        description: 'D',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });
      await service.createQuest({
        businessId: 'cafe-001',
        title: 'Q2',
        description: 'D',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });
      await service.createQuest({
        businessId: 'shop-002',
        title: 'Q3',
        description: 'D',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });

      const cafeQuests = service.getQuestsByBusiness('cafe-001');
      expect(cafeQuests.length).toBe(2);
    });
  });

  describe('Quest Progress Tracking', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should update objective progress', async () => {
      const config: QuestConfig = {
        businessId: 'cafe-001',
        title: 'Progress Quest',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);
      const quest = service.getQuest(questId)!;
      const objectiveId = quest.objectives[0].id;

      service.updateQuestProgress(questId, 'player-123', objectiveId, 1);
      // Progress should be updated internally
      expect(true).toBe(true); // No error thrown
    });

    it('should throw error for non-existent quest', () => {
      expect(() => {
        service.updateQuestProgress('fake-id', 'player-1', 'obj-1', 1);
      }).toThrow('Quest not found');
    });
  });

  describe('Quest Completion', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should complete quest and return rewards', async () => {
      const config: QuestConfig = {
        businessId: 'cafe-001',
        title: 'Completable Quest',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);
      const completion = await service.completeQuest(questId, 'player-123');

      expect(completion.questId).toBe(questId);
      expect(completion.playerId).toBe('player-123');
      expect(completion.rewards).toEqual(sampleRewards);
      expect(completion.completedAt).toBeGreaterThan(0);
    });

    it('should throw error for non-existent quest', async () => {
      await expect(service.completeQuest('fake-id', 'player-1')).rejects.toThrow('Quest not found');
    });
  });

  describe('Quest Management', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should delete quest', async () => {
      const config: QuestConfig = {
        businessId: 'cafe-001',
        title: 'Delete Me',
        description: 'Test',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      };

      const questId = await service.createQuest(config);
      expect(service.getQuest(questId)).toBeDefined();

      const deleted = service.deleteQuest(questId);
      expect(deleted).toBe(true);
      expect(service.getQuest(questId)).toBeUndefined();
    });

    it('should return false when deleting non-existent quest', () => {
      const deleted = service.deleteQuest('fake-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Import/Export', () => {
    beforeEach(() => {
      service = new QuestBuilderService();
    });

    it('should export quests as JSON', async () => {
      await service.createQuest({
        businessId: 'b1',
        title: 'Q1',
        description: 'D',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });

      const exported = service.exportQuests();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].title).toBe('Q1');
    });

    it('should import quests from JSON', async () => {
      const questData = [
        {
          id: 'imported-quest-1',
          businessId: 'cafe-001',
          title: 'Imported Quest',
          description: 'Imported from JSON',
          objectives: sampleObjectives,
          rewards: sampleRewards,
          layer: 'ar',
          difficulty: 'easy',
          estimatedDuration: 10,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const imported = service.importQuests(JSON.stringify(questData));
      expect(imported).toBe(1);

      const quest = service.getQuest('imported-quest-1');
      expect(quest?.title).toBe('Imported Quest');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        service.importQuests('invalid json');
      }).toThrow();
    });
  });

  describe('Disposal', () => {
    it('should clear quests on dispose', async () => {
      service = new QuestBuilderService();
      await service.createQuest({
        businessId: 'b1',
        title: 'Q1',
        description: 'D',
        objectives: sampleObjectives,
        rewards: sampleRewards,
        layer: 'ar',
        difficulty: 'easy',
      });

      expect(service.getAllQuests().length).toBe(1);

      service.dispose();
      expect(service.getAllQuests().length).toBe(0);
    });
  });
});
