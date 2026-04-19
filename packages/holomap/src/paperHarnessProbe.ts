import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  fnv1a32Hex,
  type ReconstructionFrame,
} from '@holoscript/core/reconstruction';
import type { IngestPath } from './ingestPath';
import { formatIngestComparisonMarkdown, type IngestComparisonRow } from './comparisonReport';

function marbleSceneDigest(paperId: string): string {
  return fnv1a32Hex(`compat|marble-manifest|${paperId}|room-canonical-v1`);
}

async function probeHolomapRow(paperId: string): Promise<IngestComparisonRow> {
  const t0 = performance.now();
  const runtime = createHoloMapRuntime();
  await runtime.init({
    ...HOLOMAP_DEFAULTS,
    seed: 42,
    modelHash: `paper-probe-${paperId}`,
    videoHash: 'synthetic-1x1-rgba',
  });
  const frame: ReconstructionFrame = {
    index: 0,
    timestampMs: 0,
    rgb: new Uint8Array([10, 20, 30, 255]),
    width: 1,
    height: 1,
    stride: 4,
  };
  await runtime.step(frame);
  const manifest = await runtime.finalize();
  await runtime.dispose();
  const ms = performance.now() - t0;
  return {
    plainLabel: 'Native scene (HoloMap)',
    technicalPath: 'holomap',
    contractFingerprint: manifest.simulationContract.replayFingerprint,
    ingestMs: ms,
    notes: `manifest v${manifest.version}`,
  };
}

function probeMarbleRow(paperId: string): IngestComparisonRow {
  const t0 = performance.now();
  const fp = marbleSceneDigest(paperId);
  const ms = performance.now() - t0;
  return {
    plainLabel: 'Compatibility scene (Marble)',
    technicalPath: 'marble',
    contractFingerprint: fp,
    ingestMs: ms,
    notes: 'digest of canonical harness room (no live manifest IO in probe)',
  };
}

/**
 * Runs lightweight ingest probes for paper harnesses. Does not replace full Marble IO;
 * fingerprints anchor the selected path for logs and reviewer tables.
 */
export async function runPaperHarnessIngestProbe(options: {
  paperId: string;
  ingestPath: IngestPath;
}): Promise<{ rows: IngestComparisonRow[]; reportMarkdown: string }> {
  const rows: IngestComparisonRow[] = [];

  if (options.ingestPath === 'marble' || options.ingestPath === 'both') {
    rows.push(probeMarbleRow(options.paperId));
  }
  if (options.ingestPath === 'holomap' || options.ingestPath === 'both') {
    rows.push(await probeHolomapRow(options.paperId));
  }

  const reportMarkdown = formatIngestComparisonMarkdown(
    options.paperId,
    options.ingestPath,
    rows,
  );
  return { rows, reportMarkdown };
}
