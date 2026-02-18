import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationSession } from '../CollaborationSession';

function makeSession(overrides = {}) {
  return new CollaborationSession({
    sessionId: 'test-session',
    workspaceId: 'ws-1',
    localPeer: {
      peerId: 'peer-1',
      displayName: 'Alice',
      color: '#00d4ff',
      platform: 'ide' as const,
    },
    ...overrides,
  });
}

describe('CollaborationSession', () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = makeSession();
  });

  afterEach(() => {
    session.disconnect();
  });

  // State management
  it('starts in disconnected state', () => {
    expect(session.getState()).toBe('disconnected');
  });

  // Document management
  it('opens a document', () => {
    const doc = session.openDocument('test.hsplus', 'hello');
    expect(doc).toBeDefined();
    expect(doc.getText()).toBe('hello');
  });

  it('returns same doc on re-open', () => {
    const doc1 = session.openDocument('test.hsplus');
    const doc2 = session.openDocument('test.hsplus');
    expect(doc1).toBe(doc2);
  });

  it('getDocument returns opened doc', () => {
    session.openDocument('test.hsplus');
    expect(session.getDocument('test.hsplus')).toBeDefined();
  });

  it('getDocument returns undefined for unknown', () => {
    expect(session.getDocument('nope.hsplus')).toBeUndefined();
  });

  it('getOpenDocuments lists open paths', () => {
    session.openDocument('a.hsplus');
    session.openDocument('b.hsplus');
    const docs = session.getOpenDocuments();
    expect(docs.some(d => d.includes('a.hsplus'))).toBe(true);
    expect(docs.some(d => d.includes('b.hsplus'))).toBe(true);
  });

  it('closeDocument removes doc', () => {
    session.openDocument('test.hsplus');
    session.closeDocument('test.hsplus');
    expect(session.getDocument('test.hsplus')).toBeUndefined();
    expect(session.getOpenDocuments().some(d => d.includes('test.hsplus'))).toBe(false);
  });

  it('closeDocument on non-existent is no-op', () => {
    expect(() => session.closeDocument('nonexistent.hsplus')).not.toThrow();
  });

  // Peer management
  it('addPeer and getPeers', () => {
    session.addPeer({
      peerId: 'peer-2',
      displayName: 'Bob',
      color: '#ff0000',
      openDocuments: [],
      connectionQuality: 1,
      platform: 'web',
      joinedAt: Date.now(),
    });
    const peers = session.getPeers();
    expect(peers.find(p => p.peerId === 'peer-2')).toBeDefined();
  });

  it('getPeer returns specific peer', () => {
    session.addPeer({
      peerId: 'peer-2',
      displayName: 'Bob',
      color: '#ff0000',
      openDocuments: [],
      connectionQuality: 1,
      platform: 'web',
      joinedAt: Date.now(),
    });
    expect(session.getPeer('peer-2')?.displayName).toBe('Bob');
  });

  it('getPeer returns undefined for unknown', () => {
    expect(session.getPeer('unknown')).toBeUndefined();
  });

  it('removePeer removes peer', () => {
    session.addPeer({
      peerId: 'peer-2',
      displayName: 'Bob',
      color: '#ff0000',
      openDocuments: [],
      connectionQuality: 1,
      platform: 'web',
      joinedAt: Date.now(),
    });
    session.removePeer('peer-2');
    expect(session.getPeer('peer-2')).toBeUndefined();
  });

  it('getPeerCount includes local peer', () => {
    expect(session.getPeerCount()).toBeGreaterThanOrEqual(1);
  });

  // Remote updates
  it('applyRemoteUpdate on open doc succeeds', () => {
    const doc = session.openDocument('test.hsplus');
    doc.setText('original');
    const encoded = doc.getEncodedState();

    // Open same file in session, then apply remote update
    const session2 = makeSession({ localPeer: { peerId: 'peer-2', displayName: 'Bob', color: '#ff0', platform: 'web' } });
    const doc2 = session2.openDocument('test.hsplus');
    session2.applyRemoteUpdate('test.hsplus', encoded, 'peer-1');
    expect(doc2.getText()).toBe('original');
    session2.disconnect();
  });

  it('applyRemoteUpdate on unopened doc is silent', () => {
    // Should not throw
    expect(() => session.applyRemoteUpdate('nonexistent.hsplus', new Uint8Array([0]), 'peer-2')).not.toThrow();
  });

  // Event subscription
  it('on/off event listeners', () => {
    const cb = vi.fn();
    session.on('peer-joined', cb);
    session.addPeer({
      peerId: 'peer-3',
      displayName: 'Charlie',
      color: '#0f0',
      openDocuments: [],
      connectionQuality: 1,
      platform: 'ide',
      joinedAt: Date.now(),
    });
    expect(cb).toHaveBeenCalled();
  });

  // Stats
  it('getStats returns valid stats', () => {
    session.openDocument('a.hsplus');
    const stats = session.getStats();
    expect(stats.documentCount).toBe(1);
    expect(stats.state).toBe('disconnected');
  });
});
