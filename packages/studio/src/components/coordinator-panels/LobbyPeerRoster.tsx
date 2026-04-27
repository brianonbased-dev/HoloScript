'use client';
/**
 * LobbyPeerRoster — Studio downstream consumer of SessionPresenceCoordinator.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement at the
 * Studio surface for the SessionPresenceCoordinator. Renders the
 * unified presence view across all 4 multiplayer-presence trait kinds:
 *   - Active SharePlay sessions + participant rosters
 *   - Spatial-voice peers per listener node + mute state
 *   - Messaging platform connections + traffic counters
 *   - World-heartbeat liveness rows
 *
 * Intended for embedding in lobby / multiplayer overlay surfaces.
 */
import type { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import { useSessionPresence } from './TraitRuntimeContext';

export interface LobbyPeerRosterProps {
  runtime?: TraitRuntimeIntegration | null;
}

export function LobbyPeerRoster({ runtime }: LobbyPeerRosterProps) {
  const { stats, sessions, voice, messaging, heartbeats } = useSessionPresence(runtime);

  return (
    <div
      data-testid="lobby-peer-roster"
      style={{
        padding: 12,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
      }}
    >
      <Section
        testid="lobby-sessions"
        title="SharePlay sessions"
        empty="No active sessions"
        rows={sessions.length}
        summary={`${stats.sessions.active} active · ${stats.sessions.participants} participants`}
      >
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            data-testid={`session-row-${s.sessionId}`}
            style={{ borderBottom: '1px solid #1e293b', padding: '4px 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{s.sessionId}</span>
              <span
                style={{
                  color:
                    s.status === 'started' || s.status === 'joined'
                      ? '#4ade80'
                      : s.status === 'ended'
                        ? '#64748b'
                        : '#94a3b8',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                {s.status}
              </span>
            </div>
            {s.participants.size > 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                participants: {Array.from(s.participants).join(', ')}
              </div>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        testid="lobby-voice"
        title="Spatial voice"
        empty="No voice listeners attached"
        rows={voice.length}
        summary={`${stats.voice.peers} peers · ${stats.voice.muted} muted`}
      >
        {voice.map((v) => (
          <div
            key={v.nodeId}
            data-testid={`voice-row-${v.nodeId}`}
            style={{ borderBottom: '1px solid #1e293b', padding: '4px 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{v.nodeId}</span>
              <span style={{ color: v.muted ? '#f87171' : '#4ade80', fontSize: 11 }}>
                {v.muted ? 'MUTED' : 'LIVE'} · {v.peers.size} peer(s)
              </span>
            </div>
          </div>
        ))}
      </Section>

      <Section
        testid="lobby-messaging"
        title="Messaging platforms"
        empty="No messaging connections"
        rows={messaging.length}
        summary={`${stats.messaging.connected} connected · ${stats.messaging.errored} errored`}
      >
        {messaging.map((m) => (
          <div
            key={m.platform}
            data-testid={`messaging-row-${m.platform}`}
            style={{ borderBottom: '1px solid #1e293b', padding: '4px 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{m.platform}</span>
              <span
                style={{
                  color:
                    m.status === 'connected'
                      ? '#4ade80'
                      : m.status === 'errored'
                        ? '#f87171'
                        : '#64748b',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                {m.status}
              </span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              ↓{m.messagesReceived} ↑{m.messagesSent}
              {m.error ? <span style={{ color: '#f87171', marginLeft: 8 }}>{m.error}</span> : null}
            </div>
          </div>
        ))}
      </Section>

      <Section
        testid="lobby-heartbeat"
        title="World heartbeat"
        empty="No heartbeat sources"
        rows={heartbeats.length}
        summary={`${stats.heartbeat.alive} alive · ${stats.heartbeat.failover} failover · ${stats.heartbeat.errored} errored`}
      >
        {heartbeats.map((h) => (
          <div
            key={h.nodeId}
            data-testid={`heartbeat-row-${h.nodeId}`}
            style={{ borderBottom: '1px solid #1e293b', padding: '4px 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{h.nodeId}</span>
              <span
                style={{
                  color:
                    h.status === 'alive'
                      ? '#4ade80'
                      : h.status === 'failover'
                        ? '#facc15'
                        : h.status === 'errored'
                          ? '#f87171'
                          : '#64748b',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                {h.status}
              </span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              ticks: {h.ticks}
              {h.error ? <span style={{ color: '#f87171', marginLeft: 8 }}>{h.error}</span> : null}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({
  testid,
  title,
  empty,
  rows,
  summary,
  children,
}: {
  testid: string;
  title: string;
  empty: string;
  rows: number;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      style={{ background: '#1e293b', padding: 10, borderRadius: 6, minHeight: 120 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>{summary}</span>
      </div>
      {rows === 0 ? (
        <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: 12 }}>{empty}</div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
