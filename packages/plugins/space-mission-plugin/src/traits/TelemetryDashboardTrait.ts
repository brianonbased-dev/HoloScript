/**
 * @telemetry_dashboard Trait — Spacecraft telemetry monitoring
 * @trait telemetry_dashboard
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface TelemetryChannel { name: string; unit: string; minNominal: number; maxNominal: number; alertThreshold: number; }
export interface TelemetryDashboardConfig { channels: TelemetryChannel[]; sampleRateHz: number; downlinkRateBps: number; format: 'CCSDS' | 'custom'; displayMode: 'realtime' | 'playback'; }
export interface TelemetryDashboardState { isActive: boolean; readings: Record<string, number>; alerts: string[]; totalSamples: number; }

const defaultConfig: TelemetryDashboardConfig = { channels: [], sampleRateHz: 1, downlinkRateBps: 9600, format: 'CCSDS', displayMode: 'realtime' };

export function createTelemetryDashboardHandler(): TraitHandler<TelemetryDashboardConfig> {
  return {
    name: 'telemetry_dashboard',
    defaultConfig,
    onAttach(node: HSPlusNode, config: TelemetryDashboardConfig, ctx: TraitContext) {
      const readings: Record<string, number> = {};
      for (const ch of config.channels) readings[ch.name] = (ch.minNominal + ch.maxNominal) / 2;
      node.__telemetryState = { isActive: false, readings, alerts: [], totalSamples: 0 };
      ctx.emit?.('telemetry:attached', { channels: config.channels.length });
    },
    onDetach(node: HSPlusNode, _c: TelemetryDashboardConfig, ctx: TraitContext) { delete node.__telemetryState; ctx.emit?.('telemetry:detached'); },
    onUpdate(node: HSPlusNode, config: TelemetryDashboardConfig, ctx: TraitContext, _d: number) {
      const s = node.__telemetryState as TelemetryDashboardState | undefined;
      if (!s?.isActive) return;
      s.totalSamples++;
      for (const ch of config.channels) {
        const val = s.readings[ch.name] ?? 0;
        if (val > ch.alertThreshold || val < ch.minNominal || val > ch.maxNominal) {
          if (!s.alerts.includes(ch.name)) { s.alerts.push(ch.name); ctx.emit?.('telemetry:alert', { channel: ch.name, value: val }); }
        }
      }
    },
    onEvent(node: HSPlusNode, _c: TelemetryDashboardConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__telemetryState as TelemetryDashboardState | undefined;
      if (!s) return;
      if (event.type === 'telemetry:start') { s.isActive = true; ctx.emit?.('telemetry:started'); }
      if (event.type === 'telemetry:update_reading') {
        const ch = event.payload?.channel as string;
        const val = event.payload?.value as number;
        if (ch) s.readings[ch] = val;
      }
    },
  };
}
