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
  // Resolve (running brain file checksum, claimed handle) on the instance.
  // Vast.ai fleet is DYNAMIC since 2026-04-26 — instances rotate without
  // notice (deleted at random + new ones rented). Order-based pairing of
  // `vastai show instances` against agents-template.json is therefore broken
  // because position N this hour may be a different handle than position N
  // next hour. Truth lives ON the instance: /root/agent.env declares the
  // handle that was assigned at provision time. We probe both the brain file
  // AND the env-declared handle, then build a handle→instance map upstream.
  // Returns { class, sha256, path, handle } or { error } on failure.
  const cmd = [
    `find /root -maxdepth 4 -name '*-brain.hsplus' 2>/dev/null | head -1 | xargs -I {} sh -c 'echo \\"FILE={}\\" && sha256sum {}'`,
    `echo "---"`,
    `grep '^HOLOSCRIPT_AGENT_HANDLE=' /root/agent.env 2>/dev/null | head -1`,
  ].join('; ');
  try {
    const out = execSync(
      `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=8 -p ${port} root@${host} "${cmd}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const fileLine = out.split('\n').find((l) => l.startsWith('FILE='));
    const shaLine = out.split('\n').find((l) => /^[0-9a-f]{64}\s/.test(l));
    const handleLine = out.split('\n').find((l) => l.startsWith('HOLOSCRIPT_AGENT_HANDLE='));
    if (!fileLine && !handleLine) return null;
    const filePath = fileLine ? fileLine.slice('FILE='.length).trim() : null;
    const sha = shaLine ? shaLine.split(/\s+/)[0] : null;
    const handle = handleLine ? handleLine.slice('HOLOSCRIPT_AGENT_HANDLE='.length).trim() : null;
    return {
      class: filePath ? brainClassFromPath(filePath) : null,
      sha256: sha,
      path: filePath,
      handle,
    };
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

// Step 1: SSH-probe each running instance to harvest its self-declared handle
// and running brain checksum. Order-based pairing was deprecated 2026-04-26
// when the fleet went dynamic (W.111: handles are stable identity, instance
// IDs are ephemeral substrate). The probe is the source of truth.
const probes = instances.map((inst) => {
  const sshHost = inst.ssh_host ?? '';
  const sshPort = inst.ssh_port ?? '';
  const probe = sshHost && sshPort ? sshProbe(sshHost, sshPort) : { error: 'no ssh coords' };
  return { inst, probe };
});

// Step 2: Build handle → planned-agent map from agents-template.json.
const plannedByHandle = new Map(planned.map((a) => [a.handle, a]));
// Step 3: Walk planned handles, find the live instance that claims that handle.
// Multiple instances claiming the same handle = identity collision (W.087-class).
// Planned handles with no live instance = `absent` (handle never came up).
// Live instances with no planned handle entry = `unplanned` (drift).
const liveByHandle = new Map();
const collisions = [];
const unplanned = [];
for (const { inst, probe } of probes) {
  if (!probe || probe.error) {
    unplanned.push({ inst, probe, reason: 'unreachable' });
    continue;
  }
  const claimed = probe.handle ?? null;
  if (!claimed) {
    unplanned.push({ inst, probe, reason: 'no-handle-in-env' });
    continue;
  }
  if (liveByHandle.has(claimed)) {
    collisions.push({ inst, probe, claimed });
    continue;
  }
  if (!plannedByHandle.has(claimed)) {
    unplanned.push({ inst, probe, reason: 'handle-not-in-template' });
    continue;
  }
  liveByHandle.set(claimed, { inst, probe });
}

let collisionCount = collisions.length;
let unplannedCount = unplanned.length;

// Step 4: Per planned handle, compute drift.
for (const agent of planned) {
  const handle = agent.handle;
  const expectedPath = join(REPO_ROOT, agent.brainPath);
  const expectedClass = brainClassFromPath(expectedPath);
  const expectedSha = sha256OfFile(expectedPath);
  const live = liveByHandle.get(handle);

  let drift = 'ok';
  let runningClass = '?';
  let instId = '-';

  if (!live) {
    drift = 'absent';
    runningClass = 'NO-LIVE-INSTANCE';
    absentCount++;
  } else {
    instId = String(live.inst.id);
    const probe = live.probe;
    if (!probe.class || probe.class === 'unknown') {
      drift = 'absent';
      runningClass = 'BRAIN-MISSING-ON-INSTANCE';
      absentCount++;
    } else if (expectedClass !== probe.class || (expectedSha && probe.sha256 && expectedSha !== probe.sha256)) {
      drift = 'drift';
      const shaSuffix = expectedSha && probe.sha256 && expectedSha !== probe.sha256 ? '(sha-mismatch)' : '';
      runningClass = `${probe.class}${shaSuffix}`;
      driftCount++;
    } else {
      runningClass = probe.class;
      okCount++;
    }
  }

  console.log(`${handle.padEnd(28)} instance=${instId.padEnd(10)} expected=${expectedClass.padEnd(28)} running=${runningClass.padEnd(35)} drift=${drift}`);
}

// Step 5: Report identity collisions (multiple instances claiming same handle)
// and unplanned instances (instance running but no template entry — usually
// means agents-template.json drifted from the live fleet).
for (const { inst, probe, claimed } of collisions) {
  console.log(`COLLISION: instance=${inst.id} also claims handle=${claimed} (already taken by another live instance) — W.087-class identity collision`);
}
for (const { inst, probe, reason } of unplanned) {
  const handle = probe?.handle ?? '(no-handle)';
  console.log(`UNPLANNED: instance=${inst.id} handle=${handle} reason=${reason} — fleet has live instance with no template entry`);
}

console.log('');
console.log(`[audit-brain] summary: ok=${okCount} drift=${driftCount} absent=${absentCount} unreachable=${unreachableCount} collisions=${collisionCount} unplanned=${unplannedCount}`);

// Exit non-zero on any drift / collision / unplanned so this can be a CI gate.
if (driftCount > 0 || absentCount > 0 || collisionCount > 0 || unplannedCount > 0) {
  process.exit(1);
}
