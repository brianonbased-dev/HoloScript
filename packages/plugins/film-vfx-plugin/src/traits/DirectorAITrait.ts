import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface DirectorAIConfig { style: string; pacing: 'slow' | 'balanced' | 'fast'; shotPreference: string[] }

export const directorAIHandler: TraitHandler<DirectorAIConfig> = {
  name: 'director_ai',
  defaultConfig: { style: 'cinematic', pacing: 'balanced', shotPreference: [] },
  onAttach(node: HSPlusNode, config: DirectorAIConfig, ctx: TraitContext): void {
    ctx.emit?.('director_ai:attached', { nodeId: node.id, style: config.style, pacing: config.pacing });
  },
  onEvent(node: HSPlusNode, config: DirectorAIConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'director_ai:recommend') {
      ctx.emit?.('director_ai:recommendation', {
        nodeId: node.id,
        style: config.style,
        pacing: config.pacing,
        recommendation: event.payload?.prompt ?? 'Use wide establishing shot followed by close-up.',
      });
    }
  },
};

export const DIRECTOR_AI_TRAIT = {
  name: 'director_ai',
  category: 'film-vfx',
  description: 'AI-assisted direction cues for shot sequencing and pacing.',
};
