/**
 * Unit tests for StoryWeaverAIService
 *
 * Tests AI-powered narrative generation including:
 * - Mock narrative generation
 * - Quest generation
 * - Generation history tracking
 * - Configuration management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StoryWeaverAIService } from '../services/StoryWeaverAIService';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      showInformationMessage: vi.fn(),
      withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        update: vi.fn(),
      })),
    },
    ConfigurationTarget: {
      Workspace: 1,
    },
    ProgressLocation: {
      Notification: 15,
    },
  };
});

describe('StoryWeaverAIService', () => {
  let service: StoryWeaverAIService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new StoryWeaverAIService();
      const config = service.getConfig();

      expect(config.provider).toBe('openai');
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(1000);
    });

    it('should create service with custom configuration', () => {
      service = new StoryWeaverAIService({
        provider: 'anthropic',
        model: 'claude-3-opus',
        apiKey: 'test-key',
        temperature: 0.9,
        maxTokens: 2000,
      });

      const config = service.getConfig();
      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-opus');
      expect(config.temperature).toBe(0.9);
      expect(config.maxTokens).toBe(2000);
    });
  });

  describe('Mock Narrative Generation', () => {
    beforeEach(() => {
      service = new StoryWeaverAIService(); // No API key = simulation mode
    });

    it('should generate mock narrative successfully', async () => {
      const narrative = await service.generateNarrative('Create a story', 'Coffee Shop Adventure');

      expect(narrative).toContain('Coffee Shop Adventure');
      expect(narrative.length).toBeGreaterThan(100);
    });

    it('should add narrative to history', async () => {
      await service.generateNarrative('Test prompt', 'Fantasy');

      const history = service.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].theme).toBe('Fantasy');
    });

    it('should track total words generated', async () => {
      await service.generateNarrative('Prompt 1', 'Theme 1');
      await service.generateNarrative('Prompt 2', 'Theme 2');

      const totalWords = service.getTotalWordsGenerated();
      expect(totalWords).toBeGreaterThan(0);
    });
  });

  describe('Quest Generation', () => {
    beforeEach(() => {
      service = new StoryWeaverAIService();
    });

    it('should generate quest with objectives and rewards', async () => {
      const quest = await service.generateQuest('business-123', 'treasure hunt');

      expect(quest.id).toMatch(/^quest_\d+$/);
      expect(quest.title).toContain('treasure hunt');
      expect(quest.objectives.length).toBeGreaterThan(0);
      expect(quest.rewards.length).toBeGreaterThan(0);
      expect(quest.theme).toBe('treasure hunt');
    });

    it('should include narrative in quest', async () => {
      const quest = await service.generateQuest('cafe-001', 'coffee');

      expect(quest.narrative).toBeDefined();
      expect(quest.narrative).toContain('coffee');
    });

    it('should set difficulty and duration', async () => {
      const quest = await service.generateQuest('shop-001', 'adventure');

      expect(quest.difficulty).toBe('medium');
      expect(quest.estimatedDuration).toBe(15);
    });
  });

  describe('Generation History', () => {
    beforeEach(() => {
      service = new StoryWeaverAIService();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should get full history', async () => {
      const gen1 = service.generateNarrative('Prompt 1', 'Theme 1');
      await vi.advanceTimersByTimeAsync(2500);
      await gen1;

      const gen2 = service.generateNarrative('Prompt 2', 'Theme 2');
      await vi.advanceTimersByTimeAsync(2500);
      await gen2;

      const gen3 = service.generateNarrative('Prompt 3', 'Theme 3');
      await vi.advanceTimersByTimeAsync(2500);
      await gen3;

      const history = service.getHistory();
      expect(history.length).toBe(3);
    });

    it('should get limited history', async () => {
      const gen1 = service.generateNarrative('Prompt 1', 'Theme 1');
      await vi.advanceTimersByTimeAsync(2500);
      await gen1;

      const gen2 = service.generateNarrative('Prompt 2', 'Theme 2');
      await vi.advanceTimersByTimeAsync(2500);
      await gen2;

      const gen3 = service.generateNarrative('Prompt 3', 'Theme 3');
      await vi.advanceTimersByTimeAsync(2500);
      await gen3;

      const history = service.getHistory(2);
      expect(history.length).toBe(2);
    });

    it('should clear history', async () => {
      const gen = service.generateNarrative('Prompt', 'Theme');
      await vi.advanceTimersByTimeAsync(2500);
      await gen;

      expect(service.getHistory().length).toBe(1);

      service.clearHistory();
      expect(service.getHistory().length).toBe(0);
    });

    it('should export history as JSON', async () => {
      const gen = service.generateNarrative('Test', 'Adventure');
      await vi.advanceTimersByTimeAsync(2500);
      await gen;

      const exported = service.exportHistory();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      service = new StoryWeaverAIService({ provider: 'openai' });

      service.updateConfig({
        provider: 'anthropic',
        temperature: 0.8,
      });

      const config = service.getConfig();
      expect(config.provider).toBe('anthropic');
      expect(config.temperature).toBe(0.8);
    });
  });

  describe('Simulation Mode Detection', () => {
    it('should be in simulation mode without API key', async () => {
      service = new StoryWeaverAIService();

      // Should not throw, uses mock generation
      const narrative = await service.generateNarrative('Test', 'Theme');
      expect(narrative).toBeDefined();
    });

    it('should use real mode with API key', async () => {
      service = new StoryWeaverAIService({ apiKey: 'test-key' });

      // Should throw since real integration not implemented
      await expect(
        service.generateNarrative('Test', 'Theme')
      ).rejects.toThrow('Real openai integration not yet implemented');
    });
  });

  describe('Disposal', () => {
    it('should clear history on dispose', async () => {
      service = new StoryWeaverAIService();
      await service.generateNarrative('Test', 'Theme');

      service.dispose();
      expect(service.getHistory().length).toBe(0);
    });
  });
});
