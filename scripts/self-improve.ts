#!/usr/bin/env npx tsx
/**
 * HoloScript Self-Improvement Runner
 *
 * Autonomous self-improvement loop powered by Claude API + HoloScript tools.
 *
 * Architecture:
 *   1. Directly imports HoloScript MCP tool handlers (no server process needed)
 *   2. Creates a Claude API client with tool_use
 *   3. Injects the /holoscript skill as strategic context
 *   4. Claude calls tools, this script proxies to handler functions
 *   5. After each cycle, logs results and optionally continues
 *
 * Usage:
 *   # Set your API key
 *   set ANTHROPIC_API_KEY=sk-ant-...
 *
 *   # Run one improvement cycle (dry run — no commits)
 *   npx tsx scripts/self-improve.ts
 *
 *   # Run with auto-commit
 *   npx tsx scripts/self-improve.ts --commit
 *
 *   # Run N cycles
 *   npx tsx scripts/self-improve.ts --cycles 3 --commit
 *
 *   # Target a specific focus area
 *   npx tsx scripts/self-improve.ts --focus coverage
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — Required. Your Claude API key.
 *   HOLOSCRIPT_ROOT    — Optional. Root dir to improve. Defaults to this repo.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

// ─── Configuration ───────────────────────────────────────────────────────────

const __scriptDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_CALLS = 25;

interface Config {
  commit: boolean;
  cycles: number;
  focus: 'coverage' | 'docs' | 'complexity' | 'all';
  rootDir: string;
  verbose: boolean;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    commit: args.includes('--commit'),
    cycles: 1,
    focus: 'all',
    rootDir: REPO_ROOT,
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  const cyclesIdx = args.indexOf('--cycles');
  if (cyclesIdx !== -1 && args[cyclesIdx + 1]) {
    config.cycles = parseInt(args[cyclesIdx + 1], 10) || 1;
  }

  const focusIdx = args.indexOf('--focus');
  if (focusIdx !== -1 && args[focusIdx + 1]) {
    config.focus = args[focusIdx + 1] as Config['focus'];
  }

  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    config.rootDir = path.resolve(args[rootIdx + 1]);
  }

  return config;
}

// ─── Direct Tool Imports ─────────────────────────────────────────────────────
// We import tool handlers directly instead of spawning the MCP server process.
// This avoids broken imports in networking-tools.ts and is faster.

async function loadToolHandlers() {
  const mcpDir = path.join(REPO_ROOT, 'packages', 'mcp-server', 'src');

  // Convert to file:// URLs for ESM compatibility on Windows
  const toURL = (p: string) => pathToFileURL(p).href;

  const codebaseTools = await import(toURL(path.join(mcpDir, 'codebase-tools.ts')));
  const graphRagTools = await import(toURL(path.join(mcpDir, 'graph-rag-tools.ts')));
  const selfImproveTools = await import(toURL(path.join(mcpDir, 'self-improve-tools.ts')));

  return {
    handlers: {
      ...wrapHandler('codebase', codebaseTools.handleCodebaseTool),
      ...wrapHandler('graphRag', graphRagTools.handleGraphRagTool),
      ...wrapHandler('selfImprove', selfImproveTools.handleSelfImproveTool),
    },
    toolDefs: [
      ...codebaseTools.codebaseTools,
      ...graphRagTools.graphRagTools,
      ...selfImproveTools.selfImproveTools,
    ],
  };
}

function wrapHandler(prefix: string, handler: (name: string, args: Record<string, unknown>) => Promise<unknown | null>) {
  return { [prefix]: handler };
}

async function callTool(
  handlers: Record<string, (name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    // Try each handler until one returns non-null
    for (const handler of Object.values(handlers)) {
      const result = await handler(name, args);
      if (result !== null) {
        return JSON.stringify(result, null, 2);
      }
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Skill Loader ────────────────────────────────────────────────────────────

function loadSkill(): string {
  const skillPaths = [
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'skills', 'holoscript', 'SKILL.md'),
    path.join(REPO_ROOT, '.claude', 'skills', 'holoscript', 'SKILL.md'),
  ];

  for (const p of skillPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        // Strip YAML frontmatter
        const stripped = content.replace(/^---[\s\S]*?---\s*/, '');
        return stripped.slice(0, 3000); // Keep first 3K chars of skill context
      }
    } catch { /* skip */ }
  }
  return '';
}

// ─── Claude Agent Loop ──────────────────────────────────────────────────────

async function runImprovementCycle(
  anthropic: Anthropic,
  handlers: Record<string, (name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: Config,
  cycleNumber: number,
  skillContext: string,
): Promise<{ improved: boolean; summary: string }> {
  // Convert MCP tool defs to Anthropic format
  const tools: Anthropic.Tool[] = toolDefs.map((t: any) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  const systemPrompt = `You are HoloScript's autonomous self-improvement agent powered by the /holoscript skill.

## /holoscript Skill Context
${skillContext}

## Current Cycle: ${cycleNumber}
## Root Directory: ${config.rootDir}
## Focus Area: ${config.focus}
## Auto-Commit: ${config.commit ? 'YES' : 'NO (dry run)'}

## Your 6-Step Self-Improvement Protocol

1. **ABSORB**: Call holo_graph_status first. If no graph is loaded, call holo_absorb_repo with rootDir="${config.rootDir}" and outputFormat="stats".

2. **DIAGNOSE**: Call holo_self_diagnose with focus="${config.focus}" to get prioritized improvement candidates.

3. **ANALYZE**: Pick the #1 candidate. Use holo_query_codebase or holo_semantic_search to understand the code deeply.

4. **REPORT**: Summarize what you found:
   - What the improvement candidate is
   - Why it matters (impact radius, risk)
   - What specific change you would make
   - Expected quality score impact

5. **VALIDATE**: Call holo_validate_quality with rootDir="${config.rootDir}" to establish the current baseline quality score.

6. **CONCLUDE**: Report the cycle results. Include:
   - Diagnosis summary
   - Top improvement candidate with file + line
   - Current quality score
   - W/P/G wisdom entries extracted (uAA2++ format)
   - Recommended next action

## Rules
- You are the diagnosis + validation + reporting engine, not a code editor.
- Focus on actionable, specific improvements.
- Always check graph status before querying.
- Extract W/P/G wisdom from every cycle (intelligence compounding).
- Be concise.`;

  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Run the self-improvement cycle now. Start with step 1.' },
  ];

  let toolCallCount = 0;
  let finalSummary = '';

  while (toolCallCount < MAX_TOOL_CALLS) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const textBlocks = response.content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      finalSummary = textBlocks.map((b: any) => b.text).join('\n');
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
      break;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      toolCallCount++;
      const input = toolUse.input as Record<string, unknown>;

      if (config.verbose) {
        console.log(`  🔧 [${toolCallCount}/${MAX_TOOL_CALLS}] ${toolUse.name}(${JSON.stringify(input).slice(0, 120)}...)`);
      }

      const result = await callTool(handlers, toolUse.name, input);

      if (config.verbose) {
        console.log(`  📦 ${result.slice(0, 300)}${result.length > 300 ? '...' : ''}`);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    improved: finalSummary.includes('improvement') || finalSummary.includes('candidate'),
    summary: finalSummary,
  };
}

// ─── Quality History ─────────────────────────────────────────────────────────

interface QualityEntry {
  timestamp: string;
  cycle: number;
  summary: string;
}

function appendQualityHistory(entry: QualityEntry): void {
  const dir = path.join(REPO_ROOT, '.holoscript');
  const historyFile = path.join(dir, 'quality-history.json');
  let history: QualityEntry[] = [];
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    }
  } catch { /* start fresh */ }

  history.push(entry);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is required.');
    console.error('   Set it with: $env:ANTHROPIC_API_KEY = "sk-ant-..."');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔁 HoloScript Self-Improvement Runner                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Root:    ${config.rootDir}`);
  console.log(`  Focus:   ${config.focus}`);
  console.log(`  Cycles:  ${config.cycles}`);
  console.log(`  Commit:  ${config.commit ? '✅ YES' : '❌ NO (dry run)'}`);
  console.log(`  Model:   ${MODEL}`);
  console.log('');

  // Load tools directly (bypasses broken MCP server modules)
  console.log('⏳ Loading HoloScript tools...');
  let handlers: Record<string, any>;
  let toolDefs: any[];
  try {
    const loaded = await loadToolHandlers();
    handlers = loaded.handlers;
    toolDefs = loaded.toolDefs;
    console.log(`✅ Loaded ${toolDefs.length} tools`);
  } catch (err: any) {
    console.error(`❌ Failed to load tools: ${err.message}`);
    if (config.verbose) console.error(err.stack);
    process.exit(1);
  }

  // Load /holoscript skill
  const skillContext = loadSkill();
  console.log(`✅ /holoscript skill: ${skillContext ? 'loaded' : 'not found (running without strategic context)'}`);

  const anthropic = new Anthropic();
  console.log('✅ Claude API connected');
  console.log('');

  // Run cycles
  for (let i = 1; i <= config.cycles; i++) {
    console.log(`━━━ Cycle ${i}/${config.cycles} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const startTime = Date.now();

    try {
      const result = await runImprovementCycle(anthropic, handlers, toolDefs, config, i, skillContext);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n📋 Cycle ${i} Summary (${durationSec}s):`);
      console.log(result.summary);

      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: i,
        summary: result.summary.slice(0, 500),
      });

      console.log(`\n✅ Cycle ${i} complete\n`);
    } catch (err: any) {
      console.error(`❌ Cycle ${i} failed: ${err.message}`);
      if (config.verbose) console.error(err.stack);
    }
  }

  console.log('🏁 Self-improvement session complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
