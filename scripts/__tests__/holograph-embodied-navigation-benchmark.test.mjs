#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { runBenchmark } from '../holo-ci/run-holograph-embodied-navigation-benchmark.mjs';

let pass = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  pass += 1;
  console.log(`  PASS ${message}`);
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  pass += 1;
  console.log(`  PASS ${message}`);
}

async function withFakeHoloLlama(fn) {
  const server = createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            {
              id: 'qwen3-4b-instruct.gguf',
              owned_by: 'llamacpp',
              meta: { n_ctx: 4096, n_params: 4022468096 },
            },
          ],
        })
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const frameDir = mkdtempSync(join(tmpdir(), 'holograph-nav-'));
  try {
    console.log('Test 1: benchmark produces passing renderer-native navigation receipt');
    await withFakeHoloLlama(async (endpoint) => {
      const receipt = await runBenchmark({
        frameDir,
        holollamaEndpoint: endpoint,
        timeoutMs: 1000,
        requireHolollamaLive: true,
      });
      equal(receipt.schema, 'holoscript.holograph-embodied-navigation-benchmark.v1', 'schema');
      equal(receipt.ok, true, 'receipt ok');
      equal(receipt.rates.rendererNativeProjectionRate, 1, 'renderer-native projection rate 1.00');
      equal(receipt.rates.validRate, 1, 'valid rate 1.00');
      equal(receipt.rates.actionRate, 1, 'action rate 1.00');
      equal(receipt.rates.doneRate, 1, 'done rate 1.00');
      equal(receipt.rates.nonblankFrameRate, 1, 'nonblank frame rate 1.00');
      equal(receipt.rates.nodeEdgeSegmentationRate, 1, 'node/edge segmentation rate 1.00');
      ok(receipt.rates.segmentedVisualDeltaRate > 0, 'segmented oracle detects label contamination');
      ok(
        receipt.rates.panCandidateSegmentedDeltaRate > 0,
        'pan candidates produce segmented graph-mass deltas'
      );
      ok(
        receipt.projection.totalTargetProjectionImprovementPx > 0,
        'target projection improves toward center'
      );
      ok(
        receipt.segmentedVisualOracle.averageLabelExclusionRate > 0,
        'visual oracle excludes label pixels from graph mass'
      );
      ok(
        receipt.segmentedVisualOracle.finalAllVsSegmentedCentroidDeltaPx > 0,
        'all-pixel centroid differs from segmented graph-mass centroid'
      );
      ok(
        receipt.segmentedVisualOracle.alignment.segmentedGraphMassDistanceToViewportCenterPx <
          receipt.projection.initial.distanceToCenterPx,
        'segmented graph mass aligns with camera-space target after pan'
      );
      equal(
        receipt.segmentedVisualOracle.alignment.holollamaMetadataAligned,
        true,
        'HoloLlama metadata aligns with segmented visual receipt'
      );
      equal(receipt.readback.mode, 'screenshot-only', 'screenshot-only readback');
      equal(receipt.readback.inspectorHidden, true, 'inspector hidden');
      equal(receipt.holollama.reachable, true, 'fake HoloLlama reachable');
      equal(receipt.holollama.model.id, 'qwen3-4b-instruct.gguf', 'model metadata recorded');
      ok(receipt.frames.every((frame) => frame.nonblank), 'every frame nonblank');
      ok(
        receipt.steps.every((step) => step.scene.projectionBridge === 'renderer-native'),
        'each scene summary keeps renderer-native bridge'
      );
    });

    console.log('Test 2: live-required mode fails honestly when HoloLlama is unreachable');
    const blocked = await runBenchmark({
      frameDir,
      holollamaEndpoint: 'http://127.0.0.1:1',
      timeoutMs: 50,
      requireHolollamaLive: true,
    });
    equal(blocked.ok, false, 'unreachable HoloLlama blocks strict receipt');
    ok(
      blocked.failures.some((failure) => failure.startsWith('holollama_unreachable:')),
      'unreachable blocker recorded'
    );
  } finally {
    rmSync(frameDir, { recursive: true, force: true });
  }

  console.log(`\n${pass}/${pass} tests passed`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
