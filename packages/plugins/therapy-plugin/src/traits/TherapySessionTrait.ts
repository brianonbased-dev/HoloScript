import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface TherapySessionConfig {
  modality: 'cbt' | 'dbt' | 'act' | 'mindfulness' | 'supportive';
  status: 'scheduled' | 'active' | 'completed';
  durationMinutes: number;
  sessionNotes?: string;
}

const handler: TraitHandler<TherapySessionConfig> = {
  name: 'therapy_session',
  defaultConfig: {
    modality: 'cbt',
    status: 'scheduled',
    durationMinutes: 50,
  },
  onEvent(_node: HSPlusNode, config: TherapySessionConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'therapy_session:start') {
      config.status = 'active';
      ctx.emit?.('session_started', { modality: config.modality, duration: config.durationMinutes });
    } else if (event.type === 'therapy_session:complete') {
      config.status = 'completed';
      ctx.emit?.('session_completed', { modality: config.modality, notes: config.sessionNotes });
    } else if (event.type === 'therapy_session:note') {
      const payload = event.payload;
      if (payload && typeof payload === 'object') {
        const note = (payload as { note?: unknown }).note;
        if (typeof note === 'string') {
          config.sessionNotes = note;
        }
      }
    }
  },
};

export const TherapySessionTrait = handler;
