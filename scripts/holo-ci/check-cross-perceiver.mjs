#!/usr/bin/env node
/**
 * check-cross-perceiver.mjs — CI gate for @cross_perceiver_contract.
 *
 * Compiles ONE .holo composition through structurally-different perceiver
 * compilers (webgpu = eye, agent-inference = agent, urdf = robot), re-derives
 * world facts from each EMITTED ARTIFACT, and diffs them into a
 * PerceiverConsensusReceipt.
 *
 * LOAD-BEARING: verdict FALSIFIED is a hard failure — this gate exits 1 and
 * must never be demoted to a warning.
 *
 * Usage:
 *   node scripts/holo-ci/check-cross-perceiver.mjs <file.holo> [--perceivers webgpu,agent-inference,urdf]
 *
 * Exit codes: 0 = CONSENSUS, 1 = FALSIFIED or any error.
 *
 * Runs over core SRC via tsx (same modules the vitest suites exercise), so it
 * does not depend on a rebuilt core dist. RBAC: pass HOLO_CI_AGENT_TOKEN to
 * have each compiler validate a real token; unset = the compilers' own
 * backwards-compatible skip.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreSrc = (rel) =>
  pathToFileURL(path.resolve(__dirname, '../../packages/core/src', rel)).href;

const args = process.argv.slice(2);
const holoPath = args.find((a) => !a.startsWith('--'));
const perceiverFlag = args.find((a) => a.startsWith('--perceivers'));

if (!holoPath) {
  console.error(
    'Usage: node scripts/holo-ci/check-cross-perceiver.mjs <file.holo> [--perceivers webgpu,agent-inference,urdf]'
  );
  process.exit(1);
}

const VALID = ['webgpu', 'agent-inference', 'urdf'];
let perceivers = VALID;
if (perceiverFlag) {
  const raw = perceiverFlag.includes('=')
    ? perceiverFlag.split('=')[1]
    : args[args.indexOf(perceiverFlag) + 1];
  perceivers = (raw ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const unknown = perceivers.filter((p) => !VALID.includes(p));
  if (unknown.length > 0 || perceivers.length < 2) {
    console.error(
      `check-cross-perceiver: need >= 2 of [${VALID.join(', ')}]; got ${JSON.stringify(perceivers)}`
    );
    process.exit(1);
  }
}

const source = readFileSync(holoPath, 'utf8');
const agentToken = process.env.HOLO_CI_AGENT_TOKEN ?? '';

register(); // tsx — lets this .mjs import core TypeScript sources directly

const { parseHolo } = await import(coreSrc('parser/HoloCompositionParser.ts'));
const { derivePerceiverConsensus } = await import(
  coreSrc('reconstruction/PerceiverConsensusReceipt.ts')
);

const parsed = parseHolo(source);
if (!parsed.success || !parsed.ast) {
  const errors = parsed.errors?.map((e) => e.message).join(', ') || 'Unknown parse error';
  console.error(`check-cross-perceiver: failed to parse ${holoPath}: ${errors}`);
  process.exit(1);
}
const composition = parsed.ast;

const derivations = [];
for (const perceiver of perceivers) {
  if (perceiver === 'webgpu') {
    const { WebGPUCompiler } = await import(coreSrc('compiler/WebGPUCompiler.ts'));
    const { deriveWebGPUPerception } = await import(
      coreSrc('reconstruction/webgpuPerceiverDerivation.ts')
    );
    derivations.push(deriveWebGPUPerception(new WebGPUCompiler({}).compile(composition, agentToken)));
  } else if (perceiver === 'agent-inference') {
    const { AgentInferenceCompiler } = await import(
      coreSrc('compiler/AgentInferenceExportTarget.ts')
    );
    const { deriveAgentInferencePerception } = await import(
      coreSrc('reconstruction/agentInferencePerceiverDerivation.ts')
    );
    derivations.push(
      deriveAgentInferencePerception(
        new AgentInferenceCompiler({ language: 'typescript' }).compile(composition, agentToken)
      )
    );
  } else if (perceiver === 'urdf') {
    const { URDFCompiler } = await import(coreSrc('compiler/URDFCompiler.ts'));
    const { deriveUrdfPerception } = await import(
      coreSrc('reconstruction/urdfPerceiverDerivation.ts')
    );
    derivations.push(deriveUrdfPerception(new URDFCompiler({}).compile(composition, agentToken)));
  }
}

const receipt = derivePerceiverConsensus(derivations);
console.log(JSON.stringify(receipt, null, 2));

if (receipt.verdict === 'FALSIFIED') {
  console.error(
    `\ncheck-cross-perceiver: FALSIFIED — ${receipt.disagreements.length} disagreement(s) on ${holoPath}. ` +
      'FALSIFIED is load-bearing: this gate fails hard, never demote it to a warning.'
  );
  process.exit(1);
}
console.error(`\ncheck-cross-perceiver: CONSENSUS across [${perceivers.join(', ')}] for ${holoPath}`);
process.exit(0);
