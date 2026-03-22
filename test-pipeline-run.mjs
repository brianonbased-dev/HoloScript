#!/usr/bin/env node
/**
 * Test Pipeline Run — Validates L0→L1→L2 flow via API
 *
 * Target: packages/connector-appstore (18 files, 0 type errors, clean test suite)
 * Mode: single (one pass through all layers)
 *
 * Expected flow:
 * 1. L0: Run daemon on connector-appstore, propose patches
 * 2. L1: Analyze L0 quality trends (needs 2+ cycles, may skip first run)
 * 3. L2: Generate skills from L1 patterns (needs 2+ L1 cycles, may skip first run)
 *
 * REQUIRES: Studio dev server running on http://localhost:3000
 * Start with: cd packages/studio && pnpm dev
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testPipelineRun() {
  console.log('\n🧪 Starting Pipeline Test Run\n');
  console.log('Target: packages/connector-appstore');
  console.log('Mode: single');
  console.log('─'.repeat(60));

  const targetProject = path.join(__dirname, 'packages/connector-appstore');

  try {
    // Check if Studio server is running
    const STUDIO_PORT = 3100; // Studio runs on port 3100
    const STUDIO_URL = `http://localhost:${STUDIO_PORT}`;

    console.log(`\n🔍 Checking Studio server at ${STUDIO_URL}...`);
    const healthCheck = await fetch(`${STUDIO_URL}/api/health`).catch(() => null);

    if (!healthCheck || !healthCheck.ok) {
      console.error('\n❌ Studio server not running!');
      console.error('\nStart it with:');
      console.error('  cd packages/studio && pnpm dev\n');
      process.exit(1);
    }
    console.log('✓ Studio server is running');

    // Start pipeline via API (with auth bypass for testing)
    console.log('\n▶ Starting pipeline via POST /api/pipeline...\n');
    const startResponse = await fetch(`${STUDIO_URL}/api/pipeline?no-auth=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'single',
        targetProject
      })
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start pipeline: ${error}`);
    }

    const result = await startResponse.json();

    console.log(`✓ Pipeline started: ${result.id}`);
    console.log(`✓ LLM Provider: ${result.llmProvider}`);

    // Poll for completion
    console.log('\n⏳ Polling for completion (checking every 5s)...\n');
    let pipelineData;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s

      const statusResponse = await fetch(`${STUDIO_URL}/api/pipeline/${result.id}?no-auth=true`);
      if (!statusResponse.ok) {
        console.error('Failed to get pipeline status');
        break;
      }

      pipelineData = await statusResponse.json();

      // Log progress
      const status = pipelineData.status;
      const l0Cycles = pipelineData.layers[0]?.currentCycleId || 0;
      const l1Cycles = pipelineData.layers[1]?.currentCycleId || 0;
      const l2Cycles = pipelineData.layers[2]?.currentCycleId || 0;

      process.stdout.write(`\r  L0: ${l0Cycles} cycles | L1: ${l1Cycles} cycles | L2: ${l2Cycles} cycles | Status: ${status}  `);

      if (status === 'completed' || status === 'failed' || status === 'paused') {
        console.log('\n');
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log('\n⚠ Timeout after 5 minutes');
      pipelineData = pipelineData || result; // Use whatever we have
    }

    // Display results
    console.log('\n' + '─'.repeat(60));
    console.log('📊 Pipeline Results:\n');
    console.log(`Status: ${pipelineData.status}`);
    console.log(`Total Cost: $${(pipelineData.totalCostUSD || 0).toFixed(4)}`);
    console.log(`Duration: ${pipelineData.endedAt ? ((pipelineData.endedAt - pipelineData.startedAt) / 1000).toFixed(2) + 's' : 'In progress'}`);

    // Layer-specific results
    console.log('\n🔹 Layer 0 (Code Fixer):');
    const l0State = pipelineData.layers?.[0];
    console.log(`  Status: ${l0State?.status || 'idle'}`);
    console.log(`  Cycles: ${l0State?.currentCycleId || 0}`);
    if (l0State?.lastOutput) {
      const output = l0State.lastOutput;
      console.log(`  Files Changed: ${output.filesChanged || 0}`);
      console.log(`  Patches: ${output.patches?.length || 0}`);
    }

    console.log('\n🔹 Layer 1 (Strategy Optimizer):');
    const l1State = pipelineData.layers?.[1];
    console.log(`  Status: ${l1State?.status || 'idle'}`);
    console.log(`  Cycles: ${l1State?.currentCycleId || 0}`);
    if (l1State?.lastOutput) {
      const output = l1State.lastOutput;
      console.log(`  Kind: ${output.kind || 'N/A'}`);
      console.log(`  Rationale: ${(output.rationale || '').slice(0, 100)}...`);
    } else if ((l0State?.currentCycleId || 0) < 2) {
      console.log(`  ⏭ Skipped (needs 2+ L0 cycles)`);
    }

    console.log('\n🔹 Layer 2 (Meta-Strategist):');
    const l2State = pipelineData.layers?.[2];
    console.log(`  Status: ${l2State?.status || 'idle'}`);
    console.log(`  Cycles: ${l2State?.currentCycleId || 0}`);
    if (l2State?.lastOutput) {
      const output = l2State.lastOutput;
      console.log(`  Skills Generated: ${output.newSkills?.length || 0}`);
      console.log(`  Wisdom Entries: ${output.wisdomEntries?.length || 0}`);
    } else if ((l1State?.currentCycleId || 0) < 2) {
      console.log(`  ⏭ Skipped (needs 2+ L1 cycles)`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`\n${pipelineData.status === 'completed' ? '✅' : '⚠'} Pipeline ${pipelineData.status}!`);
    console.log(`\nView details: ${STUDIO_URL}/pipeline/${result.id}\n`);

  } catch (err) {
    console.error('\n❌ Pipeline test failed:');
    console.error(err);
    process.exit(1);
  }
}

testPipelineRun().catch(console.error);
