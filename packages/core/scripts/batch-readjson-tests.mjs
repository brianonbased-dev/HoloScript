import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src');

const skip = new Set(['VulnerabilityScannerTrait.test.ts']);
const relFiles = [
  '__tests__/performancetracker.test.ts',
  '__tests__/lsp-traitdocs.test.ts',
  '__tests__/scenenode-constructor-and-transforms.test.ts',
  'export/__tests__/GistPublicationManifest.test.ts',
  'traits/__tests__/MQTTSourceTrait.test.ts',
  'traits/__tests__/MQTTSourceTrait.prod.test.ts',
  'traits/__tests__/IoTPipeline.integration.test.ts',
  'traits/MQTTSourceTrait.test.ts',
  'reconstruction/__tests__/HoloMapAnchoredManifest.test.ts',
  'world/__tests__/Sovereign3DAdapter.test.ts',
  '__tests__/world-model-bootstrap.test.ts',
  'world/__tests__/SovereignWorldAdapter.test.ts',
  'export/gltf/__tests__/GLTFExporter.test.ts',
  '__tests__/thingdescriptiongenerator-class.test.ts',
  '__tests__/integration/spatial-training-data.integration.test.ts',
  '__tests__/SceneManager.test.ts',
  '__tests__/exhaustive-match.test.ts',
  '__tests__/compiler/IncrementalCompiler.prod.test.ts',
  '__tests__/Profiling.test.ts',
  '__tests__/LoggerSystem.test.ts',
  'sourcemap/SourceMapV2.test.ts',
  'profiling/__tests__/Profiler.prod.test.ts',
  'hitl/__tests__/NotificationService.test.ts',
  'audit/__tests__/AuditLogger.test.ts',
  'traits/__tests__/RenderNetworkTrait.network.test.ts',
  'traits/__tests__/LocalLLMTrait.test.ts',
  'traits/__tests__/GlobalIlluminationTrait.prod.test.ts',
  'editor/__tests__/EditorPersistence.prod.test.ts',
  'debug/__tests__/OTLPExporter.test.ts',
  'cli/__tests__/daemon-discord-bridge.e2e.test.ts',
  'traits/visual/__tests__/TraitCombinationSnapshots.test.ts',
  'profiling/__tests__/Profiler.test.ts',
  'export/agent-card/__tests__/AgentCardExporter.test.ts',
  'compiler/identity/__tests__/GrandmaExploitRedTeam.test.ts',
  '__tests__/performance/PerformanceReportGenerator.test.ts',
  '__tests__/integration/PerformanceTrackingIntegration.test.ts',
];

let changed = 0;
for (const rel of relFiles) {
  const file = path.join(src, rel);
  const base = path.basename(file);
  if (skip.has(base)) continue;
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  let t = fs.readFileSync(file, 'utf8');
  if (!t.includes('JSON.parse(')) {
    console.log('skip (no JSON.parse):', rel);
    continue;
  }
  t = t.replace(/JSON.parse\(/g, 'readJson(');
  if (!/import\s*\{[^}]*readJson/.test(t)) {
    // `rel` uses `/`; never split with path.sep (on Windows that yields depth 0 for `a/b/c`).
    const relPosix = rel.replace(/\\/g, '/');
    const dir = path.posix.dirname(relPosix);
    const depth = dir === '.' || dir === '' ? 0 : dir.split('/').filter(Boolean).length;
    const imp = ('../'.repeat(depth) + 'errors/safeJsonParse').replace(/\\/g, '/');
    const importLine = `import { readJson } from '${imp}';\n`;
    const m = t.match(/^(import\s+[^;]+;\s*\n)/m);
    if (m) {
      t = t.slice(0, m.index + m[0].length) + importLine + t.slice(m.index + m[0].length);
    } else {
      t = importLine + t;
    }
  }
  fs.writeFileSync(file, t);
  changed++;
  console.log('ok', rel);
}
console.log('updated', changed);
