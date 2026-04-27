'use client';
/**
 * /coordinator — Studio inspection page for the 4 Pattern E consumer-buses.
 *
 * Closes the route gap from "panels work in standalone demo" to "panels
 * available in production Studio." The page creates a local
 * TraitRuntimeIntegration, wraps the 4 panels in a TraitRuntimeProvider,
 * and includes a demo control row (toggleable via ?demo=1) so any
 * developer can fire synthetic events to see the buses react.
 *
 * Future task: wire a global TraitRuntimeIntegration in the app shell
 * so this page subscribes to the same instance that the rest of
 * Studio's traits feed into. Currently scoped per-page render.
 *
 * Closes part of task_1777281302813_eezs route-wiring follow-up.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TraitContextFactory } from '@holoscript/engine/runtime/TraitContextFactory';
import { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import {
  TraitRuntimeProvider,
  AssetLoadingScreen,
  AdminDashboard,
  LobbyPeerRoster,
  LocomotionDemoPanel,
} from '@/components/coordinator-panels';

export default function CoordinatorPage() {
  const search = useSearchParams();
  const demoMode = search?.get('demo') === '1';

  const { runtime, factory } = useMemo(() => {
    const factory = new TraitContextFactory({});
    const runtime = new TraitRuntimeIntegration(factory);
    return { runtime, factory };
  }, []);

  return (
    <TraitRuntimeProvider runtime={runtime}>
      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <header style={{ padding: '20px 24px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 20 }}>Coordinator</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            Live view of the 4 Pattern E consumer-buses (asset loads, security, generative jobs,
            session presence). Subscribed via <code>TraitRuntimeIntegration</code>.
            {!demoMode && (
              <>
                {' '}
                Append <code>?demo=1</code> to fire synthetic events.
              </>
            )}
          </p>
          {demoMode ? <DemoControls factory={factory} /> : null}
        </header>

        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            padding: '16px 24px',
          }}
        >
          <Section title="AdminDashboard — SecurityEventBus">
            <AdminDashboard />
          </Section>
          <Section title="LocomotionDemoPanel — GenerativeJobMonitor">
            <LocomotionDemoPanel />
          </Section>
          <Section title="LobbyPeerRoster — SessionPresenceCoordinator" wide>
            <LobbyPeerRoster />
          </Section>
        </main>

        <AssetLoadingScreen />
      </div>
    </TraitRuntimeProvider>
  );
}

function Section({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        overflow: 'hidden',
        gridColumn: wide ? '1 / -1' : 'auto',
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: '10px 14px',
          background: '#1e293b',
          fontSize: 12,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: '#94a3b8',
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function DemoControls({ factory }: { factory: TraitContextFactory }) {
  const ctx = useMemo(() => factory.createContext(), [factory]);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  // Keep the demo helpers identical to the standalone demo's (commit
  // ddeb3f8c4 main.tsx) so behavior is consistent across both surfaces.
  useEffect(() => {
    // No-op effect; included so future agents see the per-button helpers
    // are intentionally defined inline (close over `ctx` + `bump`).
  }, [ctx]);

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
    const kinds = ['inpainting', 'texture_gen', 'controlnet', 'diffusion_rt'] as const;
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
        ctx.emit?.(successEvent, { requestId: id, sessionId: id, frameNumber: 0 });
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

  const buttonStyle: React.CSSProperties = {
    background: '#38bdf8',
    color: '#0f172a',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  };
  const dangerStyle: React.CSSProperties = { ...buttonStyle, background: '#f87171' };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <span style={{ color: '#64748b', fontSize: 12, alignSelf: 'center' }}>Demo · tick {tick}</span>
      <button style={buttonStyle} onClick={() => startLoad(`avatars/asset-${tick}.glb`)}>
        + Asset load
      </button>
      <button style={buttonStyle} onClick={() => startLoad(`scenes/usd-${tick}.usd`, 'usd')}>
        + USD load
      </button>
      <button style={dangerStyle} onClick={failLoad}>
        Fail asset load
      </button>
      <button style={buttonStyle} onClick={fireSecurity}>
        + Auth + RBAC
      </button>
      <button style={dangerStyle} onClick={fireQuotaExceeded}>
        Quota exceeded
      </button>
      <button style={buttonStyle} onClick={fireGenerativeJob}>
        + Gen-AI job
      </button>
      <button style={buttonStyle} onClick={firePresence}>
        + Presence
      </button>
    </div>
  );
}
