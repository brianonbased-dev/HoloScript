import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 9290 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const receiptsDir = mkdtempSync(join(tmpdir(), 'holoshell-fara-peer-automation-'));
const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSHELL_RECEIPTS_DIR: receiptsDir,
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

try {
  await waitForServer();

  const liveResponse = await fetch(`${baseUrl}/api/live-status`, {
    signal: AbortSignal.timeout(10_000),
  });
  const live = await liveResponse.json();
  assert.equal(liveResponse.status, 200, JSON.stringify(live));
  assert.equal(live.route.faraPeerAutomationEndpoint, 'POST /api/fara-peer-chat/automation-pulse');
  assert.equal(live.route.faraPeerAutomationHistoryEndpoint, 'GET /api/fara-peer-chat/automation-pulses');
  assert.equal(live.route.faraPeerAutomationScheduleEndpoint, 'POST /api/fara-peer-chat/automation-schedule');
  assert.equal(live.route.faraPeerAutomationPromotionEndpoint, 'POST /api/fara-peer-chat/promote-proposal');
  assert.equal(live.route.holoclawRuntimeBridgeEndpoint, 'GET /api/holoclaw/runtime-bridge');
  assert.equal(live.route.holoclawRuntimeBridgeWorkflowEndpoint, 'POST /workflow/holoclaw-runtime-bridge');
  assert.ok(live.capabilities.includes('fara_peer_automation_pulse'));
  assert.ok(live.capabilities.includes('fara_peer_automation_schedule'));
  assert.ok(live.capabilities.includes('fara_peer_proposal_promotion'));
  assert.ok(live.capabilities.includes('holoclaw_runtime_bridge_status'));
  assert.equal(live.faraPeerAutomation.schedule.status, 'disabled');
  assert.equal(live.holoclawRuntimeBridge.directExecutionAllowed, false);

  const pulseResponse = await fetch(`${baseUrl}/api/fara-peer-chat/automation-pulse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'Keep HoloShell moving without desktop mutation',
      cadence: 'manual-test',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const pulse = await pulseResponse.json();
  assert.equal(pulseResponse.status, 200, JSON.stringify(pulse));
  assert.equal(pulse.status, 'pulse_recorded');
  assert.equal(pulse.lane, 'fara_peer_chat');
  assert.deepEqual(pulse.participants, ['brittney', 'fara']);
  assert.equal(pulse.permissionEnvelope, 'read_only');
  assert.equal(pulse.approvalRequired, false);
  assert.equal(pulse.automationMode, 'receipt_and_proposals_only');
  assert.equal(pulse.hiddenAutomationAllowed, false);
  assert.equal(pulse.desktopMutationAllowed, false);
  assert.equal(pulse.destructiveActionsTaken, false);
  assert.equal(pulse.desktopAutomationExecuted, false);
  assert.ok(pulse.nextSafeActions.some((action) =>
    action.operation === 'inspect_holoclaw_runtime_bridge_status' &&
    action.lane === 'holoclaw_runtime' &&
    action.route === 'GET /api/holoclaw/runtime-bridge' &&
    action.permissionEnvelope === 'read_only'
  ));
  assert.ok(pulse.nextSafeActions.some((action) => action.operation === 'queue_codebase_fix_shakedown_batch'));
  assert.ok(pulse.nextSafeActions.every((action) => action.automationMayExecute === false));
  assert.ok(existsSync(pulse.receipt.receiptPath));

  const onDisk = JSON.parse(readFileSync(pulse.receipt.receiptPath, 'utf8'));
  assert.equal(onDisk.source, 'apps/holoshell/source/holoshell-fara-peer-automation.hsplus');
  assert.equal(onDisk.pulseId, pulse.pulseId);
  assert.equal(onDisk.receiptRequired, true);

  const historyResponse = await fetch(`${baseUrl}/api/fara-peer-chat/automation-pulses`, {
    signal: AbortSignal.timeout(10_000),
  });
  const history = await historyResponse.json();
  assert.equal(historyResponse.status, 200, JSON.stringify(history));
  assert.equal(history.items[0].pulseId, pulse.pulseId);
  assert.equal(history.items[0].permissionEnvelope, 'read_only');
  assert.equal(history.items[0].desktopAutomationExecuted, false);

  const cockpitResponse = await fetch(`${baseUrl}/api/cockpit/capsule`, {
    signal: AbortSignal.timeout(10_000),
  });
  const cockpit = await cockpitResponse.json();
  assert.equal(cockpitResponse.status, 200, JSON.stringify(cockpit));
  assert.ok(cockpit.cockpitLanes.some((lane) =>
    lane.id === 'fara_peer_automation' &&
    lane.permissionEnvelope === 'read_only' &&
    lane.status === 'ready'
  ));
  assert.ok(cockpit.actionCards.some((card) =>
    card.id === 'fara_peer_automation_pulse' &&
    card.href === '/api/fara-peer-chat/automation-pulse' &&
    card.mayExecuteWithoutConsent === true
  ));
  assert.ok(cockpit.actionCards.some((card) =>
    card.id === 'fara_peer_automation_schedule' &&
    card.href === '/api/fara-peer-chat/automation-schedule' &&
    card.permissionEnvelope === 'read_only_receipt_schedule'
  ));
  assert.equal(cockpit.faraPeerAutomation.latestPulse.pulseId, pulse.pulseId);
  assert.equal(cockpit.destructiveActionsTaken, false);
  assert.equal(cockpit.desktopAutomationExecuted, false);

  const scheduleResponse = await fetch(`${baseUrl}/api/fara-peer-chat/automation-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intervalMs: 60_000,
      objective: 'Scheduled read-only Fara/Brittney pulse test',
      cadence: 'scheduled-test',
      runImmediately: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const schedule = await scheduleResponse.json();
  assert.equal(scheduleResponse.status, 200, JSON.stringify(schedule));
  assert.equal(schedule.status, 'enabled');
  assert.equal(schedule.schedule.intervalMs, 60_000);
  assert.equal(schedule.schedule.hiddenAutomationAllowed, false);
  assert.equal(schedule.schedule.destructiveActionsTaken, false);
  assert.equal(schedule.schedule.desktopAutomationExecuted, false);
  assert.equal(schedule.immediatePulse.cadence, 'scheduled-test');
  assert.equal(schedule.immediatePulse.hiddenAutomationAllowed, false);
  assert.equal(schedule.immediatePulse.desktopAutomationExecuted, false);
  assert.ok(existsSync(schedule.immediatePulse.receiptPath));

  const scheduleStatusResponse = await fetch(`${baseUrl}/api/fara-peer-chat/automation-schedule`, {
    signal: AbortSignal.timeout(10_000),
  });
  const scheduleStatus = await scheduleStatusResponse.json();
  assert.equal(scheduleStatusResponse.status, 200, JSON.stringify(scheduleStatus));
  assert.equal(scheduleStatus.schedule.status, 'enabled');
  assert.equal(scheduleStatus.schedule.lastPulseId, schedule.immediatePulse.pulseId);

  const promotionResponse = await fetch(`${baseUrl}/api/fara-peer-chat/promote-proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pulseId: pulse.pulseId,
      operation: 'queue_codebase_fix_shakedown_batch',
      runCount: 3,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const promotion = await promotionResponse.json();
  assert.equal(promotionResponse.status, 200, JSON.stringify(promotion));
  assert.equal(promotion.status, 'promoted_to_improvement_run_queue');
  assert.equal(promotion.permissionEnvelope, 'receipt_backed_queue');
  assert.equal(promotion.approvalRequiredForDesktopAutomation, true);
  assert.equal(promotion.hiddenAutomationAllowed, false);
  assert.equal(promotion.destructiveActionsTaken, false);
  assert.equal(promotion.desktopAutomationExecuted, false);
  assert.equal(promotion.queuedRun.queuedRunCount, 3);
  assert.ok(existsSync(promotion.receipt.receiptPath));
  assert.ok(existsSync(promotion.queuedRun.receiptPath));

  const promotionHistoryResponse = await fetch(`${baseUrl}/api/fara-peer-chat/promotions`, {
    signal: AbortSignal.timeout(10_000),
  });
  const promotionHistory = await promotionHistoryResponse.json();
  assert.equal(promotionHistoryResponse.status, 200, JSON.stringify(promotionHistory));
  assert.equal(promotionHistory.items[0].promotionId, promotion.promotionId);
  assert.equal(promotionHistory.items[0].promotedRunId, promotion.promotedRunId);
  assert.equal(promotionHistory.items[0].desktopAutomationExecuted, false);

  const improvementHistoryResponse = await fetch(`${baseUrl}/api/improvement-runs`, {
    signal: AbortSignal.timeout(10_000),
  });
  const improvementHistory = await improvementHistoryResponse.json();
  assert.equal(improvementHistoryResponse.status, 200, JSON.stringify(improvementHistory));
  assert.ok(improvementHistory.items.some((item) => item.runId === promotion.promotedRunId));

  const blockedPromotionResponse = await fetch(`${baseUrl}/api/fara-peer-chat/promote-proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pulseId: pulse.pulseId,
      operation: 'check_desktop_bridge_readiness',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const blockedPromotion = await blockedPromotionResponse.json();
  assert.equal(blockedPromotionResponse.status, 403, JSON.stringify(blockedPromotion));
  assert.equal(blockedPromotion.error, 'proposal_is_read_only_and_not_promotable');
  assert.equal(blockedPromotion.destructiveActionsTaken, false);
  assert.equal(blockedPromotion.desktopAutomationExecuted, false);

  const disableScheduleResponse = await fetch(`${baseUrl}/api/fara-peer-chat/automation-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMs: 0 }),
    signal: AbortSignal.timeout(10_000),
  });
  const disabledSchedule = await disableScheduleResponse.json();
  assert.equal(disableScheduleResponse.status, 200, JSON.stringify(disabledSchedule));
  assert.equal(disabledSchedule.schedule.status, 'disabled');
  assert.equal(disabledSchedule.destructiveActionsTaken, false);
  assert.equal(disabledSchedule.desktopAutomationExecuted, false);
} finally {
  server.kill();
  rmSync(receiptsDir, { recursive: true, force: true });
}
