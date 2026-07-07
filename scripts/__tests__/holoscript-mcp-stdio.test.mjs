#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_GROUPS,
  buildCommandForGroup,
  missingBuildGroups,
  stdioServerPath,
  validateAbsorbBackgroundContract,
} from '../holoscript-mcp-stdio.mjs';

test('local MCP launcher tracks the required build groups in dependency order', () => {
  assert.deepEqual(
    BUILD_GROUPS.map((group) => group.id),
    ['core', 'absorb-service', 'mcp-server']
  );
  assert.ok(
    BUILD_GROUPS[0].requiredFiles.includes('packages/core/dist/index.cjs'),
    'core CJS package root is required for CJS local MCP consumers'
  );
});

test('missingBuildGroups reports only groups with missing sentinel files', () => {
  const missing = new Set(['packages/core/dist/index.cjs', 'packages/mcp-server/dist/index.js']);
  const exists = (file) => {
    const normalized = String(file).replace(/\\/g, '/');
    return ![...missing].some((suffix) => normalized.endsWith(suffix));
  };

  assert.deepEqual(
    missingBuildGroups(exists, 'C:/repo').map((group) => group.id),
    ['core', 'mcp-server']
  );
});

test('build command uses the workspace package filter', () => {
  const core = BUILD_GROUPS.find((group) => group.id === 'core');
  const command = buildCommandForGroup(core);

  assert.match(command.command, /^corepack(\.cmd)?$/);
  assert.deepEqual(command.args, ['pnpm', '--filter', '@holoscript/core', 'run', 'build']);
});

test('stdioServerPath delegates to the packaged MCP stdio bin', () => {
  assert.match(
    stdioServerPath('C:/repo').replace(/\\/g, '/'),
    /C:\/repo\/packages\/mcp-server\/bin\/holoscript-mcp\.cjs$/
  );
});

test('absorb background contract requires async schema and status polling tool', () => {
  const result = validateAbsorbBackgroundContract([
    {
      name: 'holo_absorb_repo',
      inputSchema: {
        properties: {
          rootDir: { type: 'string' },
          async: { type: 'boolean' },
          background: { type: 'boolean' },
        },
      },
    },
    { name: 'holo_get_absorb_status', inputSchema: { properties: {} } },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.properties, ['rootDir', 'async', 'background']);
});

test('absorb background contract fails on stale pre-async schemas', () => {
  assert.throws(
    () =>
      validateAbsorbBackgroundContract([
        {
          name: 'holo_absorb_repo',
          inputSchema: {
            properties: {
              rootDir: { type: 'string' },
              force: { type: 'boolean' },
            },
          },
        },
        { name: 'holo_get_absorb_status', inputSchema: { properties: {} } },
      ]),
    /inputSchema missing async/
  );
});
