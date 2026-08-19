import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 9070 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const tmpDir = mkdtempSync(join(tmpdir(), 'holoshell-cockpit-'));
const sovereignQueueFixture = join(tmpDir, 'sovereign-room-queue.json');
const sovereignExecutionReceipt = join(tmpDir, 'sovereign-room-execution-receipt.json');
const fakeAiRoot = join(tmpDir, 'ai-ecosystem');

mkdirSync(join(fakeAiRoot, 'hooks'), { recursive: true });
mkdirSync(join(fakeAiRoot, 'scripts'), { recursive: true });

writeFileSync(sovereignQueueFixture, `${JSON.stringify({
  openCount: 2,
  claimableOpenCount: 2,
  tasks: [
    {
      id: 'task_local_fixture',
      title: '[local] test sovereign room from cockpit',
      status: 'open',
      priority: 50,
      tags: ['local', 'sovereign'],
      claimable: true,
    },
    {
      id: 'task_cloud_fixture',
      title: '[cloud] provider work',
      status: 'open',
      priority: 80,
      tags: ['cloud'],
      claimable: true,
    },
    {
      id: 'task_claimed_fixture',
      title: '[local] claimed room task ready for done evidence',
      status: 'claimed',
      priority: 70,
      tags: ['local', 'sovereign'],
      claimable: false,
    },
  ],
}, null, 2)}\n`, 'utf8');

writeFileSync(sovereignExecutionReceipt, `${JSON.stringify({
  schemaVersion: 'hololand.test.execution-receipt.v0.1.0',
  status: 'completed',
  verification: {
    command: 'node scripts/__tests__/holoshell-brittney-cockpit.test.mjs',
  },
  summary: {
    status: 'pass',
  },
}, null, 2)}\n`, 'utf8');

writeFileSync(join(fakeAiRoot, 'hooks', 'team-connect.mjs'), `#!/usr/bin/env node
console.log(JSON.stringify({
  openCount: 2,
  claimableOpenCount: 2,
  tasks: [
    {
      id: 'task_local_fixture',
      title: '[local] test sovereign room from cockpit',
      status: 'open',
      priority: 50,
      tags: ['local', 'sovereign'],
      claimable: true
    },
    {
      id: 'task_cloud_fixture',
      title: '[cloud] provider work',
      status: 'open',
      priority: 80,
      tags: ['cloud'],
      claimable: true
    },
    {
      id: 'task_claimed_fixture',
      title: '[local] claimed room task ready for done evidence',
      status: 'claimed',
      priority: 70,
      tags: ['local', 'sovereign'],
      claimable: false
    }
  ]
}, null, 2));
`, 'utf8');

writeFileSync(join(fakeAiRoot, 'scripts', 'codex-team-daemon.mjs'), `#!/usr/bin/env node
console.log('fake codex heartbeat joined');
`, 'utf8');

writeFileSync(join(fakeAiRoot, 'scripts', 'room-patch-task.mjs'), `#!/usr/bin/env node
const [, , action, taskId] = process.argv;
if (action !== 'claim' || taskId !== 'task_local_fixture') {
  console.error('unexpected fake room claim', action, taskId);
  process.exit(2);
}
console.log('claimed ' + taskId);
`, 'utf8');

writeFileSync(join(fakeAiRoot, 'scripts', 'bullhorn.mjs'), `#!/usr/bin/env node
const [, , command, taskId, commit] = process.argv;
if (command !== 'done' || taskId !== 'task_claimed_fixture' || commit !== 'abc1234') {
  console.error('unexpected fake bullhorn done', command, taskId, commit);
  process.exit(2);
}
console.log('done ' + taskId + ' @' + commit);
`, 'utf8');

execFileSync(process.execPath, [
  'scripts/holoshell-legacy-window-inventory.mjs',
  '--self-test',
  '--output',
  join(tmpDir, 'legacy-window-inventory.json'),
  '--js-output',
  join(tmpDir, 'legacy-window-inventory.js'),
], { cwd: process.cwd(), stdio: 'pipe' });

execFileSync(process.execPath, [
  'scripts/holoshell-operator-brief.mjs',
  '--self-test',
  '--output',
  join(tmpDir, 'operator-brief.json'),
  '--js-output',
  join(tmpDir, 'operator-brief.js'),
], { cwd: process.cwd(), stdio: 'pipe' });

const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSHELL_TMP_DIR: tmpDir,
    HOLOSHELL_ALLOW_QUEUE_FIXTURE: '1',
    AI_ECOSYSTEM_ROOT: fakeAiRoot,
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

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function postJsonExpectStatus(path, payload, status) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

try {
  await waitForServer();

  const liveStatus = await getJson('/api/live-status');
  assert.equal(liveStatus.status, 'online');
  assert.equal(liveStatus.route.cockpitCapsuleEndpoint, 'GET /api/cockpit/capsule');
  assert.equal(liveStatus.route.visualOperatingLayerEndpoint, 'GET /api/visual-operating-layer');
  assert.equal(liveStatus.route.nativeVisualOperatingLayerSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus');
  assert.equal(liveStatus.route.nativeVisualOperatingLayerSchema, 'holoscript.holoshell.native-visual-operating-layer.v0.1.0');
  assert.equal(liveStatus.route.laptopReasoningReportEndpoint, 'POST /api/laptop-reasoning/report');
  assert.equal(liveStatus.route.windowAwarenessReportEndpoint, 'POST /api/window-awareness/report');
  assert.equal(liveStatus.route.browserSessionStateEndpoint, 'GET/POST /api/browser-session/state?sessionId=:sessionId');
  assert.equal(liveStatus.route.primaryHostRole, 'browser_first_local_test_host');
  assert.equal(liveStatus.route.canonicalJetsonSurface, 'http://holojetson.local:8747');
  assert.equal(liveStatus.route.browserFirstTestSurface, 'GET /');
  assert.equal(liveStatus.route.browserFirstReceiptScript, 'scripts/holoshell-brittney-operator-chat-browser-receipt.mjs');
  assert.equal(liveStatus.route.nativeHoloShellWrapper, 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1');
  assert.equal(liveStatus.route.nativeCapabilityEnvelopeSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus');
  assert.equal(liveStatus.route.nativeCapabilityEnvelopeSchema, 'holoscript.holoshell.native-capability-envelope.v0.1.0');
  assert.equal(liveStatus.route.nativeTerminalEventStreamSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus');
  assert.equal(liveStatus.route.nativeTerminalEventStreamSchema, 'holoscript.holoshell.native-terminal-event-stream.v0.1.0');
  assert.equal(liveStatus.route.serviceSupervisorEndpoint, 'GET /api/services/supervisor');
  assert.equal(liveStatus.route.serviceSupervisorWorkflowEndpoint, 'POST /workflow/services/supervisor');
  assert.equal(liveStatus.route.holoclawRuntimeBridgeEndpoint, 'GET /api/holoclaw/runtime-bridge');
  assert.equal(liveStatus.route.holoclawRuntimeBridgeWorkflowEndpoint, 'POST /workflow/holoclaw-runtime-bridge');
  assert.equal(liveStatus.route.sovereignRoomMarathonEndpoint, 'GET /api/sovereign-room/marathon');
  assert.equal(liveStatus.route.sovereignRoomMarathonWorkflowEndpoint, 'POST /workflow/sovereign-room-marathon');
  assert.ok(liveStatus.capabilities.includes('brittney_desktop_cockpit'));
  assert.ok(liveStatus.capabilities.includes('browser_session_snapshot'));
  assert.ok(liveStatus.capabilities.includes('sovereign_room_marathon_status'));
  assert.ok(liveStatus.capabilities.includes('sovereign_room_marathon_receipt_refresh'));
  assert.ok(liveStatus.capabilities.includes('holoclaw_runtime_bridge_status'));
  assert.ok(liveStatus.capabilities.includes('jetson_extension_surface'));
  assert.ok(liveStatus.capabilities.includes('browser_first_test_surface'));
  assert.ok(liveStatus.capabilities.includes('native_holoshell_wrapper_contract'));
  assert.ok(liveStatus.capabilities.includes('native_holoshell_app_window'));
  assert.ok(liveStatus.capabilities.includes('native_capability_envelope'));
  assert.ok(liveStatus.capabilities.includes('native_terminal_event_stream'));
  assert.ok(liveStatus.capabilities.includes('visual_operating_layer'));
  assert.ok(liveStatus.capabilities.includes('native_visual_operating_layer'));
  assert.ok(liveStatus.capabilities.includes('service_dock'));
  assert.ok(liveStatus.capabilities.includes('terminal_run_timeline'));
  assert.ok(liveStatus.capabilities.includes('agent_utility_capsules'));
  assert.ok(liveStatus.capabilities.includes('hololand_node_city'));
  assert.ok(liveStatus.capabilities.includes('consent_command_palette'));
  assert.ok(liveStatus.capabilities.includes('terminal_event_read'));
  assert.ok(liveStatus.capabilities.includes('jetson_appliance_observe'));
  assert.ok(liveStatus.capabilities.includes('guarded_service_ensure'));
  assert.ok(liveStatus.capabilities.includes('holoservices_supervisor'));
  assert.ok(liveStatus.lanes.some((lane) => lane.id === 'jetson_extension_surface' && lane.model === 'holojetson.local:8747'));
  assert.ok(liveStatus.lanes.some((lane) => lane.id === 'native_holoshell_app_window'));
  assert.ok(liveStatus.lanes.some((lane) =>
    lane.id === 'native_capability_envelope' &&
    lane.model === 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus'
  ));
  assert.ok(liveStatus.lanes.some((lane) =>
    lane.id === 'native_terminal_event_stream' &&
    lane.model === 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus'
  ));
  assert.ok(liveStatus.lanes.some((lane) =>
    lane.id === 'native_visual_operating_layer' &&
    lane.model === 'HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus'
  ));
  assert.ok(liveStatus.lanes.some((lane) => lane.id === 'holoservices_supervisor'));
  assert.equal(liveStatus.nativeCapabilityEnvelope.schemaVersion, 'holoscript.holoshell.native-capability-envelope.v0.1.0');
  assert.equal(liveStatus.nativeCapabilityEnvelope.status, 'ready');
  assert.equal(liveStatus.nativeCapabilityEnvelope.matchedLaneCount, 7);
  assert.deepEqual(liveStatus.nativeCapabilityEnvelope.missingLanes, []);
  assert.equal(liveStatus.nativeTerminalEventStream.schemaVersion, 'holoscript.holoshell.native-terminal-event-stream.v0.1.0');
  assert.equal(liveStatus.nativeTerminalEventStream.status, 'ready');
  assert.equal(liveStatus.nativeTerminalEventStream.matchedEventKindCount, 7);
  assert.deepEqual(liveStatus.nativeTerminalEventStream.missingEventKinds, []);
  assert.equal(liveStatus.nativeVisualOperatingLayer.schemaVersion, 'holoscript.holoshell.native-visual-operating-layer.v0.1.0');
  assert.equal(liveStatus.nativeVisualOperatingLayer.status, 'ready');
  assert.equal(liveStatus.nativeVisualOperatingLayer.matchedPanelCount, 5);
  assert.deepEqual(liveStatus.nativeVisualOperatingLayer.missingPanels, []);
  assert.equal(liveStatus.serviceSupervisor.schemaVersion, 'hololand.holoshell.service-supervisor.v0.1.0');
  assert.equal(liveStatus.sovereignRoomMarathon.directExecutionAllowed, false);
  assert.equal(liveStatus.holoclawRuntimeBridge.directExecutionAllowed, false);

  const initialSovereignRoom = await getJson('/api/sovereign-room/marathon');
  assert.equal(initialSovereignRoom.schemaVersion, 'hololand.holoshell.sovereign-room-marathon-status.v0.1.0');
  assert.equal(initialSovereignRoom.source, 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus');
  assert.equal(initialSovereignRoom.statusEndpoint, 'GET /api/sovereign-room/marathon');
  assert.equal(initialSovereignRoom.controlDaemonRoute, 'POST /workflow/sovereign-room-marathon');
  assert.equal(initialSovereignRoom.directExecutionAllowed, false);
  assert.equal(initialSovereignRoom.endpointExecutesRuntime, false);

  const stagedSovereignRoom = await postJson('/workflow/sovereign-room-marathon', {
    intent: 'Review local sovereign queue from the browser without claiming it.',
    taskLane: 'local',
    taskTag: 'local',
    queueFixture: sovereignQueueFixture,
  });
  assert.equal(stagedSovereignRoom.schemaVersion, 'hololand.holoshell.sovereign-room-marathon-response.v0.1.0');
  assert.equal(stagedSovereignRoom.directExecutionAllowed, false);
  assert.equal(stagedSovereignRoom.endpointExecutesRuntime, false);
  assert.equal(stagedSovereignRoom.destructiveActionsTaken, false);
  assert.equal(stagedSovereignRoom.sovereignRoomMarathon.schemaVersion, 'hololand.holoshell.sovereign-room-marathon.v0.1.0');
  assert.equal(stagedSovereignRoom.summary.taskLane, 'local');
  assert.equal(stagedSovereignRoom.summary.taskTag, 'local');
  assert.equal(stagedSovereignRoom.summary.cloudEscalationAllowed, false);
  assert.equal(stagedSovereignRoom.summary.claimAttempted, false);
  assert.equal(stagedSovereignRoom.summary.status, 'ready_to_claim');
  assert.equal(stagedSovereignRoom.summary.selectedTaskId, 'task_local_fixture');

  const unconfirmedClaim = await postJsonExpectStatus('/workflow/sovereign-room-marathon', {
    intent: 'Claim the selected local sovereign room task.',
    taskLane: 'local',
    taskTag: 'local',
    claim: true,
  }, 500);
  assert.match(unconfirmedClaim.error, /local_room_claim_requires_confirmLocalClaim_true/);

  const claimedSovereignRoom = await postJson('/workflow/sovereign-room-marathon', {
    intent: 'Claim the selected local sovereign room task.',
    taskLane: 'local',
    taskTag: 'local',
    selectedTaskId: 'task_local_fixture',
    claim: true,
    confirmLocalClaim: true,
    claimConfirmation: 'local_room_task',
    queueFixture: sovereignQueueFixture,
  });
  assert.equal(claimedSovereignRoom.summary.status, 'claimed');
  assert.equal(claimedSovereignRoom.summary.selectedTaskId, 'task_local_fixture');
  assert.equal(claimedSovereignRoom.summary.claimTaskIdRequested, 'task_local_fixture');
  assert.equal(claimedSovereignRoom.summary.claimRequested, true);
  assert.equal(claimedSovereignRoom.summary.claimAttempted, true);
  assert.equal(claimedSovereignRoom.summary.claimSucceeded, true);
  assert.equal(claimedSovereignRoom.completionClaimAllowed, false);
  assert.equal(claimedSovereignRoom.boardMutationScope, 'claim_local_room_task_only');

  const unconfirmedDone = await postJsonExpectStatus('/workflow/sovereign-room-marathon', {
    intent: 'Mark the claimed local sovereign room task done.',
    taskLane: 'local',
    taskTag: 'local',
    done: true,
    doneTaskId: 'task_claimed_fixture',
    doneCommit: 'abc1234',
    doneEvidence: 'node scripts/__tests__/holoshell-brittney-cockpit.test.mjs',
    doneSummary: 'Closed claimed local fixture task with test evidence.',
    executionReceipt: sovereignExecutionReceipt,
    queueFixture: sovereignQueueFixture,
  }, 500);
  assert.match(unconfirmedDone.error, /local_room_done_requires_confirmLocalDone_true/);

  const doneSovereignRoom = await postJson('/workflow/sovereign-room-marathon', {
    intent: 'Mark the claimed local sovereign room task done.',
    taskLane: 'local',
    taskTag: 'local',
    done: true,
    confirmLocalDone: true,
    doneConfirmation: 'local_room_task_done',
    doneTaskId: 'task_claimed_fixture',
    doneCommit: 'abc1234',
    doneEvidence: 'node scripts/__tests__/holoshell-brittney-cockpit.test.mjs',
    doneSummary: 'Closed claimed local fixture task with test evidence.',
    donePaths: ['scripts/holoshell-sovereign-room-marathon.mjs', 'packages/holoshell/serve.mjs'],
    executionReceipt: sovereignExecutionReceipt,
    queueFixture: sovereignQueueFixture,
  });
  assert.equal(doneSovereignRoom.summary.status, 'done');
  assert.equal(doneSovereignRoom.summary.doneRequested, true);
  assert.equal(doneSovereignRoom.summary.doneAttempted, true);
  assert.equal(doneSovereignRoom.summary.doneSucceeded, true);
  assert.equal(doneSovereignRoom.summary.executionReceiptObserved, true);
  assert.equal(doneSovereignRoom.completionClaimAllowed, true);
  assert.equal(doneSovereignRoom.boardMutationScope, 'mark_claimed_local_room_task_done_only_with_receipt_evidence');

  const latestSovereignRoom = await getJson('/workflow/sovereign-room-marathon/latest');
  assert.equal(latestSovereignRoom.schemaVersion, 'hololand.holoshell.sovereign-room-marathon.v0.1.0');
  assert.equal(latestSovereignRoom.receiptId, doneSovereignRoom.receiptId);

  const stagedSovereignRoomStatus = await getJson('/api/sovereign-room/marathon');
  assert.equal(stagedSovereignRoomStatus.receiptObserved, true);
  assert.equal(stagedSovereignRoomStatus.matchedCandidateCount, 1);
  assert.equal(stagedSovereignRoomStatus.selectedTaskId, 'task_claimed_fixture');
  assert.equal(stagedSovereignRoomStatus.doneAttempted, true);
  assert.equal(stagedSovereignRoomStatus.doneSucceeded, true);

  const holoclawRuntime = await getJson('/api/holoclaw/runtime-bridge');
  assert.equal(holoclawRuntime.schemaVersion, 'hololand.holoshell.holoclaw-runtime-bridge-status.v0.1.0');
  assert.equal(holoclawRuntime.source, 'apps/holoshell/source/holoshell-holoclaw-runtime-bridge.hsplus');
  assert.equal(holoclawRuntime.statusEndpoint, 'GET /api/holoclaw/runtime-bridge');
  assert.equal(holoclawRuntime.controlDaemonRoute, 'POST /workflow/holoclaw-runtime-bridge');
  assert.equal(holoclawRuntime.directExecutionAllowed, false);
  assert.equal(holoclawRuntime.endpointExecutesRuntime, false);
  assert.equal(holoclawRuntime.openClawRuntimeBackendAllowed, false);
  assert.equal(holoclawRuntime.nemoClawRuntimeBackendAllowed, false);

  const stagedHoloClaw = await postJson('/workflow/holoclaw-runtime-bridge', {
    intent: 'Stage HoloClaw as the OpenClaw and NemoClaw replacement for a browser chat turn.',
    runtimeMode: 'tick',
    agentHandle: 'holoclaw',
  });
  assert.equal(stagedHoloClaw.schemaVersion, 'hololand.holoshell.holoclaw-runtime-bridge-response.v0.1.0');
  assert.equal(stagedHoloClaw.directExecutionAllowed, false);
  assert.equal(stagedHoloClaw.endpointExecutesRuntime, false);
  assert.equal(stagedHoloClaw.destructiveActionsTaken, false);
  assert.equal(stagedHoloClaw.holoclawRuntimeBridge.schemaVersion, 'hololand.holoshell.holoclaw-runtime-bridge.v0.1.0');
  assert.equal(stagedHoloClaw.holoclawRuntimeBridge.policy.openClawRuntimeBackendAllowed, false);
  assert.equal(stagedHoloClaw.holoclawRuntimeBridge.policy.nemoClawRuntimeBackendAllowed, false);

  const latestHoloClaw = await getJson('/workflow/holoclaw-runtime-bridge/latest');
  assert.equal(latestHoloClaw.schemaVersion, 'hololand.holoshell.holoclaw-runtime-bridge.v0.1.0');
  assert.equal(latestHoloClaw.summary.bridgeId, stagedHoloClaw.bridgeId);

  const stagedHoloClawRuntime = await getJson('/api/holoclaw/runtime-bridge');
  assert.equal(stagedHoloClawRuntime.receiptObserved, true);
  assert.equal(stagedHoloClawRuntime.bridgeId, stagedHoloClaw.bridgeId);
  assert.equal(stagedHoloClawRuntime.directExecutionAllowed, false);

  const serviceSupervisorStatus = await getJson('/api/services/supervisor');
  assert.equal(serviceSupervisorStatus.schemaVersion, 'hololand.holoshell.service-supervisor.v0.1.0');
  assert.equal(serviceSupervisorStatus.source, 'apps/holoshell/source/holoshell-service-supervisor.hsplus');
  assert.equal(serviceSupervisorStatus.statusEndpoint, 'GET /api/services/supervisor');
  assert.equal(serviceSupervisorStatus.workflowEndpoint, 'POST /workflow/services/supervisor');
  assert.equal(serviceSupervisorStatus.terminalCommandId, 'check_system');
  assert.equal(serviceSupervisorStatus.policy.arbitraryProcessStartAllowed, false);
  assert.equal(serviceSupervisorStatus.policy.forceKillAllowed, false);

  const unconfirmedServiceEnsure = await postJsonExpectStatus('/workflow/services/supervisor', {
    action: 'ensure',
    ensure: true,
  }, 403);
  assert.match(unconfirmedServiceEnsure.reason, /confirmHoloServicesEnsure_true/);

  const laptopReport = await postJson('/api/laptop-reasoning/report', {
    schemaVersion: 'hololand.holoshell.laptop-reasoning-result.v0.1.0',
    resultId: 'laptop_reasoning_result_http_fixture',
    generatedAt: new Date().toISOString(),
    status: 'completed',
    sourceAnchors: {
      workerScript: 'scripts/holoshell-laptop-reasoning-worker.mjs',
    },
    inputDispatch: {
      dispatchId: 'hsdispatch-http-fixture',
      lane: 'laptop-hardware',
    },
    result: {
      modelInvocationPerformed: false,
      deterministicReceiptOnly: true,
      reasoningExecutionMode: 'receipt_consumption_only',
    },
    brittneyPingback: {
      status: 'ready_for_brittney',
    },
    summary: {
      status: 'completed',
      resultId: 'laptop_reasoning_result_http_fixture',
      dispatchId: 'hsdispatch-http-fixture',
      lane: 'laptop-hardware',
      reasoningExecutionMode: 'receipt_consumption_only',
      modelInvocationPerformed: false,
      deterministicReceiptOnly: true,
      laptopGpuStatus: 'reported',
      laptopGpuSummary: 'Fixture RTX: 0% GPU, 256/6144 MiB, no compute process reported',
      laptopGpuProcessCount: 0,
      brittneyPingbackStatus: 'ready_for_brittney',
    },
  });
  assert.equal(laptopReport.schemaVersion, 'hololand.holoshell.laptop-reasoning-report-response.v0.1.0');
  assert.equal(laptopReport.status, 'completed');
  assert.equal(laptopReport.resultId, 'laptop_reasoning_result_http_fixture');
  assert.equal(laptopReport.lane, 'laptop-hardware');
  assert.equal(laptopReport.modelInvocationPerformed, false);
  assert.equal(laptopReport.brittneyPingbackStatus, 'ready_for_brittney');

  const reportedLiveStatus = await getJson('/api/live-status');
  assert.equal(reportedLiveStatus.laptopReasoning.status, 'completed');
  assert.equal(reportedLiveStatus.laptopReasoning.resultId, 'laptop_reasoning_result_http_fixture');
  assert.equal(reportedLiveStatus.laptopReasoning.gpuStatus, 'reported');
  assert.equal(reportedLiveStatus.laptopReasoning.pingbackStatus, 'ready_for_brittney');

  const windowReport = await postJson(
    '/api/window-awareness/report',
    JSON.parse(readFileSync(join(tmpDir, 'legacy-window-inventory.json'), 'utf8')),
  );
  assert.equal(windowReport.schemaVersion, 'hololand.holoshell.window-awareness-report-response.v0.1.0');
  assert.equal(windowReport.status, 'windows_visible');
  assert.equal(windowReport.visibleWindowCount >= 1, true);
  assert.equal(windowReport.rawWindowTitlesIncluded, false);

  const capsule = await getJson('/api/cockpit/capsule');
  assert.equal(capsule.schemaVersion, 'hololand.holoshell.brittney-cockpit-capsule.v0.1.0');
  assert.equal(capsule.source, 'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus');
  assert.equal(capsule.status, 'ready');
  assert.equal(capsule.mode, 'read_only_operator_capsule');
  assert.equal(capsule.destructiveActionsTaken, false);
  assert.equal(capsule.desktopAutomationExecuted, false);
  assert.equal(capsule.summary.cockpitLaneCount, capsule.cockpitLanes.length);
  assert.equal(capsule.summary.actionCardCount, capsule.actionCards.length);
  assert.equal(capsule.summary.windowActionCardCount, 3);
  assert.equal(capsule.summary.preflightPathCount, 3);
  assert.equal(capsule.summary.jetsonExtensionStatus, 'ready');
  assert.equal(capsule.summary.browserFirstTestStatus, 'ready');
  assert.equal(capsule.summary.nativeWrapperStatus, 'source_bound');
  assert.equal(capsule.summary.nativeWindowStatus, 'ready');
  assert.ok(['ready', 'attention', 'waiting'].includes(capsule.summary.serviceSupervisorStatus));
  assert.equal(capsule.summary.nativeVisualOperatingLayerStatus, 'ready');
  assert.equal(capsule.summary.visualOperatingLayerStatus, 'ready');
  assert.equal(capsule.summary.visualOperatingLayerPanelCount, 5);
  assert.equal(capsule.summary.agentUtilityCapsuleCount, 5);
  assert.equal(capsule.summary.nodeCityNodeCount, 8);
  assert.equal(capsule.summary.commandPaletteCommandCount, 6);
  assert.equal(capsule.summary.serviceSupervisorTerminalCommandId, 'check_system');
  assert.equal(typeof capsule.summary.serviceSupervisorServiceCount, 'number');
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'runtime_truth' && lane.permissionEnvelope === 'read_only'));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'route_health' && lane.sourceEndpoint === 'GET /api/cockpit/capsule'));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'jetson_extension' &&
    lane.value === 'browser_first_local_test_host' &&
    lane.browserProvidesBootstrapValidation === true &&
    lane.browserOwnsFirstValidation === false &&
    lane.nativeWindowOwnsDailyOperation === true &&
    lane.nativeWrapperFollowsSameSource === true &&
    lane.browserFirstReceiptScript === 'scripts/holoshell-brittney-operator-chat-browser-receipt.mjs'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'native_holoshell_window' &&
    lane.permissionEnvelope === 'native_app_window' &&
    lane.serviceSupervisorEndpoint === 'GET /api/services/supervisor'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'native_capability_envelope' &&
    lane.sourceEndpoint === 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus' &&
    lane.permissionEnvelope === 'read_only_source_contract'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'visual_operating_layer' &&
    lane.sourceEndpoint === 'GET /api/visual-operating-layer' &&
    lane.upstreamSource === 'HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'holoservices_supervisor' &&
    lane.sourceEndpoint === 'GET /api/services/supervisor' &&
    lane.terminalCommandId === 'check_system'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'context_carry' && /goal, files, tests/.test(lane.detail)));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'source_owned_state' &&
    lane.sourceEndpoint === 'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus' &&
    lane.permissionEnvelope === 'read_only_source_contract'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'browser_session' &&
    lane.sourceEndpoint === 'GET/POST /api/browser-session/state?sessionId=:sessionId' &&
    lane.permissionEnvelope === 'read_only_snapshot'
  ));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'desktop_bridge' && lane.receiptRequired === true));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'laptop_reasoning' && lane.permissionEnvelope === 'read_only'));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'fara_peer_automation' && lane.permissionEnvelope === 'read_only'));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'sovereign_room' &&
    lane.permissionEnvelope === 'guarded_local_claim' &&
    lane.sourceEndpoint === 'GET /api/sovereign-room/marathon' &&
    lane.workflowEndpoint === 'POST /workflow/sovereign-room-marathon' &&
    lane.directExecutionAllowed === false &&
    lane.endpointExecutesRuntime === false
  ));
  assert.ok(capsule.cockpitLanes.some((lane) =>
    lane.id === 'holoclaw_runtime' &&
    lane.permissionEnvelope === 'guarded_execute' &&
    lane.sourceEndpoint === 'GET /api/holoclaw/runtime-bridge' &&
    lane.directExecutionAllowed === false
  ));
  assert.ok(capsule.cockpitLanes.some((lane) => lane.id === 'window_awareness' && lane.permissionEnvelope === 'read_only'));
  assert.equal(capsule.summary.sovereignRoomStatus, 'ready');
  assert.equal(capsule.summary.sovereignRoomReceiptObserved, true);
  assert.equal(capsule.summary.sovereignRoomMatchedCandidateCount, 1);
  assert.equal(capsule.summary.sovereignRoomSelectedTaskId, 'task_claimed_fixture');
  assert.equal(capsule.summary.sovereignRoomSelectedTaskTitle, '[local] claimed room task ready for done evidence');
  assert.equal(capsule.summary.sourceOwnedStateStatus, 'ready');
  assert.equal(capsule.summary.sourceOwnedDomainCount, 5);
  assert.equal(capsule.summary.sourceOwnedSelectedTaskId, 'task_claimed_fixture');
  assert.equal(capsule.sourceOwnedState.schemaVersion, 'hololand.holoshell.source-owned-cockpit-state.v0.1.0');
  assert.deepEqual(capsule.sourceOwnedState.domains, ['agents', 'files', 'worlds', 'receipts', 'board_tasks']);
  assert.equal(capsule.sourceOwnedState.summary.sourceRequiredBeforeProjection, true);
  assert.equal(capsule.sourceOwnedState.summary.sourceFormatGapNamedBeforeAdapterWork, true);
  assert.equal(capsule.sourceOwnedState.files.legacyUiMayNotOwnBehavior, true);
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('scripts/holoshell-brittney-operator-chat-browser-receipt.mjs'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('apps/holoshell/source/holoshell-service-supervisor.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('apps/holoshell/source/holoshell-terminal-event-stream.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('apps/holoshell/source/holoshell-visual-operating-layer.hsplus'));
  assert.ok(capsule.sourceOwnedState.files.sourceAnchors.includes('packages/holoshell/scenes/operate-room.holo'));
  assert.equal(capsule.sourceOwnedState.worlds.canonicalJetsonSurface, 'http://holojetson.local:8747');
  assert.equal(capsule.sourceOwnedState.worlds.browserFirstTestSurface, 'GET /');
  assert.equal(capsule.sourceOwnedState.worlds.nativeHoloShellWrapper, 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1');
  assert.equal(capsule.sourceOwnedState.worlds.nativeHoloShellWindowRole, 'native_holoshell_app_window');
  assert.equal(capsule.sourceOwnedState.worlds.nativeCapabilityEnvelopeSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus');
  assert.equal(capsule.sourceOwnedState.worlds.nativeTerminalEventStreamSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus');
  assert.equal(capsule.sourceOwnedState.worlds.nativeVisualOperatingLayerSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus');
  assert.equal(capsule.sourceOwnedState.worlds.visualOperatingLayerEndpoint, 'GET /api/visual-operating-layer');
  assert.equal(capsule.sourceOwnedState.worlds.serviceSupervisorEndpoint, 'GET /api/services/supervisor');
  assert.equal(capsule.sourceOwnedState.jetsonExtension.schemaVersion, 'hololand.holoshell.jetson-extension-route.v0.1.0');
  assert.equal(capsule.sourceOwnedState.jetsonExtension.browserProvidesBootstrapValidation, true);
  assert.equal(capsule.sourceOwnedState.jetsonExtension.browserOwnsFirstValidation, false);
  assert.equal(capsule.sourceOwnedState.jetsonExtension.nativeWindowOwnsDailyOperation, true);
  assert.equal(capsule.sourceOwnedState.jetsonExtension.nativeWrapperFollowsSameSource, true);
  assert.equal(capsule.sourceOwnedState.jetsonExtension.canonicalJetsonSurface, 'http://holojetson.local:8747');
  assert.equal(capsule.sourceOwnedState.nativeWindow.role, 'native_holoshell_app_window');
  assert.equal(capsule.sourceOwnedState.nativeWindow.upstreamCapabilityEnvelopeStatus, 'ready');
  assert.equal(capsule.sourceOwnedState.nativeWindow.serviceSupervisorEndpoint, 'GET /api/services/supervisor');
  assert.equal(capsule.sourceOwnedState.nativeCapabilityEnvelope.status, 'ready');
  assert.equal(capsule.sourceOwnedState.nativeCapabilityEnvelope.matchedLaneCount, 7);
  assert.deepEqual(capsule.sourceOwnedState.nativeCapabilityEnvelope.missingLanes, []);
  assert.equal(capsule.sourceOwnedState.nativeTerminalEventStream.status, 'ready');
  assert.equal(capsule.sourceOwnedState.nativeTerminalEventStream.matchedEventKindCount, 7);
  assert.deepEqual(capsule.sourceOwnedState.nativeTerminalEventStream.missingEventKinds, []);
  assert.equal(capsule.sourceOwnedState.nativeVisualOperatingLayer.status, 'ready');
  assert.equal(capsule.sourceOwnedState.nativeVisualOperatingLayer.matchedPanelCount, 5);
  assert.deepEqual(capsule.sourceOwnedState.nativeVisualOperatingLayer.missingPanels, []);
  assert.equal(capsule.sourceOwnedState.visualOperatingLayer.endpoint, 'GET /api/visual-operating-layer');
  assert.equal(capsule.sourceOwnedState.visualOperatingLayer.agentReadable, true);
  assert.equal(capsule.sourceOwnedState.services.statusCapabilityLane, 'service_status');
  assert.equal(capsule.sourceOwnedState.services.ensureCapabilityLane, 'guarded_service_ensure');
  assert.equal(capsule.sourceOwnedState.services.terminalCommandId, 'check_system');
  assert.equal(capsule.sourceOwnedState.boardTasks.selectedTaskId, 'task_claimed_fixture');
  assert.equal(capsule.sourceOwnedState.boardTasks.browserMayClaimRoomTask, true);
  assert.equal(capsule.sourceOwnedState.boardTasks.browserClaimRequiresExplicitLocalConfirmation, true);
  assert.equal(capsule.sourceOwnedState.boardTasks.claimMutationScope, 'claim_local_room_task_only');
  assert.equal(capsule.sourceOwnedState.uiProjection.role, 'adapter_projection_only');
  assert.equal(capsule.sourceOwnedState.uiProjection.browserFirstTestSurface, 'GET /');
  assert.equal(capsule.sourceOwnedState.uiProjection.browserProvidesBootstrapValidation, true);
  assert.equal(capsule.sourceOwnedState.uiProjection.browserOwnsFirstValidation, false);
  assert.equal(capsule.sourceOwnedState.uiProjection.nativeWindowOwnsDailyOperation, true);
  assert.equal(capsule.sourceOwnedState.uiProjection.nativeWrapperFollowsSameSource, true);
  assert.equal(capsule.jetsonExtension.canonicalJetsonSurface, 'http://holojetson.local:8747');
  assert.equal(capsule.jetsonExtension.nativeHoloShellWrapper, 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1');
  assert.equal(capsule.nativeWindow.role, 'native_holoshell_app_window');
  assert.equal(capsule.nativeCapabilityEnvelope.status, 'ready');
  assert.equal(capsule.nativeTerminalEventStream.status, 'ready');
  assert.equal(capsule.nativeVisualOperatingLayer.status, 'ready');
  assert.equal(capsule.visualOperatingLayer.schemaVersion, 'hololand.holoshell.visual-operating-layer.v0.1.0');
  assert.equal(capsule.visualOperatingLayer.source, 'apps/holoshell/source/holoshell-visual-operating-layer.hsplus');
  assert.equal(capsule.visualOperatingLayer.upstreamSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus');
  assert.deepEqual(capsule.visualOperatingLayer.panels, ['service_dock', 'terminal_run_timeline', 'agent_utility_capsules', 'hololand_node_city', 'consent_command_palette']);
  assert.equal(capsule.visualOperatingLayer.serviceDock.api, 'GET /api/services/supervisor');
  assert.equal(capsule.visualOperatingLayer.serviceDock.capabilityLane, 'service_status');
  assert.equal(capsule.visualOperatingLayer.terminalRunTimeline.api, 'GET /api/operator-terminal/events');
  assert.equal(capsule.visualOperatingLayer.terminalRunTimeline.capabilityLane, 'terminal_event_read');
  assert.equal(capsule.visualOperatingLayer.agentUtility.requiredFields.includes('api'), true);
  assert.equal(capsule.visualOperatingLayer.agentUtility.capsules.every((capsuleItem) => capsuleItem.agentReadable === true), true);
  assert.equal(capsule.visualOperatingLayer.nodeCity.nodeCount, 8);
  assert.ok(capsule.visualOperatingLayer.nodeCity.nodes.some((node) => node.nodeId === 'hololand' && node.kind === 'spatial_projection'));
  assert.equal(capsule.visualOperatingLayer.commandPalette.commandCount, 6);
  assert.ok(capsule.visualOperatingLayer.commandPalette.commands.some((command) => command.commandId === 'ensure_holo_services' && command.confirmationRequired === true));
  assert.equal(capsule.visualOperatingLayer.safety.browserMayOwnExecution, false);
  const visualLayer = await getJson('/api/visual-operating-layer');
  assert.equal(visualLayer.schemaVersion, 'hololand.holoshell.visual-operating-layer.v0.1.0');
  assert.equal(visualLayer.endpoint, 'GET /api/visual-operating-layer');
  assert.equal(visualLayer.serviceDock.serviceCount, capsule.visualOperatingLayer.serviceDock.serviceCount);
  assert.equal(visualLayer.terminalRunTimeline.permissionEnvelope, 'read_only_event_stream');
  assert.equal(visualLayer.agentUtility.capsuleCount, 5);
  assert.equal(visualLayer.nodeCity.edgeCount, 7);
  assert.equal(visualLayer.commandPalette.commands.every((command) => command.receiptRequired === true), true);
  assert.equal(visualLayer.browserMayOwnExecution, false);
  assert.equal(capsule.serviceSupervisor.schemaVersion, 'hololand.holoshell.service-supervisor.v0.1.0');
  assert.equal(capsule.sovereignRoomMarathon.statusEndpoint, 'GET /api/sovereign-room/marathon');
  assert.equal(capsule.sovereignRoomMarathon.selectedTaskId, 'task_claimed_fixture');
  assert.equal(capsule.summary.holoclawRuntimeBridgeStatus, stagedHoloClawRuntime.status);
  assert.equal(capsule.holoclawRuntimeBridge.statusEndpoint, 'GET /api/holoclaw/runtime-bridge');
  assert.equal(capsule.summary.upstreamTerminalEventStreamStatus, 'ready');
  assert.ok(capsule.summary.operatorTerminalEventStreamEventCount >= 0);
  assert.equal(capsule.summary.browserSessionStateStatus, 'waiting');
  assert.equal(capsule.summary.browserSessionSnapshotStatus, 'empty');
  assert.equal(capsule.browserSessionState.snapshotStatus, 'empty');
  assert.equal(capsule.summary.laptopReasoningLane, 'laptop-hardware');
  assert.equal(capsule.summary.laptopReasoningModelInvocationPerformed, false);
  assert.equal(capsule.summary.laptopReasoningPingbackStatus, 'ready_for_brittney');
  assert.equal(capsule.laptopReasoning.lane, 'laptop-hardware');
  assert.ok(capsule.actionCards.some((card) => card.id === 'desktop_control_plan' && card.permissionEnvelope === 'read_only_plan'));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'browser_first_test_surface' &&
    card.href === '/' &&
    card.lane === 'jetson_extension_surface' &&
    card.canonicalJetsonSurface === 'http://holojetson.local:8747' &&
    card.browserReceiptScript === 'scripts/holoshell-brittney-operator-chat-browser-receipt.mjs' &&
    card.nativeWrapperFollowsSameSource === true &&
    card.nativeWindowOwnsDailyOperation === true
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'native_holoshell_window' &&
    card.lane === 'native_holoshell_app_window' &&
    card.serviceSupervisorEndpoint === 'GET /api/services/supervisor' &&
    card.operatorTerminalSessionEndpoint === 'GET /api/operator-terminal/session' &&
    card.browserSelfTestOnly === true
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'native_capability_envelope' &&
    card.lane === 'native_capability_envelope' &&
    card.sourceEndpoint === 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus' &&
    card.matchedLaneCount === 7 &&
    card.requiredLaneCount === 7
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'holoservices_supervisor_status' &&
    card.href === '/api/services/supervisor' &&
    card.lane === 'holoservices_supervisor' &&
    card.terminalCommandId === 'check_system' &&
    card.endpointMayEnsureServices === false
  ));
  assert.ok(capsule.actionCards.some((card) => card.id === 'laptop_reasoning_status' && card.lane === 'laptop-hardware'));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'source_owned_state' &&
    card.permissionEnvelope === 'read_only_source_contract' &&
    card.primaryAction === 'inspect_source_owned_state'
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'sovereign_room_status' &&
    card.href === '/api/sovereign-room/marathon' &&
    card.mayExecuteWithoutConsent === true &&
    card.endpointExecutesRuntime === false
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'sovereign_room_receipt_refresh' &&
    card.href === '/workflow/sovereign-room-marathon' &&
    card.permissionEnvelope === 'read_only_receipt_refresh' &&
    card.defaultTaskLane === 'local' &&
    card.defaultTaskTag === 'local' &&
    card.cloudEscalationAllowed === false &&
    card.mayExecuteWithoutConsent === true &&
    card.endpointExecutesRuntime === false
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'sovereign_room_claim_local' &&
    card.href === '/workflow/sovereign-room-marathon' &&
    card.permissionEnvelope === 'guarded_local_claim' &&
    card.primaryAction === 'claim_selected_local_room_task' &&
    card.claim === true &&
    card.confirmLocalClaim === true &&
    card.requiresSelectedTaskId === true &&
    card.taskSelectionField === 'selectedTaskId' &&
    card.completionClaimAllowed === false
  ));
  assert.ok(capsule.actionCards.some((card) => card.id === 'fara_peer_automation_pulse' && card.href === '/api/fara-peer-chat/automation-pulse'));
  assert.ok(capsule.actionCards.some((card) => card.id === 'fara_peer_automation_schedule' && card.permissionEnvelope === 'read_only_receipt_schedule'));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'holoclaw_runtime_bridge_status' &&
    card.href === '/api/holoclaw/runtime-bridge' &&
    card.mayExecuteWithoutConsent === true &&
    card.endpointExecutesRuntime === false
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'holoclaw_runtime_bridge_workflow' &&
    card.href === '/workflow/holoclaw-runtime-bridge' &&
    card.permissionEnvelope === 'guarded_execute' &&
    card.mayExecuteWithoutConsent === false
  ));
  assert.ok(capsule.actionCards.some((card) => card.id === 'context_capsule' && card.href === '/api/cockpit/capsule'));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'browser_session_state' &&
    card.href === '/api/browser-session/state' &&
    card.permissionEnvelope === 'read_only_snapshot'
  ));
  assert.ok(capsule.actionCards.some((card) =>
    card.id === 'operator_terminal_events' &&
    card.href === '/api/operator-terminal/events' &&
    card.lane === 'terminal_event_stream' &&
    card.upstreamSource === 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus' &&
    card.requiredCapabilityLane === 'terminal_event_read' &&
    card.browserMayOwnExecution === false
  ));
  assert.equal(capsule.faraPeerAutomation.schedule.status, 'disabled');
  assert.ok(capsule.windowAwareness);
  assert.equal(capsule.windowAwareness.status, 'windows_visible');
  assert.equal(capsule.windowAwareness.summary.rawWindowTitlesIncluded, false);
  assert.equal(capsule.windowAwareness.summary.peerWindowCount, 2);
  assert.equal(capsule.windowAwareness.summary.shellWindowCount, 1);
  assert.ok(capsule.windowAwareness.activeWindow?.rawTitleHidden);
  assert.ok(capsule.windowAwareness.windows.every((window) => window.rawTitleHidden === true));
  assert.ok(capsule.windowAwareness.operatorNextActions.length > 0);
  const focusCard = capsule.actionCards.find((card) => card.id === 'focus_window_preflight');
  const launchCard = capsule.actionCards.find((card) => card.id === 'launch_app_preflight');
  const openUrlCard = capsule.actionCards.find((card) => card.id === 'open_url_preflight');
  assert.equal(focusCard.primaryAction, 'focus_window');
  assert.equal(launchCard.primaryAction, 'launch_app');
  assert.equal(openUrlCard.primaryAction, 'open_url');
  for (const card of [focusCard, launchCard, openUrlCard]) {
    assert.equal(card.planOnly, true);
    assert.equal(card.holoGateRequired, true);
    assert.equal(card.mayExecuteWithoutConsent, false);
    assert.equal(card.preflightPath.planOnlyUntilConsentToken, true);
    assert.deepEqual(card.preflightPath.requiredSequence, [
      'desktop_control_plan',
      'laptop_bridge_preflight',
      'fresh_gesture_proof',
      'consent_token',
      'execution_receipt',
    ]);
  }
  assert.equal(openUrlCard.preflightPath.admittedExecutor, true);
  assert.equal(focusCard.preflightPath.allOtherDesktopActionsRemainPlanOnly, true);
  assert.ok(capsule.actionCards.some((card) => card.id.startsWith('focus_window_window-') && card.target?.rawTitleHidden === true));
  assert.deepEqual(capsule.safety.admittedExecutorActions, ['open_url']);
  assert.equal(capsule.safety.allOtherDesktopActionsRemainPlanOnly, true);
  assert.equal(capsule.safety.browserFirstValidationRequiredBeforeNativeClaim, true);
  assert.equal(capsule.safety.nativeWrapperFollowsSameSource, true);
  assert.equal(capsule.safety.nativeCapabilityEnvelopeSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus');
  assert.equal(capsule.safety.nativeCapabilityEnvelopeRequired, true);
  assert.equal(capsule.safety.nativeCapabilityLanesReady, true);
  assert.ok(capsule.safety.nativeCapabilityGuardedLanes.includes('guarded_service_ensure'));
  assert.equal(capsule.safety.upstreamTerminalEventStreamSource, 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus');
  assert.equal(capsule.safety.upstreamTerminalEventStreamRequired, true);
  assert.equal(capsule.safety.upstreamTerminalEventStreamStatus, 'ready');
  assert.equal(capsule.safety.terminalEventReadCapabilityLane, 'terminal_event_read');
  assert.equal(capsule.safety.browserMayOwnTerminalExecution, false);
  assert.equal(capsule.safety.jetsonIsPrimaryAlwaysOnSurface, true);
  assert.equal(capsule.safety.nativeWindowOwnsDailyOperation, true);
  assert.equal(capsule.safety.browserIsBootstrapSelfTestOnly, true);
  assert.equal(capsule.safety.holoServicesRunThroughTerminalSupervisor, true);
  assert.equal(capsule.safety.serviceEnsureRequiresExplicitConfirmation, true);
  assert.equal(capsule.safety.sovereignRoomBrowserClaimAllowed, true);
  assert.equal(capsule.safety.sovereignRoomBrowserClaimScope, 'claim_local_room_task_only');
  assert.ok(capsule.safety.sovereignRoomClaimRequires.includes('explicit_local_claim_confirmation'));
  assert.equal(capsule.safety.sourceRequiredBeforeProjection, true);
  assert.equal(capsule.safety.sourceFormatGapNamedBeforeAdapterWork, true);
  assert.equal(capsule.safety.legacyUiMayNotOwnBehavior, true);
  assert.equal(capsule.safety.rawWindowTitlesHidden, true);
  assert.equal(capsule.safety.destructiveActionsTaken, false);
  assert.equal(capsule.receipts.latestSovereignRoomMarathonStatus, 'done');
  assert.equal(capsule.receipts.serviceSupervisorReceipt, '.tmp/holoshell/service-supervisor.json');
  assert.ok(capsule.contextCapsuleTemplate.requiredFields.includes('next_command'));
  assert.ok(capsule.contextCapsuleTemplate.memoryInputs.includes('knowledge_store'));
  assert.deepEqual(capsule.contextCapsuleTemplate.surfaceInputs, ['jetson_surface', 'native_window', 'native_capability_envelope', 'terminal_event_stream', 'terminal_run_cards', 'holo_services', 'browser_self_test_receipt']);
  assert.match(capsule.nextSafeStep, /native HoloShell window/);
  assert.match(capsule.nextSafeStep, /Holo Services/);
  assert.match(capsule.nextSafeStep, /preflight -> consent-token -> receipt/);

  const hsplusSource = readFileSync(resolve('apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus'), 'utf8');
  assert.match(hsplusSource, /composition "HoloShell Brittney Desktop Cockpit"/);
  assert.match(hsplusSource, /DesktopMutationStaysBehindHoloGate/);
  assert.match(hsplusSource, /ContextCapsuleCarriesIdentityAcrossCompaction/);
  assert.match(hsplusSource, /WindowAwarePreflightCards/);
  assert.match(hsplusSource, /LaptopReasoningPingbackIsVisible/);
  assert.match(hsplusSource, /FaraPeerAutomationIsVisibleButNonMutating/);
  assert.match(hsplusSource, /SovereignRoomMarathonVisibleAsLocalReceipt/);
  assert.match(hsplusSource, /POST \/workflow\/sovereign-room-marathon/);
  assert.match(hsplusSource, /HoloClawRuntimeVisibleBehindConsent/);
  assert.match(hsplusSource, /GET \/api\/holoclaw\/runtime-bridge/);
  assert.match(hsplusSource, /BrowserRefreshPreservesOperatorSession/);
  assert.match(hsplusSource, /GET\/POST \/api\/browser-session\/state\?sessionId=:sessionId/);
  assert.match(hsplusSource, /window\.localStorage \+ local HoloShell snapshot endpoint/);
  assert.match(hsplusSource, /sessionScopedSnapshots: true/);
  assert.match(hsplusSource, /ParallelChatWorkspacesStayIsolated/);
  assert.match(hsplusSource, /SourceOwnedStateBeforeProjection/);
  assert.match(hsplusSource, /BrowserBootstrapNativeWindowProof/);
  assert.match(hsplusSource, /NativeWindowRunsHoloServicesThroughTerminal/);
  assert.match(hsplusSource, /JetsonExtensionRoute/);
  assert.match(hsplusSource, /NativeHoloShellWindow/);
  assert.match(hsplusSource, /primaryHostRole: "jetson_extension_host"/);
  assert.match(hsplusSource, /canonicalJetsonSurface: "http:\/\/holojetson\.local:8747"/);
  assert.match(hsplusSource, /browserFirstReceiptScript: "scripts\/holoshell-brittney-operator-chat-browser-receipt\.mjs"/);
  assert.match(hsplusSource, /nativeHoloShellWrapper: "apps\/holoshell\/native\/windows\/Start-HoloShellFounderHost\.ps1"/);
  assert.match(hsplusSource, /nativeHoloShellWindowRole: "native_holoshell_app_window"/);
  assert.match(hsplusSource, /nativeCapabilityEnvelopeSource: "HoloScript:experiments\/holoshell-human-os-frontier\/native-holoshell-capability-envelope\.hsplus"/);
  assert.match(hsplusSource, /nativeTerminalEventStreamSource: "HoloScript:experiments\/holoshell-human-os-frontier\/native-terminal-event-stream\.hsplus"/);
  assert.match(hsplusSource, /nativeCapabilityEnvelopeRequired: true/);
  assert.match(hsplusSource, /upstreamTerminalEventStreamRequired: true/);
  assert.match(hsplusSource, /serviceSupervisorEndpoint: "GET \/api\/services\/supervisor"/);
  assert.match(hsplusSource, /serviceSupervisorTerminalCommandId: "check_system"/);
  assert.match(hsplusSource, /sourceOwnedStateSchema: "hololand\.holoshell\.source-owned-cockpit-state\.v0\.1\.0"/);
  assert.match(hsplusSource, /sourceOwnedDomains: \["agents", "files", "worlds", "receipts", "board_tasks"\]/);
  assert.match(hsplusSource, /browserChatWorkspaceIds: \["brittney", "sovereign", "holoclaw", "terminal", "improvement"\]/);
  assert.match(hsplusSource, /holoshell:brittney:browser-session:v1/);

  const operateRoomSource = readFileSync(resolve('packages/holoshell/scenes/operate-room.holo'), 'utf8');
  assert.match(operateRoomSource, /brittney_cockpit_source/);
  assert.match(operateRoomSource, /source_owned_state_schema: "hololand\.holoshell\.source-owned-cockpit-state\.v0\.1\.0"/);
  assert.match(operateRoomSource, /canonical_jetson_surface: "http:\/\/holojetson\.local:8747"/);
  assert.ok(operateRoomSource.includes('browser_first_test_surface: "GET /"'));
  assert.match(operateRoomSource, /browser_first_receipt_script: "scripts\/holoshell-brittney-operator-chat-browser-receipt\.mjs"/);
  assert.match(operateRoomSource, /native_holoshell_wrapper: "apps\/holoshell\/native\/windows\/Start-HoloShellFounderHost\.ps1"/);
  assert.match(operateRoomSource, /native_capability_envelope_source: "HoloScript:experiments\/holoshell-human-os-frontier\/native-holoshell-capability-envelope\.hsplus"/);
  assert.match(operateRoomSource, /native_terminal_event_stream_source: "HoloScript:experiments\/holoshell-human-os-frontier\/native-terminal-event-stream\.hsplus"/);
  assert.match(operateRoomSource, /native HoloShell app window is the product target/i);
  assert.match(operateRoomSource, /service_supervisor_endpoint: "GET \/api\/services\/supervisor"/);
  assert.match(operateRoomSource, /laptop_reasoning_lane: "laptop-hardware"/);
  assert.match(operateRoomSource, /GET \/api\/cockpit\/capsule/);

  const compileSource = readFileSync(resolve('packages/holoshell/compile.mjs'), 'utf8');
  assert.match(compileSource, /brittney-cockpit/);
  assert.match(compileSource, /loadCockpitCapsule/);
  assert.match(compileSource, /cockpit-reasoning/);
  assert.match(compileSource, /laptop_reasoning_status/);
  assert.match(compileSource, /_inspectSovereignRoomMarathon/);
  assert.match(compileSource, /_sendSovereignRoomChat/);
  assert.match(compileSource, /\/workflow\/sovereign-room-marathon/);
  assert.match(compileSource, /Sovereign Room/);
  assert.match(compileSource, /_inspectHoloClawRuntimeBridge/);
  assert.match(compileSource, /\/api\/holoclaw\/runtime-bridge/);
  assert.match(compileSource, /HOLOSHELL_BROWSER_STATE_SCHEMA/);
  assert.match(compileSource, /holoshell:brittney:browser-session:v1/);
  assert.match(compileSource, /HOLOSHELL_CHAT_WORKSPACES/);
  assert.match(compileSource, /transcriptByChat/);
  assert.match(compileSource, /parallel-chat-stack/);
  assert.match(compileSource, /_sendHoloClawChat/);
  assert.match(compileSource, /\/workflow\/holoclaw-runtime-bridge/);
  assert.match(compileSource, /_restoreBrowserSession/);
  assert.match(compileSource, /_hydrateBrowserSessionFromServer/);
  assert.match(compileSource, /_browserSessionStateEndpoint/);
  assert.match(compileSource, /_browserStateStorageKey/);
  assert.match(compileSource, /\/api\/browser-session\/state/);
  assert.match(compileSource, /localStorage/);
  assert.match(compileSource, /cockpit-action-cards/);
  assert.match(compileSource, /native-proof-strip/);
  assert.match(compileSource, /Browser Self-Test/);
  assert.match(compileSource, /Source Envelope/);
  assert.match(compileSource, /Terminal Events/);
  assert.match(compileSource, /native_capability_envelope/);
  assert.match(compileSource, /Holo Services/);
  assert.match(compileSource, /Native Window/);
  assert.match(compileSource, /Start-HoloShellFounderHost\.ps1/);
  assert.match(compileSource, /sourceOwnedState/);
  assert.match(compileSource, /cockpit-source/);
  assert.match(compileSource, /\/api\/cockpit\/capsule/);
} finally {
  if (server.exitCode === null) {
    server.kill();
  }
}
