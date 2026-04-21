/** @service_request Trait — 311-style civic service request tracking. @trait service_request */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ServiceCategory = 'pothole' | 'streetlight' | 'graffiti' | 'abandoned_vehicle' | 'code_violation' | 'tree_hazard' | 'water_main' | 'sidewalk' | 'noise_complaint' | 'other';
export type RequestStatus = 'submitted' | 'acknowledged' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'duplicate';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export interface ServiceRequestConfig {
  requestId: string;
  category: ServiceCategory;
  description: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  submittedAt: string;  // ISO datetime
  priority: PriorityLevel;
  targetResolutionDays: number; // SLA days by priority
  department: string;
  contactEmail?: string;
  isAnonymous: boolean;
}

export interface ServiceRequestState {
  status: RequestStatus;
  requestId: string;
  assignedTo?: string;
  daysOpen: number;
  isSlaBreached: boolean;
  lastStatusChange: string;
  updates: Array<{ timestamp: string; message: string; author: string }>;
}

const SLA_DAYS: Record<PriorityLevel, number> = {
  urgent: 1,
  high: 3,
  medium: 7,
  low: 14,
};

const defaultConfig: ServiceRequestConfig = {
  requestId: '',
  category: 'other',
  description: '',
  location: '',
  submittedAt: new Date().toISOString(),
  priority: 'medium',
  targetResolutionDays: SLA_DAYS.medium,
  department: 'Public Works',
  isAnonymous: false,
};

export function createServiceRequestHandler(): TraitHandler<ServiceRequestConfig> {
  return {
    name: 'service_request',
    defaultConfig,
    onAttach(node: HSPlusNode, config: ServiceRequestConfig, ctx: TraitContext) {
      const now = Date.now();
      const submitted = new Date(config.submittedAt).getTime();
      const daysOpen = Math.floor((now - submitted) / 86_400_000);
      const slaLimit = config.targetResolutionDays || SLA_DAYS[config.priority];

      node.__srState = {
        status: 'submitted' as RequestStatus,
        requestId: config.requestId,
        daysOpen,
        isSlaBreached: daysOpen > slaLimit,
        lastStatusChange: config.submittedAt,
        updates: [],
      } satisfies ServiceRequestState;

      ctx.emit?.('sr:created', { requestId: config.requestId, category: config.category });
    },
    onDetach(node: HSPlusNode, _config: ServiceRequestConfig, ctx: TraitContext) {
      delete node.__srState;
      ctx.emit?.('sr:removed');
    },
    onUpdate(node: HSPlusNode, config: ServiceRequestConfig, _ctx: TraitContext, _delta: number) {
      const s = node.__srState as ServiceRequestState | undefined;
      if (!s) return;
      const now = Date.now();
      const submitted = new Date(config.submittedAt).getTime();
      s.daysOpen = Math.floor((now - submitted) / 86_400_000);
      const slaLimit = config.targetResolutionDays || SLA_DAYS[config.priority];
      s.isSlaBreached = s.daysOpen > slaLimit && s.status !== 'resolved' && s.status !== 'closed';
    },
    onEvent(node: HSPlusNode, config: ServiceRequestConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__srState as ServiceRequestState | undefined;
      if (!s) return;
      switch (event.type) {
        case 'sr:assign': {
          const assignedTo = event.payload?.assignedTo as string;
          s.assignedTo = assignedTo;
          s.status = 'assigned';
          s.lastStatusChange = new Date().toISOString();
          ctx.emit?.('sr:assigned', { requestId: config.requestId, assignedTo });
          break;
        }
        case 'sr:update_status': {
          const newStatus = event.payload?.status as RequestStatus;
          if (!newStatus) return;
          const prev = s.status;
          s.status = newStatus;
          s.lastStatusChange = new Date().toISOString();
          ctx.emit?.('sr:status_changed', { from: prev, to: newStatus, requestId: config.requestId });
          break;
        }
        case 'sr:add_update': {
          const message = event.payload?.message as string;
          const author = (event.payload?.author as string) ?? 'staff';
          if (message) {
            s.updates.push({ timestamp: new Date().toISOString(), message, author });
            ctx.emit?.('sr:update_added', { requestId: config.requestId, updateCount: s.updates.length });
          }
          break;
        }
        case 'sr:resolve': {
          s.status = 'resolved';
          s.lastStatusChange = new Date().toISOString();
          ctx.emit?.('sr:resolved', { requestId: config.requestId, daysOpen: s.daysOpen });
          break;
        }
      }
    },
  };
}
