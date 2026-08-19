import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 9080 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const receiptsDir = mkdtempSync(join(tmpdir(), 'holoshell-improvement-runs-'));
const traceRoot = mkdtempSync(join(tmpdir(), 'holoshell-holotune-traces-'));
const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSHELL_RECEIPTS_DIR: receiptsDir,
    AI_ECOSYSTEM_DIR: traceRoot,
    HOLOTUNE_TRACE_AGENT_ID: 'agent_brittney',
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

function codebaseFixes(count, start = 1) {
  return Array.from({ length: count }, (_, index) => {
    const runNumber = start + index;
    return {
      fixId: `holoshell_fix_${runNumber}`,
      issue: `HoloShell codebase fix ${runNumber}`,
      summary: `Validated codebase fix ${runNumber}`,
      changedFiles: ['packages/holoshell/serve.mjs', 'apps/holoshell/source/holoshell-improvement-run-loop.hsplus'],
      validationCommands: ['pnpm run test:holoshell-improvement-runs'],
      validationStatus: 'passed',
      receiptPath: join(receiptsDir, `codebase-fix-${runNumber}.json`),
    };
  });
}

try {
  await waitForServer();

  const queued = await fetch(`${baseUrl}/api/improvement-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'Land codebase fixes for HoloShell screen understanding and desktop automation routing',
      runCount: 12,
      enableHolotuneTrace: true,
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const body = await queued.json();
  assert.equal(queued.status, 200, JSON.stringify(body));
  assert.equal(body.status, 'queued');
  assert.equal(body.queuedRunCount, 12);
  assert.equal(body.executionMode, 'codebase_fix_shakedown');
  assert.equal(body.destructiveActionsTaken, false);
  assert.equal(body.approvalRequiredForDesktopAutomation, true);
  assert.equal(body.receipt.codebaseFixPolicy.requiredBeforeCountedExecution, true);
  assert.equal(body.receipt.codebaseFixPolicy.requiredValidationStatus, 'passed');
  assert.equal(body.receipt.codebaseFixPolicy.commitEvidenceFormat, 'git_sha_7_to_40_hex');
  assert.equal(body.receipt.codebaseFixPolicy.filterInvalidEvidenceBeforeBatchLimit, true);
  assert.equal(body.receipt.holotuneTracePolicy.mode, 'defer_until_codebase_fix_shakedown_validated');
  assert.equal(body.receipt.holotuneTracePolicy.serverControlledMode, 'server_controlled_after_codebase_fix_review');
  assert.match(body.receipt.holotuneTracePolicy.reason, /client payloads cannot enable tuning/);
  assert.equal(body.routing.visionUnderstanding.lane, 'vision_language');
  assert.equal(body.routing.faraPeerChat.lane, 'fara_peer_chat');
  assert.equal(body.routing.faraPeerChat.permissionEnvelope, 'read_only');
  assert.equal(body.routing.faraPeerChat.approvalRequired, false);
  assert.equal(body.routing.desktopAutomation.lane, 'fara_gui_grounding');
  assert.match(body.routing.visionUnderstanding.role, /no desktop actuation/);
  assert.match(body.routing.faraPeerChat.role, /read-only peer chat/);
  assert.match(body.routing.desktopAutomation.role, /desktop automation/);
  assert.ok(body.routing.visionUnderstanding.models.some((model) => /qwen3-vl|vision/i.test(`${model.model} ${model.role}`)));
  assert.ok(body.routing.visionUnderstanding.models.every((model) => !/holo-sdf|sdf|geometry|text-to-3d/i.test(`${model.model} ${model.role}`)));
  assert.ok(body.routing.faraPeerChat.models.some((model) => /fara|computer-use/i.test(`${model.model} ${model.role}`)));
  assert.ok(body.routing.desktopAutomation.models.some((model) => /fara|computer-use/i.test(`${model.model} ${model.role}`)));
  assert.ok(body.routingSummary.includes('vision='));
  assert.ok(body.routingSummary.includes('fara_chat='));
  assert.ok(body.routingSummary.includes('desktop='));
  assert.ok(existsSync(body.receipt.receiptPath));

  const historyResponse = await fetch(`${baseUrl}/api/improvement-runs`, {
    signal: AbortSignal.timeout(10_000),
  });
  const history = await historyResponse.json();
  assert.equal(historyResponse.status, 200, JSON.stringify(history));
  assert.equal(history.items[0].runId, body.runId);
  assert.equal(history.items[0].totalExecutedRunCount, 0);
  assert.equal(history.items[0].remainingRunCount, 12);
  assert.ok(history.items.some((item) => item.runId === body.runId));

  const bridgeResponse = await fetch(`${baseUrl}/api/desktop-control/bridge`, {
    signal: AbortSignal.timeout(10_000),
  });
  const bridge = await bridgeResponse.json();
  assert.equal(bridgeResponse.status, 200, JSON.stringify(bridge));
  assert.equal(bridge.destructiveActionsTaken, false);
  assert.equal(bridge.approvalRequiredForDesktopAutomation, true);
  assert.ok(bridge.capabilities.includes('gpu_telemetry_report'));
  assert.ok(bridge.capabilities.includes('consent_token_issue'));
  assert.ok(bridge.capabilities.includes('approved_execution_staging'));
  assert.ok(bridge.capabilities.includes('execution_refusal'));
  assert.ok(bridge.capabilities.includes('receipt_write'));

  const bridgeReportResponse = await fetch(`${baseUrl}/api/desktop-control/bridge/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      report: {
        schemaVersion: 'hololand.holoshell.laptop-desktop-bridge.v0.1.0',
        reportId: 'desktop_bridge_report_test',
        generatedAt: new Date().toISOString(),
        status: 'ready',
        url: 'http://127.0.0.1:8751',
        hostRole: 'laptop_desktop_bridge',
        modelPolicy: { lane: 'fara_gui_grounding', recommendedModel: 'fara:7b', mayExecute: false },
        capabilities: ['bridge_status', 'desktop_action_preflight', 'execution_refusal', 'receipt_write'],
        destructiveActionsTaken: false,
        desktopAutomationExecuted: false,
        approvalRequiredForDesktopAutomation: true,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const bridgeReport = await bridgeReportResponse.json();
  assert.equal(bridgeReportResponse.status, 200, JSON.stringify(bridgeReport));
  assert.equal(bridgeReport.status, 'ready');
  assert.equal(bridgeReport.destructiveActionsTaken, false);
  assert.equal(bridgeReport.desktopAutomationExecuted, false);
  assert.ok(bridgeReport.receipt.capabilities.includes('consent_token_issue'));
  assert.ok(bridgeReport.receipt.capabilities.includes('approved_execution_staging'));
  assert.ok(bridgeReport.receipt.capabilities.includes('execution_refusal'));
  assert.ok(bridgeReport.receipt.capabilities.includes('receipt_write'));
  assert.equal(bridgeReport.receipt.modelPolicy.mayExecute, false);
  assert.equal(bridgeReport.receipt.modelPolicy.mayStageApprovedExecution, true);

  const readyBridgeResponse = await fetch(`${baseUrl}/api/desktop-control/bridge`, {
    signal: AbortSignal.timeout(10_000),
  });
  const readyBridge = await readyBridgeResponse.json();
  assert.equal(readyBridgeResponse.status, 200, JSON.stringify(readyBridge));
  assert.equal(readyBridge.status, 'ready');
  assert.equal(readyBridge.source, 'browser_proxied_laptop_daemon');
  assert.equal(readyBridge.hostRole, 'laptop_desktop_bridge');
  assert.equal(readyBridge.destructiveActionsTaken, false);
  assert.equal(readyBridge.desktopAutomationExecuted, false);
  assert.ok(readyBridge.capabilities.includes('consent_token_issue'));
  assert.ok(readyBridge.capabilities.includes('approved_execution_staging'));
  assert.ok(readyBridge.capabilities.includes('execution_refusal'));
  assert.ok(readyBridge.capabilities.includes('receipt_write'));
  assert.equal(readyBridge.modelPolicy.mayExecute, false);
  assert.equal(readyBridge.modelPolicy.mayStageApprovedExecution, true);

  const firstExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shakedownCount: 10 }),
    signal: AbortSignal.timeout(80_000),
  });
  const firstExecution = await firstExecutionResponse.json();
  assert.equal(firstExecutionResponse.status, 200, JSON.stringify(firstExecution));
  assert.equal(firstExecution.status, 'awaiting_codebase_fix_evidence');
  assert.equal(firstExecution.executionMode, 'codebase_fix_shakedown');
  assert.equal(firstExecution.plannedFixCount, 10);
  assert.equal(firstExecution.executedRunCount, 0);
  assert.equal(firstExecution.totalExecutedRunCount, 0);
  assert.equal(firstExecution.remainingRunCount, 12);
  assert.equal(firstExecution.destructiveActionsTaken, false);
  assert.equal(firstExecution.desktopAutomationExecuted, false);
  assert.equal(firstExecution.approvalRequiredForDesktopAutomation, true);
  assert.equal(firstExecution.desktopBridge.status, 'ready');
  assert.equal(firstExecution.desktopBridge.hostRole, 'laptop_desktop_bridge');
  assert.equal(firstExecution.desktopBridge.destructiveActionsTaken, false);
  assert.equal(firstExecution.gpuBalancePlan.policy.keepFaraDesktopOnly, false);
  assert.equal(firstExecution.gpuBalancePlan.policy.keepFaraPeerChatFree, true);
  assert.equal(firstExecution.gpuBalancePlan.policy.keepFaraDesktopMutationGuarded, true);
  assert.equal(firstExecution.holotuneTrace.status, 'deferred');
  assert.equal(firstExecution.holotuneTrace.reason, 'actual_codebase_fixes_before_tuning');
  assert.equal(firstExecution.holotuneTrace.agentId, 'agent_brittney');
  assert.equal(firstExecution.holotuneTrace.emittedRows, 0);
  assert.ok(firstExecution.gpuBalancePlan.assignments.some((assignment) => assignment.lane === 'vision_language'));
  assert.ok(firstExecution.gpuBalancePlan.assignments.some((assignment) => assignment.lane === 'fara_peer_chat' && assignment.preferredProcessor === 'laptop_rtx3060'));
  assert.ok(firstExecution.gpuBalancePlan.assignments.some((assignment) => assignment.lane === 'fara_gui_grounding' && assignment.preferredProcessor === 'laptop_desktop_bridge'));
  assert.equal(firstExecution.runResults.length, 0);
  assert.ok(existsSync(firstExecution.receipt.receiptPath));
  const tracePath = join(traceRoot, 'traces', 'agent_brittney', 'trace.jsonl');
  assert.equal(existsSync(tracePath), false);

  const unsafeFixes = [
    { ...codebaseFixes(1, 100)[0], destructiveActionsTaken: true },
    { ...codebaseFixes(1, 101)[0], desktopAutomationExecuted: true },
  ];
  const unsafeExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shakedownCount: 2, codebaseFixes: unsafeFixes }),
    signal: AbortSignal.timeout(80_000),
  });
  const unsafeExecution = await unsafeExecutionResponse.json();
  assert.equal(unsafeExecutionResponse.status, 200, JSON.stringify(unsafeExecution));
  assert.equal(unsafeExecution.status, 'awaiting_codebase_fix_evidence');
  assert.equal(unsafeExecution.plannedFixCount, 2);
  assert.equal(unsafeExecution.executedRunCount, 0);
  assert.equal(unsafeExecution.totalExecutedRunCount, 0);
  assert.equal(unsafeExecution.remainingRunCount, 12);
  assert.equal(unsafeExecution.destructiveActionsTaken, false);
  assert.equal(unsafeExecution.desktopAutomationExecuted, false);
  assert.equal(unsafeExecution.runResults.length, 0);
  assert.equal(unsafeExecution.holotuneTrace.status, 'deferred');
  assert.equal(unsafeExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);

  const failedExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shakedownCount: 1,
      codebaseFixes: [{ ...codebaseFixes(1, 102)[0], validationStatus: 'failed' }],
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const failedExecution = await failedExecutionResponse.json();
  assert.equal(failedExecutionResponse.status, 200, JSON.stringify(failedExecution));
  assert.equal(failedExecution.status, 'awaiting_codebase_fix_evidence');
  assert.equal(failedExecution.plannedFixCount, 1);
  assert.equal(failedExecution.executedRunCount, 0);
  assert.equal(failedExecution.totalExecutedRunCount, 0);
  assert.equal(failedExecution.remainingRunCount, 12);
  assert.equal(failedExecution.runResults.length, 0);
  assert.equal(failedExecution.aggregate.validationStatus, 'awaiting_codebase_fix_evidence');
  assert.equal(failedExecution.holotuneTrace.status, 'deferred');
  assert.equal(failedExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);

  const invalidCommitExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shakedownCount: 1,
      codebaseFixes: [{
        ...codebaseFixes(1, 103)[0],
        receiptPath: '',
        commit: 'not-a-commit',
      }],
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const invalidCommitExecution = await invalidCommitExecutionResponse.json();
  assert.equal(invalidCommitExecutionResponse.status, 200, JSON.stringify(invalidCommitExecution));
  assert.equal(invalidCommitExecution.status, 'awaiting_codebase_fix_evidence');
  assert.equal(invalidCommitExecution.plannedFixCount, 1);
  assert.equal(invalidCommitExecution.executedRunCount, 0);
  assert.equal(invalidCommitExecution.totalExecutedRunCount, 0);
  assert.equal(invalidCommitExecution.remainingRunCount, 12);
  assert.equal(invalidCommitExecution.runResults.length, 0);
  assert.equal(invalidCommitExecution.holotuneTrace.status, 'deferred');
  assert.equal(invalidCommitExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);

  const mixedEvidenceExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shakedownCount: 1,
      codebaseFixes: [
        {
          ...codebaseFixes(1, 104)[0],
          receiptPath: '',
          commit: 'not-a-commit',
        },
        {
          ...codebaseFixes(1, 105)[0],
          receiptPath: '',
          commit: '123ABCD',
        },
      ],
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const mixedEvidenceExecution = await mixedEvidenceExecutionResponse.json();
  assert.equal(mixedEvidenceExecutionResponse.status, 200, JSON.stringify(mixedEvidenceExecution));
  assert.equal(mixedEvidenceExecution.status, 'completed_codebase_fix_shakedown');
  assert.equal(mixedEvidenceExecution.executedRunCount, 1);
  assert.equal(mixedEvidenceExecution.totalExecutedRunCount, 1);
  assert.equal(mixedEvidenceExecution.remainingRunCount, 11);
  assert.equal(mixedEvidenceExecution.runResults.length, 1);
  assert.equal(mixedEvidenceExecution.runResults[0].codebaseFix.commit, '123abcd');
  assert.equal(mixedEvidenceExecution.holotuneTrace.status, 'deferred');
  assert.equal(mixedEvidenceExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);

  const secondExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shakedownCount: 10, codebaseFixes: codebaseFixes(2) }),
    signal: AbortSignal.timeout(80_000),
  });
  const secondExecution = await secondExecutionResponse.json();
  assert.equal(secondExecutionResponse.status, 200, JSON.stringify(secondExecution));
  assert.equal(secondExecution.status, 'completed_codebase_fix_shakedown');
  assert.equal(secondExecution.executedRunCount, 2);
  assert.equal(secondExecution.totalExecutedRunCount, 3);
  assert.equal(secondExecution.remainingRunCount, 9);
  assert.equal(secondExecution.holotuneTrace.status, 'deferred');
  assert.equal(secondExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);
  assert.equal(secondExecution.runResults.length, 2);
  assert.ok(secondExecution.runResults.every((result) => result.status === 'validated_codebase_fix'));
  assert.ok(secondExecution.runResults.every((result) => result.validation.status === 'passed'));
  assert.ok(secondExecution.runResults.every((result) => result.codebaseFix.changedFiles.includes('packages/holoshell/serve.mjs')));

  const validCommitExecutionResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shakedownCount: 1,
      codebaseFixes: [{
        ...codebaseFixes(1, 106)[0],
        receiptPath: '',
        commit: 'ABCDEF1',
      }],
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const validCommitExecution = await validCommitExecutionResponse.json();
  assert.equal(validCommitExecutionResponse.status, 200, JSON.stringify(validCommitExecution));
  assert.equal(validCommitExecution.status, 'completed_codebase_fix_shakedown');
  assert.equal(validCommitExecution.executedRunCount, 1);
  assert.equal(validCommitExecution.totalExecutedRunCount, 4);
  assert.equal(validCommitExecution.remainingRunCount, 8);
  assert.equal(validCommitExecution.runResults.length, 1);
  assert.equal(validCommitExecution.runResults[0].codebaseFix.commit, 'abcdef1');
  assert.equal(validCommitExecution.holotuneTrace.status, 'deferred');
  assert.equal(validCommitExecution.holotuneTrace.emittedRows, 0);
  assert.equal(existsSync(tracePath), false);

  const detailResponse = await fetch(`${baseUrl}/api/improvement-runs/${body.runId}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200, JSON.stringify(detail));
  assert.equal(detail.totalExecutedRunCount, 4);
  assert.equal(detail.remainingRunCount, 8);
  assert.equal(detail.executions.length, 7);

  const receiptText = readFileSync(body.receipt.receiptPath, 'utf8');
  assert.match(receiptText, /holoshell-improvement-run-loop\.hsplus/);
  assert.match(receiptText, /visionUnderstanding/);
  assert.match(receiptText, /desktopAutomation/);
  assert.match(receiptText, /codebaseFixPolicy/);
  assert.match(receiptText, /requiredValidationStatus/);
  assert.match(receiptText, /commitEvidenceFormat/);
  assert.match(receiptText, /filterInvalidEvidenceBeforeBatchLimit/);
  assert.match(receiptText, /disallowedEvidence/);
  assert.match(readFileSync(firstExecution.receipt.receiptPath, 'utf8'), /holotuneTrace/);
  assert.match(readFileSync(firstExecution.receipt.receiptPath, 'utf8'), /awaiting_codebase_fix_evidence/);
  assert.match(readFileSync(unsafeExecution.receipt.receiptPath, 'utf8'), /awaiting_codebase_fix_evidence/);
  assert.match(readFileSync(failedExecution.receipt.receiptPath, 'utf8'), /awaiting_codebase_fix_evidence/);
  assert.match(readFileSync(invalidCommitExecution.receipt.receiptPath, 'utf8'), /awaiting_codebase_fix_evidence/);
  assert.match(readFileSync(mixedEvidenceExecution.receipt.receiptPath, 'utf8'), /completed_codebase_fix_shakedown/);

  const serveSource = readFileSync(resolve('packages/holoshell/serve.mjs'), 'utf8');
  assert.match(serveSource, /buildNativeRunRouting/);
  assert.match(serveSource, /buildImprovementExecutionReceipt/);
  assert.match(serveSource, /desktopBridgeStatusSnapshot/);
  assert.match(serveSource, /buildGpuBalancePlan/);
  assert.match(serveSource, /codebaseFixEvidenceFromPayload/);
  assert.match(serveSource, /emitImprovementHolotuneTraces/);
  assert.match(serveSource, /actual_codebase_fixes_before_tuning/);
  assert.match(serveSource, /desktop-bridge-report/);
  assert.match(serveSource, /approvalRequiredForDesktopAutomation/);
  assert.match(serveSource, /normalizeCommitEvidence/);

  const compileSource = readFileSync(resolve('packages/holoshell/compile.mjs'), 'utf8');
  assert.match(compileSource, /improvement-run-panel/);
  assert.match(compileSource, /api\/improvement-runs/);
  assert.match(compileSource, /executeLatestImprovementRun/);
  assert.match(compileSource, /Codebase-fix shakedown/);
  assert.match(compileSource, /HoloTune:/);
  assert.match(compileSource, /improvement-history/);
  assert.match(compileSource, /127\.0\.0\.1:8751/);
  assert.match(compileSource, /127\.0\.0\.1:8752/);
  assert.match(compileSource, /127\.0\.0\.1:8753/);
  assert.match(compileSource, /desktop-control\/bridge\/report/);
} finally {
  if (server.exitCode === null) server.kill();
  rmSync(receiptsDir, { recursive: true, force: true });
  rmSync(traceRoot, { recursive: true, force: true });
}
