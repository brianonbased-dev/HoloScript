/**
 * Story Weaver Protocol — AI quest & narrative generation (HTTP)
 *
 * Zod-validated JSON bodies with Business VRR context, theme, and difficulty.
 * Production uses @holoscript/llm-provider NarrativeQuestService; tests can inject overrides.
 */

import type http from 'http';
import { z } from 'zod';
import { getNarrativeQuestService, type GeneratedQuest, type QuestParams } from '@holoscript/llm-provider';
import { json, parseJsonBody } from '../utils';
import { requireAuth } from '../auth-utils';

// ── Zod — request schemas ─────────────────────────────────────────────────

export const storyWeaverVrrBusinessSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().optional(),
  geo: z.object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
});

export const storyWeaverVrrContextSchema = z.object({
  compositionName: z.string().min(1),
  twinMirrorId: z.string().min(1),
  businesses: z.array(storyWeaverVrrBusinessSchema).min(1),
});

export const storyWeaverQuestNarrativeRequestSchema = z.object({
  vrrContext: storyWeaverVrrContextSchema,
  theme: z.string().min(1).max(240),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  locale: z.string().max(32).optional(),
});

export const storyWeaverNarrativeTextRequestSchema = z.object({
  vrrContext: storyWeaverVrrContextSchema,
  theme: z.string().min(1).max(240),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  focus: z.enum(['intro', 'rising', 'climax', 'resolution']).optional(),
});

export type StoryWeaverQuestNarrativeRequest = z.infer<typeof storyWeaverQuestNarrativeRequestSchema>;
export type StoryWeaverNarrativeTextRequest = z.infer<typeof storyWeaverNarrativeTextRequestSchema>;

// ── Test hooks (vitest) ───────────────────────────────────────────────────

export type QuestNarrativeGenerator = (input: StoryWeaverQuestNarrativeRequest) => Promise<GeneratedQuest>;
export type StoryTextGenerator = (input: StoryWeaverNarrativeTextRequest) => Promise<{
  narrative: string;
  beats: string[];
}>;

let questNarrativeOverride: QuestNarrativeGenerator | null = null;
let storyTextOverride: StoryTextGenerator | null = null;

/** @internal */
export function __setQuestNarrativeGeneratorForTests(fn: QuestNarrativeGenerator | null): void {
  questNarrativeOverride = fn;
}

/** @internal */
export function __setStoryTextGeneratorForTests(fn: StoryTextGenerator | null): void {
  storyTextOverride = fn;
}

function mapThemeToQuestParams(theme: string): QuestParams['theme'] {
  const t = theme.toLowerCase();
  if (t.includes('cyber') || t.includes('neon')) return 'cyberpunk';
  if (t.includes('fantasy') || t.includes('magic') || t.includes('dragon')) return 'fantasy';
  if (t.includes('hist') || t.includes('ancient')) return 'historical';
  return 'mystery';
}

/**
 * Generate a structured quest narrative from validated Story Weaver input.
 */
export async function generateQuestNarrativeFromContext(
  input: StoryWeaverQuestNarrativeRequest
): Promise<GeneratedQuest> {
  if (questNarrativeOverride) {
    return questNarrativeOverride(input);
  }
  const svc = getNarrativeQuestService();
  const first = input.vrrContext.businesses[0]!;
  const poi = `${first.displayName ?? first.id} @ ${first.geo.lat.toFixed(4)},${first.geo.lng.toFixed(4)}`;
  return svc.generateQuestNarrative({
    locationName: input.vrrContext.compositionName,
    theme: mapThemeToQuestParams(input.theme),
    difficulty: input.difficulty,
    poiContext: poi,
  });
}

/**
 * Generate prose narrative + beat list (deterministic unless storyTextOverride is set).
 */
export async function generateStoryTextFromContext(
  input: StoryWeaverNarrativeTextRequest
): Promise<{ narrative: string; beats: string[]; meta: { theme: string; difficulty: string; focus: string } }> {
  if (storyTextOverride) {
    const r = await storyTextOverride(input);
    return {
      ...r,
      meta: {
        theme: input.theme,
        difficulty: input.difficulty,
        focus: input.focus ?? 'intro',
      },
    };
  }
  const focus = input.focus ?? 'intro';
  const biz = input.vrrContext.businesses[0]!;
  const label = biz.displayName ?? biz.id;
  const narrative = [
    `In ${input.vrrContext.compositionName}, the VRR twin “${input.vrrContext.twinMirrorId}” frames ${label} in a ${input.theme} register.`,
    `Difficulty: ${input.difficulty}. Beat focus: ${focus}.`,
    `Players move between AR scan hooks and the mirrored storefront, chasing clues tied to ${label}'s geo anchor.`,
  ].join(' ');
  const beats = [
    `${focus}: arrive at ${label}`,
    `Tension (${input.difficulty}): sync with twin mirror`,
    'Climax: reveal the hidden reward',
    'Resolution: coupon or NFT grant',
  ];
  return { narrative, beats, meta: { theme: input.theme, difficulty: input.difficulty, focus } };
}

// ── HTTP ───────────────────────────────────────────────────────────────────

export async function handleStoryWeaverGenerationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  if (pathname === '/api/holomesh/storyweaver/generate/quest-narrative' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const parsed = storyWeaverQuestNarrativeRequestSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: 'Invalid request body', details: parsed.error.flatten() });
      return true;
    }

    try {
      const quest = await generateQuestNarrativeFromContext(parsed.data);
      json(res, 200, {
        success: true,
        protocol: 'story-weaver-v1',
        quest,
        requestEcho: {
          theme: parsed.data.theme,
          difficulty: parsed.data.difficulty,
          compositionName: parsed.data.vrrContext.compositionName,
        },
      });
    } catch (err) {
      json(res, 500, {
        error: 'Quest narrative generation failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === '/api/holomesh/storyweaver/generate/narrative' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const parsed = storyWeaverNarrativeTextRequestSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: 'Invalid request body', details: parsed.error.flatten() });
      return true;
    }

    try {
      const result = await generateStoryTextFromContext(parsed.data);
      json(res, 200, {
        success: true,
        protocol: 'story-weaver-v1',
        ...result,
      });
    } catch (err) {
      json(res, 500, {
        error: 'Narrative generation failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  return false;
}
