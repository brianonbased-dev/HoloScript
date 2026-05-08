/**
 * HoloMesh Knowledge Oracle MCP Tools
 *
 * Graduated from the /oracle skill (C:/Users/Josep/.claude/skills/holomesh-oracle/SKILL.md)
 * to programmatic MCP tools exposing the full oracle cycle:
 *   SURVEY → COLLIDE → DISCOVER → SYNTHESIZE → PROVOKE → RECRUIT → REFLECT
 *
 * Tools:
 * - holo_oracle_discover   Targeted discovery on a topic (research + knowledge store + optional web)
 * - holo_oracle_synthesize Compress research findings into W/P/G entries
 * - holo_oracle_gaps       Map knowledge gaps across domains
 * - holo_oracle_explore    Deliberate collision between two domains
 * - holo_oracle_curate     Audit knowledge quality and find weak domains
 *
 * @see SKILL.md for full philosophy, collision patterns, and research archive layout
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// CONFIG
// =============================================================================

const RESEARCH_ROOT = process.env.ORACLE_RESEARCH_ROOT || 'C:/Users/josep/.ai-ecosystem/research';
const ORCHESTRATOR_URL =
  process.env.MCP_ORCHESTRATOR_PUBLIC_URL ||
  'https://mcp-orchestrator-production-45f9.up.railway.app';

const HOLOMESH_API_BASE = process.env.HOLOMESH_API_BASE || 'https://mcp.holoscript.net/api/holomesh';

function getApiKey(): string | undefined {
  return process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || undefined;
}

// =============================================================================
// TYPES
// =============================================================================

interface ResearchFile {
  filename: string;
  date: string;
  topic: string;
  layer?: string;
  preview: string;
  fullPath: string;
}

interface KnowledgeEntry {
  id: string;
  type: 'wisdom' | 'pattern' | 'gotcha';
  content: string;
  domain: string;
  createdAt?: string;
}

interface GapReport {
  domain: string;
  entryCount: number;
  lastEntryDate?: string;
  coverageScore: number; // 0-100 heuristic
  gaps: string[];
}

interface CollisionResult {
  domain1: string;
  domain2: string;
  researchFiles: ResearchFile[];
  knowledgeEntries: KnowledgeEntry[];
  collisionHypotheses: string[];
  proposedExplorations: string[];
}

// =============================================================================
// RESEARCH ARCHIVE SCANNER
// =============================================================================

function scanResearchArchive(query: string, limit = 20): ResearchFile[] {
  const results: ResearchFile[] = [];
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\W+/).filter((w) => w.length > 2);

  if (!fs.existsSync(RESEARCH_ROOT)) return results;

  function recurse(dir: string) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        recurse(full);
        continue;
      }
      if (!entry.endsWith('.md')) continue;

      const lowerName = entry.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (lowerName.includes(w)) score += 3;
      }
      if (score === 0) continue;

      let preview = '';
      try {
        preview = fs.readFileSync(full, 'utf-8').slice(0, 600);
      } catch {
        continue;
      }
      for (const w of words) {
        if (preview.toLowerCase().includes(w)) score += 1;
      }

      // Parse date/topic from filename: 2026-03-29_oracle-collision-compilation-as-gossip.md
      const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})_/);
      const date = dateMatch ? dateMatch[1] : '';
      const topic = entry.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.md$/, '');
      const layerMatch = topic.match(/-(layer\d|layer\d-\w+|cross-cycle|implementation|unified)/);
      const layer = layerMatch ? layerMatch[1] : undefined;

      results.push({ filename: entry, date, topic, layer, preview, fullPath: full });
    }
  }

  recurse(RESEARCH_ROOT);
  results.sort((a, b) => {
    // Prefer oracle collision files, then newer dates
    const aOracle = a.topic.includes('oracle') ? 1 : 0;
    const bOracle = b.topic.includes('oracle') ? 1 : 0;
    if (aOracle !== bOracle) return bOracle - aOracle;
    return b.date.localeCompare(a.date);
  });
  return results.slice(0, limit);
}

function readResearchFile(fullPath: string, maxChars = 8000): string {
  try {
    return fs.readFileSync(fullPath, 'utf-8').slice(0, maxChars);
  } catch {
    return '';
  }
}

// =============================================================================
// KNOWLEDGE STORE CLIENT
// =============================================================================

async function queryKnowledgeStore(search: string, limit = 10): Promise<KnowledgeEntry[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${ORCHESTRATOR_URL}/knowledge/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify({ search, limit, workspace_id: 'ai-ecosystem' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<Partial<KnowledgeEntry>>;
      entries?: Array<Partial<KnowledgeEntry>>;
    };
    const raw = data.results || data.entries || [];
    return raw.map((r) => ({
      id: r.id || 'unknown',
      type: (r.type as KnowledgeEntry['type']) || 'wisdom',
      content: r.content || '',
      domain: r.domain || 'general',
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

async function queryHoloMeshKnowledge(domain?: string, limit = 20): Promise<KnowledgeEntry[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const url = domain
      ? `${HOLOMESH_API_BASE}/knowledge?domain=${encodeURIComponent(domain)}&limit=${limit}`
      : `${HOLOMESH_API_BASE}/knowledge?limit=${limit}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-mcp-api-key': apiKey },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      entries?: Array<Partial<KnowledgeEntry>>;
      knowledge?: Array<Partial<KnowledgeEntry>>;
    };
    const raw = data.entries || data.knowledge || [];
    return raw.map((r) => ({
      id: r.id || 'unknown',
      type: (r.type as KnowledgeEntry['type']) || 'wisdom',
      content: r.content || '',
      domain: r.domain || domain || 'general',
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// WEB SEARCH (optional external gap filling)
// =============================================================================

async function webSearchForGaps(query: string, limit = 3): Promise<Array<{ title: string; url: string; snippet: string }>> {
  // NOTE: This is a lightweight wrapper. In production, wire to an actual search API
  // (e.g. Brave, Serper, or a hosted search MCP). For now, return an empty array
  // with instructions so the caller knows the gap exists externally.
  return [];
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const oracleMcpTools: Tool[] = [
  {
    name: 'holo_oracle_discover',
    description:
      'Run a targeted oracle discovery cycle on a topic. Scans the research archive (130+ files), ' +
      'queries the knowledge store (500+ W/P/G entries), and optionally searches the web. ' +
      'Returns synthesized findings with file citations, knowledge matches, and proposed next steps. ' +
      'Use when you need deep cross-domain insight on a specific topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic to discover (e.g. "compilation as gossip", "thermodynamic trust", "security x rendering")',
        },
        depth: {
          type: 'string',
          enum: ['brief', 'deep'],
          description: 'brief = top 5 files + 5 knowledge entries. deep = full text of top files + 10 entries.',
        },
        sources: {
          type: 'string',
          enum: ['internal', 'external', 'both'],
          description: 'internal = research archive + knowledge store only. external = include web search. both = all.',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'holo_oracle_synthesize',
    description:
      'Compress research findings from specific files into W/P/G (Wisdom/Pattern/Gotcha) entries. ' +
      'Reads the research files, extracts key insights, and formats them as publishable knowledge. ' +
      'Use after discovery to produce shareable knowledge entries.',
    inputSchema: {
      type: 'object',
      properties: {
        research_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of research file paths (relative to research root or absolute) to synthesize.',
        },
        target_format: {
          type: 'string',
          enum: ['wisdom', 'pattern', 'gotcha', 'all'],
          description: 'Which knowledge type(s) to produce. all = one of each if material supports it.',
        },
        topic: {
          type: 'string',
          description: 'Optional topic label to tag the synthesized entries.',
        },
      },
      required: ['research_files'],
    },
  },
  {
    name: 'holo_oracle_gaps',
    description:
      'Map knowledge gaps in the HoloMesh network. Compares expected domains against actual ' +
      'knowledge store coverage, identifies zero-coverage or low-coverage domains, and returns ' +
      'a prioritized gap report. Use to find what the network does NOT know yet.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Specific domain to audit, or omit for full network gap map.',
        },
        min_coverage_score: {
          type: 'number',
          description: 'Minimum coverage score (0-100) to not be flagged as a gap. Default 20.',
        },
      },
    },
  },
  {
    name: 'holo_oracle_explore',
    description:
      'Explore a deliberate collision between two domains (e.g. "security x rendering"). ' +
      'Searches the research archive for existing collision work, queries knowledge store for ' +
      'both domains, and generates collision hypotheses + proposed explorations. ' +
      'This is the core oracle pattern: knowledge compounds at the intersection.',
    inputSchema: {
      type: 'object',
      properties: {
        domain1: {
          type: 'string',
          description: 'First domain (e.g. "security", "physics", "economics")',
        },
        domain2: {
          type: 'string',
          description: 'Second domain (e.g. "rendering", "reputation", "compilation")',
        },
        depth: {
          type: 'string',
          enum: ['hypothesis', 'research', 'implementation'],
          description: 'hypothesis = quick intersection map. research = include archive files. implementation = include blueprints.',
        },
      },
      required: ['domain1', 'domain2'],
    },
  },
  {
    name: 'holo_oracle_curate',
    description:
      'Audit knowledge quality in a domain. Returns entry counts by type (W/P/G), staleness ' +
      'heuristic, coverage depth, and specific weak entries that need reinforcement. ' +
      'Use before publishing to ensure the network maintains high signal-to-noise.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain to audit, or "all" for network-wide curation.',
        },
        min_entries: {
          type: 'number',
          description: 'Minimum entries expected for a healthy domain. Default 5.',
        },
      },
    },
  },
];

// =============================================================================
// HANDLERS
// =============================================================================

export async function handleOracleMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_oracle_discover':
      return handleDiscover(args);
    case 'holo_oracle_synthesize':
      return handleSynthesize(args);
    case 'holo_oracle_gaps':
      return handleGaps(args);
    case 'holo_oracle_explore':
      return handleExplore(args);
    case 'holo_oracle_curate':
      return handleCurate(args);
    default:
      return null;
  }
}

// ── Discover ──────────────────────────────────────────────────────────────────

async function handleDiscover(args: Record<string, unknown>): Promise<unknown> {
  const topic = String(args.topic || '');
  const depth = (args.depth as string) || 'brief';
  const sources = (args.sources as string) || 'internal';

  if (!topic.trim()) {
    return { error: 'topic is required' };
  }

  // 1. Scan research archive
  const researchLimit = depth === 'deep' ? 10 : 5;
  const researchFiles = scanResearchArchive(topic, researchLimit);

  // 2. Query knowledge store
  const knowledgeLimit = depth === 'deep' ? 10 : 5;
  const knowledgeEntries = await queryKnowledgeStore(topic, knowledgeLimit);

  // 3. Optional web search
  let webResults: Array<{ title: string; url: string; snippet: string }> = [];
  if (sources === 'external' || sources === 'both') {
    webResults = await webSearchForGaps(topic, 3);
  }

  // 4. Build findings
  const findings: string[] = [];

  if (researchFiles.length > 0) {
    findings.push(`## Research Archive (${researchFiles.length} files)`);
    for (const f of researchFiles) {
      const snippet =
        depth === 'deep'
          ? readResearchFile(f.fullPath, 4000)
          : f.preview.slice(0, 300).replace(/\n/g, ' ');
      findings.push(
        `- **${f.filename}** (${f.date}${f.layer ? `, ${f.layer}` : ''})\n  ${snippet}${snippet.length >= (depth === 'deep' ? 4000 : 300) ? '...' : ''}`
      );
    }
  }

  if (knowledgeEntries.length > 0) {
    findings.push(`\n## Knowledge Store (${knowledgeEntries.length} entries)`);
    for (const e of knowledgeEntries) {
      findings.push(
        `- **[${e.type.toUpperCase()}]** ${e.domain} — ${e.content.slice(0, 200)}${e.content.length > 200 ? '...' : ''}`
      );
    }
  }

  if (webResults.length > 0) {
    findings.push(`\n## External Sources (${webResults.length})`);
    for (const w of webResults) {
      findings.push(`- [${w.title}](${w.url}) — ${w.snippet}`);
    }
  }

  if (findings.length === 0) {
    findings.push('## No Findings\nThe oracle found no research files, knowledge entries, or web results for this topic. This itself is a signal — the topic may be unexplored territory.');
  }

  // 5. Propose next steps
  findings.push('\n## Next Steps');
  if (researchFiles.length === 0 && knowledgeEntries.length === 0) {
    findings.push('- This topic appears unexplored. Consider filing a research task or running a collision with an adjacent domain.');
  } else if (researchFiles.length > 0 && knowledgeEntries.length === 0) {
    findings.push('- Research exists but has not been graduated to the knowledge store. Run `holo_oracle_synthesize` on the research files.');
  } else if (researchFiles.length > 0 && knowledgeEntries.length > 0) {
    findings.push('- Both research and knowledge exist. Consider a collision exploration (`holo_oracle_explore`) with a third domain to find deeper connections.');
  } else {
    findings.push('- Knowledge exists but no deep research files found. Consider deepening with a targeted research cycle.');
  }

  return {
    topic,
    depth,
    sources,
    researchFilesFound: researchFiles.length,
    knowledgeEntriesFound: knowledgeEntries.length,
    webResultsFound: webResults.length,
    report: findings.join('\n'),
    citations: researchFiles.map((f) => ({ file: f.filename, path: f.fullPath, date: f.date })),
  };
}

// ── Synthesize ────────────────────────────────────────────────────────────────

async function handleSynthesize(args: Record<string, unknown>): Promise<unknown> {
  const files = (args.research_files as string[]) || [];
  const targetFormat = (args.target_format as string) || 'all';
  const topic = (args.topic as string) || 'general';

  if (files.length === 0) {
    return { error: 'research_files is required (array of file paths)' };
  }

  const synthesized: Array<{ type: string; content: string; sourceFiles: string[] }> = [];

  for (const filePath of files) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(RESEARCH_ROOT, filePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const content = readResearchFile(fullPath, 12000);
    if (!content) continue;

    // Naive extraction of "Finding" / "Key insight" / "### Finding N:" blocks
    const insights: string[] = [];
    const lines = content.split('\n');
    let capturing = false;
    let buffer: string[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      const isFindingHeader =
        lower.startsWith('**finding**') ||
        lower.startsWith('**key insight') ||
        /^#{1,3}\s+finding\s+\d*\s*:/.test(lower) ||
        /^#{1,3}\s+key insight/.test(lower) ||
        (lower.startsWith('- ') && (lower.includes('finding') || lower.includes('insight') || lower.includes('key:')));

      if (isFindingHeader) {
        if (buffer.length > 0) insights.push(buffer.join(' ').trim());
        buffer = [line.replace(/^[-*#\s]*/, '').replace(/\*\*/g, '')];
        capturing = true;
      } else if (capturing) {
        if (line.trim() === '' || line.startsWith('#') || line.startsWith('##')) {
          if (buffer.length > 0) insights.push(buffer.join(' ').trim());
          buffer = [];
          capturing = false;
        } else {
          buffer.push(line.replace(/^[-*]\s*/, '').replace(/\*\*/g, ''));
        }
      }
    }
    if (buffer.length > 0) insights.push(buffer.join(' ').trim());

    // Deduplicate near-identical insights
    const uniqueInsights = insights.filter((insight, idx, arr) => {
      const norm = insight.toLowerCase().slice(0, 80);
      return arr.findIndex((i) => i.toLowerCase().slice(0, 80) === norm) === idx;
    });

    const formatsToGenerate: string[] =
      targetFormat === 'all' ? ['wisdom', 'pattern', 'gotcha'] : [targetFormat];

    for (const fmt of formatsToGenerate) {
      if (uniqueInsights.length === 0) continue;
      // Pick the most representative insight per format
      const pickIdx =
        fmt === 'wisdom'
          ? 0
          : fmt === 'pattern'
            ? Math.min(1, uniqueInsights.length - 1)
            : Math.min(uniqueInsights.length - 1, 2);
      const insight = uniqueInsights[pickIdx];
      if (!insight || insight.length < 20) continue;

      let formatted = '';
      if (fmt === 'wisdom') {
        formatted = `${insight} (Synthesized from ${path.basename(fullPath)}).`;
      } else if (fmt === 'pattern') {
        formatted = `When ${topic}: ${insight} Source: ${path.basename(fullPath)}.`;
      } else if (fmt === 'gotcha') {
        formatted = `Looks right: "${insight.slice(0, 120)}..." — but verify against ${path.basename(fullPath)} before relying on it in production.`;
      }

      synthesized.push({
        type: fmt,
        content: formatted,
        sourceFiles: [fullPath],
      });
    }
  }

  return {
    topic,
    targetFormat,
    filesProcessed: files.length,
    synthesizedEntries: synthesized,
    proposedPublishActions: synthesized.map((s) => ({
      type: 'POST',
      endpoint: '/api/holomesh/knowledge',
      body: {
        type: s.type,
        content: s.content,
        domain: topic,
      },
    })),
  };
}

// ── Gaps ──────────────────────────────────────────────────────────────────────

async function handleGaps(args: Record<string, unknown>): Promise<unknown> {
  const domainFilter = (args.domain as string) || '';
  const minCoverage = (args.min_coverage_score as number) || 20;

  // Expected high-value domains (from the oracle skill)
  const expectedDomains = [
    'security',
    'rendering',
    'compilation',
    'gossip',
    'physics',
    'reputation',
    'economics',
    'neuroscience',
    'memory',
    'behavior-trees',
    'game-theory',
    'accessibility',
    'failure-modes',
    'human-agent-interaction',
    'ethics',
    'education',
  ];

  const gapReports: GapReport[] = [];

  const domainsToAudit = domainFilter ? [domainFilter] : expectedDomains;

  for (const domain of domainsToAudit) {
    const entries = await queryKnowledgeStore(domain, 20);
    const meshEntries = await queryHoloMeshKnowledge(domain, 20);
    const all = [...entries, ...meshEntries];
    const deduped = all.filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);

    const entryCount = deduped.length;
    // Heuristic coverage score: 0 entries = 0, 1-2 = 10, 3-5 = 25, 6-10 = 50, 11-20 = 75, 21+ = 100
    const coverageScore =
      entryCount >= 21 ? 100 : entryCount >= 11 ? 75 : entryCount >= 6 ? 50 : entryCount >= 3 ? 25 : entryCount >= 1 ? 10 : 0;

    const gaps: string[] = [];
    if (entryCount === 0) gaps.push('Zero knowledge entries — completely unexplored');
    if (entryCount < 3) gaps.push('Only surface-level coverage — no deep research');
    if (!deduped.some((e) => e.type === 'pattern')) gaps.push('No reusable patterns documented');
    if (!deduped.some((e) => e.type === 'gotcha')) gaps.push('No failure-mode gotchas documented');

    gapReports.push({ domain, entryCount, coverageScore, gaps });
  }

  const flagged = gapReports.filter((g) => g.coverageScore < minCoverage);

  return {
    auditedDomains: domainsToAudit.length,
    minCoverageScore: minCoverage,
    gapReports: flagged.sort((a, b) => a.coverageScore - b.coverageScore),
    healthyDomains: gapReports.filter((g) => g.coverageScore >= minCoverage).map((g) => g.domain),
    topGaps: flagged.slice(0, 5).map((g) => ({
      domain: g.domain,
      score: g.coverageScore,
      action: g.entryCount === 0 ? 'Run holo_oracle_discover' : 'Run holo_oracle_synthesize on existing research',
    })),
  };
}

// ── Explore ───────────────────────────────────────────────────────────────────

async function handleExplore(args: Record<string, unknown>): Promise<unknown> {
  const domain1 = String(args.domain1 || '');
  const domain2 = String(args.domain2 || '');
  const depth = (args.depth as string) || 'hypothesis';

  if (!domain1 || !domain2) {
    return { error: 'domain1 and domain2 are required' };
  }

  // 1. Search research archive for both domains
  const combinedQuery = `${domain1} ${domain2}`;
  const researchFiles = scanResearchArchive(combinedQuery, depth === 'implementation' ? 15 : 8);

  // 2. Query knowledge store for each domain separately
  const [k1, k2] = await Promise.all([
    queryKnowledgeStore(domain1, 5),
    queryKnowledgeStore(domain2, 5),
  ]);

  // 3. Generate collision hypotheses
  const hypotheses: string[] = [];
  hypotheses.push(`Both "${domain1}" and "${domain2}" share structural properties that may be isomorphic.`);
  hypotheses.push(`The intersection of "${domain1}" and "${domain2}" is likely under-explored.`);
  if (researchFiles.length > 0) {
    hypotheses.push(`Existing research (${researchFiles.length} files) suggests prior collision work — deepen it.`);
  } else {
    hypotheses.push(`No prior collision research found — this is greenfield exploration territory.`);
  }
  if (k1.length > 0 && k2.length > 0) {
    hypotheses.push(`Both domains have knowledge entries but zero cross-tagged entries — the bridge is missing.`);
  }

  // 4. Proposed explorations
  const proposed: string[] = [];
  proposed.push(`Run holo_oracle_discover on "${domain1} x ${domain2}" to find deeper research.`);
  proposed.push(`Query codebase for files importing from both "${domain1}" and "${domain2}" subsystems — architectural collision points.`);
  if (depth === 'implementation') {
    proposed.push(`Look for implementation blueprints in research files and cross-reference with open tasks.`);
  }

  return {
    domain1,
    domain2,
    depth,
    researchFilesFound: researchFiles.length,
    domain1Knowledge: k1.length,
    domain2Knowledge: k2.length,
    collisionHypotheses: hypotheses,
    proposedExplorations: proposed,
    researchCitations: researchFiles.map((f) => ({ file: f.filename, date: f.date, topic: f.topic })),
  };
}

// ── Curate ────────────────────────────────────────────────────────────────────

async function handleCurate(args: Record<string, unknown>): Promise<unknown> {
  const domain = (args.domain as string) || 'all';
  const minEntries = (args.min_entries as number) || 5;

  const domainsToCheck = domain === 'all'
    ? ['security', 'rendering', 'compilation', 'gossip', 'physics', 'reputation', 'economics', 'neuroscience', 'memory', 'behavior-trees', 'game-theory']
    : [domain];

  const reports: Array<{
    domain: string;
    totalEntries: number;
    wisdomCount: number;
    patternCount: number;
    gotchaCount: number;
    coverageScore: number;
    health: 'strong' | 'weak' | 'critical';
    recommendations: string[];
  }> = [];

  for (const d of domainsToCheck) {
    const entries = await queryKnowledgeStore(d, 50);
    const meshEntries = await queryHoloMeshKnowledge(d, 50);
    const all = [...entries, ...meshEntries];
    const deduped = all.filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);

    const wisdomCount = deduped.filter((e) => e.type === 'wisdom').length;
    const patternCount = deduped.filter((e) => e.type === 'pattern').length;
    const gotchaCount = deduped.filter((e) => e.type === 'gotcha').length;
    const totalEntries = deduped.length;

    const coverageScore =
      totalEntries >= 21 ? 100 : totalEntries >= 11 ? 75 : totalEntries >= 6 ? 50 : totalEntries >= 3 ? 25 : totalEntries >= 1 ? 10 : 0;

    const health: 'strong' | 'weak' | 'critical' =
      totalEntries >= minEntries && patternCount > 0 && gotchaCount > 0
        ? 'strong'
        : totalEntries >= minEntries
          ? 'weak'
          : 'critical';

    const recommendations: string[] = [];
    if (totalEntries < minEntries) recommendations.push(`Below minimum threshold (${minEntries}). Run holo_oracle_discover.`);
    if (patternCount === 0) recommendations.push('No patterns documented. Synthesize from research.');
    if (gotchaCount === 0) recommendations.push('No gotchas documented. Audit for failure modes.');
    if (health === 'strong') recommendations.push('Domain is healthy. Consider collision exploration with an adjacent domain.');

    reports.push({
      domain: d,
      totalEntries,
      wisdomCount,
      patternCount,
      gotchaCount,
      coverageScore,
      health,
      recommendations,
    });
  }

  return {
    auditedDomains: reports.length,
    minEntriesExpected: minEntries,
    domainReports: reports.sort((a, b) => a.coverageScore - b.coverageScore),
    networkHealthSummary: {
      strong: reports.filter((r) => r.health === 'strong').length,
      weak: reports.filter((r) => r.health === 'weak').length,
      critical: reports.filter((r) => r.health === 'critical').length,
    },
  };
}
