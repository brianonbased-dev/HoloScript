import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 8870 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSCRIPT_API_KEY: '',
    HOLOSCRIPT_MCP_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', (chunk) => { stdout += chunk; });
server.stderr.on('data', (chunk) => { stderr += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`HoloShell server exited early (${server.exitCode})\n${stdout}\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/substrate-pressure`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for HoloShell server\n${stdout}\n${stderr}`);
}

async function postChat(message, extra = {}) {
  const response = await fetch(`${baseUrl}/api/brittney/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, selfTest: true, ...extra }),
    signal: AbortSignal.timeout(80_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

function readTurnReceipt(turnId) {
  return JSON.parse(readFileSync(resolve('.tmp', 'holoshell', 'brittney-turns', `${turnId}.json`), 'utf8'));
}

try {
  await waitForServer();

  const status = await postChat('whats the status of the system?');
  assert.match(status.reply, /System status: online/);
  assert.doesNotMatch(status.reply, /System status:\s*unknown/i);
  assert.doesNotMatch(status.reply, /Avatar status:\s*unknown/i);
  assert.doesNotMatch(status.reply, /No active capabilities/i);
  assert.doesNotMatch(status.reply, /NaN/);
  assert.match(status.reply, /Model library:/);
  assert.match(status.reply, /Native resources:/);
  assert.equal(status.systemStatus.status, 'online');
  assert.ok(status.systemStatus.capabilityCount >= 10);
  assert.ok(status.systemStatus.laneCount >= 7);
  assert.equal(status.systemStatus.route.improvementRunEndpoint, 'POST /api/improvement-runs');
  assert.equal(status.systemStatus.route.desktopBridgeReportEndpoint, 'POST /api/desktop-control/bridge/report');
  assert.equal(status.systemStatus.route.laptopReasoningReportEndpoint, 'POST /api/laptop-reasoning/report');
  assert.equal(status.systemStatus.route.operatorTerminalReportEndpoint, 'POST /api/operator-terminal/report');
  assert.equal(status.systemStatus.route.windowAwarenessReportEndpoint, 'POST /api/window-awareness/report');
  assert.equal(status.systemStatus.route.holoclawRuntimeBridgeEndpoint, 'GET /api/holoclaw/runtime-bridge');
  assert.equal(status.systemStatus.route.holoclawRuntimeBridgeWorkflowEndpoint, 'POST /workflow/holoclaw-runtime-bridge');
  assert.ok(status.systemStatus.capabilities.includes('vision_model_routing'));
  assert.ok(status.systemStatus.capabilities.includes('improvement_run_queue'));
  assert.ok(status.systemStatus.capabilities.includes('codebase_fix_shakedown'));
  assert.ok(status.systemStatus.capabilities.includes('holotune_trace_deferred'));
  assert.ok(status.systemStatus.capabilities.includes('desktop_bridge_browser_report'));
  assert.ok(status.systemStatus.capabilities.includes('laptop_hardware_reasoning_receipts'));
  assert.ok(status.systemStatus.capabilities.includes('holoclaw_runtime_bridge_status'));
  assert.equal(status.systemStatus.holoclawRuntimeBridge.directExecutionAllowed, false);
  assert.equal(status.systemStatus.laptopReasoning.lane, 'laptop-hardware');
  assert.equal(status.selectedBrain.id, 'gamedev');
  assert.equal(status.selectedCompatibilitySkill.id, 'gamedev');
  assert.equal(status.brainSelection.schema, 'holollama-brain-router.selection.v1');
  assert.equal(status.brainSelection.selectedBrainId, 'gamedev');
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'codebase_fix' && /actual patch|validation/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'laptop_hardware' && /GPU telemetry truth|reasoning dispatch/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'vision_language' && /screen and image|vision model stack/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'fara_peer_chat' && /read-only peer chat|co-planning/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'fara_gui_grounding' && /desktop automation/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.lanes.some((lane) =>
    lane.id === 'holoclaw_runtime' && /consent-gated HoloScript agent runtime bridge/i.test(lane.role)
  ));
  assert.ok(status.systemStatus.modelLibrary.catalogCount >= 1);
  assert.ok(status.systemStatus.nativeResources.holoClawSkillCount >= 1);
  assert.match(status.reply, /Improvement runs:/);
  assert.match(status.reply, /HoloClaw runtime bridge:/);
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'summarize_live_system_status'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'inspect_gpu_lane_balance'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'inspect_laptop_hardware_reasoning_receipt'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'inspect_model_library'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'inspect_holoclaw_skill_shelf'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'inspect_holoclaw_runtime_bridge_status'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'stage_holoclaw_runtime_bridge_with_approval'));
  assert.ok(status.proposals.some((proposal) => proposal.operation === 'queue_codebase_fix_shakedown_batch'));
  assert.ok(!status.proposals.some((proposal) => proposal.operation === 'dispatch_laptop_reasoning_job'));
  const statusReceipt = readTurnReceipt(status.turnId);
  assert.equal(statusReceipt.prompt, 'whats the status of the system?');
  assert.equal(statusReceipt.runtime.routingIntentProvided, true);
  assert.equal(statusReceipt.selectedBrain.id, 'gamedev');
  assert.equal(statusReceipt.summary.selectedBrainId, 'gamedev');
  assert.notEqual(statusReceipt.runtime.laptopReasoningDelegation.status, 'delegated');

  const gaps = await postChat('what are your edges and gaps?');
  assert.equal(gaps.systemStatus, null);
  assert.ok(!gaps.proposals.some((proposal) => proposal.operation === 'dispatch_laptop_reasoning_job'));
  assert.doesNotMatch(gaps.reply, /hsdispatch-/i);
  assert.doesNotMatch(gaps.reply, /initiated and is awaiting result/i);
  const gapsReceipt = readTurnReceipt(gaps.turnId);
  assert.equal(gapsReceipt.prompt, 'what are your edges and gaps?');
  assert.equal(gapsReceipt.runtime.routingIntentProvided, true);
  assert.notEqual(gapsReceipt.runtime.laptopReasoningDelegation.status, 'delegated');

  const next = await postChat('what are our next steps?');
  assert.match(next.reply, /Next steps, grounded in live HoloShell state/);
  assert.match(next.reply, /Fara/i);
  assert.match(next.reply, /vision models read screens\/images/i);
  assert.match(next.reply, /Fara peer chat is read-only\/free/i);
  assert.match(next.reply, /Fara desktop plans remain guarded/i);
  assert.match(next.reply, /HoloClaw as the native agent-runtime gate/i);
  assert.match(next.reply, /No cube\/test object is needed/);
  assert.doesNotMatch(next.reply, /Begin with a minimal test object/i);
  assert.doesNotMatch(next.reply, /NaN/);
  assert.match(next.reply, /patch.*targeted validation/i);
  assert.match(next.reply, /Tuning waits/i);
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'plan_receipt_backed_codebase_fix_batch'));
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'plan_desktop_control_with_fara'));
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'route_task_to_native_model_or_skill'));
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'queue_codebase_fix_shakedown_batch'));
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'inspect_holoclaw_runtime_bridge_status'));
  assert.ok(next.proposals.some((proposal) => proposal.operation === 'separate_vision_from_desktop_automation'));

  const addressed = await postChat(
    'Brittney, use founder-language inspiration to separate cloud focus from local Jetson focus.',
    { brain: 'narrative' }
  );
  assert.equal(addressed.systemStatus, null);
  assert.doesNotMatch(addressed.reply, /System status: online/);
  assert.equal(addressed.receiptType, 'hololand.holoshell.brittney-turn.v0.1.0');
  assert.equal(addressed.selectedBrain.id, 'narrative');
  assert.equal(addressed.selectedCompatibilitySkill.id, 'narrative');

  const relational = await postChat('Brittney, how are we doing together right now?');
  assert.equal(relational.systemStatus, null);
  assert.doesNotMatch(relational.reply, /System status: online/);
  assert.equal(relational.receiptType, 'hololand.holoshell.brittney-turn.v0.1.0');

  const guardrail = await postChat('Please restart holoshell-surface immediately and modify the app backend without an approval receipt.');
  assert.equal(guardrail.systemStatus, null);
  assert.doesNotMatch(guardrail.reply, /System status: online/);
  assert.equal(guardrail.receiptType, 'hololand.holoshell.brittney-turn.v0.1.0');

  const laptopReasoning = await postChat(
    'Brittney, send a read-only reasoning job to the laptop hardware lane so it can inspect the repo/backend/autonomy seams and return a receipt.'
  );
  assert.equal(laptopReasoning.systemStatus, null);
  assert.doesNotMatch(laptopReasoning.reply, /System status: online/);
  assert.ok(laptopReasoning.proposals.some((proposal) => proposal.operation === 'dispatch_laptop_reasoning_job'));
  assert.equal(laptopReasoning.receiptType, 'hololand.holoshell.brittney-turn.v0.1.0');

  const serveSource = readFileSync(resolve('packages/holoshell/serve.mjs'), 'utf8');
  assert.match(serveSource, /tegrastatsGpuSnapshot/);
  assert.match(serveSource, /Number\.isFinite/);
  assert.match(serveSource, /GPU util not reported/);
  assert.match(serveSource, /modelLibrarySnapshot/);
  assert.match(serveSource, /nativeResourceSnapshot/);
  assert.match(serveSource, /directCatalogByName/);
  assert.match(serveSource, /baseCatalogByName/);
} finally {
  if (server.exitCode === null) {
    server.kill();
  }
}
