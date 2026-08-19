import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

execFileSync(process.execPath, ['packages/holoshell/compile.mjs'], {
  cwd: process.cwd(),
  stdio: 'pipe',
});

const compileSource = readFileSync(resolve('packages/holoshell/compile.mjs'), 'utf8');
const operateRoomSource = readFileSync(resolve('packages/holoshell/scenes/operate-room.holo'), 'utf8');
const operatorChatSource = readFileSync(resolve('apps/holoshell/source/holoshell-brittney-operator-chat.hsplus'), 'utf8');
const compiledHtml = readFileSync(resolve('packages/holoshell/dist/operate-room.html'), 'utf8');
const deployPowerShell = readFileSync(resolve('scripts/deploy-holoshell-to-jetson.ps1'), 'utf8');
const deployBash = readFileSync(resolve('scripts/deploy-holoshell-to-jetson.sh'), 'utf8');

assert.match(operatorChatSource, /composition "HoloShell Brittney Operator Chat"/);
assert.match(operatorChatSource, /ChatIsPrimaryOperatorSurface/);
assert.match(operatorChatSource, /LaneTruthMustBeVisible/);
assert.match(operatorChatSource, /StaleEvidenceBecomesChatPrompt/);
assert.match(operatorChatSource, /ActionProposalsRenderAsCards/);
assert.match(operatorChatSource, /ContextCarryIsInspectableFromChat/);
assert.match(operatorChatSource, /OperatorEvidenceStaysPeripheral/);
assert.match(operatorChatSource, /chatTranscriptMustBeLargestRegion: true/);
assert.match(operatorChatSource, /mustNotPrecedeChatAsPrimaryStack: true/);

assert.match(operateRoomSource, /operator_chat_source: "apps\/holoshell\/source\/holoshell-brittney-operator-chat\.hsplus"/);
assert.match(operateRoomSource, /Operator Chat v1 keeps the Brittney/);
assert.match(operateRoomSource, /transcript\/input as the focal workbench/);
assert.match(operateRoomSource, /visible_action_proposal_count/);
assert.match(deployPowerShell, /holoshell-brittney-operator-chat\.hsplus/);
assert.match(deployBash, /holoshell-brittney-operator-chat\.hsplus/);

assert.match(compileSource, /operator-state-rail/);
assert.match(compileSource, /operator-alerts/);
assert.match(compileSource, /context-capsule-panel/);
assert.match(compileSource, /operator-chat-shell/);
assert.match(compileSource, /brittney-chat-panel/);
assert.match(compileSource, /operator-left-rail/);
assert.match(compileSource, /operator-right-rail/);
assert.match(compileSource, /brittney-message-stream/);
assert.match(compileSource, /_focusBrittneyChatLayout/);
assert.match(compileSource, /_renderOperatorTruth/);
assert.match(compileSource, /_renderEvidencePrompts/);
assert.match(compileSource, /_renderTurnOperatorCards/);
assert.match(compileSource, /_renderProposalCards/);
assert.match(compileSource, /_renderAgentHandoffCards/);
assert.match(compileSource, /_renderReceiptNarration/);

assert.match(compiledHtml, /id="operator-state-rail"/);
assert.match(compiledHtml, /id="operator-alerts"/);
assert.match(compiledHtml, /id="context-capsule-panel"/);
assert.match(compiledHtml, /operator-chat-shell/);
assert.match(compiledHtml, /brittney-chat-panel/);
assert.match(compiledHtml, /operator-left-rail/);
assert.match(compiledHtml, /operator-right-rail/);
assert.match(compiledHtml, /brittney-message-stream/);
assert.match(compiledHtml, /Proposal: /);
assert.match(compiledHtml, /Agent handoff/);
assert.match(compiledHtml, /Receipt narration/);
assert.match(compiledHtml, /laptop-hardware/);
assert.match(compiledHtml, /receipt-only\/model not invoked/);
assert.match(compiledHtml, /Endpoint inspection is read-only/);
assert.match(compiledHtml, /turn returned without receipt metadata; do not treat as completed evidence/);
assert.doesNotMatch(compiledHtml, /turn completed; receipt metadata not reported/i);
assert.doesNotMatch(compiledHtml, /onclick="[^"]*"/);
