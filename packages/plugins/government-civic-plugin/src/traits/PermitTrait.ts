/** @permit Trait — Building and business permit lifecycle management. @trait permit */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type PermitType = 'building' | 'business' | 'event' | 'demolition' | 'electrical' | 'plumbing' | 'sign' | 'zoning';
export type PermitStatus = 'submitted' | 'under_review' | 'approved' | 'denied' | 'expired' | 'revoked' | 'withdrawn';

export interface PermitConfig {
  permitType: PermitType;
  applicationNumber: string;
  applicantName: string;
  projectAddress: string;
  submittedAt: string; // ISO date
  expiresAt?: string;  // ISO date — when approved permit expires
  reviewDeadlineDays: number;
  showStatusBadge: boolean;
}

export interface PermitState {
  status: PermitStatus;
  applicationNumber: string;
  daysInReview: number;
  isOverdue: boolean;
  isExpiringSoon: boolean; // within 30 days
  isExpired: boolean;
  reviewNotes: string[];
  lastUpdated: string;
}

const defaultConfig: PermitConfig = {
  permitType: 'building',
  applicationNumber: '',
  applicantName: '',
  projectAddress: '',
  submittedAt: new Date().toISOString(),
  reviewDeadlineDays: 30,
  showStatusBadge: true,
};

function computeState(config: PermitConfig, existing?: Partial<PermitState>): PermitState {
  const now = Date.now();
  const submitted = new Date(config.submittedAt).getTime();
  const daysInReview = Math.floor((now - submitted) / 86_400_000);
  const expiresAt = config.expiresAt ? new Date(config.expiresAt).getTime() : null;
  const daysUntilExpiry = expiresAt ? Math.floor((expiresAt - now) / 86_400_000) : null;

  return {
    status: (existing?.status as PermitStatus) ?? 'submitted',
    applicationNumber: config.applicationNumber,
    daysInReview,
    isOverdue: daysInReview > config.reviewDeadlineDays,
    isExpiringSoon: daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
    isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    reviewNotes: (existing?.reviewNotes as string[]) ?? [],
    lastUpdated: new Date().toISOString(),
  };
}

export function createPermitHandler(): TraitHandler<PermitConfig> {
  return {
    name: 'permit',
    defaultConfig,
    onAttach(node: HSPlusNode, config: PermitConfig, ctx: TraitContext) {
      node.__permitState = computeState(config);
      ctx.emit?.('permit:attached', {
        applicationNumber: config.applicationNumber,
        type: config.permitType,
      });
    },
    onDetach(node: HSPlusNode, _config: PermitConfig, ctx: TraitContext) {
      delete node.__permitState;
      ctx.emit?.('permit:detached');
    },
    onUpdate(node: HSPlusNode, config: PermitConfig, ctx: TraitContext, _delta: number) {
      const prev = node.__permitState as PermitState | undefined;
      const next = computeState(config, prev);
      if (next.isOverdue && !prev?.isOverdue) {
        ctx.emit?.('permit:overdue', { applicationNumber: config.applicationNumber, daysInReview: next.daysInReview });
      }
      if (next.isExpiringSoon && !prev?.isExpiringSoon) {
        ctx.emit?.('permit:expiring_soon', { applicationNumber: config.applicationNumber });
      }
      if (next.isExpired && !prev?.isExpired) {
        ctx.emit?.('permit:expired', { applicationNumber: config.applicationNumber });
      }
      node.__permitState = next;
    },
    onEvent(node: HSPlusNode, config: PermitConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__permitState as PermitState | undefined;
      if (!s) return;
      if (event.type === 'permit:update_status') {
        const newStatus = event.payload?.status as PermitStatus;
        if (!newStatus) return;
        const prev = s.status;
        s.status = newStatus;
        s.lastUpdated = new Date().toISOString();
        ctx.emit?.('permit:status_changed', { from: prev, to: newStatus, applicationNumber: config.applicationNumber });
      }
      if (event.type === 'permit:add_note') {
        const note = event.payload?.note as string;
        if (note) {
          s.reviewNotes.push(note);
          ctx.emit?.('permit:note_added', { applicationNumber: config.applicationNumber, noteCount: s.reviewNotes.length });
        }
      }
    },
  };
}
