process.env.BENCHMARK_CRITIC_LOOP = '1';
process.argv = [
  process.argv[0],
  new URL('../run-vitest.mjs', import.meta.url).pathname,
  'src/self-improvement/__tests__/OutcomeLoop.benchmark.test.ts',
];

await import('../run-vitest.mjs');
