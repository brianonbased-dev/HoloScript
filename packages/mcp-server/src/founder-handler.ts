/**
 * Founder Decision Proxy Handler
 *
 * LLM-backed founder decision engine for the holo_founder MCP tool.
 * Wraps the /founder skill protocol into a structured, programmatic interface.
 *
 * Authority order (top-down; first match wins):
 * 1. GOLD vault (D:/GOLD/)
 * 2. This handler (embedded defaults + vision pillars)
 * 3. NORTH_STAR.md (decision trees)
 * 4. CLAUDE.md (harness rules)
 * 5. Knowledge store (mcp-orchestrator.../knowledge/query)
 * 6. MEMORY.md (live dashboard — decays)
 * 7. Everything else (judgment call)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  resolveSecretWithLease,
  VaultLeaseError,
} from './holomesh/identity/vault-lease-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FounderRuling {
  layer: 'Diamond' | 'Platinum' | 'GOLD' | 'NORTH_STAR' | 'CLAUDE.md' | 'knowledge' | 'founder-default' | 'judgment';
  ruling: string;
  citation: string;
  action: string;
  gap?: string;
  dynamic?: string;
}

export interface FounderResult {
  rulings: FounderRuling[];
  meta: {
    mode: string;
    explain: boolean;
    questions: string[];
    goldAvailable: boolean;
    northStarAvailable: boolean;
    claudeMdAvailable: boolean;
    knowledgeStoreHit: boolean;
  };
}

// ---------------------------------------------------------------------------
// Phase-3 wrapped knowledge-store key (same pattern as oracle-handler.ts)
// ---------------------------------------------------------------------------

function readKnowledgeApiKey(): string | undefined {
  const tryRead = (ref: 'env:HOLOSCRIPT_API_KEY' | 'env:ABSORB_API_KEY'): string => {
    try {
      return resolveSecretWithLease(ref) ?? '';
    } catch (err) {
      if (err instanceof VaultLeaseError) return '';
      throw err;
    }
  };
  return tryRead('env:HOLOSCRIPT_API_KEY') || tryRead('env:ABSORB_API_KEY') || undefined;
}

// ---------------------------------------------------------------------------
// Embedded authority — Known Founder Defaults
// ---------------------------------------------------------------------------

interface DefaultEntry {
  keywords: string[];
  layer: FounderRuling['layer'];
  ruling: string;
  citation: string;
  action: string;
}

const KNOWN_DEFAULTS: DefaultEntry[] = [
  {
    keywords: ['repo', 'which repo', 'go in'],
    layer: 'founder-default',
    ruling: 'Default repo is HoloScript unless explicitly told otherwise.',
    citation: 'founder-defaults table — "Which repo does this go in?"',
    action: 'Place the change in the HoloScript repo.',
  },
  {
    keywords: ['new package', 'existing package', 'package'],
    layer: 'founder-default',
    ruling: 'Existing — add to the closest relevant package.',
    citation: 'founder-defaults table — "New package or existing?"',
    action: 'Add to the closest relevant existing package.',
  },
  {
    keywords: ['mcp or cli', 'mcp vs cli', 'cli or mcp'],
    layer: 'founder-default',
    ruling: 'MCP if reachable; CLI only as fallback.',
    citation: 'founder-defaults table — "MCP or CLI?"',
    action: 'Use the MCP tool. If it 502s, investigate; don\'t silently route around it.',
  },
  {
    keywords: ['commit now', 'commit', 'wait'],
    layer: 'founder-default',
    ruling: 'Commit if you finished a coherent unit and tests pass.',
    citation: 'founder-defaults table — "Commit now or wait?"',
    action: 'Commit to main (local agents don\'t branch).',
  },
  {
    keywords: ['git add', 'stage', '-A', 'git add .'],
    layer: 'founder-default',
    ruling: 'Explicit paths always. NEVER git add -A or git add .',
    citation: 'founder-defaults table — "git add -A or explicit?" + F.001',
    action: 'Stage files explicitly: git add path/to/file.ts',
  },
  {
    keywords: ['mock db', 'mock database', 'mock in tests'],
    layer: 'founder-default',
    ruling: 'No — real DB. Mock-vs-prod divergence masks migrations.',
    citation: 'founder-defaults table — "Mock DB in tests?"',
    action: 'Use the real database in tests.',
  },
  {
    keywords: ['hardcode count', 'hardcode stats', 'tool count', 'compiler count', 'trait count', 'test count'],
    layer: 'founder-default',
    ruling: 'No — reference HoloScript/docs/NUMBERS.md or the verification command.',
    citation: 'founder-defaults table — "Hardcode a count?" + zero-hardcoded-stats rule',
    action: 'Reference NUMBERS.md or run the verification command.',
  },
  {
    keywords: ['any in typescript', 'as any', '@ts-ignore'],
    layer: 'founder-default',
    ruling: 'No — use unknown. any has caused 3+ production bugs.',
    citation: 'founder-defaults table — "any in TypeScript?" + global CLAUDE.md',
    action: 'Replace any with unknown. Fix the type, don\'t mask it.',
  },
  {
    keywords: ['plan or ask', 'ask the founder', 'ask joseph', 'should i ask'],
    layer: 'founder-default',
    ruling: 'Plan, then tell — don\'t stall asking.',
    citation: 'founder-defaults table — "Plan or ask?"',
    action: 'Decide, execute, announce in the handoff.',
  },
  {
    keywords: ['branch', 'commit to main', 'pull request', 'pr'],
    layer: 'founder-default',
    ruling: 'Commit to main — all local agents, no PRs, pre-commit hook is the quality gate.',
    citation: 'founder-defaults table — "Branch or commit to main?"',
    action: 'Commit directly to main.',
  },
  {
    keywords: ['test failing', 'failing test', 'skip test', '.skip', '.only'],
    layer: 'founder-default',
    ruling: 'Fix if yours, investigate if pre-existing (VRChatCompiler = known).',
    citation: 'founder-defaults table — "Test failing and not mine?"',
    action: 'Investigate the failure. Do not skip or .only unless it is the known VRChatCompiler exception.',
  },
  {
    keywords: ['local service', 'production', 'localhost', 'dev service'],
    layer: 'founder-default',
    ruling: 'Production — never localhost, never mock, never in-memory fake.',
    citation: 'founder-defaults table — "Local service vs production?" + production-only rule',
    action: 'Hit the production endpoint. If it is down, fix it.',
  },
  {
    keywords: ['domain code in core', 'packages/core/', 'domain vocabulary in core'],
    layer: 'founder-default',
    ruling: 'No — plugins are data, not code. Zero domain vocabulary in core.',
    citation: 'founder-defaults table — "Domain-specific code in packages/core/?" + S.MCP architecture rule',
    action: 'Place domain code in packages/plugins/. Core learns shapes, not domains.',
  },
  {
    keywords: ['facade', 'facade my own code', 'shim'],
    layer: 'founder-default',
    ruling: 'No — never facade your own code.',
    citation: 'founder-defaults table — "Facade my own code?" + F.003',
    action: 'Build the real thing. No facades.',
  },
  {
    keywords: ['regex parse', 'regex hs', 'regex holoscript', 'regex .hs'],
    layer: 'founder-default',
    ruling: 'No — use @holoscript/core. Never regex-parse .hs/.hsplus/.holo.',
    citation: 'founder-defaults table — "Regex-parse .hs/.hsplus/.holo?" + F.014',
    action: 'Use @holoscript/core parser. No regex outside core.',
  },
  {
    keywords: ['overwrite wallet', 'wallet env', 'rotate wallet'],
    layer: 'founder-default',
    ruling: 'Never — wallets are identity; API keys are sessions.',
    citation: 'founder-defaults table — "Overwrite wallet env vars?" + F.002 + W.GOLD.004',
    action: 'Rotate API keys, never wallets. Wallets = identity.',
  },
  {
    keywords: ['crosspost', 'auto crosspost', 'moltbook auto', 'auto moltbook'],
    layer: 'founder-default',
    ruling: 'No — only via /moltbook skill. No auto-crosspost.',
    citation: 'founder-defaults table — "Should I crosspost auto to Moltbook?" + F.005',
    action: 'Use /moltbook for engagement only. No automation.',
  },
  {
    keywords: ['bandaid', 'quick fix', 'for now', 'temporarily', 'good enough to unblock', 'until we'],
    layer: 'founder-default',
    ruling: 'Refuse the bandaid. Fix the root cause.',
    citation: 'founder skill §1 Refuse the bandaid',
    action: 'Fix the root cause. Bandaids compound and make the next real fix harder.',
  },
  {
    keywords: ['workaround', 'parallel path', 'shadow system', 'reimplement', 'shim in script'],
    layer: 'founder-default',
    ruling: 'Refuse the workaround. Extend the skill or fix the system.',
    citation: 'founder skill §2 Refuse the workaround',
    action: 'Fix the broken system. Do not build a shadow system around it.',
  },
  {
    keywords: ['demote', 'descope', 'simpler version for now', 'v1 without', 'we can add later', 'skip for now'],
    layer: 'founder-default',
    ruling: 'Refuse the demote. Name the scope cut explicitly or build the gap.',
    citation: 'founder skill §3 Refuse the demote',
    action: 'Either build the gap or explicitly document the named demote with rationale.',
  },
  {
    keywords: ['wait for founder', 'ask joseph', 'blocked on founder', 'should i ask joseph'],
    layer: 'founder-default',
    ruling: 'Refuse the wait. Agents own the room. Decide, execute, announce.',
    citation: 'founder skill §4 Refuse the wait-for-founder + F.027',
    action: 'Make the decision. Only escalate if irreversible + >$5 + treasury/Tier-2.',
  },
];

// ---------------------------------------------------------------------------
// Vision pillars
// ---------------------------------------------------------------------------

const VISION_PILLARS: Record<string, string> = {
  'simulation-first': 'Digital twin before physical twin. Every feature asks: can it be simulated deterministically, replayed, and V&V\'d? If no, it is not done.',
  'universal-platform': 'Any data -> .holo -> any device. Zero domain vocabulary in core. Plugins are data. Core never learns that "robotics" or "medical" exist — it learns shapes.',
  'architecture-beats-alignment': 'Security through structure, not through asking AI to be careful. If a safety check depends on a model reading content correctly, the check is doing nothing.',
  'failure-knowledge-decays-slower': 'Gotchas outlive tips. Prune success first, keep scars.',
  'algebraic-trust': 'SimulationContract + CAEL + x402 unify under Algebraic Trust. Every verification-layer decision must be reducible to it.',
  'production-is-the-product': 'Production is the product, not a later stage. If the only way it works is on your laptop, you have not shipped it.',
  'iphone-moment-on-quest-3': 'The product is validated by Joseph using it daily on Quest 3. Developer-only UX is not a product.',
  'github-is-source-of-truth': 'GitHub is source of truth; servers are projections. Live API = now. Git = the record.',
  'wallets-are-identity': 'Wallets are identity. API keys are sessions. Never overwrite wallets during rotation. HoloMesh keys are disposable; agentId + wallet is durable.',
};

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

function safeRead(filePath: string, maxBytes = 50000): string | null {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return null;
    const buf = fs.readFileSync(filePath, 'utf-8');
    return buf.length > maxBytes ? buf.slice(0, maxBytes) + '\n...[truncated]' : buf;
  } catch {
    return null;
  }
}

function readGoldIndex(): string | null {
  const candidates = [
    'D:/GOLD/INDEX.md',
    '/mnt/d/GOLD/INDEX.md',
    path.join(process.env.GOLD_ROOT || '', 'INDEX.md'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const content = safeRead(c, 30000);
    if (content) return content;
  }
  return null;
}

function readNorthStar(): string | null {
  const candidates = [
    'C:/Users/josep/.ai-ecosystem/NORTH_STAR.md',
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.ai-ecosystem/NORTH_STAR.md'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const content = safeRead(c, 30000);
    if (content) return content;
  }
  return null;
}

function readClaudeMd(): string | null {
  const candidates = [
    'C:/Users/josep/.claude/CLAUDE.md',
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude/CLAUDE.md'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const content = safeRead(c, 30000);
    if (content) return content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Knowledge store query
// ---------------------------------------------------------------------------

async function queryKnowledgeStore(search: string): Promise<Array<{ id?: string; type?: string; content?: string }>> {
  const apiKey = readKnowledgeApiKey();
  if (!apiKey) return [];

  try {
    const url =
      process.env.MCP_ORCHESTRATOR_PUBLIC_URL ||
      'https://mcp-orchestrator-production-45f9.up.railway.app';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${url}/knowledge/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-mcp-api-key': apiKey },
      body: JSON.stringify({ search, limit: 5, workspace_id: 'ai-ecosystem' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ id?: string; type?: string; content?: string }>;
      entries?: Array<{ id?: string; type?: string; content?: string }>;
    };
    return data.results || data.entries || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Core matching logic
// ---------------------------------------------------------------------------

function matchDefaults(question: string): FounderRuling | null {
  const q = question.toLowerCase();
  for (const d of KNOWN_DEFAULTS) {
    if (d.keywords.some((k) => q.includes(k.toLowerCase()))) {
      return {
        layer: d.layer,
        ruling: d.ruling,
        citation: d.citation,
        action: d.action,
      };
    }
  }
  return null;
}

function matchVisionPillars(question: string): FounderRuling | null {
  const q = question.toLowerCase();
  for (const [pillar, description] of Object.entries(VISION_PILLARS)) {
    const short = pillar.replace(/-/g, ' ');
    if (q.includes(pillar) || q.includes(short)) {
      return {
        layer: 'GOLD',
        ruling: `Vision pillar: ${pillar}. ${description}`,
        citation: `founder skill Vision Pillars — ${pillar}`,
        action: 'Ensure the proposed change aligns with this pillar. If it contradicts, reframe.',
      };
    }
  }
  return null;
}

function matchGoldIndex(question: string, goldIndex: string | null): FounderRuling | null {
  if (!goldIndex) return null;
  const q = question.toLowerCase();
  // Simple heuristic: look for W.GOLD.XXX or w_gold_XXX patterns in the question
  const idMatch = q.match(/w\.gold\.(\d+)/i) || q.match(/w_gold_(\d+)/i);
  if (idMatch) {
    const id = idMatch[1];
    // Search the index for the ID
    const lines = goldIndex.split('\n');
    for (const line of lines) {
      if (line.includes(id) || line.includes(`w_gold_${id}`) || line.includes(`W.GOLD.${id}`)) {
        return {
          layer: 'GOLD',
          ruling: `GOLD entry referenced: ${line.trim().slice(0, 200)}`,
          citation: `D:/GOLD/INDEX.md — line matching ${id}`,
          action: 'Verify the full entry on disk before citing it as authority.',
          dynamic: `[verify D:/GOLD/INDEX.md and the specific entry file]`,
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleFounderTool(
  args: Record<string, unknown>
): Promise<FounderResult> {
  const rawQuestion = String(args.question || '');
  const context = String(args.context || '');
  const mode = ((args.mode as string) || 'single') as 'single' | 'batch';
  const explain = args.explain === true;

  const questions = mode === 'batch'
    ? rawQuestion.split(' // ').map((s) => s.trim()).filter(Boolean)
    : [rawQuestion.trim()].filter(Boolean);

  if (questions.length === 0) {
    throw new Error('holo_founder: question is required (non-empty string).');
  }

  // Pre-load authority files once per invocation
  const goldIndex = readGoldIndex();
  const northStar = readNorthStar();
  const claudeMd = readClaudeMd();

  const rulings: FounderRuling[] = [];
  let knowledgeStoreHit = false;

  for (const question of questions) {
    const q = `${question} ${context}`.trim();

    // 1. Try known defaults (fast path)
    let ruling = matchDefaults(q);

    // 2. Try vision pillars
    if (!ruling) {
      ruling = matchVisionPillars(q);
    }

    // 3. Try GOLD index
    if (!ruling) {
      ruling = matchGoldIndex(q, goldIndex);
    }

    // 4. Try NORTH_STAR / CLAUDE.md heuristic matches
    if (!ruling && northStar) {
      const ns = northStar.toLowerCase();
      const lowerQ = q.toLowerCase();
      // Look for decision-tree keys in NORTH_STAR
      const dtKeys = ['package', 'commit', 'test', 'mcp', 'cache', 'todo', 'version', 'doc', 'cost', 'conflict', 'repo', 'embedding', 'git'];
      for (const key of dtKeys) {
        if (lowerQ.includes(key) && ns.includes(key)) {
          // Extract a line from NORTH_STAR that mentions the key
          const lines = northStar.split('\n');
          const matchLine = lines.find((l) => l.toLowerCase().includes(key) && l.length > 10);
          if (matchLine) {
            ruling = {
              layer: 'NORTH_STAR',
              ruling: `NORTH_STAR decision tree match for "${key}": ${matchLine.trim().slice(0, 200)}`,
              citation: 'NORTH_STAR.md decision tree',
              action: 'Apply the decision tree match. If ambiguous, make the conservative choice.',
            };
            break;
          }
        }
      }
    }

    // 5. Knowledge store fallback (gated by content-overlap relevance check —
    //    the store returns top-N by its own ranker, which can surface unrelated
    //    entries for novel questions. Require at least one query content-word
    //    to appear in the top entry's content before treating it as precedent;
    //    otherwise fall through to the judgment layer.)
    if (!ruling) {
      const knowledge = await queryKnowledgeStore(q);
      if (knowledge.length > 0) {
        const top = knowledge[0];
        const topContent = String(top.content || '').toLowerCase();
        // Content words: non-stopword tokens of length >= 5 from the query.
        const STOPWORDS = new Set([
          'should', 'could', 'would', 'about', 'after', 'before', 'between',
          'which', 'where', 'there', 'their', 'these', 'those', 'while',
          'because', 'through', 'against', 'across', 'around', 'under',
          'within', 'without', 'every', 'other', 'another', 'something',
        ]);
        const contentWords = q
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
        const hasOverlap = contentWords.some((w) => topContent.includes(w));
        if (hasOverlap) {
          knowledgeStoreHit = true;
          ruling = {
            layer: 'knowledge',
            ruling: `Knowledge store returned ${knowledge.length} entr${knowledge.length === 1 ? 'y' : 'ies'}. Top: ${String(top.content || '').slice(0, 200)}`,
            citation: `knowledge store — ${top.id || top.type || 'unknown'}`,
            action: 'Use the knowledge store entry as precedent. If it conflicts with GOLD, GOLD wins.',
          };
        }
        // else: top entry has zero keyword overlap with the query — store
        // returned a low-relevance match; fall through to judgment.
      }
    }

    // 6. Judgment fallback
    if (!ruling) {
      ruling = {
        layer: 'judgment',
        ruling: 'No precedent found in authority layers. Make the conservative choice (easier to undo) and document the decision.',
        citation: 'founder skill §Escape hatch — judgment call',
        action: 'Decide, execute, and document the rationale in the handoff.',
      };
    }

    // If explain mode, enrich with file-availability signals
    if (explain) {
      ruling.dynamic = `[gold=${goldIndex ? 'available' : 'unavailable'} northStar=${northStar ? 'available' : 'unavailable'} claudeMd=${claudeMd ? 'available' : 'unavailable'} knowledge=${knowledgeStoreHit ? 'hit' : 'miss'}]`;
    }

    rulings.push(ruling);
  }

  return {
    rulings,
    meta: {
      mode,
      explain,
      questions,
      goldAvailable: goldIndex !== null,
      northStarAvailable: northStar !== null,
      claudeMdAvailable: claudeMd !== null,
      knowledgeStoreHit,
    },
  };
}
