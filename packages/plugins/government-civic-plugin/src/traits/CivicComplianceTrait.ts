/** @civic_compliance Trait — ADA, FOIA, and public records compliance enforcement. @trait civic_compliance */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ComplianceFramework = 'ADA' | 'FOIA' | 'WCAG' | 'OPRA' | 'GDPR' | 'CCPA' | 'section508';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'pending_review' | 'exempt' | 'remediation_in_progress';

export interface ComplianceCheck {
  id: string;
  framework: ComplianceFramework;
  requirement: string;
  status: ComplianceStatus;
  lastChecked: string;
  remediation?: string;
  dueDate?: string;
}

export interface FoiaRequest {
  requestId: string;
  requestedAt: string;
  description: string;
  status: 'received' | 'processing' | 'fulfilled' | 'denied' | 'appealed';
  responseDueAt: string; // 20 business days under US federal FOIA
}

export interface CivicComplianceConfig {
  entityId: string;
  entityType: 'website' | 'facility' | 'service' | 'document' | 'meeting';
  frameworks: ComplianceFramework[];
  foiaEnabled: boolean;
  foiaResponseDaysLimit: number; // default 20 federal, varies by state
  accessibilityStandard: 'WCAG_2_1_AA' | 'WCAG_2_1_AAA' | 'WCAG_2_2_AA' | 'section508';
  auditLogRetentionDays: number;
  isPublicRecord: boolean;
}

export interface CivicComplianceState {
  overallStatus: ComplianceStatus;
  checks: ComplianceCheck[];
  foiaRequests: FoiaRequest[];
  auditLog: Array<{ timestamp: string; action: string; actor: string; details: string }>;
  lastAuditAt: string;
  openFoiaCount: number;
  overdueFoiaCount: number;
  nonCompliantCount: number;
}

const defaultConfig: CivicComplianceConfig = {
  entityId: '',
  entityType: 'service',
  frameworks: ['ADA', 'FOIA', 'WCAG'],
  foiaEnabled: true,
  foiaResponseDaysLimit: 20,
  accessibilityStandard: 'WCAG_2_1_AA',
  auditLogRetentionDays: 2555, // 7 years
  isPublicRecord: true,
};

function computeOverallStatus(checks: ComplianceCheck[]): ComplianceStatus {
  if (checks.some(c => c.status === 'non_compliant')) return 'non_compliant';
  if (checks.some(c => c.status === 'remediation_in_progress')) return 'remediation_in_progress';
  if (checks.some(c => c.status === 'pending_review')) return 'pending_review';
  if (checks.length > 0 && checks.every(c => c.status === 'compliant' || c.status === 'exempt')) return 'compliant';
  return 'pending_review';
}

export function createCivicComplianceHandler(): TraitHandler<CivicComplianceConfig> {
  return {
    name: 'civic_compliance',
    defaultConfig,
    onAttach(node: HSPlusNode, config: CivicComplianceConfig, ctx: TraitContext) {
      // Seed initial checks based on declared frameworks
      const checks: ComplianceCheck[] = config.frameworks.map(fw => ({
        id: `${config.entityId}-${fw.toLowerCase()}`,
        framework: fw,
        requirement: `${fw} baseline compliance`,
        status: 'pending_review' as ComplianceStatus,
        lastChecked: new Date().toISOString(),
      }));
      node.__complianceState = {
        overallStatus: 'pending_review' as ComplianceStatus,
        checks,
        foiaRequests: [],
        auditLog: [],
        lastAuditAt: new Date().toISOString(),
        openFoiaCount: 0,
        overdueFoiaCount: 0,
        nonCompliantCount: 0,
      } satisfies CivicComplianceState;
      ctx.emit?.('compliance:initialized', { entityId: config.entityId, frameworks: config.frameworks });
    },
    onDetach(node: HSPlusNode, _config: CivicComplianceConfig, ctx: TraitContext) {
      delete node.__complianceState;
      ctx.emit?.('compliance:removed');
    },
    onUpdate(node: HSPlusNode, config: CivicComplianceConfig, ctx: TraitContext, _delta: number) {
      const s = node.__complianceState as CivicComplianceState | undefined;
      if (!s) return;
      const now = Date.now();
      // Check FOIA deadlines
      let overdue = 0;
      for (const req of s.foiaRequests) {
        if (req.status === 'received' || req.status === 'processing') {
          const dueAt = new Date(req.responseDueAt).getTime();
          if (now > dueAt) overdue++;
        }
      }
      const prevOverdue = s.overdueFoiaCount;
      s.overdueFoiaCount = overdue;
      if (overdue > prevOverdue) {
        ctx.emit?.('compliance:foia_overdue', { entityId: config.entityId, overdueCount: overdue });
      }
      s.openFoiaCount = s.foiaRequests.filter(r => r.status === 'received' || r.status === 'processing').length;
      s.nonCompliantCount = s.checks.filter(c => c.status === 'non_compliant').length;
      s.overallStatus = computeOverallStatus(s.checks);
    },
    onEvent(node: HSPlusNode, config: CivicComplianceConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__complianceState as CivicComplianceState | undefined;
      if (!s) return;
      switch (event.type) {
        case 'compliance:update_check': {
          const { checkId, status, remediation } = event.payload as { checkId: string; status: ComplianceStatus; remediation?: string };
          const check = s.checks.find(c => c.id === checkId);
          if (check) {
            check.status = status;
            check.lastChecked = new Date().toISOString();
            if (remediation) check.remediation = remediation;
            s.overallStatus = computeOverallStatus(s.checks);
            ctx.emit?.('compliance:check_updated', { checkId, status, overall: s.overallStatus });
          }
          break;
        }
        case 'compliance:foia_received': {
          if (!config.foiaEnabled) return;
          const req = event.payload as unknown as FoiaRequest;
          if (!req?.requestId) return;
          const receivedAt = new Date();
          // Approx 20 business days = 28 calendar days
          const dueAt = new Date(receivedAt.getTime() + config.foiaResponseDaysLimit * 1.4 * 86_400_000);
          s.foiaRequests.push({ ...req, requestedAt: receivedAt.toISOString(), responseDueAt: dueAt.toISOString(), status: 'received' });
          s.openFoiaCount = s.foiaRequests.filter(r => r.status === 'received' || r.status === 'processing').length;
          ctx.emit?.('compliance:foia_received', { requestId: req.requestId, dueAt: dueAt.toISOString() });
          break;
        }
        case 'compliance:foia_fulfill': {
          const requestId = event.payload?.requestId as string;
          const req = s.foiaRequests.find(r => r.requestId === requestId);
          if (req) {
            req.status = 'fulfilled';
            s.openFoiaCount = s.foiaRequests.filter(r => r.status === 'received' || r.status === 'processing').length;
            ctx.emit?.('compliance:foia_fulfilled', { requestId });
          }
          break;
        }
        case 'compliance:audit_log': {
          const { action, actor, details } = event.payload as { action: string; actor: string; details: string };
          s.auditLog.push({ timestamp: new Date().toISOString(), action, actor, details: details ?? '' });
          // Prune logs older than retention window
          const cutoff = Date.now() - config.auditLogRetentionDays * 86_400_000;
          s.auditLog = s.auditLog.filter(e => new Date(e.timestamp).getTime() > cutoff);
          break;
        }
      }
    },
  };
}
