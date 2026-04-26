#!/usr/bin/env node
// audit-brain-identity.mjs — closes W.093 brain-identity-drift detection.
//
// Compares the planned brain assignment in agents-template.json (or a runtime
// agents.json) against the brain file actually loaded on each running Vast.ai
// instance. Flags drift where the running .hsplus checksum doesn't match the
// expected composition file.
//
// 2026-04-26 mesh-worker-02 audit found that mw02's CAEL records signed as
// `trait-inference-brain` while S.FLEET / agents-template.json claimed it
// should be `mesh-security-auditor-1` (security-auditor-brain.hsplus). Either
// the bootstrap pulled the wrong brain, agents.json drifted post-deploy, or
// the labeling in MEMORY was wrong from the start. This script is the
// detector — run it whenever the fleet is up.
//
// Usage:
//   node scripts/mesh-deploy/audit-brain-identity.mjs [--config agents-template.json]
//
// Output: per-agent line of form
//   mesh-worker-N: instance=ID expected=<class> running=<class>|MISSING|UNREACHABLE drift=ok|drift|absent
//
// Requires:
//   - vastai CLI on PATH (for `vastai show instances --raw`)
//   - SSH access to each running instance via the SSH coords vastai reports
//   - The planned brain file to exist at compositions/<class>-brain.hsplus
//     in the local repo for sha256 comparison

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const configIdx = args.indexOf('--config');
const configPath = configIdx >= 0 ? args[configIdx + 1] : join(__dirname, 'agents-template.json');

if (!existsSync(configPath)) {
  console.error(`[audit-brain] config not found: ${configPath}`);
  process.exit(2);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const planned = (config.agents ?? []).filter((a) => a.enabled !== false);

function sha256OfFile(path) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

function brainClassFromPath(p) {
  const base = basename(String(p ?? ''));
  const m = base.match(/^([\w-]+)-brain\.hsplus$/) || base.match(/^([\w-]+)\.hsplus$/);
  return m ? m[1] : 'unknown';
}

function vastInstances() {
  try {
    const raw = execSync('vastai show instances --raw', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(raw).filter((i) => i.actual_status === 'running');
  } catch (err) {
    console.error(`[audit-brain] vastai show instances failed: ${err.message}`);
    return [];
  }
}

function sshProbe(host, port) {
  // Resolve the running brain file checksum on the instance. Looks at common
  // bootstrap paths: /root/<class>-brain.hsplus or /root/holoscript-mesh/compositions/<class>-brain.hsplus.
  // Returns { class, sha256 } or null if unreachable / not found.
  const cmd = `find /root -maxdepth 4 -name '*-brain.hsplus' 2>/dev/null | head -1 | xargs -I {} sh -c 'echo "FILE={}" && sha256sum {}'`;
  try {
    const out = execSync(
      `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=8 -p ${port} root@${host} "${cmd}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const fileLine = out.split('\n').find((l) => l.startsWith('FILE='));
    const shaLine = out.split('\n').find((l) => /^[0-9a-f]{64}\s/.test(l));
    if (!fileLine) return null;
    const path = fileLine.slice('FILE='.length).trim();
    const sha = shaLine ? shaLine.split(/\s+/)[0] : null;
    return { class: brainClassFromPath(path), sha256: sha, path };
  } catch (err) {
    return { error: err.message };
  }
}

const instances = vastInstances();
console.log(`[audit-brain] running vast instances: ${instances.length}`);
console.log(`[audit-brain] planned agents in ${basename(configPath)}: ${planned.length}`);
console.log('');

let driftCount = 0;
let absentCount = 0;
let unreachableCount = 0;
let okCount = 0;

// Match instances to planned agents by ORDER (matches deploy.py's pairing).
const pairs = instances.map((inst, i) => ({ inst, agent: planned[i] }));

for (const { inst, agent } of pairs) {
  const handle = agent?.handle ?? `(unassigned-${inst.id})`;
  const expectedPath = agent ? join(REPO_ROOT, agent.brainPath) : null;
  const expectedClass = expectedPath ? brainClassFromPath(expectedPath) : 'NO-PLAN';
  const expectedSha = expectedPath ? sha256OfFile(expectedPath) : null;

  const sshHost = inst.ssh_host ?? '';
  const sshPort = inst.ssh_port ?? '';
  const probe = sshHost && sshPort ? sshProbe(sshHost, sshPort) : { error: 'no ssh coords' };

  let drift = 'ok';
  let runningClass = '?';
  if (!probe || probe.error) {
    drift = 'unreachable';
    runningClass = `UNREACHABLE(${probe?.error ?? 'null'})`;
    unreachableCount++;
  } else if (!probe.class || probe.class === 'unknown') {
    drift = 'absent';
    runningClass = 'MISSING';
    absentCount++;
  } else if (expectedClass !== probe.class || (expectedSha && probe.sha256 && expectedSha !== probe.sha256)) {
    drift = 'drift';
    runningClass = `${probe.class}${expectedSha && probe.sha256 && expectedSha !== probe.sha256 ? '(sha-mismatch)' : ''}`;
    driftCount++;
  } else {
    runningClass = probe.class;
    okCount++;
  }

  console.log(`${handle.padEnd(28)} instance=${String(inst.id).padEnd(10)} expected=${expectedClass.padEnd(28)} running=${runningClass.padEnd(35)} drift=${drift}`);
}

console.log('');
console.log(`[audit-brain] summary: ok=${okCount} drift=${driftCount} absent=${absentCount} unreachable=${unreachableCount}`);

// Exit non-zero on any drift so this can be a CI gate.
if (driftCount > 0 || absentCount > 0) {
  process.exit(1);
}
