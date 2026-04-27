/**
 * Coordinator panels demo — mounts all 4 panels with a real
 * TraitContextFactory and a synthetic event-firer so the founder can
 * see them rendering live in a browser. Operationalizes W.343 (UI is
 * the build) for the work shipped in commit 90d268fec.
 *
 * Press the buttons to fire synthetic events and watch the panels
 * react. No backend required — events are dispatched directly into
 * the same factory the panels subscribe to in production.
 */
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { TraitContextFactory } from '@holoscript/engine/runtime/TraitContextFactory';
import { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import {
  TraitRuntimeProvider,
  AssetLoadingScreen,
  AdminDashboard,
  LobbyPeerRoster,
  LocomotionDemoPanel,
} from '../index';

function Demo() {
  const { runtime, factory } = useMemo(() => {
    const factory = new TraitContextFactory({});
    const runtime = new TraitRuntimeIntegration(factory);
    return { runtime, factory };
  }, []);
  const ctx = useMemo(() => factory.createContext(), [factory]);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  // ---- Synthetic event helpers ----------------------------------------
  const startLoad = (url: string, format: 'gltf' | 'usd' | 'fbx' = 'gltf') => {
    ctx.emit?.(`${format}:load_started`, { url });
    let p = 0;
    const id = setInterval(() => {
      p += 0.2;
      if (p >= 1) {
        ctx.emit?.(`${format}:loaded`, { url });
        clearInterval(id);
        bump();
        return;
      }
      ctx.emit?.(`${format}:loading_progress`, { url, progress: p });
      bump();
    }, 600);
    bump();
  };

  const failLoad = () => {
    ctx.emit?.('gltf:load_started', { url: 'broken-asset.glb' });
    setTimeout(() => {
      ctx.emit?.('gltf:load_error', { url: 'broken-asset.glb', error: '404 not found' });
      bump();
    }, 400);
    bump();
  };

  const fireSecurity = () => {
    const sid = `sess-${Date.now()}`;
    const aid = `agent-${Math.floor(Math.random() * 1000)}`;
    ctx.emit?.('sso_authenticated', { sessionId: sid, userId: 'user-x', idp: 'oidc' });
    ctx.emit?.('rbac_role_assigned', { agentId: aid, role: 'admin' });
    ctx.emit?.('audit_log', { action: 'role.assign', actor: aid, outcome: 'success' });
    bump();
  };

  const fireQuotaExceeded = () => {
    ctx.emit?.('quota_exceeded', {
      resource: 'api_calls',
      tenantId: 'tenant-acme',
      consumed: 1100,
      limit: 1000,
    });
    ctx.emit?.('audit_log', { action: 'quota.exceeded', actor: 'tenant-acme', outcome: 'denied' });
    bump();
  };

  const fireGenerativeJob = () => {
    const id = `job-${Date.now()}`;
    const kinds = ['inpainting', 'texture_gen', 'controlnet', 'diffusion_rt'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    ctx.emit?.(`${kind}:ready`, {});
    ctx.emit?.(`${kind}:started`, { requestId: id, sessionId: id });
    setTimeout(() => {
      const success = Math.random() > 0.3;
      if (success) {
        const successEvent =
          kind === 'texture_gen'
            ? `${kind}:applied`
            : kind === 'diffusion_rt'
              ? `${kind}:frame_ready`
              : `${kind}:result`;
        ctx.emit?.(successEvent, {
          requestId: id,
          sessionId: id,
          frameNumber: 0,
        });
      } else {
        ctx.emit?.(`${kind}:error`, { requestId: id, error: 'GPU OOM' });
      }
      bump();
    }, 800);
    bump();
  };

  const firePresence = () => {
    const sid = `sp-${Date.now()}`;
    const nid = `world-${Math.floor(Math.random() * 100)}`;
    ctx.emit?.('shareplay:started', { sessionId: sid });
    ctx.emit?.('shareplay:participant_joined', { sessionId: sid, participantId: 'pA' });
    ctx.emit?.('shareplay:participant_joined', { sessionId: sid, participantId: 'pB' });
    ctx.emit?.('spatial_voice_create', { nodeId: nid });
    ctx.emit?.('spatial_voice_peer_joined', { nodeId: nid, peerId: 'remoteA' });
    ctx.emit?.('messaging_connected', { platform: 'discord' });
    ctx.emit?.('message_received', { platform: 'discord' });
    ctx.emit?.('heartbeat_initialized', { nodeId: nid });
    ctx.emit?.('heartbeat_tick', { nodeId: nid });
    ctx.emit?.('heartbeat_tick', { nodeId: nid });
    bump();
  };

  return (
    <TraitRuntimeProvider runtime={runtime}>
      <header>
        <h1>Coordinator panels demo</h1>
        <p>
          Live preview of the 4 Pattern E consumer-buses (commit 90d268fec). Buttons fire synthetic
          events into a real TraitContextFactory; panels subscribe and rerender. Tick: {tick}
        </p>
        <div className="controls" style={{ marginTop: 8 }}>
          <button onClick={() => startLoad(`avatars/asset-${tick}.glb`)}>+ Asset load</button>
          <button onClick={() => startLoad(`scenes/usd-${tick}.usd`, 'usd')}>+ USD load</button>
          <button onClick={failLoad} className="danger">
            Fail asset load
          </button>
          <button onClick={fireSecurity}>+ Auth + RBAC</button>
          <button onClick={fireQuotaExceeded} className="danger">
            Quota exceeded
          </button>
          <button onClick={fireGenerativeJob}>+ Gen-AI job</button>
          <button onClick={firePresence}>+ Presence</button>
        </div>
      </header>

      <main>
        <section>
          <h2>AdminDashboard — SecurityEventBus</h2>
          <AdminDashboard />
        </section>
        <section>
          <h2>LocomotionDemoPanel — GenerativeJobMonitor</h2>
          <LocomotionDemoPanel />
        </section>
        <section style={{ gridColumn: '1 / -1' }}>
          <h2>LobbyPeerRoster — SessionPresenceCoordinator</h2>
          <LobbyPeerRoster />
        </section>
      </main>

      {/* AssetLoadingScreen renders its own fixed-position overlay (bottom-right). */}
      <AssetLoadingScreen />
    </TraitRuntimeProvider>
  );
}

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<Demo />);
