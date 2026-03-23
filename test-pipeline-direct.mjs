#!/usr/bin/env node
/**
 * Direct Pipeline Test — Bypasses API, runs orchestrator directly
 *
 * This version doesn't require authentication or Studio server.
 * Imports the pipeline orchestrator and runs it directly.
 */

import { PipelineOrchestrator } from './packages/studio/src/lib/recursive/pipelineOrchestrator.ts';
import { detectLLMProviderName } from './packages/studio/src/lib/recursive/llmProvider.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple in-memory store adapter
const createMemoryStore = () => {
  const state = {
    activePipeline: null,
    pipelineHistory: [],
    layerConfigs: {
      0: {
        id: 0,
        name: 'Layer 0: Code Fixer',
        description: 'Runs daemon to propose code patches',
        budget: { maxCostUSD: 2.0, maxDurationMs: 600000, maxCycles: 3 },
        requiresHumanReview: false,
        enabled: true,
      },
      1: {
        id: 1,
        name: 'Layer 1: Strategy Optimizer',
        description: 'Analyzes L0 trends and adjusts strategy',
        budget: { maxCostUSD: 1.0, maxDurationMs: 300000, maxCycles: 2 },
        requiresHumanReview: true,
        enabled: true,
      },
      2: {
        id: 2,
        name: 'Layer 2: Meta-Strategist',
        description: 'Generates skills and wisdom from L1 patterns',
        budget: { maxCostUSD: 1.5, maxDurationMs: 400000, maxCycles: 1 },
        requiresHumanReview: true,
        enabled: true,
      },
    },
    globalFeedback: [],
  };

  return {
    getState: () => state,
    setState: (updates) => Object.assign(state, typeof updates === 'function' ? updates(state) : updates),
    subscribe: () => () => {},
  };
};

async function testPipelineRun() {
  console.log('\n🧪 Direct Pipeline Test\n');
  console.log('Target: packages/connector-appstore');
  console.log('Mode: single');
  console.log('─'.repeat(60));

  const targetProject = path.join(__dirname, 'packages/connector-appstore');
  const provider = detectLLMProviderName();

  console.log(`\n✓ LLM Provider: ${provider}`);

  if (provider === 'ollama') {
    console.warn('⚠ Warning: Using Ollama. Set ANTHROPIC_API_KEY for better results.\n');
  }

  try {
    const store = createMemoryStore();
    const orchestrator = new PipelineOrchestrator(store);

    console.log('▶ Starting pipeline...\n');
    const result = await orchestrator.runPipeline('single', targetProject);

    // Display results
    console.log('\n' + '─'.repeat(60));
    console.log('📊 Pipeline Results:\n');
    console.log(`Status: ${result.status}`);
    console.log(`Total Cost: $${result.totalCostUSD.toFixed(4)}`);
    console.log(`Duration: ${((result.endedAt - result.startedAt) / 1000).toFixed(2)}s`);

    // Layer results
    console.log('\n🔹 Layer 0 (Code Fixer):');
    const l0 = result.layers[0];
    console.log(`  Status: ${l0.status}`);
    console.log(`  Cycles: ${l0.currentCycleId}`);
    if (l0.lastOutput) {
      console.log(`  Files Changed: ${l0.lastOutput.filesChanged || 0}`);
      console.log(`  Patches: ${l0.lastOutput.patches?.length || 0}`);
    }

    console.log('\n🔹 Layer 1 (Strategy Optimizer):');
    const l1 = result.layers[1];
    console.log(`  Status: ${l1.status}`);
    console.log(`  Cycles: ${l1.currentCycleId}`);
    if (l1.lastOutput) {
      console.log(`  Kind: ${l1.lastOutput.kind}`);
      console.log(`  Rationale: ${(l1.lastOutput.rationale || '').slice(0, 100)}...`);
    } else if (l0.currentCycleId < 2) {
      console.log(`  ⏭ Skipped (needs 2+ L0 cycles)`);
    }

    console.log('\n🔹 Layer 2 (Meta-Strategist):');
    const l2 = result.layers[2];
    console.log(`  Status: ${l2.status}`);
    console.log(`  Cycles: ${l2.currentCycleId}`);
    if (l2.lastOutput) {
      console.log(`  Skills Generated: ${l2.lastOutput.newSkills?.length || 0}`);
      console.log(`  Wisdom Entries: ${l2.lastOutput.wisdomEntries?.length || 0}`);
    } else if (l1.currentCycleId < 2) {
      console.log(`  ⏭ Skipped (needs 2+ L1 cycles)`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`\n✅ Pipeline ${result.status}!\n`);

  } catch (err) {
    console.error('\n❌ Pipeline failed:');
    console.error(err);
    process.exit(1);
  }
}

testPipelineRun().catch(console.error);
