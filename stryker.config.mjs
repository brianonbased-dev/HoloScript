/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Only mutate the most critical modules where false-passing tests are dangerous
  mutate: [
    'packages/core/src/parser/HoloScriptParser.ts',
    'packages/core/src/parser/HoloCompositionParser.ts',
    'packages/core/src/parser/HybridChunker.ts',
    'packages/core/src/parser/ParseCache.ts',
    'packages/core/src/compiler/CompilerBase.ts',
    'packages/core/src/compiler/ExportManager.ts',
    'packages/core/src/compiler/ModuleResolver.ts',
    'packages/core/src/runtime/HeadlessRuntime.ts',
    'packages/core/src/network/CRDT.ts',
    'packages/core/src/network/StateSynchronizer.ts',
    'packages/core/src/network/AntiCheat.ts',
  ],
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  timeoutMS: 30000,
  // Vitest plugin options
  vitest: {
    configFile: 'packages/core/vitest.config.ts',
    dir: 'packages/core',
  },
  // Only run on changed files in incremental mode
  incremental: true,
  incrementalFile: '.stryker-cache/incremental.json',
  // Thresholds for mutation score
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
};
