#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const bashPath = path.join(REPO_ROOT, 'scripts', 'deploy-holoshell-to-jetson.sh');
const psPath = path.join(REPO_ROOT, 'scripts', 'deploy-holoshell-to-jetson.ps1');

assert.ok(existsSync(bashPath), 'bash deploy wrapper must exist');
assert.ok(existsSync(psPath), 'PowerShell deploy wrapper must exist');

const bash = readFileSync(bashPath, 'utf8');
assert.match(bash, /JETSON_IP:-192\.168\.0\.119/, 'bash wrapper must have Jetson IP fallback');
assert.match(bash, /resolve_bin "\$\{SSH_BIN:-\}" ssh\.exe ssh/, 'bash wrapper must resolve ssh.exe/ssh consistently');
assert.match(bash, /resolve_bin "\$\{SCP_BIN:-\}" scp\.exe scp/, 'bash wrapper must resolve scp.exe/scp consistently');
assert.match(bash, /BatchMode=yes/, 'bash wrapper must use batch SSH');
assert.match(bash, /StrictHostKeyChecking=accept-new/, 'bash wrapper must avoid interactive host-key prompts');
assert.match(bash, /tool_path/, 'bash wrapper must convert local paths for Windows executables');
assert.match(bash, /powershell\.exe/, 'bash wrapper must be able to discover the Windows profile from WSL or Git Bash');
assert.match(bash, /check_wrapper_parity/, 'bash wrapper must compare local and Jetson wrapper hashes');
assert.match(bash, /packages\/holoshell\/serve\.mjs/, 'bash wrapper must parity-check serve.mjs');
assert.match(bash, /scripts\/holoshell-brittney-turn\.mjs/, 'bash wrapper must parity-check Brittney turn wrapper');
assert.match(bash, /scripts\/holoshell-sovereign-room-marathon\.mjs/, 'bash wrapper must sync Sovereign Room adapter');
assert.match(bash, /scripts\/holoshell-holoclaw-runtime-bridge\.mjs/, 'bash wrapper must sync HoloClaw runtime adapter');
assert.match(bash, /scripts\/holoshell-terminal-event-stream\.mjs/, 'bash wrapper must sync terminal event stream adapter');
assert.match(bash, /packages\/holollama\/dist/, 'bash wrapper must sync HoloLlama Brain selector dist');
assert.match(bash, /holoshell-brittney-runtime-bridge\.hsplus/, 'bash wrapper must sync Brittney runtime bridge source');
assert.match(bash, /Jetson chat wrapper parity mismatch/, 'bash wrapper must fail loudly on hash mismatch');

const powershell = readFileSync(psPath, 'utf8');
assert.match(powershell, /Resolve-JetsonTarget/, 'PowerShell wrapper must resolve target host/IP');
assert.match(powershell, /ssh\.exe/, 'PowerShell wrapper must prefer Windows OpenSSH');
assert.match(powershell, /scp\.exe/, 'PowerShell wrapper must prefer Windows scp');
assert.match(powershell, /Invoke-ChatReceipt/, 'PowerShell wrapper must verify live Brittney chat');
assert.match(powershell, /\/api\/brittney\/chat/, 'PowerShell wrapper must call the live chat route');
assert.match(powershell, /Test-JetsonChatWrapperParity/, 'PowerShell wrapper must compare local and Jetson wrapper hashes');
assert.match(powershell, /Get-FileHash -Algorithm SHA256/, 'PowerShell wrapper must hash local files');
assert.match(powershell, /sha256sum/, 'PowerShell wrapper must hash remote Jetson files');
assert.match(powershell, /Jetson chat wrapper parity mismatch after deploy/, 'PowerShell wrapper must fail loudly on hash mismatch');
assert.match(powershell, /holoshell-sovereign-room-marathon\.mjs/, 'PowerShell wrapper must sync Sovereign Room adapter');
assert.match(powershell, /holoshell-holoclaw-runtime-bridge\.mjs/, 'PowerShell wrapper must sync HoloClaw runtime adapter');
assert.match(powershell, /holoshell-terminal-event-stream\.mjs/, 'PowerShell wrapper must sync terminal event stream adapter');
assert.match(powershell, /packages\/holollama\//, 'PowerShell wrapper must sync HoloLlama Brain selector dist');
assert.match(powershell, /holoshell-brittney-runtime-bridge\.hsplus/, 'PowerShell wrapper must sync Brittney runtime bridge source');
assert.match(powershell, /function Ensure-RemoteDirectory/, 'PowerShell wrapper must create each remote copy destination defensively');
assert.match(powershell, /Ensure-RemoteDirectory \(Get-RemoteDestinationDirectory \$Destination\)/, 'PowerShell wrapper must ensure remote copy destinations before scp');
assert.match(powershell, /sshKeyPathIncluded = \$false/, 'PowerShell wrapper receipt must hide raw key paths');
assert.match(powershell, /sudo -n systemctl restart holoshell-surface/, 'PowerShell wrapper restart must be non-interactive');

const psCommand = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const probe = spawnSync(psCommand, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (probe.status === 0) {
  const plan = spawnSync(
    psCommand,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      psPath,
      '-PlanOnly',
      '-Restart',
      '-VerifyChat',
      '-Json',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 30_000 },
  );

  assert.equal(plan.status, 0, `PowerShell plan failed:\n${plan.stderr || plan.stdout}`);
  const receipt = JSON.parse(plan.stdout.slice(plan.stdout.indexOf('{')));
  assert.equal(receipt.schemaVersion, 'hololand.holoshell.jetson-deploy-wrapper.v0.1.0');
  assert.equal(receipt.summary.planOnly, true);
  assert.equal(receipt.summary.restartRequested, true);
  assert.equal(receipt.summary.verifyChatRequested, true);
  assert.equal(receipt.summary.parityStatus, 'not_checked_plan_only');
  assert.equal(receipt.summary.parityCheckedCount, 0);
  assert.match(receipt.summary.target, /^username@/);
  assert.equal(receipt.policy.jetsonChatWrapperParityRequired, true);
  assert.equal(receipt.policy.sshBatchMode, true);
  assert.equal(receipt.policy.sshKeyPathIncluded, false);
  assert.equal(receipt.resolved.sshKeyPathIncluded, false);
  assert.ok(receipt.summary.copiedCount >= 20, 'plan should include deploy copy set');
}

console.log('HoloShell Jetson deploy wrapper parity test passed.');
