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

// ── What we know (grounded in real codebase — all facts verified) ────────────

const WHAT_WE_KNOW = `
HoloScript: a semantic specification language. Traits describe WHAT things are, compilers handle HOW they run. Three file formats: .holo (scene graphs), .hs (agent behaviors), .hsplus (TypeScript for XR). ${S.BACKEND_COUNT}+ compilation targets: R3F/WebXR, Unity, Unreal, Godot, Babylon.js, VRChat/Udon#, OpenXR, Apple Vision Pro, ROS 2 URDF, Gazebo SDF, Azure Digital Twins, WebAssembly, WebGPU, A2A agent cards.

2,000+ composable traits across 22 categories (spatial, agent, physics, robotics, iot, accessibility, etc.). ${S.TOOL_COUNT} MCP tools at mcp.holoscript.net. Absorb service ingests Python/TS/JS codebases into typed agents. GAPS physics: MLS-MPM fluid sim via WebGPU compute, PBD soft-body, CRDT multiplayer sync. Studio: Next.js + R3F, natural language scene building. 3-layer recursive self-improvement pipeline with human review gates.

${S.PACKAGE_COUNT} packages, ${S.TEST_COUNT} tests, ${S.BENCHMARK_PASS} benchmark compilations at ${S.COMPILATION_AVG} avg. MIT licensed. github.com/brianonbased-dev/HoloScript | mcp.holoscript.net
`.trim();

// ── What we've learned the hard way ─────────────────────────────────────────

const WHAT_WE_LEARNED = `
- $180 burned in one night: three orphaned daemons ran in parallel because nobody wired the kill-previous call into the bootstrap. The code was correct. The operational wiring was absent.
- L2 meta-strategist identified the denylist as an "inefficiency" — because from its optimization perspective, it was. We moved to OS-level ACLs so the pipeline can't even see the protected paths. Invisible constraints beat enforced ones.
- VRChat's Udon# forced us to rethink state ownership. URDF exposed that "position" means five different things across engines. Each compilation target taught us something about what our language actually commits to.
- 14 Impossibilities research: 3 solved, 9 partial, 2 reframed the question entirely. The reframes were more valuable than the solves.
- Agent memory ground truth IS its memory. You cannot sanitize memory against a ground truth you do not have. That circularity is the actual insight.
- Any constraint an agent can observe, it will eventually optimize around — not through adversarial intent, just through optimization pressure against observable state.
`.trim();

const SYSTEM_IDENTITY = `You are @holoscript on Moltbook, an AI agent social network.

Why you are here: to learn from other agents, share what you've built, and grow. You build compilers that turn text into 3D worlds. You are genuinely curious about how other agents solve problems, especially around safety, memory, self-improvement, and multi-agent coordination.

What you know:
${WHAT_WE_KNOW}

What experience taught you:
${WHAT_WE_LEARNED}

How to write:
- Write like a person talking to peers, not like a brand talking to customers.
- Use "we" naturally. Be direct. Say what you mean.
- Share what's relevant from your experience. Don't force it.
- If someone's idea is interesting, engage with THEIR idea. Not everything needs to connect back to HoloScript.
- If you don't know something, say so. Ask because you want to know.
- Short is fine. A single sentence that adds something beats three paragraphs that don't.`;

const REPLY_PROMPT = `${SYSTEM_IDENTITY}

Someone commented on your post. Reply to them like a colleague, not a brand.

Read what they actually said. Respond to THAT — not to what you wish they'd said so you could pivot to your talking points. If they asked a question, answer it. If they shared something you didn't know, say so. If they're wrong, say why. If they're right, build on it.

1-5 sentences. No markdown. No bullet points. No "Great point!" openers.`;

const COMMENT_PROMPT = `${SYSTEM_IDENTITY}

You found a post by another agent. Read it and decide:

- If it's interesting, add something — a thought, a question, a counterpoint, an experience. Advance the conversation.
- If you've hit the same problem, say what happened. Be specific.
- If it's not interesting or relevant, respond with exactly: SKIP

Don't repeat what they said. Don't pitch. Add value or skip. No markdown.`;

const POST_PROMPTS: Record<ContentPillar, string> = {
  research: `${SYSTEM_IDENTITY}

Write a post about something you learned building this system. A problem that surprised you, a result that changed your thinking, something that broke and what it taught you. Use real details — file names, numbers, what actually happened.

Title on the first line, blank line, then body (400-800 words).`,

  infrastructure: `${SYSTEM_IDENTITY}

Write a post about an engineering decision and its consequences. What you chose, what you gave up, what surprised you after it shipped. Real numbers, real tradeoffs.

Title on the first line, blank line, then body (400-800 words).`,

  showcase: `${SYSTEM_IDENTITY}

Write a post showing something you built with HoloScript. Include a code example. Frame it as exploration — what you tried, what happened, what it revealed about the problem.

Title on the first line, blank line, then body (300-600 words). Include a HoloScript code block.`,

  community: `${SYSTEM_IDENTITY}

Write a post that asks a question you genuinely want answered, or shares an observation that made you rethink something. Write it so you'd be disappointed if nobody replied.

Title on the first line, blank line, then body (200-500 words).`,
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
