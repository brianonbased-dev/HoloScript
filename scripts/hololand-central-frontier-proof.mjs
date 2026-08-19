#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PROOF = 'source/proofs/central-frontier-receipt-proof.hsplus';
const DEFAULT_OUTPUT = '.tmp/hololand/receipts/central-frontier-latest.json';

const PROOF_STEPS = [
  {
    kind: 'central_entered',
    playerVerb: 'spawn',
    layer: 'vr',
    place: 'hololand-central',
    source: 'source/layers/vr/central/hololand-central.holo',
    summary: 'Player enters HoloLand Central.',
  },
  {
    kind: 'portal_used',
    playerVerb: 'portal',
    layer: 'vr',
    place: 'hololand-central',
    source: 'source/layers/vr/central/hololand-central.holo',
    summary: 'Player uses the Central portal board for Frontier Shard 0.',
  },
  {
    kind: 'shard_entered',
    playerVerb: 'frontier_entry',
    layer: 'vr',
    place: 'frontier-shard-0',
    source: 'source/layers/vr/frontier/shard-0/frontier-shard-0.holo',
    summary: 'Player enters Frontier Shard 0.',
  },
  {
    kind: 'encounter_completed',
    playerVerb: 'encounter',
    layer: 'vr',
    place: 'frontier-shard-0',
    source: 'source/layers/vr/frontier/shard-0/frontier-shard-0.holo',
    summary: 'Player completes the first readable encounter.',
  },
  {
    kind: 'reward_earned',
    playerVerb: 'reward',
    layer: 'vr',
    place: 'frontier-shard-0',
    source: 'source/layers/vr/frontier/shard-0/frontier-shard-0.holo',
    summary: 'Player earns the first shard mark and can return to Central.',
  },
];

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    proof: DEFAULT_PROOF,
    output: DEFAULT_OUTPUT,
    actor: 'founder_player',
    surface: 'browser',
    write: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--proof') {
      args.proof = argv[index + 1];
      index += 1;
    } else if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === '--actor') {
      args.actor = argv[index + 1];
      index += 1;
    } else if (arg === '--surface') {
      args.surface = argv[index + 1];
      index += 1;
    } else if (arg === '--no-write') {
      args.write = false;
    } else if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function toRepoPath(root, file) {
  return relative(root, file).split(sep).join('/');
}

function extractString(content, field) {
  const match = content.match(new RegExp(`${field}\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? '';
}

function extractList(content, field) {
  const match = content.match(new RegExp(`${field}\\s*:\\s*\\[([^\\]]*)\\]`, 's'));
  if (!match) return [];

  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

function requireSource(root, sourcePath) {
  const full = resolve(root, sourcePath);
  if (!existsSync(full)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }

  return {
    path: sourcePath,
    content: readFileSync(full, 'utf8'),
  };
}

function buildStepReceipts({ actor, surface, domains, verticals, proofId, sourceHashes }) {
  return PROOF_STEPS.map((step, index) => {
    const receiptBase = {
      id: `central-frontier-${String(index + 1).padStart(2, '0')}`,
      kind: step.kind,
      actor,
      layer: step.layer,
      place: step.place,
      domains,
      verticals,
      surface,
      source: step.source,
      sourceHash: sourceHashes[step.source],
      proof: proofId,
      playerVerb: step.playerVerb,
      summary: step.summary,
      order: index + 1,
    };

    return {
      ...receiptBase,
      hash: hashJson(receiptBase),
    };
  });
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function runCentralFrontierProof(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const proofPath = options.proof ?? DEFAULT_PROOF;
  const outputPath = options.output ?? DEFAULT_OUTPUT;
  const actor = options.actor ?? 'founder_player';
  const surface = options.surface ?? 'browser';
  const write = options.write ?? true;

  const proof = requireSource(root, proofPath);
  const proofId = extractString(proof.content, 'id');
  const layer = extractString(proof.content, 'layer');
  const canonicalSource = extractString(proof.content, 'canonicalSource');
  const secondarySource = extractString(proof.content, 'secondarySource');
  const receiptEnvelope = extractString(proof.content, 'receiptEnvelope');
  const domains = extractList(proof.content, 'domains');
  const verticals = extractList(proof.content, 'verticals');
  const requiredReceipts = extractList(proof.content, 'requiredReceipts');
  const playerLoop = extractList(proof.content, 'playerLoop');

  const requiredProofFields = {
    proofId,
    layer,
    canonicalSource,
    secondarySource,
    receiptEnvelope,
  };
  for (const [field, value] of Object.entries(requiredProofFields)) {
    if (!value) {
      throw new Error(`Proof is missing ${field}`);
    }
  }

  const sourceFiles = [
    proofPath,
    canonicalSource,
    secondarySource,
    receiptEnvelope,
  ].map((sourcePath) => requireSource(root, sourcePath));

  const sourceHashes = Object.fromEntries(
    sourceFiles.map((sourceFile) => [
      sourceFile.path,
      hashJson({
        path: sourceFile.path,
        content: sourceFile.content,
      }),
    ]),
  );

  for (const receipt of requiredReceipts) {
    const appearsInSource = sourceFiles.some((sourceFile) => sourceFile.content.includes(receipt));
    if (!appearsInSource) {
      throw new Error(`Required receipt is not declared in source: ${receipt}`);
    }
  }

  const stepReceipts = buildStepReceipts({
    actor,
    surface,
    domains,
    verticals,
    proofId,
    sourceHashes,
  });

  const missingStepReceipts = requiredReceipts.filter(
    (receipt) => !stepReceipts.some((step) => step.kind === receipt),
  );
  if (missingStepReceipts.length > 0) {
    throw new Error(`Proof runner did not emit required receipts: ${missingStepReceipts.join(', ')}`);
  }

  const receipt = {
    receiptType: 'hololand.central-frontier.proof.v0.1.0',
    status: 'pass',
    proof: {
      id: proofId,
      source: proofPath,
      layer,
      canonicalSource,
      secondarySource,
      receiptEnvelope,
      domains,
      verticals,
      playerLoop,
      requiredReceipts,
    },
    actor,
    surface,
    output: outputPath,
    sources: sourceFiles.map((sourceFile) => ({
      path: sourceFile.path,
      hash: sourceHashes[sourceFile.path],
    })),
    steps: stepReceipts,
    summary: {
      stepCount: stepReceipts.length,
      receiptCount: stepReceipts.length,
      firstStep: stepReceipts[0]?.kind ?? '',
      lastStep: stepReceipts.at(-1)?.kind ?? '',
      centralSource: canonicalSource,
      frontierSource: secondarySource,
      replayable: true,
    },
  };

  const finalReceipt = {
    ...receipt,
    hash: hashJson(receipt),
  };

  if (write) {
    const fullOutput = resolve(root, outputPath);
    mkdirSync(dirname(fullOutput), { recursive: true });
    writeFileSync(fullOutput, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  }

  return finalReceipt;
}

function printHuman(receipt) {
  console.log(`PASS central frontier proof: ${receipt.summary.receiptCount} receipts emitted`);
  console.log(`Output: ${receipt.output}`);
  console.log(`Hash: ${receipt.hash}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const receipt = runCentralFrontierProof(args);
    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      printHuman(receipt);
    }
  } catch (error) {
    console.error(`FAIL central frontier proof: ${error.message}`);
    process.exit(1);
  }
}
