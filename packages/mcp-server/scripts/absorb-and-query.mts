/**
 * absorb-and-query.mts
 * 
 * Direct invocation of HoloScript MCP codebase tools for strategic absorption.
 * Runs holo_absorb_repo, holo_graph_status, and holo_query_codebase on key packages.
 */

import { handleCodebaseTool } from '../src/codebase-tools.js';
import { handleSelfImproveTool } from '../src/self-improve-tools.js';
import path from 'path';

const REPO_ROOT = path.resolve('c:/Users/josep/Documents/GitHub/HoloScript');

function section(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function pretty(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  section('1. GRAPH STATUS — check existing cache');
  const status = await handleCodebaseTool('holo_graph_status', {});
  pretty(status);

  section('2. ABSORB — repo root (stats only, fast)');
  const absorb = await handleCodebaseTool('holo_absorb_repo', {
    rootDir: REPO_ROOT,
    outputFormat: 'stats',
    languages: ['typescript'],
    maxFiles: 5000,
  });
  pretty(absorb);

  section('3. QUERY — community detection (module clusters)');
  const communities = await handleCodebaseTool('holo_query_codebase', {
    query: 'show all module communities',
    queryType: 'communities',
  });
  pretty(communities);

  section('4. QUERY — find useMCPSceneGen (Sprint 11 hook)');
  const hook = await handleCodebaseTool('holo_query_codebase', {
    query: 'find useMCPSceneGen',
    queryType: 'find',
    symbolName: 'useMCPSceneGen',
  });
  pretty(hook);

  section('5. QUERY — find GLTFPipeline (OOM target)');
  const gltf = await handleCodebaseTool('holo_query_codebase', {
    query: 'find GLTFPipeline',
    queryType: 'find',
    symbolName: 'GLTFPipeline',
  });
  pretty(gltf);

  section('6. QUERY — callers of handleSelfImproveTool');
  const selfImproveCallers = await handleCodebaseTool('holo_query_codebase', {
    query: 'callers of handleSelfImproveTool',
    queryType: 'callers',
    symbolName: 'handleSelfImproveTool',
  });
  pretty(selfImproveCallers);

  section('7. QUERY — studio package imports');
  const studioImports = await handleCodebaseTool('holo_query_codebase', {
    query: 'imports of packages/studio/src/hooks/useLOD.ts',
    queryType: 'imports',
    filePath: 'packages/studio/src/hooks/useLOD.ts',
  });
  pretty(studioImports);

  section('8. QUERY — rigidbody_block (physics↔network coupling)');
  const rigidbody = await handleCodebaseTool('holo_query_codebase', {
    query: 'find rigidbody_block',
    queryType: 'find',
    symbolName: 'rigidbody_block',
  });
  pretty(rigidbody);

  section('9. SELF-IMPROVE — diagnose quality on mcp-server');
  const diag = await handleSelfImproveTool('holo_diagnose', {
    rootDir: path.join(REPO_ROOT, 'packages/mcp-server/src'),
  });
  pretty(diag);

  section('DONE');
}

main().catch((e) => {
  console.error('Absorb script failed:', e);
  process.exit(1);
});
