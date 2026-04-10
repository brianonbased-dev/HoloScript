/**
 * IncidentTrait — v5.1
 *
 * Incident lifecycle management (open → acknowledged → resolved).
 *
 * Events:
 *  incident:open         { incidentId, title, severity, source }
 *  incident:acknowledge  { incidentId, acknowledgedBy }
 *  incident:resolve      { incidentId, resolution }
 *  incident:updated      { incidentId, status, ... }
 *  incident:list         (command)
 *  incident:info         { incidents[] }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface IncidentConfig {
  max_incidents: number;
  auto_archive_resolved: boolean;
}

type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

interface Incident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  status: IncidentStatus;
  openedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  resolution: string | null;
}

export const incidentHandler: TraitHandler<IncidentConfig> = {
  name: 'incident',
  defaultConfig: { max_incidents: 200, auto_archive_resolved: true },

  onAttach(node: HSPlusNode): void {
    node.__incidentState = { incidents: new Map<string, Incident>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__incidentState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: IncidentConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__incidentState as { incidents: Map<string, Incident> } | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'incident:open': {
        const id = (event.incidentId as string) ?? `inc_${Date.now()}`;
        if (state.incidents.size >= config.max_incidents) {
          // Archive oldest resolved
          for (const [key, inc] of state.incidents) {
            if (inc.status === 'resolved') {
              state.incidents.delete(key);
              break;
            }
          }
        }
        const incident: Incident = {
          id,
          title: (event.title as string) ?? 'Untitled Incident',
          severity: (event.severity as Incident['severity']) ?? 'medium',
          source: (event.source as string) ?? 'unknown',
          status: 'open',
          openedAt: Date.now(),
          acknowledgedAt: null,
          resolvedAt: null,
          resolution: null,
        };
        state.incidents.set(id, incident);
        context.emit?.('incident:updated', {
          incidentId: id,
          status: 'open',
          severity: incident.severity,
        });
        break;
      }
      case 'incident:acknowledge': {
        const inc = state.incidents.get(event.incidentId as string);
        if (inc && inc.status === 'open') {
          inc.status = 'acknowledged';
          inc.acknowledgedAt = Date.now();
          context.emit?.('incident:updated', { incidentId: inc.id, status: 'acknowledged' });
        }
        break;
      }
      case 'incident:resolve': {
        const inc = state.incidents.get(event.incidentId as string);
        if (inc && inc.status !== 'resolved') {
          inc.status = 'resolved';
          inc.resolvedAt = Date.now();
          inc.resolution = (event.resolution as string) ?? null;
          context.emit?.('incident:updated', {
            incidentId: inc.id,
            status: 'resolved',
            resolution: inc.resolution,
          });
        }
        break;
      }
      case 'incident:list': {
        const list = [...state.incidents.values()].map((i) => ({
          id: i.id,
          title: i.title,
          severity: i.severity,
          status: i.status,
        }));
        context.emit?.('incident:info', {
          incidents: list,
          open: list.filter((i) => i.status !== 'resolved').length,
        });
        break;
      }
    }
  },
};

export default incidentHandler;
