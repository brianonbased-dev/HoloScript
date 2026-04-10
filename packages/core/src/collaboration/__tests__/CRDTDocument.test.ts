import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CRDTDocument } from '../CRDTDocument';
import type { DocumentEvent } from '../CRDTDocument';

function makeDoc(peerId = 'peer-1', config = {}) {
  return new CRDTDocument(
    { filePath: 'test.hsplus', workspaceId: 'ws1' },
    peerId,
    { displayName: 'Alice', color: '#00d4ff' },
    { changeDebounceMs: 0, ...config }
  );
}

describe('CRDTDocument', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = makeDoc();
  });

  afterEach(() => {
    doc.dispose();
    vi.useRealTimers();
  });

  // Content
  it('starts with empty content', () => {
    expect(doc.getText()).toBe('');
    expect(doc.getVersion()).toBe(0);
  });

  it('setText replaces content', () => {
    doc.setText('hello');
    expect(doc.getText()).toBe('hello');
    expect(doc.getVersion()).toBe(1);
  });

  it('setText is idempotent for same text', () => {
    doc.setText('hello');
    doc.setText('hello');
    expect(doc.getVersion()).toBe(1);
  });

  it('insert at beginning', () => {
    doc.setText('world');
    doc.insert(0, 'hello ');
    expect(doc.getText()).toBe('hello world');
  });

  it('insert at end', () => {
    doc.setText('hello');
    doc.insert(5, ' world');
    expect(doc.getText()).toBe('hello world');
  });

  it('insert at middle', () => {
    doc.setText('helo');
    doc.insert(2, 'l');
    expect(doc.getText()).toBe('hello');
  });

  it('insert throws on out of range', () => {
    doc.setText('hi');
    expect(() => doc.insert(-1, 'x')).toThrow(RangeError);
    expect(() => doc.insert(99, 'x')).toThrow(RangeError);
  });

  it('delete removes text', () => {
    doc.setText('hello world');
    doc.delete(5, 6);
    expect(doc.getText()).toBe('hello');
  });

  it('delete throws on out of range', () => {
    doc.setText('hi');
    expect(() => doc.delete(0, 10)).toThrow(RangeError);
    expect(() => doc.delete(-1, 1)).toThrow(RangeError);
  });

  it('replace text in range', () => {
    doc.setText('hello world');
    doc.replace(6, 5, 'there');
    expect(doc.getText()).toBe('hello there');
  });

  it('replace throws on out of range', () => {
    doc.setText('hi');
    expect(() => doc.replace(0, 10, 'x')).toThrow(RangeError);
  });

  // Undo/Redo
  it('undo restores previous state', () => {
    doc.setText('a');
    doc.setText('b');
    expect(doc.undo()).toBe(true);
    expect(doc.getText()).toBe('a');
  });

  it('redo re-applies undone state', () => {
    doc.setText('a');
    doc.setText('b');
    doc.undo();
    expect(doc.redo()).toBe(true);
    expect(doc.getText()).toBe('b');
  });

  it('undo returns false when stack empty', () => {
    expect(doc.undo()).toBe(false);
  });

  it('redo returns false when stack empty', () => {
    expect(doc.redo()).toBe(false);
  });

  it('canUndo and canRedo', () => {
    expect(doc.canUndo()).toBe(false);
    doc.setText('a');
    expect(doc.canUndo()).toBe(true);
    doc.undo();
    expect(doc.canRedo()).toBe(true);
  });

  it('new edit clears redo stack', () => {
    doc.setText('a');
    doc.setText('b');
    doc.undo();
    doc.setText('c');
    expect(doc.canRedo()).toBe(false);
  });

  it('respects maxUndoStack', () => {
    const small = makeDoc('p', { maxUndoStack: 2 });
    small.setText('a');
    small.setText('b');
    small.setText('c');
    // Only 2 most recent undos available
    expect(small.canUndo()).toBe(true);
    small.undo(); // → b
    small.undo(); // → a
    expect(small.canUndo()).toBe(false);
    small.dispose();
  });

  it('undo disabled skips undo stack', () => {
    const noUndo = makeDoc('p', { undoEnabled: false });
    noUndo.setText('a');
    noUndo.setText('b');
    expect(noUndo.canUndo()).toBe(false);
    noUndo.dispose();
  });

  // Remote sync
  it('getEncodedState and applyUpdate roundtrip', () => {
    doc.setText('remote content');
    const encoded = doc.getEncodedState();

    const doc2 = makeDoc('peer-2');
    doc2.applyUpdate(encoded, 'peer-1');
    expect(doc2.getText()).toBe('remote content');
    doc2.dispose();
  });

  it('applyUpdate ignores corrupt data', () => {
    doc.setText('original');
    doc.applyUpdate(new Uint8Array([0, 0, 0]), 'bad');
    expect(doc.getText()).toBe('original');
  });

  it('getStateVector returns 8 bytes', () => {
    const sv = doc.getStateVector();
    expect(sv.byteLength).toBe(8);
  });

  it('getSnapshot returns full snapshot', () => {
    doc.setText('snapshot test');
    const snap = doc.getSnapshot();
    expect(snap.content).toBe('snapshot test');
    expect(snap.documentId.filePath).toBe('test.hsplus');
    expect(snap.stateVector).toBeTruthy();
  });

  it('loadSnapshot restores content and clears undo', () => {
    doc.setText('a');
    doc.setText('b');
    doc.loadSnapshot({
      content: 'snap',
      stateVector: '',
      timestamp: 0,
      documentId: doc.documentId,
    });
    expect(doc.getText()).toBe('snap');
    expect(doc.canUndo()).toBe(false);
  });

  // Awareness
  it('local peer exists on construction', () => {
    const peers = doc.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].peerId).toBe('peer-1');
    expect(peers[0].displayName).toBe('Alice');
  });

  it('setCursor updates local awareness', () => {
    doc.setCursor({ line: 10, column: 5 });
    const awareness = doc.getLocalAwareness();
    expect(awareness.cursor).toEqual({ line: 10, column: 5 });
  });

  it('setSelection updates local awareness', () => {
    doc.setSelection({ start: { line: 1, column: 1 }, end: { line: 2, column: 10 } });
    const awareness = doc.getLocalAwareness();
    expect(awareness.selection).toBeDefined();
  });

  it('setWorldPosition updates local awareness', () => {
    doc.setWorldPosition([1, 2, 3]);
    const awareness = doc.getLocalAwareness();
    expect(awareness.worldPosition).toEqual([1, 2, 3]);
  });

  it('applyAwarenessUpdate adds new peer', () => {
    doc.applyAwarenessUpdate('peer-2', { displayName: 'Bob', color: '#ff0000' });
    const peers = doc.getPeers();
    expect(peers).toHaveLength(2);
    expect(peers.find((p) => p.peerId === 'peer-2')?.displayName).toBe('Bob');
  });

  it('applyAwarenessUpdate updates existing peer', () => {
    doc.applyAwarenessUpdate('peer-2', { displayName: 'Bob', color: '#ff0000' });
    doc.applyAwarenessUpdate('peer-2', { cursor: { line: 5, column: 1 } });
    const bob = doc.getPeers().find((p) => p.peerId === 'peer-2');
    expect(bob?.cursor).toEqual({ line: 5, column: 1 });
  });

  it('removePeer removes non-local peer', () => {
    doc.applyAwarenessUpdate('peer-2', { displayName: 'Bob', color: '#ff0000' });
    doc.removePeer('peer-2');
    expect(doc.getPeers()).toHaveLength(1);
  });

  it('removePeer does not remove local peer', () => {
    doc.removePeer('peer-1');
    expect(doc.getPeers()).toHaveLength(1);
  });

  // Events
  it('emits peer-joined event', () => {
    const cb = vi.fn();
    doc.on('peer-joined', cb);
    doc.applyAwarenessUpdate('peer-2', { displayName: 'Bob', color: '#ff0000' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].type).toBe('peer-joined');
  });

  it('emits peer-left event', () => {
    doc.applyAwarenessUpdate('peer-2', { displayName: 'Bob', color: '#ff0000' });
    const cb = vi.fn();
    doc.on('peer-left', cb);
    doc.removePeer('peer-2');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('emits change events after debounce', () => {
    const cb = vi.fn();
    doc.on('change', cb);
    doc.setText('hello');
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect((cb.mock.calls[0][0] as DocumentEvent).data.origin).toBe('local');
  });

  it('off removes listener', () => {
    const cb = vi.fn();
    doc.on('awareness-change', cb);
    doc.off('awareness-change', cb);
    doc.setCursor({ line: 1, column: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  // Dispose
  it('dispose clears all state', () => {
    doc.applyAwarenessUpdate('peer-2', { displayName: 'B', color: '#fff' });
    doc.dispose();
    expect(doc.getPeers()).toHaveLength(0);
  });
});
