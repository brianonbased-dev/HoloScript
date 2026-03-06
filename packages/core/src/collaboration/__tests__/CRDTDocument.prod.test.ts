/**
 * CRDTDocument.prod.test.ts — Sprint CLXVIII
 *
 * Production tests for CRDTDocument.
 * Uses the actual API: getText(), getVersion(), getEncodedState(),
 * applyUpdate(update, peerId), on('change'|'peer-joined'|etc, handler).
 * Note: emitChange() is debounced (50ms default), so change event tests
 * use fake timers or test only synchronous state rather than events.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CRDTDocument, type CRDTDocumentConfig } from '../CRDTDocument';
import type { DocumentIdentifier, CursorPosition, SelectionRange } from '../CRDTDocument';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocId(fp = 'test.hsplus'): DocumentIdentifier {
  return { filePath: fp, workspaceId: 'ws-test' };
}

function makeDoc(
  initialContent = '',
  config: Partial<CRDTDocumentConfig> = {},
  peerId = 'peer-A',
): CRDTDocument {
  const doc = new CRDTDocument(
    makeDocId(),
    peerId,
    { displayName: 'Tester', color: '#FF0000' },
    { changeDebounceMs: 0, ...config }, // 0ms debounce so we can test events synchronously
  );
  if (initialContent) {
    doc.setText(initialContent);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('CRDTDocument', () => {
  describe('constructor', () => {
    it('initializes with empty content when no setText called', () => {
      const doc = new CRDTDocument(
        makeDocId(),
        'peer-A',
        { displayName: 'A', color: '#f00' },
      );
      expect(doc.getText()).toBe('');
    });

    it('starts at version 0', () => {
      const doc = makeDoc();
      expect(doc.getVersion()).toBe(0);
    });

    it('stores documentId', () => {
      const id = makeDocId('arena.hsplus');
      const doc = new CRDTDocument(id, 'peer-A', { displayName: 'A', color: '#f00' });
      expect(doc.documentId.filePath).toBe('arena.hsplus');
    });

    it('includes local peer in getPeers()', () => {
      const doc = makeDoc('', {}, 'peer-A');
      const peers = doc.getPeers();
      expect(peers.some((p) => p.peerId === 'peer-A')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // setText
  // -------------------------------------------------------------------------

  describe('setText()', () => {
    it('sets full text content', () => {
      const doc = makeDoc();
      doc.setText('Hello World');
      expect(doc.getText()).toBe('Hello World');
    });

    it('increments version', () => {
      const doc = makeDoc();
      doc.setText('Hello');
      expect(doc.getVersion()).toBe(1);
    });

    it('is a no-op when content is unchanged', () => {
      const doc = makeDoc('Hello');
      const v = doc.getVersion();
      doc.setText('Hello'); // same content
      expect(doc.getVersion()).toBe(v);
    });

    it('clears redo stack', () => {
      const doc = makeDoc('ab');
      doc.insert(2, 'c');
      doc.undo();
      doc.setText('xyz');
      expect(doc.canRedo()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe('insert()', () => {
    it('inserts at the start', () => {
      const doc = makeDoc('World');
      doc.insert(0, 'Hello ');
      expect(doc.getText()).toBe('Hello World');
    });

    it('inserts in the middle', () => {
      const doc = makeDoc('HelloWorld');
      doc.insert(5, ' ');
      expect(doc.getText()).toBe('Hello World');
    });

    it('inserts at the end', () => {
      const doc = makeDoc('Hello');
      doc.insert(5, ' World');
      expect(doc.getText()).toBe('Hello World');
    });

    it('increments version', () => {
      const doc = makeDoc();
      doc.insert(0, 'abc');
      expect(doc.getVersion()).toBe(1);
    });

    it('throws on negative position', () => {
      const doc = makeDoc('Hi');
      expect(() => doc.insert(-1, 'x')).toThrow(/out of range/i);
    });

    it('throws when position exceeds length', () => {
      const doc = makeDoc('Hi');
      expect(() => doc.insert(10, 'x')).toThrow(/out of range/i);
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('deletes a range', () => {
      const doc = makeDoc('Hello World');
      doc.delete(5, 6);
      expect(doc.getText()).toBe('Hello');
    });

    it('deletes from the start', () => {
      const doc = makeDoc('Hello World');
      doc.delete(0, 6);
      expect(doc.getText()).toBe('World');
    });

    it('increments version', () => {
      const doc = makeDoc('Hello');
      doc.delete(0, 5);
      expect(doc.getVersion()).toBe(2); // setText + delete
    });

    it('does nothing when length is 0 — content unchanged, version still incremented', () => {
      // delete() does NOT short-circuit for 0-length — it still mutates & increments
      const doc = makeDoc('Hello');
      doc.delete(2, 0);
      expect(doc.getText()).toBe('Hello'); // content same
      expect(doc.getVersion()).toBeGreaterThanOrEqual(2); // version was bumped
    });

    it('throws RangeError when delete range exceeds content length', () => {
      const doc = makeDoc('Hi');
      expect(() => doc.delete(0, 999)).toThrow(/out of range/i);
    });
  });

  // -------------------------------------------------------------------------
  // replace
  // -------------------------------------------------------------------------

  describe('replace()', () => {
    it('replaces a range', () => {
      const doc = makeDoc('Hello World');
      doc.replace(6, 5, 'HoloScript');
      expect(doc.getText()).toBe('Hello HoloScript');
    });

    it('increments version once', () => {
      const doc = makeDoc('Hello');
      const before = doc.getVersion();
      doc.replace(0, 5, 'World');
      expect(doc.getVersion()).toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  describe('undo() / redo()', () => {
    it('undoes an insert', () => {
      const doc = makeDoc('World');
      doc.insert(0, 'Hello ');
      doc.undo();
      expect(doc.getText()).toBe('World');
    });

    it('undoes a delete', () => {
      const doc = makeDoc('Hello World');
      doc.delete(5, 6);
      doc.undo();
      expect(doc.getText()).toBe('Hello World');
    });

    it('redoes after undo', () => {
      const doc = makeDoc('World');
      doc.insert(0, 'Hello ');
      doc.undo();
      doc.redo();
      expect(doc.getText()).toBe('Hello World');
    });

    it('canUndo() is true after operations', () => {
      const doc = makeDoc();
      doc.insert(0, 'test');
      expect(doc.canUndo()).toBe(true);
    });

    it('canRedo() is true after undo', () => {
      const doc = makeDoc();
      doc.insert(0, 'test');
      doc.undo();
      expect(doc.canRedo()).toBe(true);
    });

    it('canRedo() is false before undo', () => {
      const doc = makeDoc();
      doc.insert(0, 'test');
      expect(doc.canRedo()).toBe(false);
    });

    it('canUndo() is false initially', () => {
      const doc = makeDoc();
      expect(doc.canUndo()).toBe(false);
    });

    it('new operation clears redo stack', () => {
      const doc = makeDoc('abc');
      doc.insert(3, 'd');
      doc.undo();
      doc.insert(3, 'x'); // clears redo
      expect(doc.canRedo()).toBe(false);
    });

    it('multiple undo levels', () => {
      const doc = makeDoc();
      doc.insert(0, 'a');
      doc.insert(1, 'b');
      doc.insert(2, 'c');
      doc.undo();
      doc.undo();
      expect(doc.getText()).toBe('a');
    });

    it('undo returns true when successful', () => {
      const doc = makeDoc('hi');
      doc.insert(2, '!');
      expect(doc.undo()).toBe(true);
    });

    it('undo returns false when nothing to undo', () => {
      const doc = makeDoc();
      expect(doc.undo()).toBe(false);
    });

    it('redo returns false when nothing to redo', () => {
      const doc = makeDoc();
      expect(doc.redo()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Awareness / Peers
  // -------------------------------------------------------------------------

  describe('peer awareness', () => {
    it('applyAwarenessUpdate adds a new peer', () => {
      const doc = makeDoc();
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#00f', isActive: true });
      expect(doc.getPeers().some((p) => p.peerId === 'peer-B')).toBe(true);
    });

    it('removePeer removes an existing peer', () => {
      const doc = makeDoc();
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#00f', isActive: true });
      doc.removePeer('peer-B');
      expect(doc.getPeers().some((p) => p.peerId === 'peer-B')).toBe(false);
    });

    it('removePeer silently ignores unknown peer', () => {
      const doc = makeDoc();
      expect(() => doc.removePeer('ghost')).not.toThrow();
    });

    it('removePeer does not remove local peer', () => {
      const doc = makeDoc('', {}, 'local-peer');
      doc.removePeer('local-peer'); // should be no-op
      expect(doc.getPeers().some((p) => p.peerId === 'local-peer')).toBe(true);
    });

    it('setCursor updates local awareness', () => {
      const doc = makeDoc();
      const cursor: CursorPosition = { line: 1, column: 5 };
      doc.setCursor(cursor);
      expect(doc.getLocalAwareness().cursor).toEqual(cursor);
    });

    it('setSelection updates local awareness', () => {
      const doc = makeDoc();
      const sel: SelectionRange = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 10 },
      };
      doc.setSelection(sel);
      expect(doc.getLocalAwareness().selection).toEqual(sel);
    });

    it('setWorldPosition updates local awareness', () => {
      const doc = makeDoc();
      doc.setWorldPosition([10, 20, 30]);
      expect(doc.getLocalAwareness().worldPosition).toEqual([10, 20, 30]);
    });

    it('applyAwarenessUpdate merges updates into existing peer', () => {
      const doc = makeDoc();
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#00f', isActive: true });
      const cursor: CursorPosition = { line: 3, column: 7 };
      doc.applyAwarenessUpdate('peer-B', { cursor });
      const peer = doc.getPeers().find((p) => p.peerId === 'peer-B');
      expect(peer?.cursor).toEqual(cursor);
    });
  });

  // -------------------------------------------------------------------------
  // getEncodedState / applyUpdate
  // -------------------------------------------------------------------------

  describe('getEncodedState() / applyUpdate()', () => {
    it('getEncodedState returns a Uint8Array', () => {
      const doc = makeDoc('Hello');
      const state = doc.getEncodedState();
      expect(state).toBeInstanceOf(Uint8Array);
      expect(state.length).toBeGreaterThan(0);
    });

    it('applyUpdate merges remote content', () => {
      const docA = makeDoc('Hello');
      const docB = new CRDTDocument(makeDocId(), 'peer-B', { displayName: 'B', color: '#0f0' });

      const state = docA.getEncodedState();
      docB.applyUpdate(state, 'peer-A');

      expect(docB.getText()).toBe('Hello');
    });

    it('applyUpdate increments version', () => {
      const docA = makeDoc('Hello');
      const docB = new CRDTDocument(makeDocId(), 'peer-B', { displayName: 'B', color: '#0f0' });
      docB.applyUpdate(docA.getEncodedState(), 'peer-A');
      expect(docB.getVersion()).toBe(1);
    });

    it('getStateVector returns Uint8Array', () => {
      const doc = makeDoc('x');
      expect(doc.getStateVector()).toBeInstanceOf(Uint8Array);
    });

    it('getUpdate returns Uint8Array', () => {
      const doc = makeDoc('Hello');
      const sv = doc.getStateVector();
      expect(doc.getUpdate(sv)).toBeInstanceOf(Uint8Array);
    });
  });

  // -------------------------------------------------------------------------
  // getSnapshot / loadSnapshot
  // -------------------------------------------------------------------------

  describe('getSnapshot() / loadSnapshot()', () => {
    it('getSnapshot captures content', () => {
      const doc = makeDoc('Snapshot test');
      const snap = doc.getSnapshot();
      expect(snap.content).toBe('Snapshot test');
      expect(snap.documentId.filePath).toBe('test.hsplus');
      expect(snap.stateVector).toBeTruthy();
    });

    it('loadSnapshot restores content', () => {
      const doc = makeDoc('Original');
      const snap = doc.getSnapshot();
      doc.setText('Changed');
      doc.loadSnapshot(snap);
      expect(doc.getText()).toBe('Original');
    });

    it('loadSnapshot clears undo/redo stacks', () => {
      const doc = makeDoc('A');
      doc.insert(1, 'B');
      const snap = doc.getSnapshot();
      doc.insert(2, 'C');
      doc.loadSnapshot(snap);
      expect(doc.canUndo()).toBe(false);
      expect(doc.canRedo()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Event system
  // -------------------------------------------------------------------------

  describe('on() / off()', () => {
    it('registers and fires change handler (0ms debounce)', () => {
      vi.useFakeTimers();
      const doc = makeDoc('', { changeDebounceMs: 0 });
      const handler = vi.fn();
      doc.on('change', handler);
      doc.insert(0, 'hello');
      vi.runAllTimers();
      expect(handler).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('off() removes the handler', () => {
      vi.useFakeTimers();
      const doc = makeDoc('', { changeDebounceMs: 0 });
      const handler = vi.fn();
      doc.on('change', handler);
      doc.off('change', handler);
      doc.insert(0, 'test');
      vi.runAllTimers();
      expect(handler).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('peer-joined fires when new peer is added', () => {
      const doc = makeDoc();
      const handler = vi.fn();
      doc.on('peer-joined', handler);
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#00f', isActive: true });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('peer-left fires when peer is removed', () => {
      const doc = makeDoc();
      const handler = vi.fn();
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#00f', isActive: true });
      doc.on('peer-left', handler);
      doc.removePeer('peer-B');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // dispose()
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('clears listeners and peers without throwing', () => {
      const doc = makeDoc('Hi');
      doc.applyAwarenessUpdate('peer-B', { displayName: 'Bob', color: '#f00', isActive: true });
      expect(() => doc.dispose()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-peer convergence
  // -------------------------------------------------------------------------

  describe('multi-peer convergence', () => {
    it('two docs converge via state exchange', () => {
      const docA = new CRDTDocument(makeDocId(), 'peer-A', { displayName: 'A', color: '#f00' });
      const docB = new CRDTDocument(makeDocId(), 'peer-B', { displayName: 'B', color: '#0f0' });

      docA.setText('Hello');
      docB.applyUpdate(docA.getEncodedState(), 'peer-A');

      expect(docB.getText()).toBe('Hello');
    });

    it('later setText overrides remote content', () => {
      const docA = new CRDTDocument(makeDocId(), 'peer-A', { displayName: 'A', color: '#f00' });
      const docB = new CRDTDocument(makeDocId(), 'peer-B', { displayName: 'B', color: '#0f0' });

      docA.setText('A-content');
      docB.applyUpdate(docA.getEncodedState(), 'peer-A');
      docB.setText('B-content'); // local override

      expect(docB.getText()).toBe('B-content');
    });
  });
});
