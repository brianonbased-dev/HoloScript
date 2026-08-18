/**
 * CG-757: the create-page dispatch invokes the REAL compile_fanout tool, and
 * its toasts can no longer claim receipts that were never produced. The tool
 * caller is mocked at the transport seam; the mapping semantics are real.
 */
import { describe, it, expect, vi } from 'vitest';

import { dispatchCompileFanout, FANOUT_TARGETS } from '../dispatchFanout';

const SOURCE = 'composition "probe" { object "Box" { @grabbable } }';

describe('dispatchCompileFanout', () => {
  it('invokes the real tool with jobId studio, the source, and the proven targets', async () => {
    const callTool = vi.fn().mockResolvedValue({
      jobId: 'studio',
      entityId: 'compile-job-studio',
      status: 'complete',
      okCount: 4,
      targetCount: 4,
      totalKb: 38.61,
      targets: [],
    });
    await dispatchCompileFanout({ code: SOURCE, callTool });
    // The wire itself: cut the invocation and this goes red (watched during dev).
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('compile_fanout', {
      jobId: 'studio',
      code: SOURCE,
      targets: FANOUT_TARGETS,
    });
  });

  it('a complete job summarizes REAL numbers and names the entity', async () => {
    const callTool = vi.fn().mockResolvedValue({
      jobId: 'studio',
      entityId: 'compile-job-studio',
      status: 'complete',
      okCount: 4,
      targetCount: 4,
      totalKb: 38.61,
      targets: [],
    });
    const r = await dispatchCompileFanout({ code: SOURCE, callTool });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('complete');
    expect(r.summary).toContain('4/4');
    expect(r.summary).toContain('38.61 KB');
    expect(r.summary).toContain('compile-job-studio');
  });

  it('a partial job says partial — never "complete" language for failures', async () => {
    const callTool = vi.fn().mockResolvedValue({
      jobId: 'studio',
      status: 'partial',
      okCount: 3,
      targetCount: 4,
      totalKb: 12.5,
      targets: [],
    });
    const r = await dispatchCompileFanout({ code: SOURCE, callTool });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('partial');
    expect(r.summary).toContain('partial');
    expect(r.summary).toContain('3/4');
    expect(r.summary).not.toContain('Fan-out complete');
  });

  it('a transport failure reports ok:false with the honest error — no receipt language', async () => {
    const callTool = vi.fn().mockRejectedValue(new Error('MCP orchestrator unreachable'));
    const r = await dispatchCompileFanout({ code: SOURCE, callTool });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('did not run');
    expect(r.summary).toContain('MCP orchestrator unreachable');
    expect(r.summary).not.toMatch(/receipt/i);
  });

  it('a shapeless result is a failure, not a silent success', async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    const r = await dispatchCompileFanout({ code: SOURCE, callTool });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('nothing was compiled');
  });
});
