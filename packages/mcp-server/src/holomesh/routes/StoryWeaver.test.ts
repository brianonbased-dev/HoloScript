import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type http from 'http';
import {
  storyWeaverQuestNarrativeRequestSchema,
  storyWeaverNarrativeTextRequestSchema,
  generateQuestNarrativeFromContext,
  generateStoryTextFromContext,
  __setQuestNarrativeGeneratorForTests,
  __setStoryTextGeneratorForTests,
  handleStoryWeaverGenerationRoutes,
} from './storyweaver-generation-routes';
import type { GeneratedQuest } from '@holoscript/llm-provider';

const sampleVrr = {
  compositionName: 'DemoVRR',
  twinMirrorId: 'mirror_1',
  businesses: [{ id: 'cafe', displayName: 'Neon Cafe', geo: { lat: 33.44, lng: -112.07 } }],
};

const validQuestReq = {
  vrrContext: sampleVrr,
  theme: 'neon mystery',
  difficulty: 'medium' as const,
};

describe('Story Weaver generation', () => {
  beforeEach(() => {
    __setQuestNarrativeGeneratorForTests(null);
    __setStoryTextGeneratorForTests(null);
  });

  afterEach(() => {
    __setQuestNarrativeGeneratorForTests(null);
    __setStoryTextGeneratorForTests(null);
  });

  it('validates quest narrative request with Zod', () => {
    const ok = storyWeaverQuestNarrativeRequestSchema.safeParse(validQuestReq);
    expect(ok.success).toBe(true);
    const bad = storyWeaverQuestNarrativeRequestSchema.safeParse({
      ...validQuestReq,
      difficulty: 'extreme',
    });
    expect(bad.success).toBe(false);
  });

  it('validates narrative text request with Zod', () => {
    const ok = storyWeaverNarrativeTextRequestSchema.safeParse({
      vrrContext: sampleVrr,
      theme: 'noir',
      difficulty: 'hard',
      focus: 'climax',
    });
    expect(ok.success).toBe(true);
  });

  it('generateQuestNarrativeFromContext uses mocked LLM output', async () => {
    const mockQuest: GeneratedQuest = {
      title: 'Mock Latte Hunt',
      loreDescription: 'Find the beans.',
      objectives: [{ id: 'o1', instruction: 'Scan the counter' }],
      npcDialogue: [{ trigger: 'start', text: 'Hi' }],
      rewardMetadata: { assetId: 'r1', dropRate: 0.2 },
    };
    __setQuestNarrativeGeneratorForTests(async () => mockQuest);

    const out = await generateQuestNarrativeFromContext(
      storyWeaverQuestNarrativeRequestSchema.parse(validQuestReq)
    );
    expect(out.title).toBe('Mock Latte Hunt');
    expect(out.objectives).toHaveLength(1);
  });

  it('generateStoryTextFromContext uses mocked prose', async () => {
    __setStoryTextGeneratorForTests(async () => ({
      narrative: 'Custom LLM paragraph.',
      beats: ['a', 'b', 'c'],
    }));

    const out = await generateStoryTextFromContext(
      storyWeaverNarrativeTextRequestSchema.parse({
        vrrContext: sampleVrr,
        theme: 'noir',
        difficulty: 'easy',
      })
    );
    expect(out.narrative).toContain('Custom LLM');
    expect(out.beats).toHaveLength(3);
  });

  it('POST /generate/quest-narrative returns mocked quest with auth', async () => {
    const prev = process.env.HOLOMESH_API_KEY;
    process.env.HOLOMESH_API_KEY = 'storyweaver-test-key';

    const mockQuest: GeneratedQuest = {
      title: 'HTTP Mock Quest',
      loreDescription: 'Lore',
      objectives: [],
      npcDialogue: [],
      rewardMetadata: { assetId: 'x', dropRate: 0.1 },
    };
    __setQuestNarrativeGeneratorForTests(async () => mockQuest);

    const req = new EventEmitter() as http.IncomingMessage;
    req.method = 'POST';
    req.headers = { authorization: 'Bearer storyweaver-test-key' };

    let status = 0;
    let body = '';
    const res = {
      writeHead(s: number) {
        status = s;
      },
      end(d: string) {
        body = d;
      },
    } as unknown as http.ServerResponse;

    const p = handleStoryWeaverGenerationRoutes(
      req,
      res,
      '/api/holomesh/storyweaver/generate/quest-narrative',
      'POST',
      'http://localhost/api/holomesh/storyweaver/generate/quest-narrative'
    );

    setImmediate(() => {
      req.emit('data', Buffer.from(JSON.stringify(validQuestReq)));
      req.emit('end');
    });

    await p;
    expect(status).toBe(200);
    const json = JSON.parse(body) as { success: boolean; quest: GeneratedQuest };
    expect(json.success).toBe(true);
    expect(json.quest.title).toBe('HTTP Mock Quest');

    if (prev === undefined) delete process.env.HOLOMESH_API_KEY;
    else process.env.HOLOMESH_API_KEY = prev;
  });
});
