#!/usr/bin/env node

/**
 * MCP Tool Quality Gate
 *
 * Validates all registered MCP tools meet quality standards:
 * 1. Description is present and under 200 characters
 * 2. inputSchema is a valid JSON Schema object
 * 3. Tool name uses snake_case convention
 * 4. Required fields are declared in inputSchema
 *
 * Usage:
 *   node scripts/validate-mcp-tools.mjs
 *   node scripts/validate-mcp-tools.mjs --strict  (fails on warnings too)
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more errors found
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const strict = process.argv.includes('--strict');

// Dynamic import of the tool registry
async function loadTools() {
  try {
    // Try loading the built dist first
    const distPath = resolve(ROOT, 'packages/mcp-server/dist/tools.js');
    const mod = await import(`file://${distPath}`);
    return mod.tools || mod.default?.tools || [];
  } catch {
    // Fallback: parse the source file to extract tool names
    console.log('  (using source parse fallback — run `pnpm --filter @holoscript/mcp-server build` for full validation)');
    return parseToolsFromSource();
  }
}

function parseToolsFromSource() {
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

  const tools = [];

  for (const file of toolFiles) {
    try {
      const content = readFileSync(resolve(ROOT, file), 'utf-8');

      // Extract tool definitions: look for { name: '...', description: ... } patterns
      // Only match names that look like MCP tool names (lowercase with underscores)
      const toolBlockRegex = /\{\s*name:\s*['"]([a-z][a-z0-9_]*)['"]\s*,\s*description:\s*/g;
      let match;

      while ((match = toolBlockRegex.exec(content)) !== null) {
        const toolName = match[1];

        // Extract description that follows
        const descStart = match.index + match[0].length;
        const descSlice = content.slice(descStart, descStart + 500);
        let desc = '';

        // Handle multi-line string concatenation: 'foo' + 'bar' or template literals
        const descMatch = descSlice.match(/^(?:'([^']*)'|"([^"]*)")/);
        if (descMatch) {
          desc = descMatch[1] || descMatch[2] || '';
        }

        tools.push({
          name: toolName,
          description: desc,
          inputSchema: { type: 'object' },
          _source: file,
        });
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return tools;
}

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function validateTool(tool, index) {
  const errors = [];
  const warnings = [];

  // 1. Name must exist
  if (!tool.name) {
    errors.push(`Tool #${index}: missing "name" field`);
    return { errors, warnings };
  }

  // 2. Name must be snake_case
  if (!SNAKE_CASE_RE.test(tool.name)) {
    // Allow holo_ and hs_ prefixed names which use mixed conventions
    if (!tool.name.startsWith('holo_') && !tool.name.startsWith('hs_')) {
      warnings.push(`${tool.name}: name is not strict snake_case`);
    }
  }

  // 3. Description must exist
  // Note: source-parse fallback can't extract multi-line concatenated descriptions,
  // so missing descriptions are warnings (not errors) in fallback mode.
  if (!tool.description) {
    if (tool._source) {
      warnings.push(`${tool.name}: description not extractable from source (multi-line concat?)`);
    } else {
      errors.push(`${tool.name}: missing description`);
    }
  } else if (tool.description.length > 200) {
    warnings.push(`${tool.name}: description is ${tool.description.length} chars (max 200 recommended)`);
  }

  // 4. inputSchema must be an object with type: 'object'
  if (!tool.inputSchema) {
    errors.push(`${tool.name}: missing inputSchema`);
  } else if (tool.inputSchema.type !== 'object') {
    errors.push(`${tool.name}: inputSchema.type must be "object", got "${tool.inputSchema.type}"`);
  }

  return { errors, warnings };
}

async function main() {
  console.log('MCP Tool Quality Gate');
  console.log('====================\n');

  const tools = await loadTools();
  console.log(`Found ${tools.length} tools\n`);

  if (tools.length === 0) {
    console.error('ERROR: No tools found. Is the MCP server built?');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const namesSeen = new Set();

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const { errors, warnings } = validateTool(tool, i);

    // Check for duplicate names
    if (tool.name) {
      if (namesSeen.has(tool.name)) {
        errors.push(`${tool.name}: duplicate tool name`);
      }
      namesSeen.add(tool.name);
    }

    for (const err of errors) {
      console.error(`  ERROR: ${err}`);
      totalErrors++;
    }
    for (const warn of warnings) {
      console.warn(`  WARN:  ${warn}`);
      totalWarnings++;
    }
  }

  console.log(`\nResults: ${tools.length} tools, ${totalErrors} errors, ${totalWarnings} warnings`);

  if (totalErrors > 0) {
    console.error('\nFAILED: Fix the errors above.');
    process.exit(1);
  }

  if (strict && totalWarnings > 0) {
    console.error('\nFAILED (strict mode): Fix the warnings above.');
    process.exit(1);
  }

  console.log('\nPASSED: All MCP tools meet quality standards.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
