import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from './route';
import { POST } from './[receiptKey]/replay/route';

const tmpRoot = path.join(os.tmpdir(), 'holoscript-studio-conjecture-route-test');

describe('/api/conjecture/receipts', () => {
  beforeEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });
    process.env.HOLOSCRIPT_CONJECTURE_RECEIPT_DIR = tmpRoot;
  });

  afterEach(async () => {
    delete process.env.HOLOSCRIPT_CONJECTURE_RECEIPT_DIR;
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('lists conjecture runner receipts from disk', async () => {
    await writeFile(
      path.join(tmpRoot, 'sample.json'),
      JSON.stringify({
        solverType: 'conjecture.runner.v1',
        specVersion: 1,
        suite: 'generated-geometry-family',
        status: 'completed',
        receiptKey: 'conjecture.runner.v1-sha-sample',
        gate: { passed: true },
        classifications: [
          {
            scenarioId: 'generated-geometry.collapsing-triangle-sweep',
            role: 'falsifier',
            status: 'falsified',
            receiptKey: 'conjecture.v1-sha-falsifier',
            counterexampleCount: 1,
          },
        ],
        receipts: [
          {
            solverType: 'conjecture.v1',
            specVersion: 1,
            claim: {
              id: 'C.TEST',
              statement: 'Every generated triangle is non-degenerate.',
            },
            status: 'falsified',
            receiptKey: 'conjecture.v1-sha-falsifier',
            evaluations: [
              {
                candidateId: 'collapsing-triangle-0',
                family: 'collapsing-triangle',
                status: 'falsified',
                parameters: { apexHeight: 0 },
                facts: { geometryHash: 'geo-sha-test' },
                probeResults: [{ probeId: 'geometry.non_degenerate', status: 'fail' }],
              },
            ],
            counterexamples: [{ candidateId: 'collapsing-triangle-0' }],
          },
        ],
      }),
      'utf8'
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pointCount).toBe(1);
    expect(body.points[0].gateState).toBe('falsified');
    expect(body.points[0].replayable).toBe(true);
  });

  it('replays a falsified generated-geometry receipt', async () => {
    const req = new NextRequest('http://localhost/api/conjecture/receipts/key/replay', {
      method: 'POST',
      body: JSON.stringify({
        suite: 'generated-geometry-family',
        scenarioId: 'generated-geometry.collapsing-triangle-sweep',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ receiptKey: 'key' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.counterexampleMatched).toBe(true);
    expect(body.point.gateState).toBe('falsified');
  });
});
