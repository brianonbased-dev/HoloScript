#!/usr/bin/env npx tsx
/**
 * HoloScript Self-Improvement Runner
 *
 * Autonomous self-improvement loop powered by Claude API + HoloScript MCP Server.
 *
 * Architecture:
 *   1. Spawns holoscript-mcp as a child process (stdio transport)
 *   2. Creates a Claude API client with tool_use
 *   3. Sends a system prompt directing the 6-step improvement cycle
 *   4. Claude calls MCP tools, this script proxies tool calls to the MCP server
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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ─── Configuration ───────────────────────────────────────────────────────────

const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(import.meta.dirname, '..');
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_CALLS = 25; // Safety limit per cycle

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

// ─── MCP Client ──────────────────────────────────────────────────────────────

async function createMCPClient(): Promise<Client> {
  const serverPath = path.join(REPO_ROOT, 'packages', 'mcp-server', 'src', 'index.ts');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', serverPath],
    env: { ...process.env, NODE_ENV: 'development' },
  });

  const client = new Client({ name: 'self-improve-runner', version: '1.0.0' }, {});
  await client.connect(transport);
  return client;
}

// ─── Tool Bridge ─────────────────────────────────────────────────────────────

async function getMCPTools(client: Client): Promise<Anthropic.Tool[]> {
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
  }));
}

async function callMCPTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    return text ?? JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Claude Agent Loop ──────────────────────────────────────────────────────

async function runImprovementCycle(
  anthropic: Anthropic,
  mcpClient: Client,
  config: Config,
  cycleNumber: number,
): Promise<{ improved: boolean; summary: string }> {
  const tools = await getMCPTools(mcpClient);

  // Filter to relevant tools for self-improvement
  const relevantTools = tools.filter((t) =>
    t.name.startsWith('holo_') ||
    t.name === 'validate_holoscript' ||
    t.name === 'parse_hs' ||
    t.name === 'parse_holo'
  );

  const systemPrompt = `You are HoloScript's autonomous self-improvement agent. Your job is to make ONE concrete improvement to the HoloScript codebase per cycle.

## Current Cycle: ${cycleNumber}
## Root Directory: ${config.rootDir}
## Focus Area: ${config.focus}
## Auto-Commit: ${config.commit ? 'YES — commit if quality improves' : 'NO — dry run only'}

## Your 6-Step Protocol

1. **ABSORB**: Call holo_graph_status first. If no graph is loaded, call holo_absorb_repo with rootDir="${config.rootDir}" and outputFormat="stats".

2. **DIAGNOSE**: Call holo_self_diagnose with focus="${config.focus}" to get prioritized improvement candidates.

3. **ANALYZE**: Pick the #1 candidate. Use holo_query_codebase or holo_semantic_search to understand the code deeply before making changes.

4. **REPORT**: Summarize what you found:
   - What the improvement candidate is
   - Why it matters (impact radius, risk)
   - What specific change you would make
   - Expected quality score impact

5. **VALIDATE**: Call holo_validate_quality with rootDir="${config.rootDir}" to establish the current baseline quality score.

6. **CONCLUDE**: Report the cycle results clearly. Include:
   - Diagnosis summary
   - Top improvement candidate with file + line
   - Current quality score
   - Recommended action

## Rules
- Do NOT generate or modify code files directly. You are the diagnosis + validation engine.
- Focus on actionable, specific improvements — not vague suggestions.
- Always check graph status before querying.
- Be concise in your analysis.`;

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
      tools: relevantTools,
      messages,
    });

    // Collect the assistant response
    messages.push({ role: 'assistant', content: response.content });

    // Check for text content (final answer)
    const textBlocks = response.content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      finalSummary = textBlocks.map((b: any) => b.text).join('\n');
    }

    // If no tool use, we're done
    if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
      break;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      toolCallCount++;
      const input = toolUse.input as Record<string, unknown>;

      if (config.verbose) {
        console.log(`  🔧 [${toolCallCount}/${MAX_TOOL_CALLS}] ${toolUse.name}(${JSON.stringify(input).slice(0, 100)}...)`);
      }

      const result = await callMCPTool(mcpClient, toolUse.name, input);

      if (config.verbose) {
        console.log(`  📦 Result: ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`);
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
  composite: number;
  grade: string;
  summary: string;
}

function appendQualityHistory(entry: QualityEntry): void {
  const historyFile = path.join(REPO_ROOT, '.holoscript', 'quality-history.json');
  let history: QualityEntry[] = [];
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    }
  } catch { /* start fresh */ }

  history.push(entry);

  const dir = path.dirname(historyFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is required.');
    console.error('   Set it with: set ANTHROPIC_API_KEY=sk-ant-...');
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

  // Create clients
  console.log('⏳ Starting MCP server...');
  let mcpClient: Client;
  try {
    mcpClient = await createMCPClient();
    console.log('✅ MCP server connected');
  } catch (err: any) {
    console.error(`❌ Failed to start MCP server: ${err.message}`);
    process.exit(1);
  }

  const anthropic = new Anthropic();
  console.log('✅ Claude API connected');
  console.log('');

  // Run cycles
  for (let i = 1; i <= config.cycles; i++) {
    console.log(`━━━ Cycle ${i}/${config.cycles} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const startTime = Date.now();

    try {
      const result = await runImprovementCycle(anthropic, mcpClient, config, i);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n📋 Cycle ${i} Summary (${durationSec}s):`);
      console.log(result.summary);

      // Log to quality history
      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: i,
        composite: 0, // Will be populated when holo_validate_quality runs
        grade: 'N/A',
        summary: result.summary.slice(0, 200),
      });

      console.log(`✅ Cycle ${i} complete\n`);
    } catch (err: any) {
      console.error(`❌ Cycle ${i} failed: ${err.message}`);
      if (config.verbose) console.error(err.stack);
    }
  }

  // Cleanup
  try {
    await mcpClient.close();
  } catch { /* best effort */ }

  console.log('🏁 Self-improvement session complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
