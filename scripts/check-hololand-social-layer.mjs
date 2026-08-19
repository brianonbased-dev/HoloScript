#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.consumer-social.v0.1.0';
const ROOM_SOURCE = 'apps/holoshell/source/hololand-consumer-social-room.holo';
const POLICY_SOURCE = 'apps/holoshell/source/hololand-consumer-social-policy.hsplus';
const SOCIAL_FACADE = 'packages/platform/social/src/index.ts';
const SOCIAL_PACKAGE = 'packages/platform/social/package.json';
const SOCIAL_SPEC = 'docs/specs/SOCIAL_FEATURES_SPEC.md';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand-social-layer', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand social layer check

Usage:
  node scripts/check-hololand-social-layer.mjs [--output <path>] [--json]
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean))];
}

function runTsxTemp(script, name, options = {}) {
  const tempDir = repoPath(path.join('.tmp', 'hololand-social-layer'));
  mkdirSync(tempDir, { recursive: true });
  const scriptPath = path.join(tempDir, `${name}.mjs`);
  writeFileSync(scriptPath, `${script}\n`, 'utf8');

  const dirArg = options.pnpmDir ? `--dir ${options.pnpmDir.replace(/\\/g, '/')} ` : '';
  const rawScriptArg = options.pnpmDir ? scriptPath : path.relative(process.cwd(), scriptPath);
  const scriptArg = rawScriptArg.replace(/\\/g, '/');
  const command = `pnpm ${dirArg}exec tsx ${scriptArg}`;
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.timeout ?? 120000,
    });
  }
  return spawnSync('sh', ['-c', command], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 120000,
  });
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(path.join(candidate, 'package.json'))) || null;
}

function parseWithHoloScript(relativePath) {
  const root = findHoloScriptRoot();
  if (!root) {
    return {
      source: relativePath,
      passed: false,
      kind: 'missing_local_holoscript_root',
      error: 'Set HOLOSCRIPT_ROOT or place HoloScript next to HoloLand before running this check.',
    };
  }

  const absoluteSource = repoPath(relativePath);
  const isHolo = relativePath.endsWith('.holo');
  const parserPath = isHolo
    ? path.join(root, 'packages', 'core', 'src', 'parser', 'HoloCompositionParser.ts')
    : path.join(root, 'packages', 'core', 'src', 'parser', 'HoloScriptPlusParser.ts');
  const parserExport = isHolo ? 'parseHolo' : 'parse';
  const parserUrl = pathToFileURL(parserPath).href;
  const script = `
    import { readFileSync } from 'node:fs';
    import { ${parserExport} as parseSource } from ${JSON.stringify(parserUrl)};
    const result = parseSource(readFileSync(${JSON.stringify(absoluteSource)}, 'utf8'));
    console.log(JSON.stringify({
      success: result.success,
      errors: (result.errors || []).slice(0, 4).map((error) => ({
        message: error.message,
        loc: error.loc || error.location || null,
        severity: error.severity || 'error'
      }))
    }));
    if (!result.success) process.exit(1);
  `;

  const result = runTsxTemp(script, `parse-${path.extname(relativePath).slice(1) || 'source'}`, { pnpmDir: root });
  return {
    source: relativePath,
    passed: result.status === 0,
    kind: 'local_holoscript_source_parser',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-4),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function runSocialFacadeSmoke() {
  const facadeUrl = pathToFileURL(repoPath(SOCIAL_FACADE)).href;
  const smoke = `
    import assert from 'node:assert/strict';
    import {
      HOLOLAND_SOCIAL_VERSION,
      createFriendSystem,
      createNotificationSystem,
      createPartySystem,
    } from ${JSON.stringify(facadeUrl)};

    const aliceFriends = createFriendSystem('alice', 'Alice');
    const bobFriends = createFriendSystem('bob', 'Bob');
    aliceFriends.setNetworkCallback((type, data) => bobFriends.handleNetworkEvent(type, data));
    const request = aliceFriends.sendFriendRequest('bob', 'Bob', 'join the shard');
    assert.equal(bobFriends.getPendingRequests().length, 1);
    bobFriends.acceptFriendRequest(request.id);
    assert.equal(bobFriends.getFriends()[0].odId, 'alice');

    const aliceParty = createPartySystem('alice', 'Alice');
    const bobParty = createPartySystem('bob', 'Bob');
    aliceParty.setNetworkCallback((type, data) => bobParty.handleNetworkEvent(type, data));
    const party = aliceParty.createParty({ name: 'Shard Party', privacy: 'friends', maxSize: 4 });
    const invite = aliceParty.sendInvite('bob', 'Bob');
    assert.equal(party.voiceEnabled, true);
    assert.equal(bobParty.getPendingInvites().length, 1);
    bobParty.acceptInvite(invite.id);
    assert.equal(bobParty.getCurrentParty()?.id, party.id);

    const notifications = createNotificationSystem('bob');
    notifications.notifyFriendRequest('Alice', request.id);
    notifications.notifyPartyInvite('Alice', party.name, invite.id);
    assert.equal(notifications.getUnreadCount(), 2);
    assert.equal(HOLOLAND_SOCIAL_VERSION, '1.0.0-compat');

    console.log(JSON.stringify({
      version: HOLOLAND_SOCIAL_VERSION,
      friends: bobFriends.getFriends().length,
      partyId: bobParty.getCurrentParty()?.id,
      unread: notifications.getUnreadCount()
    }));
  `;

  const result = runTsxTemp(smoke, 'facade-smoke');

  let parsed = null;
  try {
    parsed = result.stdout.trim() ? JSON.parse(result.stdout.trim().split(/\r?\n/).slice(-1)[0]) : null;
  } catch {
    parsed = null;
  }

  return {
    passed: result.status === 0 && parsed?.version === '1.0.0-compat' && parsed?.friends === 1 && parsed?.unread === 2,
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-6),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-8),
    parsed,
  };
}

function buildSemanticIr(texts) {
  return {
    room: {
      source: ROOM_SOURCE,
      composition: uniqueMatches(texts.room, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.room, /template\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.room, /channel_id:\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.room, /policy_id:\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.room, /object\s+"([^"]+)"/g),
      sourceHash: sha256(texts.room),
    },
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policy, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policy, /template\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.policy, /channel\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policy, /policy\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policy, /action\s+([A-Za-z0-9_]+)/g),
      sourceHash: sha256(texts.policy),
    },
    facade: {
      source: SOCIAL_FACADE,
      hash: sha256(texts.facade),
      anchors: [
        'HOLOLAND_SOCIAL_VERSION',
        'FriendSystem',
        'FriendRequest',
        'PartySystem',
        'PartyInvite',
        'NotificationSystem',
        'createFriendSystem',
        'createPartySystem',
        'createNotificationSystem',
      ].filter((anchor) => texts.facade.includes(anchor)),
    },
    spec: {
      source: SOCIAL_SPEC,
      hash: sha256(texts.spec),
      sourcePointersPresent: includesAll(texts.spec, [ROOM_SOURCE, POLICY_SOURCE, SOCIAL_FACADE]),
    },
  };
}

function buildAssertions({ semanticIr, parsers, smoke, texts }) {
  return {
    sourceParser: parsers.every((parser) => parser.passed),
    roomDefinesConsumerPanels: ['FriendsPanel', 'PartyPanel', 'InviteTray', 'EventRail'].every((name) => semanticIr.room.objects.includes(name)),
    roomDefinesChannels: [
      'hololand:social:presence',
      'hololand:social:friend',
      'hololand:social:party',
      'hololand:social:invite',
      'hololand:social:event',
    ].every((name) => semanticIr.room.channels.includes(name)),
    policyDefinesPackets: ['FriendRequestPacket', 'PartyPacket', 'InvitePacket', 'ConsumerSocialReceipt'].every((name) => semanticIr.policy.templates.includes(name)),
    policyDefinesBackendBoundary: semanticIr.policy.policies.includes('PublicSocialGraphRequiresBackend'),
    facadeExportsCompatLayer: semanticIr.facade.anchors.length === 9,
    facadeRuntimeSmoke: smoke.passed,
    packageScript: texts.packageJson.includes('"check:hololand-social-layer": "node scripts/check-hololand-social-layer.mjs"'),
    socialPackageIsCompatFacade: texts.socialPackage.includes('Compatibility social facade for HoloLand demos'),
    specReferencesSourceLayer: semanticIr.spec.sourcePointersPresent,
  };
}

function assertReceipt(receipt) {
  const failures = [];
  for (const [name, passed] of Object.entries(receipt.assertions || {})) {
    if (!passed) failures.push(`failed assertion: ${name}`);
  }
  for (const parser of receipt.parsers || []) {
    if (!parser.passed) failures.push(`parser failed for ${parser.source}: ${parser.error || parser.stderrTail?.join(' ') || parser.status}`);
  }
  if (!receipt.receipt?.receiptHash) failures.push('missing receipt hash');
  if (failures.length) throw new Error(failures.join('\n'));
}

function writeReceipt(output, receipt) {
  const resolved = repoPath(output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolved;
}

function runCheck(args) {
  const texts = {
    room: read(ROOM_SOURCE),
    policy: read(POLICY_SOURCE),
    facade: read(SOCIAL_FACADE),
    socialPackage: read(SOCIAL_PACKAGE),
    spec: read(SOCIAL_SPEC),
    packageJson: read(PACKAGE_JSON),
  };
  const parsers = [parseWithHoloScript(ROOM_SOURCE), parseWithHoloScript(POLICY_SOURCE)];
  const smoke = runSocialFacadeSmoke();
  const semanticIr = buildSemanticIr(texts);
  const assertions = buildAssertions({ semanticIr, parsers, smoke, texts });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    semanticIr,
    assertions,
    parsers: parsers.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...parser }) => parser),
    smoke: { passed: smoke.passed, parsed: smoke.parsed },
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      room: ROOM_SOURCE,
      policy: POLICY_SOURCE,
      facade: SOCIAL_FACADE,
      package: SOCIAL_PACKAGE,
      spec: SOCIAL_SPEC,
    },
    parsers,
    facadeSmoke: smoke,
    semanticIr,
    assertions,
    policy: {
      sourceOwnedByHoloScript: true,
      typescriptMayOnlyProject: true,
      publicSocialGraphStillRequiresBackend: true,
      receiptRequiredForPlayerVisibleSocialActions: true,
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawFacadeCodeIncluded: false,
    },
  };

  assertReceipt(receipt);
  const output = writeReceipt(args.output, receipt);
  return { receipt, output };
}

try {
  const args = parseArgs();
  const { receipt, output } = runCheck(args);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log('[hololand-social-layer] ok');
    console.log(`receipt: ${output}`);
    console.log(`room: ${receipt.sources.room}`);
    console.log(`policy: ${receipt.sources.policy}`);
    console.log(`facade: ${receipt.sources.facade}`);
  }
} catch (error) {
  console.error('[hololand-social-layer] failed');
  console.error(error.message || error);
  process.exit(1);
}
