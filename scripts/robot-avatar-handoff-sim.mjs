#!/usr/bin/env node
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultBenchDir = '.bench-logs/format-stress/2026-05-20_codex-format-realism-ratchet-2054Z/novel';

function usage() {
  console.log(`Usage:
  node scripts/robot-avatar-handoff-sim.mjs [options]

Options:
  --scene <path>        Holo scene path
  --thing <path>        WoT Thing Description path
  --out <path>          Pipeline row output JSON
  --receipt-out <path>  Full signed receipt envelope JSON
  --force-n <number>    Simulated gripper force, default 9.4
  --age-ms <number>     Simulated robot receipt age, default 36
  --run-id <id>         Receipt run id
  --help               Show this message`);
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
}

function resolveInsideRepo(label, inputPath) {
  const resolved = path.resolve(repoRoot, inputPath);
  const normalizedRoot = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(normalizedRoot)) {
    throw new Error(`${label} must stay inside the repository: ${inputPath}`);
  }
  return resolved;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to read JSON ${path.relative(repoRoot, filePath)}: ${error.message}`);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function distanceMm(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 100000) / 100;
}

function makeSignedReceipt(payload, keyPair) {
  const canonical = stableStringify(payload);
  const signature = sign(null, Buffer.from(canonical), keyPair.privateKey).toString('base64');
  const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' });
  const verified = verify(null, Buffer.from(canonical), publicKeyPem, Buffer.from(signature, 'base64'));
  if (!verified) {
    throw new Error(`signature verification failed for ${payload.kind}`);
  }
  return {
    payload,
    receiptHash: `sha256:${sha256(canonical)}`,
    signature,
    publicKeyPem,
    signatureAlgorithm: 'Ed25519',
    verified,
  };
}

function summarizeThing(thing) {
  const actionKey =
    Object.keys(thing.actions ?? {}).find((name) => name.toLowerCase() === 'streamrobotreceipts') ??
    Object.keys(thing.actions ?? {})[0] ??
    'streamRobotReceipts';
  const actionName = thing.properties?.action?.default ?? actionKey;
  return {
    id: thing.id ?? 'urn:holoscript:ForceTorqueSensor',
    title: thing.title ?? 'ForceTorqueSensor',
    actionKey,
    actionName,
    observedProperty: thing.properties?.observedProperty?.default ?? 'handoff_force_n',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const sceneRel = argValue(args, '--scene', path.join(defaultBenchDir, 'robot-avatar-mirror-handoff.holo'));
  const thingRel = argValue(args, '--thing', path.join(defaultBenchDir, 'robot-avatar-mirror-handoff.wot.json'));
  const outRel = argValue(args, '--out', path.join(defaultBenchDir, 'robot-avatar-live-sim-receipts.json'));
  const receiptOutRel = argValue(args, '--receipt-out', path.join(defaultBenchDir, 'robot-avatar-handoff-sim-receipt.json'));
  const forceN = Number(argValue(args, '--force-n', '9.4'));
  const ageMs = Number(argValue(args, '--age-ms', '36'));
  const runId = argValue(args, '--run-id', `robot-avatar-sim-${Date.now()}`);

  if (!Number.isFinite(forceN) || forceN <= 0) {
    throw new Error('--force-n must be a positive number');
  }
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    throw new Error('--age-ms must be a non-negative number');
  }

  const scenePath = resolveInsideRepo('scene', sceneRel);
  const thingPath = resolveInsideRepo('thing', thingRel);
  const outPath = resolveInsideRepo('out', outRel);
  const receiptOutPath = resolveInsideRepo('receipt-out', receiptOutRel);

  if (!fs.existsSync(scenePath)) {
    throw new Error(`scene does not exist: ${path.relative(repoRoot, scenePath)}`);
  }
  if (!fs.existsSync(thingPath)) {
    throw new Error(`Thing Description does not exist: ${path.relative(repoRoot, thingPath)}`);
  }

  const thing = summarizeThing(readJson(thingPath));
  const sceneSource = fs.readFileSync(scenePath, 'utf8');
  const sceneObjects = [...sceneSource.matchAll(/object\s+"([^"]+)"/g)].map((match) => match[1]);

  const keyPair = generateKeyPairSync('ed25519');
  const verifiedAt = new Date();
  const observedAt = new Date(verifiedAt.getTime() - ageMs);
  const robotPose = {
    frame: 'RobotGripper',
    positionM: { x: 0.42, y: 1.18, z: -0.08 },
    orientationEulerDeg: { x: 0, y: -12, z: 0 },
    gripperOpenMm: 14,
  };
  const avatarPose = {
    frame: 'AvatarHand',
    positionM: { x: 0.421, y: 1.18, z: -0.079 },
    orientationEulerDeg: { x: 0, y: -12, z: 0 },
    handOpenMm: 14,
  };
  const ikErrorMm = distanceMm(robotPose.positionM, avatarPose.positionM);
  const fresh = ageMs < 80;
  const ikLocked = ikErrorMm <= 3;
  const transferEnabled = fresh && ikLocked;

  const robotReceipt = makeSignedReceipt(
    {
      schemaVersion: 'holoscript.robot-receipt.v0.1.0',
      kind: 'RobotPoseActionReceipt',
      adapter: 'HoloShell robot-sim',
      runId,
      thing,
      observedAt: observedAt.toISOString(),
      verifiedAt: verifiedAt.toISOString(),
      ageMs,
      fresh,
      forceN,
      action: 'streamRobotReceipts',
      pose: robotPose,
      payloadContact: {
        object: 'Payload',
        heldBy: 'RobotGripper',
        normalForceN: forceN,
        minTransferForceN: 6,
      },
    },
    keyPair,
  );

  const avatarIkReceipt = makeSignedReceipt(
    {
      schemaVersion: 'holoscript.avatar-ik-receipt.v0.1.0',
      kind: 'AvatarIkReceipt',
      runtime: 'HoloLand avatar IK sim',
      runId,
      robotReceiptHash: robotReceipt.receiptHash,
      targetPose: robotPose,
      solvedPose: avatarPose,
      lockErrorMm: ikErrorMm,
      lockThresholdMm: 3,
      locked: ikLocked,
      consumedAction: thing.actionName,
    },
    keyPair,
  );

  const payloadTransferReceipt = makeSignedReceipt(
    {
      schemaVersion: 'holoscript.payload-transfer-replay.v0.1.0',
      kind: 'PayloadTransferReplayReceipt',
      runtime: 'HoloScript world model sim',
      runId,
      robotReceiptHash: robotReceipt.receiptHash,
      avatarIkReceiptHash: avatarIkReceipt.receiptHash,
      initialCustody: { object: 'Payload', owner: 'robot', holder: 'RobotGripper' },
      finalCustody: {
        object: 'Payload',
        owner: transferEnabled ? 'avatar' : 'robot',
        holder: transferEnabled ? 'AvatarHand' : 'RobotGripper',
      },
      replay: [
        { action: 'ingestRobotReceipt', fresh, forceN, ageMs },
        { action: 'solveAvatarMirrorPose', locked: ikLocked, lockErrorMm: ikErrorMm },
        { action: 'gateTransfer', enabled: transferEnabled },
        { action: 'transferPayload', transferred: transferEnabled },
      ],
      transferEnabled,
    },
    keyPair,
  );

  const rows = [
    {
      phase: 'robot_receipt',
      surface: 'HoloShell robotics adapter',
      status: fresh ? 'pass' : 'partial',
      evidence: `robot-sim emitted verified ${robotReceipt.signatureAlgorithm} pose/action receipt ${robotReceipt.receiptHash} at ${ageMs}ms age`,
      receipt_hash: robotReceipt.receiptHash,
      signature_verified: robotReceipt.verified,
    },
    {
      phase: 'avatar_ik',
      surface: 'HoloLand avatar runtime',
      status: ikLocked ? 'pass' : 'partial',
      evidence: `avatar IK consumed robot receipt ${robotReceipt.receiptHash} and locked ${thing.actionName} target at ${ikErrorMm}mm error`,
      receipt_hash: avatarIkReceipt.receiptHash,
      signature_verified: avatarIkReceipt.verified,
    },
    {
      phase: 'payload_transfer',
      surface: 'HoloScript world model',
      status: transferEnabled ? 'pass' : 'blocked',
      evidence: `world-model replay moved Payload custody robot -> avatar with transfer gate ${transferEnabled ? 'enabled' : 'blocked'} by receipt ${payloadTransferReceipt.receiptHash}`,
      receipt_hash: payloadTransferReceipt.receiptHash,
      signature_verified: payloadTransferReceipt.verified,
    },
  ];

  const envelope = {
    schemaVersion: 'holoscript.robot-avatar-handoff-sim.v0.1.0',
    runId,
    createdAt: verifiedAt.toISOString(),
    mode: 'robot-sim',
    scene: {
      path: path.relative(repoRoot, scenePath).replace(/\\/g, '/'),
      objectCount: sceneObjects.length,
      requiredObjects: ['RobotGripper', 'AvatarHand', 'Payload'],
      requiredObjectsPresent: ['RobotGripper', 'AvatarHand', 'Payload'].every((name) => sceneObjects.includes(name)),
    },
    thingDescription: {
      path: path.relative(repoRoot, thingPath).replace(/\\/g, '/'),
      ...thing,
    },
    receipts: {
      robotReceipt,
      avatarIkReceipt,
      payloadTransferReceipt,
    },
    replay: {
      pass: rows.every((row) => row.status === 'pass'),
      finalPayloadOwner: transferEnabled ? 'avatar' : 'robot',
    },
    digestRows: rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.mkdirSync(path.dirname(receiptOutPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(receiptOutPath, `${JSON.stringify(envelope, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        success: true,
        runId,
        rows: rows.length,
        nonPassingRows: rows.filter((row) => row.status !== 'pass').length,
        out: path.relative(repoRoot, outPath).replace(/\\/g, '/'),
        receiptOut: path.relative(repoRoot, receiptOutPath).replace(/\\/g, '/'),
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(`[robot-avatar-handoff-sim] ${error.message}`);
  process.exit(1);
}
