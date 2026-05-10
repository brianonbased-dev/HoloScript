import {
  formatDispatchLatencyBenchmarkReport,
  runDispatchPolicyLatencyBenchmark,
} from './DispatchPolicyBenchmark';

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const iterations = readPositiveInteger(
  process.env.DISPATCH_POLICY_BENCHMARK_ITERATIONS ?? args[0],
  100
);
const warmupIterations = readPositiveInteger(
  process.env.DISPATCH_POLICY_BENCHMARK_WARMUP ?? args[1],
  10
);

const report = await runDispatchPolicyLatencyBenchmark({
  iterations,
  warmupIterations,
});

console.log(formatDispatchLatencyBenchmarkReport(report));
