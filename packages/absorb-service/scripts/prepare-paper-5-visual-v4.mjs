#!/usr/bin/env node
/**
 * Prepare sealed four-arm Paper 5 v4 packets and deterministic PNGs.
 *
 * This command does not call models or score outcomes. It refuses to prepare
 * packets unless the external multi-codebase dataset and annotation custody
 * gates pass.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAPER_5_VISUAL_V4_PACKET_SCHEMA,
  auditPaper5VisualV4Dataset,
  buildPaper5VisualV4CasePacket,
  buildVerifiedImageContentPart,
  renderPaper5VisualV4Png,
} from './lib/paper-5-visual-v4.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultProtocol = resolve(packageRoot, 'benchmarks/paper-5-visual-agent-study-v4.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  const options = {
    protocol: defaultProtocol,
    dataset: '',
    outDir: '.scratch/paper-5-visual-v4-packets',
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const next = inline ?? argv[index + 1];
    if (inline === undefined && next && !next.startsWith('--')) index += 1;
    if (flag === 'protocol') options.protocol = resolve(next || defaultProtocol);
    if (flag === 'dataset') options.dataset = resolve(next || '');
    if (flag === 'out-dir') options.outDir = next || options.outDir;
    if (flag === 'help') options.help = true;
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/prepare-paper-5-visual-v4.mjs [options]',
    '',
    'Options:',
    '  --protocol=PATH          Frozen v4 protocol',
    '  --dataset=PATH           Sealed admitted external dataset (required)',
    '  --out-dir=PATH           Packet and image output directory',
    '  --help                   Show this message',
  ].join('\n');
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/giu, '-');
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.dataset) throw new Error('--dataset is required');
  const protocolRaw = readFileSync(options.protocol, 'utf8');
  const datasetRaw = readFileSync(options.dataset, 'utf8');
  const protocol = JSON.parse(protocolRaw);
  const dataset = JSON.parse(datasetRaw);
  const datasetAudit = auditPaper5VisualV4Dataset({ protocol, protocolRaw, dataset });
  if (datasetAudit.status !== 'pass') {
    throw new Error(`v4 dataset admission blocked: ${datasetAudit.errors.join(', ')}`);
  }

  const outDir = resolve(repoRoot, options.outDir);
  const imageDir = resolve(outDir, 'images');
  mkdirSync(imageDir, { recursive: true });
  const cases = [];
  for (const query of dataset.queries) {
    const packet = buildPaper5VisualV4CasePacket({ query, protocol });
    const rendered = renderPaper5VisualV4Png({
      candidates: packet.visual.candidates,
      relations: packet.visual.relations,
      width: Number(protocol.design.visualProjection.width),
      height: Number(protocol.design.visualProjection.height),
    });
    const imageInput = buildVerifiedImageContentPart(rendered.png, rendered.receipt.sha256);
    const imageName = `${safeName(query.id)}.png`;
    const imagePath = resolve(imageDir, imageName);
    writeFileSync(imagePath, rendered.png);
    for (const arm of ['pixels', 'relations-pixels']) {
      packet.arms[arm].literalImage = {
        path: `images/${imageName}`,
        sha256: rendered.receipt.sha256,
        mimeType: rendered.receipt.mimeType,
        bytes: rendered.receipt.bytes,
        actualImageContentPartRequired: true,
      };
    }
    packet.imageReceipt = {
      ...rendered.receipt,
      inputReceipt: imageInput.receipt,
    };
    delete packet.visual;
    cases.push(packet);
  }

  const core = {
    schemaVersion: PAPER_5_VISUAL_V4_PACKET_SCHEMA,
    protocolId: protocol.protocolId,
    protocolSha256: datasetAudit.protocolSha256,
    datasetId: dataset.datasetId,
    datasetSha256: sha256(datasetRaw),
    split: dataset.split,
    cases,
  };
  const manifest = {
    ...core,
    generatedAt: new Date().toISOString(),
    packetSha256: sha256(JSON.stringify(core)),
    custody: {
      imageCount: cases.length,
      uniqueImageHashes: new Set(cases.map((item) => item.imageReceipt.sha256)).size,
      sameImageAcrossPixelArms: cases.every(
        (item) =>
          item.arms.pixels.literalImage.sha256 === item.arms['relations-pixels'].literalImage.sha256
      ),
      actualImageBytesVerified: cases.every(
        (item) => item.imageReceipt.inputReceipt.actualImageBytes === true
      ),
    },
    claimBoundary:
      'Prepared packets contain no model responses or scored outcomes and do not support a visual-accuracy claim.',
  };
  const packetPath = resolve(outDir, 'packets.json');
  writeFileSync(packetPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `Paper 5 visual v4 packet preparation PASS queries=${cases.length} -> ${relative(
      repoRoot,
      packetPath
    ).replace(/\\/gu, '/')}`
  );
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(
      `[prepare-paper-5-visual-v4] ${error instanceof Error ? error.stack : String(error)}`
    );
    process.exitCode = 1;
  }
}
