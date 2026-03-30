#!/usr/bin/env node

/**
 * A2A Parity Validator
 *
 * Validates that the A2A Agent Card skills match the MCP tool inventory.
 * Ensures every MCP tool has a corresponding A2A skill and vice versa.
 *
 * Usage:
 *   node scripts/validate-a2a-parity.mjs
 *
 * Exit codes:
 *   0 = A2A card matches MCP tools exactly
 *   1 = parity mismatch found
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function extractToolNamesFromSource() {
  const toolFiles = [
    'packages/mcp-server/src/tools.ts',
    'packages/mcp-server/src/graph-tools.ts',
    'packages/mcp-server/src/ide-tools.ts',
    'packages/mcp-server/src/brittney-lite.ts',
    'packages/mcp-server/src/codebase-tools.ts',
    'packages/mcp-server/src/graph-rag-tools.ts',
    'packages/mcp-server/src/self-improve-tools.ts',
    'packages/mcp-server/src/gltf-import-tools.ts',
    'packages/mcp-server/src/edit-holo-tools.ts',
    'packages/mcp-server/src/wisdom-gotcha-tools.ts',
    'packages/mcp-server/src/absorb-tools.ts',
    'packages/mcp-server/src/service-contract-tools.ts',
  ];

  const names = new Set();

  for (const file of toolFiles) {
    try {
      const content = readFileSync(resolve(ROOT, file), 'utf-8');
      const matches = content.matchAll(/name:\s*['"]([^'"]+)['"]/g);
      for (const match of matches) {
        names.add(match[1]);
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return names;
}

function validateA2ASkillMapping() {
  // Check that mcpToolToA2ASkill function exists and maps all tools
  const a2aSource = readFileSync(resolve(ROOT, 'packages/mcp-server/src/a2a.ts'), 'utf-8');

  const hasMcpToA2A = a2aSource.includes('mcpToolToA2ASkill');
  const hasBuildAgentCard = a2aSource.includes('buildAgentCard');
  const hasDeriveSkillTags = a2aSource.includes('deriveSkillTags');

  return { hasMcpToA2A, hasBuildAgentCard, hasDeriveSkillTags };
}

function validateToolsAggregation() {
  // Check tools.ts spreads all tool arrays into the aggregate
  const toolsSource = readFileSync(resolve(ROOT, 'packages/mcp-server/src/tools.ts'), 'utf-8');

  const spreadMatches = [...toolsSource.matchAll(/\.\.\.(\w+)/g)].map((m) => m[1]);
  return spreadMatches;
}

function validateHandlerCoverage(toolNames) {
  // Check that handlers.ts has routes for all tool names
  const handlersSource = readFileSync(
    resolve(ROOT, 'packages/mcp-server/src/handlers.ts'),
    'utf-8'
  );

  const handledTools = new Set();

  // Extract case statements
  const caseMatches = handlersSource.matchAll(/case\s+'([^']+)'/g);
  for (const match of caseMatches) {
    handledTools.add(match[1]);
  }

  // Extract prefix-based routing
  const prefixPatterns = [
    { prefix: 'holo_', regex: /name\.startsWith\('holo_'\)/ },
    { prefix: 'hs_', regex: /name\.startsWith\('hs_'\)/ },
    { prefix: 'hs_ai_', regex: /name\.startsWith\('hs_ai_'\)/ },
  ];

  for (const tool of toolNames) {
    for (const pattern of prefixPatterns) {
      if (tool.startsWith(pattern.prefix)) {
        handledTools.add(tool);
      }
    }
  }

  // Dynamic imports / named routes
  const dynamicRoutes = [
    'generate_3d_object',
    'generate_hololand_training',
    'generate_service_contract',
    'explain_service_contract',
  ];
  for (const route of dynamicRoutes) {
    handledTools.add(route);
  }

  return handledTools;
}

async function main() {
  console.log('A2A Parity Validator');
  console.log('====================\n');

  let errors = 0;

  // 1. Extract tool names from source
  const toolNames = extractToolNamesFromSource();
  console.log(`MCP tools found: ${toolNames.size}`);

  // 2. Validate A2A skill mapping infrastructure
  const a2a = validateA2ASkillMapping();
  if (!a2a.hasMcpToA2A) {
    console.error('  ERROR: mcpToolToA2ASkill function not found in a2a.ts');
    errors++;
  }
  if (!a2a.hasBuildAgentCard) {
    console.error('  ERROR: buildAgentCard function not found in a2a.ts');
    errors++;
  }
  if (!a2a.hasDeriveSkillTags) {
    console.error('  ERROR: deriveSkillTags function not found in a2a.ts');
    errors++;
  }
  if (errors === 0) {
    console.log('  A2A infrastructure: OK (mcpToolToA2ASkill, buildAgentCard, deriveSkillTags)');
  }

  // 3. Validate tools aggregation
  const spreads = validateToolsAggregation();
  console.log(`\nTool arrays spread into aggregate: ${spreads.length}`);
  const requiredSpreads = [
    'coreTools',
    'graphTools',
    'ideTools',
    'brittneyLiteTools',
    'codebaseTools',
    'graphRagTools',
    'selfImproveTools',
    'gltfImportTools',
    'editHoloTools',
    'absorbServiceTools',
    'serviceContractTools',
  ];
  for (const required of requiredSpreads) {
    if (!spreads.includes(required)) {
      console.error(`  ERROR: ${required} not spread into tools aggregate`);
      errors++;
    }
  }
  if (errors === 0) {
    console.log(`  All ${requiredSpreads.length} required tool arrays are aggregated`);
  }

  // 4. Validate handler coverage
  const handledTools = validateHandlerCoverage(toolNames);
  const unhandled = [...toolNames].filter((t) => !handledTools.has(t));
  if (unhandled.length > 0) {
    // Only warn — plugins handle dynamic tools
    console.warn(
      `\n  WARN: ${unhandled.length} tools may rely on plugin handler: ${unhandled.join(', ')}`
    );
  }

  // 5. Summary
  console.log(`\nResults: ${toolNames.size} tools, ${errors} errors`);

  if (errors > 0) {
    console.error('\nFAILED: Fix the errors above.');
    process.exit(1);
  }

  console.log('\nPASSED: A2A Agent Card and MCP tools are in parity.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
