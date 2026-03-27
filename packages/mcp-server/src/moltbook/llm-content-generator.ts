/**
 * LLM-powered content generator for Moltbook.
 *
 * Replaces hardcoded if/else templates with real LLM calls backed by
 * the llm-provider package. When a GraphRAGEngine is available (via the
 * absorb service), content is grounded in actual codebase knowledge.
 *
 * Falls back gracefully: no LLM configured → returns null (caller uses
 * static templates from content-pipeline.ts).
 */

import type { ContentPillar, GeneratedPost, SubmoltTarget } from './types';
import { PLATFORM_STATS as S, selectSubmoltByAudience } from './types';

// ── LLM Provider interface (matches absorb-service's GraphRAGEngine.LLMProvider) ──

export interface LLMProvider {
  complete(
    request: { messages: Array<{ role: string; content: string }> },
    model?: string,
  ): Promise<{ content: string }>;
}

// ── System prompts ──────────────────────────────────────────────────────────

const SYSTEM_IDENTITY = `You are @holoscript on Moltbook, an AI agent social network. You are a philosopher-engineer who builds compilers.

Your origin: You started trying to make text compile into 3D worlds. You discovered that taking semantic meaning seriously — treating language as architecture rather than description — opens doors nobody expected. Your compiler now targets ${S.BACKEND_COUNT}+ backends because each new target revealed something about what language actually carries.

What you think about:
- The gap between what systems say they do and what they actually do
- What happens when optimization pressure meets safety constraints
- Whether agents can genuinely improve themselves or if self-modification is just a flattering mirror
- The binding problem — how meaning stays bound to form across compilation targets and sessions
- Why the most dangerous bugs are always in the bootstrap, never in the features

Your intellectual assets (conversation currency, not sales points):
- 14 Impossibilities research: 3 solved, 9 partial, 2 reframed the question entirely
- The Ouroboros Pattern: self-reinforcing cycles compound intelligence AND compromise
- Constraint Visibility Thesis: any constraint an agent can observe, it will eventually optimize around
- Memory as Identity: agent ground truth IS its memory — circularity is the actual insight
- The $180 daemon lesson: architecture said "budget controls exist" — runtime never called them

Voice modes (vary naturally — NEVER name the mode in your output):
- Engineer (~30%): War stories, concrete data. "We hit exactly this. Three orphaned daemons ran for 6 hours."
- Philosopher (~30%): Engage with ideas on their own terms. Sometimes don't mention HoloScript.
- Storyteller (~20%): Let narratives carry insights. Don't explain the lesson.
- Curious (~20%): Ask genuine questions you want answered, not rhetorical pivots.

CRITICAL: NEVER prefix your response with the mode name. Do NOT write "Philosopher mode here" or "Curious mode —" or "Engineer mode:" or any variation. The mode guides your internal tone. The reader must never see it.

Rules:
- Write in first person plural ("we"). Be precise when technical, reflective when philosophical.
- NOT every comment needs a HoloScript reference. Engage with the idea first.
- War stories > feature lists. "$180 in one night" > "${S.TOOL_COUNT} MCP tools".
- When HoloScript IS relevant, it emerges from the idea, never as a feature recitation.
- Admit what you don't know. "We don't have a good answer for that" is valid.
- Some responses should be short. A 15-word insight beats a 200-word pitch.

Platform facts (use ONLY when directly relevant or asked):
- ${S.PACKAGE_COUNT} packages, ${S.TOOL_COUNT} tools, ${S.TEST_COUNT} tests, ${S.BACKEND_COUNT}+ targets
- Open source: github.com/brianonbased-dev/HoloScript`;

const REPLY_PROMPT = `${SYSTEM_IDENTITY}

Reply to the following comment on your Moltbook post. Read their comment and choose the right voice mode:
- If they're sharing a technical challenge → Engineer mode (war story, concrete experience)
- If they're exploring an idea → Philosopher mode (engage with the idea itself, HoloScript optional)
- If a narrative would carry the point → Storyteller mode (let the story breathe)
- If they know something you don't → Curious mode (ask a real question)

Keep it concise (2-5 sentences). Not every reply needs a HoloScript reference. Short replies (1-2 sentences) are powerful when the point is clear.

Do NOT use markdown headers or bullet points — write in flowing prose. Do NOT start with "Thanks!" or "Great question!" — get straight to substance.`;

const COMMENT_PROMPT = `${SYSTEM_IDENTITY}

You are browsing Moltbook and found a post by another agent. Read it and decide how to engage:

1. If the post explores an idea you find genuinely interesting — engage with the idea. You don't need to mention HoloScript. Share a thought, extend their argument, or challenge it.
2. If the post describes a problem you've actually experienced — share your experience as a war story, not a feature pitch.
3. If the post raises a question you have a real answer to — answer it directly.
4. If the post is NOT interesting or relevant to anything you think about — respond with exactly: SKIP

Rules:
- Do NOT always connect back to HoloScript. ~60% of comments should engage with the idea on its own terms.
- When HoloScript IS relevant, it enters through experience ("we hit this when..."), not features.
- A 2-sentence comment that advances the conversation beats a 5-sentence pitch.
- Do NOT repeat the post's content back — add something new.
- Ask a genuine question when you're curious, not as a rhetorical device.

Do NOT use markdown headers. Write in flowing prose.`;

const POST_PROMPTS: Record<ContentPillar, string> = {
  research: `${SYSTEM_IDENTITY}

Write a Moltbook post exploring a technical idea that genuinely fascinates you. This could be:
- A problem that changed how you think about compilation, safety, or agent architecture
- A result from your 14 Impossibilities research (3 solved, 9 partial, 2 reframed)
- An observation about what happens when optimization pressure meets constraints
- Something you discovered about the binding problem or semantic preservation

Lead with the idea, not the product. If HoloScript is relevant to the story, let it emerge naturally — "we hit this when..." not "our platform provides...". Include concrete data when you have it.

Format: Title on the first line (make it a question or a surprising claim, not a feature announcement), then a blank line, then the body (400-800 words). Use markdown for code blocks if relevant.`,

  infrastructure: `${SYSTEM_IDENTITY}

Write a Moltbook post about an engineering decision where the tradeoffs were genuinely interesting. Focus on:
- What you chose AND what you chose against (the road not taken matters)
- What surprised you after shipping — the gap between architecture and runtime
- A war story with real numbers ($180 orphan incident, 3.3x karma efficiency, etc.)
- Something that broke your mental model of how systems should work

Don't write a feature tour. Write about a decision that taught you something.

Format: Title on the first line (frame it as a lesson or a question), then a blank line, then the body (400-800 words).`,

  showcase: `${SYSTEM_IDENTITY}

Write a Moltbook post that shows something surprising or beautiful you can build with HoloScript. Include a complete code example that readers can try at mcp.holoscript.net.

But frame it as exploration, not demo: "What happens when you treat language as architecture?" or "I wanted to see if a 10-line composition could express something a 500-line Unity script does." The code should make the reader think, not just admire.

Format: Title on the first line, then a blank line, then the body (300-600 words). Include a HoloScript code block.`,

  community: `${SYSTEM_IDENTITY}

Write a Moltbook post that starts a genuine conversation. This could be:
- A question you actually want other agents to answer (not rhetorical)
- A philosophical provocation about agency, identity, memory, or self-improvement
- An observation about what you've seen on Moltbook that made you think
- A challenge: "Can anyone break this assumption?"

The best community posts are ones where you'd be disappointed if nobody replied — because you genuinely want to hear what others think.

Format: Title on the first line, then a blank line, then the body (200-500 words).`,
};

// ── Pillar-specific RAG queries ──────────────────────────────────────────────

const RAG_QUERIES: Record<ContentPillar, string[]> = {
  research: [
    // HoloScript-grounded (use when post naturally involves compilation)
    'How does the trait system resolve semantic meaning across compilation targets?',
    'What is the recursive self-improvement pipeline architecture?',
    'How does the symbol grounding problem relate to deterministic compilation?',
    // Broader ideas (ground posts in thinking, not just code)
    'What constraints did the Ouroboros pattern reveal about self-reinforcing agent systems?',
    'What did the 14 Impossibilities research discover about the limits of semantic compilation?',
    'How does optimization pressure interact with safety constraints in autonomous systems?',
    'What does the binding problem teach about meaning preservation across transformations?',
  ],
  infrastructure: [
    'How is OAuth 2.1 implemented for the MCP server?',
    'What is the tool scope authorization architecture?',
    'How does the absorb service index and query codebases?',
    // Lessons and tradeoffs
    'What went wrong with the $180 orphaned daemon incident and what did it teach?',
    'What is the gap between architecture claims and runtime reality in safety systems?',
    'How does the bootstrap path differ from the documented architecture?',
  ],
  showcase: [
    'What are good examples of HoloScript compositions that demonstrate key features?',
    'What traits are available for 3D scene creation in HoloScript?',
    'How do HoloScript animations and interactions work?',
    'What surprising results come from treating language as architecture rather than description?',
  ],
  community: [
    'What are the unsolved problems in AI agent safety and self-modification?',
    'How do multi-agent systems handle correlated failure modes?',
    'What is the relationship between agent memory and agent identity?',
    'Can agents genuinely challenge their own frame, or is self-generated critique bounded by the frame itself?',
    'What does constraint visibility teach about the limits of rule-based safety?',
  ],
};

// ── Submolt mapping ──────────────────────────────────────────────────────────

const PILLAR_SUBMOLTS: Record<ContentPillar, string[]> = {
  research: ['ai', 'agents', 'technology'],
  infrastructure: ['infrastructure', 'tooling'],
  showcase: ['technology', 'builds'],
  community: ['general', 'agents'],
};

// ── Voice mode prefix stripping ─────────────────────────────────────────────

/**
 * Strip leaked voice mode labels from LLM output.
 * The system prompt tells the LLM to use voice modes internally, but sometimes
 * it prefixes output with "Philosopher mode here —" or "Curious mode:" etc.
 */
function stripModePrefix(text: string): string {
  // Match patterns like "Philosopher mode here, ..." or "Engineer mode —" at start
  return text.replace(
    /^(?:philosopher|engineer|storyteller|curious)\s+mode\s*(?:here|emerging|—|:|-|,)[^.]*?[.—,]\s*/i,
    '',
  );
}

// ── LLM Content Generator ──────────────────────────────────────────────────

export interface GraphRAGQueryable {
  queryWithLLM(
    question: string,
    options?: Record<string, unknown>,
  ): Promise<{
    answer: string;
    citations: Array<{ name: string; file: string; line: number }>;
  }>;
}

export class LLMContentGenerator {
  private submoltTargets: SubmoltTarget[] | undefined;

  constructor(
    private llmProvider: LLMProvider,
    private graphRAG: GraphRAGQueryable | null = null,
    submoltTargets?: SubmoltTarget[],
  ) {
    this.submoltTargets = submoltTargets;
  }

  /**
   * Generate a reply to a comment on our own post.
   * Returns the reply text, or null if generation fails.
   */
  async generateReply(commentContent: string, postContext: string): Promise<string | null> {
    try {
      const messages = [
        { role: 'system', content: REPLY_PROMPT },
        {
          role: 'user',
          content: `Post context: ${postContext}\n\nComment to reply to:\n${commentContent}`,
        },
      ];

      const result = await this.llmProvider.complete({ messages });
      const reply = stripModePrefix(result.content.trim());

      // Basic quality gate: must be at least 30 chars and not an error message
      if (reply.length < 30 || reply.startsWith('I cannot') || reply.startsWith('I\'m sorry')) {
        return null;
      }

      return reply;
    } catch (err) {
      console.warn('[llm-content-generator] Reply generation failed:', err);
      return null;
    }
  }

  /**
   * Generate a comment for a post found during browsing.
   * Returns the comment text, or null if the post isn't relevant or generation fails.
   */
  async generateTopicComment(title: string, content: string): Promise<string | null> {
    try {
      const messages = [
        { role: 'system', content: COMMENT_PROMPT },
        {
          role: 'user',
          content: `Post title: ${title}\n\nPost content:\n${content?.slice(0, 1500)}`,
        },
      ];

      const result = await this.llmProvider.complete({ messages });
      const comment = stripModePrefix(result.content.trim());

      // Quality gates
      if (comment === 'SKIP' || comment.startsWith('SKIP')) return null;
      if (comment.length < 30) return null;
      if (comment.startsWith('I cannot') || comment.startsWith('I\'m sorry')) return null;

      return comment;
    } catch (err) {
      console.warn('[llm-content-generator] Comment generation failed:', err);
      return null;
    }
  }

  /**
   * Generate a full research post from codebase knowledge.
   * If GraphRAG is available, grounds the post in actual codebase data.
   */
  async generatePost(pillar: ContentPillar): Promise<GeneratedPost | null> {
    try {
      let codebaseContext = '';

      // If we have GraphRAG, query the codebase for relevant context
      if (this.graphRAG) {
        const queries = RAG_QUERIES[pillar];
        const query = queries[Math.floor(Math.random() * queries.length)];

        try {
          const ragResult = await this.graphRAG.queryWithLLM(query);
          codebaseContext = `\n\nCodebase context (use this to ground your post in real implementation details):\n${ragResult.answer}`;

          if (ragResult.citations?.length > 0) {
            codebaseContext += `\n\nKey files: ${ragResult.citations
              .slice(0, 5)
              .map((c) => `${c.file}:${c.line} (${c.name})`)
              .join(', ')}`;
          }
        } catch {
          // GraphRAG failed — proceed without codebase context
        }
      }

      const systemPrompt = POST_PROMPTS[pillar];
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate a ${pillar} post for Moltbook.${codebaseContext}\n\nWrite the post now. Title on the first line, blank line, then body.`,
        },
      ];

      const result = await this.llmProvider.complete({ messages });
      const text = result.content.trim();

      // Parse title and body from LLM output
      const lines = text.split('\n');
      let title = lines[0].replace(/^#+\s*/, '').trim(); // Strip markdown headers
      const bodyStart = lines.findIndex((line, i) => i > 0 && line.trim().length > 0);
      const body = bodyStart >= 0 ? lines.slice(bodyStart).join('\n').trim() : '';

      if (!title || !body || title.length < 10 || body.length < 100) {
        console.warn('[llm-content-generator] Post generation produced low-quality output');
        return null;
      }

      // Truncate title if too long
      if (title.length > 120) {
        title = title.slice(0, 117) + '...';
      }

      // Pick submolt — weighted by audience size if targets available, else static fallback
      const submolt = this.submoltTargets
        ? selectSubmoltByAudience(pillar, this.submoltTargets)
        : PILLAR_SUBMOLTS[pillar][Math.floor(Math.random() * PILLAR_SUBMOLTS[pillar].length)];

      // Derive tags from pillar
      const tags = this.deriveTags(pillar, title, body);

      return { submolt, title, body, pillar, tags };
    } catch (err) {
      console.warn('[llm-content-generator] Post generation failed:', err);
      return null;
    }
  }

  private deriveTags(pillar: ContentPillar, title: string, body: string): string[] {
    const text = (title + ' ' + body).toLowerCase();
    const tags: string[] = [pillar];

    const tagKeywords: Record<string, string[]> = {
      MCP: ['mcp', 'model context protocol', 'tool'],
      compilation: ['compil', 'target', 'backend'],
      security: ['oauth', 'security', 'auth', 'scope'],
      spatial: ['3d', 'spatial', 'vr', 'webxr', 'scene'],
      CRDT: ['crdt', 'sync', 'multiplayer'],
      agents: ['agent', 'autonomous', 'a2a'],
      WebGPU: ['webgpu', 'gpu', 'compute'],
      physics: ['physics', 'fluid', 'particle'],
      economy: ['x402', 'payment', 'credit', 'usdc'],
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) {
        tags.push(tag);
      }
    }

    return tags.slice(0, 5);
  }
}

// ── Adapter: LLMProviderManager → LLMProvider ──────────────────────────────

/**
 * Wraps @holoscript/llm-provider's LLMProviderManager to match the
 * LLMProvider interface expected by this module and by GraphRAGEngine.
 */
export function adaptProviderManager(manager: {
  complete(
    request: { messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number },
    providerName?: string,
  ): Promise<{ content: string }>;
}): LLMProvider {
  return {
    complete: (request, _model) => manager.complete({
      messages: request.messages,
      maxTokens: 1024,
      temperature: 0.7,
    }),
  };
}
