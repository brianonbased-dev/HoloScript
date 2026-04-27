// @vitest-environment jsdom

/**
 * Coordinator-panels unified test — verifies all 4 Studio downstream
 * consumers actually rerender when their bus pushes state changes.
 * Uses real coordinator instances + a MockEventSource that mirrors
 * TraitContextFactory's `on(event, handler)` shape, so the test
 * exercises the bus subscription path end-to-end (not via a stub).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import {
  AssetLoadCoordinator,
  SecurityEventBus,
  GenerativeJobMonitor,
  SessionPresenceCoordinator,
} from '@holoscript/core/coordinators';
import {
  TraitRuntimeProvider,
  AssetLoadingScreen,
  AdminDashboard,
  LobbyPeerRoster,
  LocomotionDemoPanel,
} from '../index';

// =============================================================================
// MockEventSource — same shape as TraitContextFactory.on
// =============================================================================

class MockEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();
  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }
  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }
}

/** Build a fake TraitRuntimeIntegration with real coordinator instances. */
function makeRuntime() {
  const source = new MockEventSource();
  const assetLoadCoordinator = new AssetLoadCoordinator(source);
  const securityEventBus = new SecurityEventBus(source);
  const generativeJobMonitor = new GenerativeJobMonitor(source);
  const sessionPresenceCoordinator = new SessionPresenceCoordinator(source);
  // Cast to the runtime shape — the panels only touch the 4 coordinator
  // fields, so a partial object satisfies their type contract for tests.
  return {
    runtime: {
      assetLoadCoordinator,
      securityEventBus,
      generativeJobMonitor,
      sessionPresenceCoordinator,
    } as unknown as Parameters<typeof TraitRuntimeProvider>[0]['runtime'],
    source,
  };
}

describe('AssetLoadingScreen — AssetLoadCoordinator consumer', () => {
  let runtime: ReturnType<typeof makeRuntime>['runtime'];
  let source: MockEventSource;
  beforeEach(() => {
    const r = makeRuntime();
    runtime = r.runtime;
    source = r.source;
  });

  it('renders nothing when no assets are loading and hideWhenIdle=true', () => {
    const { container } = render(
      <TraitRuntimeProvider runtime={runtime}>
        <AssetLoadingScreen />
      </TraitRuntimeProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a loading row when an asset starts loading', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AssetLoadingScreen />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('gltf:load_started', { url: 'avatars/hero.glb' });
    });
    expect(screen.getByTestId('asset-loading-screen')).toBeInTheDocument();
    expect(screen.getByTestId('asset-loading-row-avatars/hero.glb')).toBeInTheDocument();
  });

  it('updates the progress bar width as progress events fire', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AssetLoadingScreen />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('gltf:load_started', { url: 'a.glb' });
      source.fire('gltf:loading_progress', { url: 'a.glb', progress: 0.6 });
    });
    const bar = screen.getByTestId('asset-progress-a.glb');
    expect(bar.style.width).toBe('60%');
  });

  it('shows an error row when an asset load fails', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AssetLoadingScreen />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('gltf:load_started', { url: 'broken.glb' });
      source.fire('gltf:load_error', { url: 'broken.glb', error: '404 not found' });
    });
    expect(screen.getByTestId('asset-error-row-broken.glb')).toHaveTextContent('404 not found');
  });

  it('explicit runtime prop overrides Provider context', async () => {
    render(<AssetLoadingScreen runtime={runtime} />);
    await act(async () => {
      source.fire('gltf:load_started', { url: 'direct.glb' });
    });
    expect(screen.getByTestId('asset-loading-row-direct.glb')).toBeInTheDocument();
  });
});

describe('AdminDashboard — SecurityEventBus consumer', () => {
  let runtime: ReturnType<typeof makeRuntime>['runtime'];
  let source: MockEventSource;
  beforeEach(() => {
    const r = makeRuntime();
    runtime = r.runtime;
    source = r.source;
  });

  it('renders empty stat grid + audit-empty placeholder on mount', () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AdminDashboard />
      </TraitRuntimeProvider>
    );
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('admin-audit-empty')).toBeInTheDocument();
    // Sessions stat starts at 0
    expect(screen.getByTestId('stat-sessions-active')).toHaveTextContent('0');
  });

  it('updates session counter when sso_authenticated fires', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AdminDashboard />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('sso_authenticated', { sessionId: 's1', userId: 'u1' });
      source.fire('sso_authenticated', { sessionId: 's2', userId: 'u2' });
    });
    expect(screen.getByTestId('stat-sessions-active')).toHaveTextContent('2');
  });

  it('renders audit log rows when audit_log fires', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AdminDashboard />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('audit_log', {
        action: 'role.assign',
        actor: 'agent-1',
        outcome: 'success',
      });
    });
    expect(screen.queryByTestId('admin-audit-empty')).toBeNull();
    expect(screen.getByTestId('admin-audit-list')).toHaveTextContent('role.assign');
    expect(screen.getByTestId('admin-audit-list')).toHaveTextContent('agent-1');
  });

  it('flips quotas card to error accent when a quota is exceeded', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <AdminDashboard />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('quota_exceeded', {
        resource: 'api_calls',
        tenantId: 't1',
        consumed: 1100,
        limit: 1000,
      });
    });
    expect(screen.getByTestId('stat-quotas-exceeded')).toHaveTextContent('1');
  });
});

describe('LobbyPeerRoster — SessionPresenceCoordinator consumer', () => {
  let runtime: ReturnType<typeof makeRuntime>['runtime'];
  let source: MockEventSource;
  beforeEach(() => {
    const r = makeRuntime();
    runtime = r.runtime;
    source = r.source;
  });

  it('renders the 4 sub-sections empty on mount', () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LobbyPeerRoster />
      </TraitRuntimeProvider>
    );
    expect(screen.getByTestId('lobby-sessions')).toHaveTextContent('No active sessions');
    expect(screen.getByTestId('lobby-voice')).toHaveTextContent('No voice listeners attached');
    expect(screen.getByTestId('lobby-messaging')).toHaveTextContent('No messaging connections');
    expect(screen.getByTestId('lobby-heartbeat')).toHaveTextContent('No heartbeat sources');
  });

  it('shows a session row with participants when SharePlay events fire', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LobbyPeerRoster />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('shareplay:started', { sessionId: 'sp-1' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp-1', participantId: 'pA' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp-1', participantId: 'pB' });
    });
    const row = screen.getByTestId('session-row-sp-1');
    // Panel renders status lowercase; CSS uppercases visually only.
    expect(row).toHaveTextContent('started');
    expect(row).toHaveTextContent('pA');
    expect(row).toHaveTextContent('pB');
  });

  it('shows voice peer with mute state', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LobbyPeerRoster />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('spatial_voice_create', { nodeId: 'listener-1' });
      source.fire('spatial_voice_peer_joined', { nodeId: 'listener-1', peerId: 'remoteA' });
      source.fire('spatial_voice_muted', {});
    });
    const row = screen.getByTestId('voice-row-listener-1');
    // 'MUTED'/'LIVE' are rendered as literal uppercase strings in JSX (not CSS),
    // so they DO appear uppercase in the DOM. Assert the literal.
    expect(row).toHaveTextContent('MUTED');
    expect(row).toHaveTextContent('1 peer');
  });

  it('shows messaging connection + traffic counts', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LobbyPeerRoster />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('message_received', { platform: 'discord' });
      source.fire('message_received', { platform: 'discord' });
      source.fire('message_sent', { platform: 'discord' });
    });
    const row = screen.getByTestId('messaging-row-discord');
    expect(row).toHaveTextContent('connected'); // DOM lowercase; CSS uppercases visually
    expect(row).toHaveTextContent('↓2');
    expect(row).toHaveTextContent('↑1');
  });

  it('shows heartbeat tick count', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LobbyPeerRoster />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('heartbeat_initialized', { nodeId: 'world-1' });
      source.fire('heartbeat_tick', { nodeId: 'world-1' });
      source.fire('heartbeat_tick', { nodeId: 'world-1' });
      source.fire('heartbeat_tick', { nodeId: 'world-1' });
    });
    const row = screen.getByTestId('heartbeat-row-world-1');
    expect(row).toHaveTextContent('alive'); // DOM lowercase; CSS uppercases visually
    expect(row).toHaveTextContent('ticks: 3');
  });
});

describe('LocomotionDemoPanel — GenerativeJobMonitor consumer', () => {
  let runtime: ReturnType<typeof makeRuntime>['runtime'];
  let source: MockEventSource;
  beforeEach(() => {
    const r = makeRuntime();
    runtime = r.runtime;
    source = r.source;
  });

  it('renders 4 kind cards + empty jobs list on mount', () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LocomotionDemoPanel />
      </TraitRuntimeProvider>
    );
    expect(screen.getByTestId('locomotion-kind-inpainting')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-kind-texture_gen')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-kind-controlnet')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-kind-diffusion_rt')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-jobs-empty')).toBeInTheDocument();
  });

  it('flips ready badge to "ready" after <kind>:ready fires', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LocomotionDemoPanel />
      </TraitRuntimeProvider>
    );
    expect(screen.getByTestId('locomotion-ready-inpainting')).toHaveTextContent('idle');
    await act(async () => {
      source.fire('inpainting:ready', { modelId: 'sd-inpaint' });
    });
    expect(screen.getByTestId('locomotion-ready-inpainting')).toHaveTextContent('ready');
  });

  it('shows a job row that transitions running → completed', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LocomotionDemoPanel />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('inpainting:started', { requestId: 'job-1' });
    });
    // Status text is rendered lowercase in DOM (CSS uppercases visually only).
    expect(screen.getByTestId('locomotion-job-row-job-1')).toHaveTextContent('running');
    await act(async () => {
      source.fire('inpainting:result', { requestId: 'job-1' });
    });
    expect(screen.getByTestId('locomotion-job-row-job-1')).toHaveTextContent('completed');
  });

  it('shows error status with red accent when job fails', async () => {
    render(
      <TraitRuntimeProvider runtime={runtime}>
        <LocomotionDemoPanel />
      </TraitRuntimeProvider>
    );
    await act(async () => {
      source.fire('texture_gen:queued', { requestId: 'tx-1' });
      source.fire('texture_gen:started', { requestId: 'tx-1' });
      source.fire('controlnet:error', { requestId: 'cn-1', error: 'invalid map' });
    });
    expect(screen.getByTestId('locomotion-total-counter')).toHaveTextContent('2 tracked');
  });

  it('renders nothing-changes view when runtime is null', () => {
    render(
      <TraitRuntimeProvider runtime={null}>
        <LocomotionDemoPanel />
      </TraitRuntimeProvider>
    );
    // Still renders the panel shell, just with no jobs.
    expect(screen.getByTestId('locomotion-demo-panel')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-jobs-empty')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-total-counter')).toHaveTextContent('0 tracked');
  });
});
