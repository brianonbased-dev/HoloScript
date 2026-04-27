/**
 * SnapshotTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { snapshotHandler } from '../SnapshotTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __snapshotState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_snapshots: 20, auto_capture_interval_ms: 0 };

describe('SnapshotTrait', () => {
  it('has name "snapshot"', () => {
    expect(snapshotHandler.name).toBe('snapshot');
  });

  it('snapshot:capture emits snapshot:captured', () => {
    const node = makeNode();
    snapshotHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    snapshotHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'snapshot:capture', snapshotId: 'snap1', scope: 'full',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('snapshot:captured', expect.objectContaining({ snapshotId: 'snap1' }));
  });
});
