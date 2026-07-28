import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PAPER_5_VISUAL_V4_DATASET_SCHEMA,
  PAPER_5_VISUAL_V4_PROTOCOL_SCHEMA,
  auditPaper5VisualV4Dataset,
  auditPaper5VisualV4ExecutionPlan,
  buildPaper5VisualV4CasePacket,
  buildVerifiedImageContentPart,
  renderPaper5VisualV4Png,
} from './paper-5-visual-v4.mjs';
import { main as prepareVisualV4 } from '../prepare-paper-5-visual-v4.mjs';

const hash = 'a'.repeat(64);
const protocol = {
  schemaVersion: PAPER_5_VISUAL_V4_PROTOCOL_SCHEMA,
  protocolId: 'v4-test',
  dataset: {
    minimumExternalCodebases: 3,
    minimumQueries: 90,
    categoriesPerCodebase: { dependency: 10, impact: 10, reasoning: 10 },
    annotation: {
      minimumIndependentAnnotatorsPerQuery: 2,
      minimumInterAnnotatorAgreement: 0.7,
    },
    custody: { calibrationFraction: 0.2 },
  },
  design: {
    candidateCount: 8,
    arms: [{ id: 'text' }, { id: 'relations' }, { id: 'pixels' }, { id: 'relations-pixels' }],
  },
  agentProtocol: {
    minimumIndependentVisionCapableAgentFamilies: 3,
    trialsPerArm: 3,
  },
};
const protocolRaw = JSON.stringify(protocol);

function datasetFixture() {
  const repositories = Array.from({ length: 3 }, (_, index) => ({
    id: `repo-${index + 1}`,
    commit: String(index + 1).repeat(40),
    license: 'MIT',
    trackedSourceFiles: 500,
    moduleBoundaries: 2,
    corpusSha256: hash,
    usedInV1ThroughV3: false,
  }));
  const categories = ['dependency', 'impact', 'reasoning'];
  const queries = [];
  for (const repository of repositories) {
    for (const category of categories) {
      for (let index = 0; index < 10; index += 1) {
        const id = `${repository.id}-${category}-${index + 1}`;
        const candidates = Array.from({ length: 8 }, (_, candidateIndex) => ({
          file: `src/${category}-${candidateIndex + 1}.ts`,
          symbols: [`symbol${candidateIndex + 1}`],
        }));
        const relevantFiles = candidates.slice(0, 2).map((item) => item.file);
        const annotation = (annotatorId) => ({
          annotatorId,
          relevantFiles,
          evidence: relevantFiles.map((file, evidenceIndex) => ({
            file,
            line: evidenceIndex + 1,
          })),
        });
        queries.push({
          id,
          repositoryId: repository.id,
          category,
          query: `Question ${id}`,
          candidates,
          relevantFiles,
          annotations: [annotation('ann-1'), annotation('ann-2')],
          relations: [
            {
              fromFile: candidates[0].file,
              toFile: candidates[1].file,
              type: 'imports',
            },
          ],
        });
      }
    }
  }
  return {
    schemaVersion: PAPER_5_VISUAL_V4_DATASET_SCHEMA,
    datasetId: 'external-v4-test',
    protocolId: protocol.protocolId,
    protocolSha256: createHash('sha256').update(protocolRaw).digest('hex'),
    sealed: true,
    annotation: {
      receiptSha256: hash,
      annotatorsBlindToModelOutputs: true,
      agreementMetric: 'Krippendorff alpha over binary file relevance',
      krippendorffAlpha: 0.8,
    },
    repositories,
    queries,
    split: {
      sealed: true,
      calibrationQueryIds: queries.slice(0, 18).map((item) => item.id),
      confirmatoryQueryIds: queries.slice(18).map((item) => item.id),
    },
  };
}

test('audits a sealed external multi-codebase dataset and blocks missing custody', () => {
  const dataset = datasetFixture();
  const audit = auditPaper5VisualV4Dataset({ protocol, protocolRaw, dataset });
  assert.equal(audit.status, 'pass');
  assert.deepEqual(audit.counts, {
    repositories: 3,
    queries: 90,
    calibrationQueries: 18,
    confirmatoryQueries: 72,
  });

  dataset.annotation.annotatorsBlindToModelOutputs = false;
  const blocked = auditPaper5VisualV4Dataset({ protocol, protocolRaw, dataset });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.errors.includes('annotation-blinding'));
});

test('renders deterministic real PNG bytes and verifies multimodal content custody', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({ alias: `c${index + 1}` }));
  const relations = [{ fromAlias: 'c1', toAlias: 'c2', type: 'imports' }];
  const first = renderPaper5VisualV4Png({ candidates, relations });
  const second = renderPaper5VisualV4Png({ candidates, relations });
  assert.equal(first.receipt.sha256, second.receipt.sha256);
  assert.deepEqual([...first.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(first.receipt.width, 1600);
  assert.equal(first.receipt.height, 900);

  const image = buildVerifiedImageContentPart(first.png, first.receipt.sha256);
  assert.equal(image.contentPart.type, 'image_url');
  assert.match(image.contentPart.image_url.url, /^data:image\/png;base64,/u);
  assert.equal(image.receipt.actualImageBytes, true);
});

test('builds four arms with one literal image requirement and no gold leakage', () => {
  const dataset = datasetFixture();
  const packet = buildPaper5VisualV4CasePacket({
    query: dataset.queries[0],
    protocol,
  });
  assert.deepEqual(Object.keys(packet.arms), ['text', 'relations', 'pixels', 'relations-pixels']);
  assert.equal(packet.arms.pixels.literalImageRequired, true);
  assert.equal(packet.arms['relations-pixels'].literalImageRequired, true);
  assert.equal(packet.arms.text.literalImageRequired, undefined);
  assert.doesNotMatch(JSON.stringify(packet.arms), /gold|relevantFiles|annotations/iu);
  assert.equal(packet.visual.candidates.length, 8);
});

test('requires three independently receipted vision families and three trials', () => {
  const executionPlan = {
    trialsPerArm: 3,
    modelFamilies: ['openai', 'google', 'anthropic'].map((family) => ({
      family,
      visionCapable: true,
      modelVersion: `${family}-vision`,
      providerVersionReceiptSha256: hash,
    })),
  };
  assert.equal(auditPaper5VisualV4ExecutionPlan({ protocol, executionPlan }).status, 'pass');
  executionPlan.modelFamilies.pop();
  const blocked = auditPaper5VisualV4ExecutionPlan({ protocol, executionPlan });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.errors.includes('independent-vision-family-count'));
  assert.ok(blocked.errors.includes('vision-and-version-receipts'));
});

test('prepares one sealed packet with one deterministic PNG for both pixel arms', () => {
  const root = mkdtempSync(join(tmpdir(), 'paper-5-visual-v4-prepare-'));
  try {
    const smallProtocol = {
      ...protocol,
      protocolId: 'v4-prepare-test',
      dataset: {
        minimumExternalCodebases: 1,
        minimumQueries: 1,
        categoriesPerCodebase: { dependency: 1, impact: 0, reasoning: 0 },
        annotation: {
          minimumIndependentAnnotatorsPerQuery: 2,
          minimumInterAnnotatorAgreement: 0.7,
        },
        custody: { calibrationFraction: 0 },
      },
      design: {
        ...protocol.design,
        visualProjection: { width: 320, height: 180 },
      },
    };
    const smallProtocolRaw = JSON.stringify(smallProtocol);
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      file: `src/file-${index + 1}.ts`,
      symbols: [`symbol${index + 1}`],
    }));
    const relevantFiles = candidates.slice(0, 2).map((item) => item.file);
    const annotation = (annotatorId) => ({
      annotatorId,
      relevantFiles,
      evidence: relevantFiles.map((file, index) => ({ file, line: index + 1 })),
    });
    const smallDataset = {
      schemaVersion: PAPER_5_VISUAL_V4_DATASET_SCHEMA,
      datasetId: 'external-v4-prepare-test',
      protocolId: smallProtocol.protocolId,
      protocolSha256: createHash('sha256').update(smallProtocolRaw).digest('hex'),
      sealed: true,
      annotation: {
        receiptSha256: hash,
        annotatorsBlindToModelOutputs: true,
        agreementMetric: 'Krippendorff alpha over binary file relevance',
        krippendorffAlpha: 1,
      },
      repositories: [
        {
          id: 'repo-1',
          commit: '1'.repeat(40),
          license: 'MIT',
          trackedSourceFiles: 500,
          moduleBoundaries: 2,
          corpusSha256: hash,
          usedInV1ThroughV3: false,
        },
      ],
      queries: [
        {
          id: 'dependency-1',
          repositoryId: 'repo-1',
          category: 'dependency',
          query: 'Which files form the dependency?',
          candidates,
          relevantFiles,
          annotations: [annotation('ann-1'), annotation('ann-2')],
          relations: [
            {
              fromFile: candidates[0].file,
              toFile: candidates[1].file,
              type: 'imports',
            },
          ],
        },
      ],
      split: {
        sealed: true,
        calibrationQueryIds: [],
        confirmatoryQueryIds: ['dependency-1'],
      },
    };
    const protocolPath = join(root, 'protocol.json');
    const datasetPath = join(root, 'dataset.json');
    const outDir = join(root, 'out');
    writeFileSync(protocolPath, smallProtocolRaw);
    writeFileSync(datasetPath, JSON.stringify(smallDataset));
    assert.equal(
      prepareVisualV4([
        `--protocol=${protocolPath}`,
        `--dataset=${datasetPath}`,
        `--out-dir=${outDir}`,
      ]),
      0
    );
    const packet = JSON.parse(readFileSync(join(outDir, 'packets.json'), 'utf8'));
    assert.equal(packet.cases.length, 1);
    assert.equal(packet.custody.sameImageAcrossPixelArms, true);
    assert.equal(packet.custody.actualImageBytesVerified, true);
    const png = readFileSync(join(outDir, packet.cases[0].arms.pixels.literalImage.path));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
