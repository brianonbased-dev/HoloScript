/**
 * Tests for the HoloScript Collaboration Module
 *
 * Covers CRDTDocument, CollaborationSession, and CollaborationTransport.
 */

import { describe, test, expect } from 'vitest';
import { CRDTDocument, DocumentIdentifier } from '@holoscript/mesh/collaboration/CRDTDocument';
import { CollaborationSession, SessionPeer } from '@holoscript/mesh/collaboration/CollaborationSession';
import {
  CollaborationTransport,
  encodeSyncMessage,
  decodeSyncMessage,
  SyncMessage,
} from '@holoscript/mesh/collaboration/CollaborationTransport';

// =============================================================================
// HELPERS
// =============================================================================

function makeDocId(filePath = 'test.hsplus'): DocumentIdentifier {
  return { filePath, workspaceId: 'test-workspace' };
}

function makeDocument(filePath = 'test.hsplus', initialContent = ''): CRDTDocument {
  const doc = new CRDTDocument(makeDocId(filePath), 'local-peer', {
    displayName: 'Test User',
    color: '#00d4ff',
  });
  if (initialContent) {
    doc.setText(initialContent);
  }
  return doc;
}

function makeSession(overrides: Record<string, unknown> = {}): CollaborationSession {
  return new CollaborationSession({
    sessionId: 'test-session',
    workspaceId: 'test-workspace',
    localPeer: {
      peerId: 'alice',
      displayName: 'Alice',
      color: '#00d4ff',
      platform: 'ide' as const,
    },
    autoSaveInterval: 0, // disable auto-save in tests
    ...overrides,
  });
}

// =============================================================================
// CRDTDocument Tests
// =============================================================================

describe('CRDTDocument', () => {
  describe('basic text operations', () => {
    test('should initialize with empty text', () => {
      const doc = makeDocument();
      expect(doc.getText()).toBe('');
      expect(doc.getText().length).toBe(0);
      doc.dispose();
    });

    test('should set and get text', () => {
      const doc = makeDocument();
      doc.setText('composition "Test" {}');
      expect(doc.getText()).toBe('composition "Test" {}');
      doc.dispose();
    });

    test('should insert text at position', () => {
      const doc = makeDocument('test.hsplus', 'hello world');
      doc.insert(5, ' beautiful');
      expect(doc.getText()).toBe('hello beautiful world');
      doc.dispose();
    });

    test('should delete text at position', () => {
      const doc = makeDocument('test.hsplus', 'hello world');
      doc.delete(5, 6);
      expect(doc.getText()).toBe('hello');
      doc.dispose();
    });

    test('should replace text', () => {
      const doc = makeDocument('test.hsplus', 'hello world');
      doc.replace(6, 5, 'HoloScript');
      expect(doc.getText()).toBe('hello HoloScript');
      doc.dispose();
    });

    test('should emit change events', () => {
      const doc = makeDocument();
      const changes: unknown[] = [];

      doc.on('change', (event) => {
        changes.push(event);
      });

      doc.setText('test');

      // Changes may be debounced, so we wait briefly
      setTimeout(() => {
        expect(changes.length).toBeGreaterThan(0);
        doc.dispose();
      }, 100);
    });
  });

  describe('document identity', () => {
    test('should expose document identifier', () => {
      const doc = makeDocument('zones/main.hsplus');
      expect(doc.documentId.filePath).toBe('zones/main.hsplus');
      expect(doc.documentId.workspaceId).toBe('test-workspace');
      doc.dispose();
    });
  });

  describe('undo/redo', () => {
    test('should undo text changes', () => {
      const doc = makeDocument('test.hsplus', 'original');
      doc.setText('modified');
      doc.undo();
      expect(doc.getText()).toBe('original');
      doc.dispose();
    });

    test('should redo undone changes', () => {
      const doc = makeDocument('test.hsplus', 'original');
      doc.setText('modified');
      doc.undo();
      doc.redo();
      expect(doc.getText()).toBe('modified');
      doc.dispose();
    });
  });

  describe('awareness', () => {
    test('should set and get cursor position', () => {
      const doc = makeDocument();
      doc.setCursor({ line: 5, column: 10 });
      const awareness = doc.getPeers();
      const local = awareness.find((a) => a.peerId === 'local-peer');
      expect(local?.cursor).toEqual({ line: 5, column: 10 });
      doc.dispose();
    });

    test('should set selection range', () => {
      const doc = makeDocument();
      doc.setSelection({
        start: { line: 1, column: 1 },
        end: { line: 3, column: 15 },
      });
      const awareness = doc.getPeers();
      const local = awareness.find((a) => a.peerId === 'local-peer');
      expect(local?.selection?.start).toEqual({ line: 1, column: 1 });
      expect(local?.selection?.end).toEqual({ line: 3, column: 15 });
      doc.dispose();
    });

    test('should track VR world position', () => {
      const doc = makeDocument();
      doc.setWorldPosition([1.5, 1.8, -3.0]);
      const awareness = doc.getPeers();
      const local = awareness.find((a) => a.peerId === 'local-peer');
      expect(local?.worldPosition).toEqual([1.5, 1.8, -3.0]);
      doc.dispose();
    });

    test('should apply remote awareness updates', () => {
      const doc = makeDocument();
      doc.applyAwarenessUpdate('remote-peer', {
        displayName: 'Bob',
        color: '#ff0000',
        cursor: { line: 10, column: 5 },
        isActive: true,
      });
      const awareness = doc.getPeers();
      const remote = awareness.find((a) => a.peerId === 'remote-peer');
      expect(remote?.displayName).toBe('Bob');
      expect(remote?.cursor).toEqual({ line: 10, column: 5 });
      doc.dispose();
    });

    test('should remove peers', () => {
      const doc = makeDocument();
      doc.applyAwarenessUpdate('remote-peer', {
        displayName: 'Bob',
        color: '#ff0000',
        isActive: true,
      });
      expect(doc.getPeers().length).toBe(2); // local + remote
      doc.removePeer('remote-peer');
      expect(doc.getPeers().length).toBe(1); // local only
      doc.dispose();
    });
  });

  describe('snapshots', () => {
    test('should create and restore snapshots', () => {
      const doc = makeDocument('test.hsplus', 'composition "Test" {}');
      const snapshot = doc.getSnapshot();

      expect(snapshot.content).toBe('composition "Test" {}');
      expect(snapshot.documentId.filePath).toBe('test.hsplus');

      const doc2 = makeDocument('test.hsplus');
      doc2.loadSnapshot(snapshot);
      expect(doc2.getText()).toBe('composition "Test" {}');

      doc.dispose();
      doc2.dispose();
    });
  });

  describe('remote sync', () => {
    test('should encode and decode state for sync', () => {
      const doc = makeDocument('test.hsplus', 'hello world');
      const state = doc.getEncodedState();
      expect(state).toBeInstanceOf(Uint8Array);
      expect(state.byteLength).toBeGreaterThan(0);

      const stateVector = doc.getStateVector();
      expect(stateVector).toBeInstanceOf(Uint8Array);
      doc.dispose();
    });

    test('should sync between two documents', () => {
      const doc1 = makeDocument('test.hsplus', 'hello');
      const doc2 = new CRDTDocument(makeDocId('test.hsplus'), 'peer-2', {
        displayName: 'User 2',
        color: '#ff0000',
      });

      // Sync doc1 -> doc2
      const state = doc1.getEncodedState();
      doc2.applyUpdate(state, 'peer-1');

      expect(doc2.getText()).toBe('hello');

      doc1.dispose();
      doc2.dispose();
    });
  });
});

// =============================================================================
// CollaborationSession Tests
// =============================================================================

describe('CollaborationSession', () => {
  describe('lifecycle', () => {
    test('should initialize in disconnected state', () => {
      const session = makeSession();
      expect(session.getState()).toBe('disconnected');
      session.dispose();
    });

    test('should connect and disconnect', async () => {
      const session = makeSession();
      await session.connect();
      expect(session.getState()).toBe('connected');

      await session.disconnect();
      expect(session.getState()).toBe('disconnected');
      session.dispose();
    });
  });

  describe('document management', () => {
    test('should open and close documents', async () => {
      const session = makeSession();
      await session.connect();

      const doc = session.openDocument('test.hsplus', 'composition "Test" {}');
      expect(doc).toBeDefined();
      expect(doc.getText()).toBe('composition "Test" {}');

      expect(session.getOpenDocuments()).toHaveLength(1);

      session.closeDocument('test.hsplus');
      expect(session.getOpenDocuments()).toHaveLength(0);

      session.dispose();
    });

    test('should return existing document on re-open', async () => {
      const session = makeSession();
      await session.connect();

      const doc1 = session.openDocument('test.hsplus', 'hello');
      const doc2 = session.openDocument('test.hsplus');

      expect(doc1).toBe(doc2);
      session.dispose();
    });

    test('should get document by path', async () => {
      const session = makeSession();
      await session.connect();

      session.openDocument('a.hsplus', 'content A');
      session.openDocument('b.hsplus', 'content B');

      const docA = session.getDocument('a.hsplus');
      expect(docA?.getText()).toBe('content A');

      const docB = session.getDocument('b.hsplus');
      expect(docB?.getText()).toBe('content B');

      session.dispose();
    });
  });

  describe('peer management', () => {
    test('should include local peer on init', () => {
      const session = makeSession();
      const peers = session.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].peerId).toBe('alice');
      session.dispose();
    });

    test('should add and remove remote peers', () => {
      const session = makeSession();

      session.addPeer({
        peerId: 'bob',
        displayName: 'Bob',
        color: '#ff0000',
        openDocuments: [],
        connectionQuality: 0.9,
        platform: 'vr',
        joinedAt: Date.now(),
      });

      expect(session.getPeerCount()).toBe(2);
      expect(session.getPeer('bob')?.displayName).toBe('Bob');

      session.removePeer('bob');
      expect(session.getPeerCount()).toBe(1);

      session.dispose();
    });

    test('should not remove local peer', () => {
      const session = makeSession();
      session.removePeer('alice');
      expect(session.getPeerCount()).toBe(1);
      session.dispose();
    });
  });

  describe('remote sync', () => {
    test('should apply remote updates to documents', async () => {
      const session = makeSession();
      await session.connect();

      session.openDocument('test.hsplus', 'hello');

      // Simulate remote update
      const remoteDoc = makeDocument('test.hsplus', 'hello world from remote');
      const update = remoteDoc.getEncodedState();

      session.applyRemoteUpdate('test.hsplus', update, 'remote-peer');

      const doc = session.getDocument('test.hsplus');
      expect(doc?.getText()).toBe('hello world from remote');

      remoteDoc.dispose();
      session.dispose();
    });

    test('should auto-open documents for remote updates', async () => {
      const session = makeSession();
      await session.connect();

      const remoteDoc = makeDocument('new-file.hsplus', 'remote content');
      const update = remoteDoc.getEncodedState();

      session.applyRemoteUpdate('new-file.hsplus', update, 'remote-peer');

      const doc = session.getDocument('new-file.hsplus');
      expect(doc).toBeDefined();
      expect(doc?.getText()).toBe('remote content');

      remoteDoc.dispose();
      session.dispose();
    });
  });

  describe('file change callbacks', () => {
    test('should notify on remote file changes', async () => {
      const session = makeSession();
      await session.connect();

      const changes: Array<{ filePath: string; content: string }> = [];
      session.onFileChange((change) => {
        changes.push({ filePath: change.filePath, content: change.content });
      });

      session.openDocument('test.hsplus', 'hello');

      // Simulate remote update
      const remoteDoc = makeDocument('test.hsplus', 'hello updated');
      const update = remoteDoc.getEncodedState();
      session.applyRemoteUpdate('test.hsplus', update, 'remote-peer');

      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].filePath).toBe('test.hsplus');

      remoteDoc.dispose();
      session.dispose();
    });
  });

  describe('events', () => {
    test('should emit state changes', async () => {
      const session = makeSession();
      const states: string[] = [];

      session.on('state-change', (event) => {
        states.push(event.data.to as string);
      });

      await session.connect();
      await session.disconnect();

      expect(states).toContain('connecting');
      expect(states).toContain('connected');
      expect(states).toContain('disconnected');

      session.dispose();
    });

    test('should emit peer events', () => {
      const session = makeSession();
      const events: string[] = [];

      session.on('peer-joined', () => events.push('joined'));
      session.on('peer-left', () => events.push('left'));

      session.addPeer({
        peerId: 'bob',
        displayName: 'Bob',
        color: '#ff0000',
        openDocuments: [],
        connectionQuality: 1,
        platform: 'web',
        joinedAt: Date.now(),
      });

      session.removePeer('bob');

      expect(events).toEqual(['joined', 'left']);
      session.dispose();
    });
  });

  describe('stats', () => {
    test('should track session statistics', async () => {
      const session = makeSession();
      await session.connect();

      const stats = session.getStats();
      expect(stats.state).toBe('connected');
      expect(stats.peerCount).toBe(1);
      expect(stats.documentCount).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);

      session.dispose();
    });
  });

  describe('snapshots', () => {
    test('should get and load snapshots', async () => {
      const session1 = makeSession();
      await session1.connect();
      session1.openDocument('a.hsplus', 'content A');
      session1.openDocument('b.hsplus', 'content B');

      const snapshots = session1.getSnapshots();
      expect(snapshots).toHaveLength(2);

      const session2 = makeSession();
      await session2.connect();
      session2.loadSnapshots(snapshots);

      expect(session2.getDocument('a.hsplus')?.getText()).toBe('content A');
      expect(session2.getDocument('b.hsplus')?.getText()).toBe('content B');

      session1.dispose();
      session2.dispose();
    });
  });
});

// =============================================================================
// CollaborationTransport Tests
// =============================================================================

describe('CollaborationTransport', () => {
  describe('message encoding', () => {
    test('should encode and decode sync messages', () => {
      const original: SyncMessage = {
        type: 'doc-update',
        sessionId: 'session-1',
        peerId: 'alice',
        filePath: 'zones/main.hsplus',
        data: new Uint8Array([1, 2, 3, 4, 5]),
        metadata: { version: 3 },
        timestamp: 1700000000000,
      };

      const encoded = encodeSyncMessage(original);
      const decoded = decodeSyncMessage(encoded);

      expect(decoded.type).toBe('doc-update');
      expect(decoded.sessionId).toBe('session-1');
      expect(decoded.peerId).toBe('alice');
      expect(decoded.filePath).toBe('zones/main.hsplus');
      expect(decoded.metadata).toEqual({ version: 3 });
      expect(decoded.timestamp).toBe(1700000000000);
      expect(decoded.data).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    test('should handle messages without optional fields', () => {
      const original: SyncMessage = {
        type: 'heartbeat',
        sessionId: 'session-1',
        peerId: 'alice',
        timestamp: Date.now(),
      };

      const encoded = encodeSyncMessage(original);
      const decoded = decodeSyncMessage(encoded);

      expect(decoded.type).toBe('heartbeat');
      expect(decoded.sessionId).toBe('session-1');
      expect(decoded.peerId).toBe('alice');
      expect(decoded.filePath).toBeUndefined();
      expect(decoded.metadata).toBeUndefined();
    });

    test('should handle all message types', () => {
      const types: SyncMessage['type'][] = [
        'doc-update',
        'doc-state-vector',
        'doc-state-request',
        'awareness',
        'peer-joined',
        'peer-left',
        'heartbeat',
        'heartbeat-ack',
      ];

      for (const type of types) {
        const msg: SyncMessage = {
          type,
          sessionId: 'test',
          peerId: 'test',
          timestamp: Date.now(),
        };

        const encoded = encodeSyncMessage(msg);
        const decoded = decodeSyncMessage(encoded);
        expect(decoded.type).toBe(type);
      }
    });
  });

  describe('transport lifecycle', () => {
    test('should initialize in closed state', () => {
      const transport = new CollaborationTransport();
      expect(transport.getState()).toBe('closed');
      transport.dispose();
    });

    test('should connect and close', async () => {
      const transport = new CollaborationTransport({
        sessionId: 'test',
        peerId: 'alice',
      });

      await transport.connect();
      expect(transport.getState()).toBe('open');

      await transport.close();
      expect(transport.getState()).toBe('closed');

      transport.dispose();
    });

    test('should track state changes', async () => {
      const transport = new CollaborationTransport({
        sessionId: 'test',
        peerId: 'alice',
      });

      const states: string[] = [];
      transport.onStateChange((state) => states.push(state));

      await transport.connect();
      await transport.close();

      expect(states).toContain('connecting');
      expect(states).toContain('open');
      expect(states).toContain('closing');
      expect(states).toContain('closed');

      transport.dispose();
    });
  });

  describe('messaging', () => {
    test('should send messages when connected', async () => {
      const transport = new CollaborationTransport({
        sessionId: 'test',
        peerId: 'alice',
      });

      await transport.connect();

      // Should not throw
      transport.send({
        type: 'doc-update',
        sessionId: 'test',
        peerId: 'alice',
        filePath: 'test.hsplus',
        data: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
      });

      const stats = transport.getStats();
      expect(stats.state).toBe('open');

      await transport.close();
      transport.dispose();
    });

    test('should throw when sending while disconnected', () => {
      const transport = new CollaborationTransport();

      expect(() => {
        transport.send({
          type: 'doc-update',
          sessionId: 'test',
          peerId: 'alice',
          timestamp: Date.now(),
        });
      }).toThrow('Cannot send in state: closed');

      transport.dispose();
    });

    test('should reject oversized messages', async () => {
      const transport = new CollaborationTransport({
        sessionId: 'test',
        peerId: 'alice',
        maxMessageSize: 100,
      });

      await transport.connect();

      expect(() => {
        transport.send({
          type: 'doc-update',
          sessionId: 'test',
          peerId: 'alice',
          data: new Uint8Array(200),
          timestamp: Date.now(),
        });
      }).toThrow('Message exceeds max size');

      await transport.close();
      transport.dispose();
    });
  });

  describe('stats', () => {
    test('should track transport statistics', async () => {
      const transport = new CollaborationTransport({
        sessionId: 'test',
        peerId: 'alice',
      });

      await transport.connect();

      const stats = transport.getStats();
      expect(stats.state).toBe('open');
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);

      await transport.close();
      transport.dispose();
    });
  });
});
