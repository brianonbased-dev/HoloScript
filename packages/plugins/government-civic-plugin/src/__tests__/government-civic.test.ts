import { describe, it, expect, vi } from 'vitest';
import {
  createPermitHandler,
  createPublicMeetingHandler,
  createServiceRequestHandler,
  createVotingRecordHandler,
  createCivicComplianceHandler,
  pluginMeta,
  traitHandlers,
} from '../index';
import type { PermitConfig, PermitState } from '../traits/PermitTrait';
import type { PublicMeetingConfig } from '../traits/PublicMeetingTrait';
import type { ServiceRequestConfig } from '../traits/ServiceRequestTrait';
import type { VotingRecordConfig } from '../traits/VotingRecordTrait';
import type { CivicComplianceConfig } from '../traits/CivicComplianceTrait';
import type { HSPlusNode, TraitContext } from '../traits/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode { return { id: 'n1', traits: [], state: {}, position: [0, 0, 0] }; }
function makeCtx(): TraitContext { return { emit: vi.fn(), scene: {} }; }

// ── Plugin metadata ───────────────────────────────────────────────────────────

describe('pluginMeta', () => {
  it('has correct name', () => {
    expect(pluginMeta.name).toBe('@holoscript/plugin-government-civic');
  });
  it('exports five traits', () => {
    expect(pluginMeta.traits).toHaveLength(5);
    expect(pluginMeta.traits).toContain('permit');
    expect(pluginMeta.traits).toContain('public_meeting');
    expect(pluginMeta.traits).toContain('service_request');
    expect(pluginMeta.traits).toContain('voting_record');
    expect(pluginMeta.traits).toContain('civic_compliance');
  });
  it('traitHandlers has five entries', () => {
    expect(traitHandlers).toHaveLength(5);
  });
  it('each handler has required interface', () => {
    for (const h of traitHandlers) {
      expect(typeof h.name).toBe('string');
      expect(h.defaultConfig).toBeDefined();
      expect(typeof h.onAttach).toBe('function');
      expect(typeof h.onDetach).toBe('function');
      expect(typeof h.onEvent).toBe('function');
    }
  });
});

// ── PermitTrait ───────────────────────────────────────────────────────────────

describe('PermitTrait', () => {
  const cfg: PermitConfig = {
    permitType: 'building',
    applicationNumber: 'P-001',
    applicantName: 'ACME Corp',
    projectAddress: '100 Main St',
    submittedAt: new Date(Date.now() - 86_400_000 * 5).toISOString(), // 5 days ago
    reviewDeadlineDays: 30,
    showStatusBadge: true,
  };

  it('initialises state on attach', () => {
    const handler = createPermitHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    expect(node.__permitState).toBeDefined();
    expect((node.__permitState as { daysInReview: number }).daysInReview).toBeGreaterThanOrEqual(4);
    expect(ctx.emit).toHaveBeenCalledWith('permit:attached', expect.any(Object));
  });

  it('changes status via permit:update_status event', () => {
    const handler = createPermitHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'permit:update_status', payload: { status: 'approved' } });
    expect((node.__permitState as { status: string }).status).toBe('approved');
    expect(ctx.emit).toHaveBeenCalledWith('permit:status_changed', expect.objectContaining({ to: 'approved' }));
  });

  it('cleans up on detach', () => {
    const handler = createPermitHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onDetach(node, cfg, ctx);
    expect(node.__permitState).toBeUndefined();
  });
});

// ── PublicMeetingTrait ────────────────────────────────────────────────────────

describe('PublicMeetingTrait', () => {
  const cfg: PublicMeetingConfig = {
    meetingType: 'city_council',
    meetingId: 'CC-001',
    title: 'April Session',
    scheduledAt: new Date().toISOString(),
    location: 'City Hall',
    quorumRequired: 4,
    membersPresent: 5,
    publicCommentMinutesPerSpeaker: 3,
    agenda: [
      { id: '1', title: 'Call to Order', type: 'action', durationMinutes: 5, requiresVote: false },
      { id: '2', title: 'Public Comment', type: 'public_comment', durationMinutes: 30, requiresVote: false },
    ],
    accessibilityFeatures: ['captioning'],
  };

  it('initialises with quorum met when members >= required', () => {
    const handler = createPublicMeetingHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    expect((node.__meetingState as { quorumMet: boolean }).quorumMet).toBe(true);
  });

  it('call_to_order changes status and starts recording', () => {
    const handler = createPublicMeetingHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'meeting:call_to_order' });
    const s = node.__meetingState as { status: string; recordingActive: boolean };
    expect(s.status).toBe('in_session');
    expect(s.recordingActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('meeting:called_to_order', expect.any(Object));
  });

  it('adjourn changes status and emits event', () => {
    const handler = createPublicMeetingHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'meeting:call_to_order' });
    handler.onEvent(node, cfg, ctx, { type: 'meeting:adjourn' });
    expect((node.__meetingState as { status: string }).status).toBe('adjourned');
    expect(ctx.emit).toHaveBeenCalledWith('meeting:adjourned', expect.any(Object));
  });
});

// ── ServiceRequestTrait ───────────────────────────────────────────────────────

describe('ServiceRequestTrait', () => {
  const cfg: ServiceRequestConfig = {
    requestId: 'SR-001',
    category: 'pothole',
    description: 'Large pothole on Main St',
    location: 'Main St & 3rd',
    submittedAt: new Date(Date.now() - 86_400_000).toISOString(), // 1 day ago
    priority: 'high',
    targetResolutionDays: 3,
    department: 'Public Works',
    isAnonymous: false,
  };

  it('initialises state on attach', () => {
    const handler = createServiceRequestHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    expect(node.__srState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('sr:created', expect.any(Object));
  });

  it('sr:assign sets assignedTo and status', () => {
    const handler = createServiceRequestHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'sr:assign', payload: { assignedTo: 'crew-7' } });
    const s = node.__srState as { status: string; assignedTo: string };
    expect(s.status).toBe('assigned');
    expect(s.assignedTo).toBe('crew-7');
  });

  it('sr:resolve sets status to resolved', () => {
    const handler = createServiceRequestHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'sr:resolve' });
    expect((node.__srState as { status: string }).status).toBe('resolved');
    expect(ctx.emit).toHaveBeenCalledWith('sr:resolved', expect.any(Object));
  });
});

// ── VotingRecordTrait ─────────────────────────────────────────────────────────

describe('VotingRecordTrait', () => {
  const cfg: VotingRecordConfig = {
    voteId: 'V-001',
    voteType: 'council_vote',
    title: 'Budget Amendment',
    description: 'FY2026 infrastructure spend',
    motionText: 'Move to adopt Res 2026-19',
    scheduledAt: new Date().toISOString(),
    requiredMajority: 'simple',
    eligibleVoters: ['CM-A', 'CM-B', 'CM-C', 'CM-D', 'Mayor'],
    showLiveResults: true,
    showMemberVotes: true,
  };

  it('initialises with pending outcome and no votes', () => {
    const handler = createVotingRecordHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    const s = node.__votingState as { outcome: string; ayeCount: number };
    expect(s.outcome).toBe('pending');
    expect(s.ayeCount).toBe(0);
  });

  it('vote:cast increments aye count', () => {
    const handler = createVotingRecordHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'vote:open' });
    handler.onEvent(node, cfg, ctx, { type: 'vote:cast', payload: { memberId: 'CM-A', memberName: 'Councilmember A', vote: 'aye' } });
    expect((node.__votingState as { ayeCount: number }).ayeCount).toBe(1);
  });

  it('vote:close with majority ayes resolves to passed', () => {
    const handler = createVotingRecordHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'vote:open' });
    for (const id of ['CM-A', 'CM-B', 'CM-C']) {
      handler.onEvent(node, cfg, ctx, { type: 'vote:cast', payload: { memberId: id, memberName: id, vote: 'aye' } });
    }
    for (const id of ['CM-D', 'Mayor']) {
      handler.onEvent(node, cfg, ctx, { type: 'vote:cast', payload: { memberId: id, memberName: id, vote: 'nay' } });
    }
    handler.onEvent(node, cfg, ctx, { type: 'vote:close' });
    expect((node.__votingState as { outcome: string }).outcome).toBe('passed');
    expect(ctx.emit).toHaveBeenCalledWith('vote:closed', expect.objectContaining({ outcome: 'passed' }));
  });
});

// ── CivicComplianceTrait ──────────────────────────────────────────────────────

describe('CivicComplianceTrait', () => {
  const cfg: CivicComplianceConfig = {
    entityId: 'portal-1',
    entityType: 'website',
    frameworks: ['ADA', 'WCAG', 'FOIA'],
    foiaEnabled: true,
    foiaResponseDaysLimit: 20,
    accessibilityStandard: 'WCAG_2_1_AA',
    auditLogRetentionDays: 2555,
    isPublicRecord: true,
  };

  it('initialises checks for each framework', () => {
    const handler = createCivicComplianceHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    const s = node.__complianceState as { checks: unknown[] };
    expect(s.checks).toHaveLength(3);
  });

  it('compliance:update_check changes check status', () => {
    const handler = createCivicComplianceHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    const s = node.__complianceState as { checks: Array<{ id: string; status: string }> };
    const checkId = s.checks[0]!.id;
    handler.onEvent(node, cfg, ctx, { type: 'compliance:update_check', payload: { checkId, status: 'compliant' } });
    expect(s.checks[0]!.status).toBe('compliant');
    expect(ctx.emit).toHaveBeenCalledWith('compliance:check_updated', expect.objectContaining({ status: 'compliant' }));
  });

  it('compliance:foia_received creates a pending FOIA request', () => {
    const handler = createCivicComplianceHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'compliance:foia_received', payload: { requestId: 'FOIA-001', description: 'Budget docs' } });
    const s = node.__complianceState as { foiaRequests: unknown[]; openFoiaCount: number };
    expect(s.foiaRequests).toHaveLength(1);
    expect(s.openFoiaCount).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('compliance:foia_received', expect.objectContaining({ requestId: 'FOIA-001' }));
  });

  it('audit log entry is stored', () => {
    const handler = createCivicComplianceHandler();
    const node = makeNode();
    const ctx = makeCtx();
    handler.onAttach(node, cfg, ctx);
    handler.onEvent(node, cfg, ctx, { type: 'compliance:audit_log', payload: { action: 'page_view', actor: 'user-99', details: 'Viewed homepage' } });
    const s = node.__complianceState as { auditLog: unknown[] };
    expect(s.auditLog).toHaveLength(1);
  });
});
