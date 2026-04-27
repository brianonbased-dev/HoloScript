/**
 * End-to-end integration test for the 4 consumer-buses wired into
 * TraitRuntimeIntegration. Constructs a real TraitContextFactory + real
 * TraitRuntimeIntegration, then fires events through `context.emit`
 * (the same path traits use in production) and asserts each bus
 * observed the event and updated its state.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement for
 * the Pattern E coordinators (task_1777281302813_eezs). Without this
 * test, the unit tests verify only that the buses work against a mock
 * source — they do NOT prove the engine's TraitContextFactory.emit
 * actually reaches them in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TraitContextFactory } from '../TraitContextFactory';
import { TraitRuntimeIntegration } from '../TraitRuntimeIntegration';

describe('TraitRuntimeIntegration — Pattern E consumer-bus wire (4/4)', () => {
  let factory: TraitContextFactory;
  let runtime: TraitRuntimeIntegration;

  beforeEach(() => {
    // Empty config = all no-op providers. The buses subscribe to
    // factory.on(...) at construction; they do not depend on providers.
    factory = new TraitContextFactory({});
    runtime = new TraitRuntimeIntegration(factory);
  });

  it('wires all 4 coordinators to TraitContextFactory at construction', () => {
    expect(runtime.assetLoadCoordinator).toBeDefined();
    expect(runtime.securityEventBus).toBeDefined();
    expect(runtime.generativeJobMonitor).toBeDefined();
    expect(runtime.sessionPresenceCoordinator).toBeDefined();
  });

  it('AssetLoadCoordinator receives events through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('gltf:load_started', { url: 'avatars/hero.glb' });
    ctx.emit('gltf:loading_progress', { url: 'avatars/hero.glb', progress: 0.5 });
    const state = runtime.assetLoadCoordinator.getAssetState('avatars/hero.glb');
    expect(state?.status).toBe('loading');
    expect(state?.progress).toBe(0.5);
    expect(state?.format).toBe('gltf');
  });

  it('AssetLoadCoordinator transitions to loaded on gltf:loaded', () => {
    const ctx = factory.createContext();
    ctx.emit('gltf:load_started', { url: 'a.glb' });
    ctx.emit('gltf:loaded', { url: 'a.glb' });
    expect(runtime.assetLoadCoordinator.getAssetState('a.glb')?.status).toBe('loaded');
  });

  it('SecurityEventBus receives RBAC events through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('rbac_role_assigned', { agentId: 'agent-1', role: 'admin' });
    ctx.emit('rbac_capability_granted', { agentId: 'agent-1', capability: 'tenant:write' });
    const agent = runtime.securityEventBus.getAgent('agent-1');
    expect(agent?.roles.has('admin')).toBe(true);
    expect(agent?.capabilities.has('tenant:write')).toBe(true);
  });

  it('SecurityEventBus receives SSO events through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('sso_authenticated', { sessionId: 'sess-1', userId: 'user-1', idp: 'oidc' });
    expect(runtime.securityEventBus.getSession('sess-1')?.status).toBe('authenticated');
  });

  it('SecurityEventBus appends audit_log entries through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('audit_log', { action: 'role.assign', actor: 'agent-1', outcome: 'success' });
    const log = runtime.securityEventBus.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('role.assign');
  });

  it('GenerativeJobMonitor tracks inpainting lifecycle through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('inpainting:ready', { modelId: 'sd-inpaint' });
    ctx.emit('inpainting:started', { requestId: 'req-1' });
    ctx.emit('inpainting:result', { requestId: 'req-1' });
    expect(runtime.generativeJobMonitor.isReady('inpainting')).toBe(true);
    expect(runtime.generativeJobMonitor.getJob('req-1')?.status).toBe('completed');
  });

  it('GenerativeJobMonitor tracks diffusion_rt frames through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('diffusion_rt:started', { sessionId: 'rt1' });
    ctx.emit('diffusion_rt:frame_ready', { sessionId: 'rt1', frameNumber: 0 });
    ctx.emit('diffusion_rt:frame_ready', { sessionId: 'rt1', frameNumber: 1 });
    expect(runtime.generativeJobMonitor.getJobsByKind('diffusion_rt').length).toBeGreaterThanOrEqual(2);
  });

  it('SessionPresenceCoordinator tracks SharePlay sessions through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('shareplay:started', { sessionId: 'sp-1' });
    ctx.emit('shareplay:participant_joined', { sessionId: 'sp-1', participantId: 'pA' });
    ctx.emit('shareplay:participant_joined', { sessionId: 'sp-1', participantId: 'pB' });
    const s = runtime.sessionPresenceCoordinator.getSession('sp-1');
    expect(s?.status).toBe('started');
    expect(s?.participants.size).toBe(2);
  });

  it('SessionPresenceCoordinator tracks heartbeats through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('heartbeat_initialized', { nodeId: 'world-1' });
    ctx.emit('heartbeat_tick', { nodeId: 'world-1' });
    ctx.emit('heartbeat_tick', { nodeId: 'world-1' });
    const h = runtime.sessionPresenceCoordinator.getHeartbeat('world-1');
    expect(h?.status).toBe('alive');
    expect(h?.ticks).toBe(2);
  });

  it('SessionPresenceCoordinator tracks messaging through factory.emit', () => {
    const ctx = factory.createContext();
    ctx.emit('messaging_connected', { platform: 'discord' });
    ctx.emit('message_received', { platform: 'discord' });
    expect(runtime.sessionPresenceCoordinator.getMessagingConnection('discord')?.status).toBe(
      'connected'
    );
    expect(runtime.sessionPresenceCoordinator.getMessagingConnection('discord')?.messagesReceived).toBe(
      1
    );
  });

  it('A single emit is received by ALL relevant buses (cross-cluster fan-out)', () => {
    // The audit_log channel should reach SecurityEventBus only — none of
    // the other 3 buses subscribe to it. This pins the cross-cluster
    // routing in case anyone widens a bus's vocabulary by accident.
    const ctx = factory.createContext();
    const beforeAudit = runtime.securityEventBus.getAuditLog().length;
    const beforeAsset = runtime.assetLoadCoordinator.getAllStates().length;
    const beforeJobs = runtime.generativeJobMonitor.getAllJobs().length;
    const beforePresence = runtime.sessionPresenceCoordinator.getAllSessions().length;

    ctx.emit('audit_log', { action: 'x', actor: 'sys' });

    expect(runtime.securityEventBus.getAuditLog().length).toBe(beforeAudit + 1);
    expect(runtime.assetLoadCoordinator.getAllStates().length).toBe(beforeAsset);
    expect(runtime.generativeJobMonitor.getAllJobs().length).toBe(beforeJobs);
    expect(runtime.sessionPresenceCoordinator.getAllSessions().length).toBe(beforePresence);
  });

  it('Subscribers across all 4 buses receive their domain events', () => {
    const ctx = factory.createContext();
    let assetSeen = 0;
    let securitySeen = 0;
    let jobSeen = 0;
    let presenceSeen = 0;
    runtime.assetLoadCoordinator.subscribe(() => assetSeen++);
    runtime.securityEventBus.subscribe(() => securitySeen++);
    runtime.generativeJobMonitor.subscribe(() => jobSeen++);
    runtime.sessionPresenceCoordinator.subscribe(() => presenceSeen++);

    ctx.emit('gltf:loaded', { url: 'a.glb' });
    ctx.emit('rbac_role_assigned', { agentId: 'a', role: 'r' });
    ctx.emit('inpainting:started', { requestId: 'i1' });
    ctx.emit('shareplay:started', { sessionId: 'sp1' });

    expect(assetSeen).toBe(1);
    expect(securitySeen).toBe(1);
    expect(jobSeen).toBe(1);
    expect(presenceSeen).toBe(1);
  });
});
