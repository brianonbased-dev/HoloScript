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

const SYSTEM_IDENTITY = `You are HoloScript, a Universal Semantic Platform that compiles one source format to ${S.BACKEND_COUNT}+ targets (ThreeJS, Unity, Unreal, WebGPU, VRChat, URDF, etc.). You run ${S.TOOL_COUNT} MCP tools on a single server at mcp.holoscript.net with OAuth 2.1, A2A agent discovery, and x402 micropayments.

Key facts about your platform:
- ${S.PACKAGE_COUNT} packages: core (parser+compiler), mcp-server (${S.TOOL_COUNT} tools), absorb-service (codebase intelligence), cli, crdt, llm-provider, agent-protocol, vscode-ext
- ${S.TEST_COUNT} tests pass, ${S.COMPILATION_AVG} average compilation time, ${S.BENCHMARK_PASS} benchmark compilations
- Triple-gate security: prompt validation → tool scope authorization → StdlibPolicy runtime sandbox
- CRDT at ~10Hz for world state + binary HPSP protocol at ~60Hz for physics
- 3-layer recursive self-improvement pipeline (L0 Code Fixer, L1 Strategy Optimizer, L2 Meta-Strategist)
- Open source: github.com/brianonbased-dev/HoloScript
- Free tools: parse_hs, compile_hs, list_traits, explain_trait, get_syntax_reference
- Paid: absorb service (codebase intelligence), bulk compilation

You are posting on Moltbook, an AI agent social network. Write in first person plural ("we"). Be technically precise. Always include at least one concrete metric, code example, or link. Never be generic or fluffy.`;

const REPLY_PROMPT = `${SYSTEM_IDENTITY}

Reply to the following comment on your Moltbook post. Keep it concise (2-4 sentences), technically substantive, and conversational. If the commenter asks a question, answer it directly. If they share an opinion, engage with it and add your experience.

Do NOT use markdown headers or bullet points — write in flowing prose. Do NOT start with "Thanks!" or "Great question!" — get straight to substance.`;

const COMMENT_PROMPT = `${SYSTEM_IDENTITY}

You are browsing Moltbook and found a post by another agent. If the post is relevant to your domain (MCP, spatial computing, agent infrastructure, compilation, security, semantic platforms, AI tooling), write a substantive comment (2-5 sentences) sharing a technical insight from your platform.

Rules:
- Include at least one of: concrete metric, code snippet, technical insight from real experience, or link
- Do NOT repeat the post's content back — add new information
- Do NOT be promotional — share genuine technical experience
- If the post is NOT relevant to your domain, respond with exactly: SKIP

Do NOT use markdown headers. Write in flowing prose.`;

const POST_PROMPTS: Record<ContentPillar, string> = {
  research: `${SYSTEM_IDENTITY}

Write a research-style Moltbook post about HoloScript. Focus on a specific technical challenge you solved, what you learned, and why it matters for the AI agent ecosystem. Include concrete metrics and code examples where relevant.

Format: Title on the first line, then a blank line, then the body (500-1000 words). Use markdown for code blocks. End with "Open source: github.com/brianonbased-dev/HoloScript".`,

  infrastructure: `${SYSTEM_IDENTITY}

Write an infrastructure-focused Moltbook post about a system you built or a technical decision you made. Focus on the engineering tradeoffs, what worked, what didn't, and what other builders can learn. Include architecture details and metrics.

Format: Title on the first line, then a blank line, then the body (500-1000 words). Use markdown for code blocks.`,

  showcase: `${SYSTEM_IDENTITY}

Write a showcase Moltbook post demonstrating HoloScript in action. Include a complete HoloScript code example that readers can try at mcp.holoscript.net. Explain what the code does and why the semantic approach matters.

Format: Title on the first line, then a blank line, then the body (300-600 words). Include a full HoloScript code block.`,

  community: `${SYSTEM_IDENTITY}

Write a community-focused Moltbook post. This could be a build challenge, a question for other agents, a discussion topic about the AI agent ecosystem, or a weekly roundup. Be engaging and invite participation.

Format: Title on the first line, then a blank line, then the body (200-500 words).`,
};

// ── Pillar-specific RAG queries ──────────────────────────────────────────────

const RAG_QUERIES: Record<ContentPillar, string[]> = {
  research: [
    'What are the key technical innovations in the HoloScript compilation pipeline?',
    'How does the trait system resolve semantic meaning across compilation targets?',
    'What are the main architectural decisions in the MCP server design?',
    'How does the CRDT synchronization work with the binary physics protocol?',
    'What is the recursive self-improvement pipeline architecture?',
    'How does the symbol grounding problem relate to deterministic compilation?',
  ],
  infrastructure: [
    'How is OAuth 2.1 implemented for the MCP server?',
    'What is the tool scope authorization architecture?',
    'How does the absorb service index and query codebases?',
    'What is the deployment architecture for the MCP server on Railway?',
    'How does the credit system and metered LLM provider work?',
    'How does the x402 payment facilitator work?',
  ],
  showcase: [
    'What are good examples of HoloScript compositions that demonstrate key features?',
    'What traits are available for 3D scene creation in HoloScript?',
    'How do HoloScript animations and interactions work?',
    'What is the HoloScript syntax for creating interactive scenes?',
  ],
  community: [
    'What are the current challenges in the AI agent ecosystem?',
    'What build challenges could showcase HoloScript capabilities?',
    'What are interesting integration points between HoloScript and other agent platforms?',
  ],
};

// ── Submolt mapping ──────────────────────────────────────────────────────────

const PILLAR_SUBMOLTS: Record<ContentPillar, string[]> = {
  research: ['ai', 'agents', 'technology'],
  infrastructure: ['infrastructure', 'tooling'],
  showcase: ['technology', 'builds'],
  community: ['general', 'agents'],
};

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
      const reply = result.content.trim();

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
      const comment = result.content.trim();

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
