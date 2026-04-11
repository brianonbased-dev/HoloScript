import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ColorGradeConfig { profile: string; lut?: string; exposure: number; contrast: number; saturation: number }

export const colorGradeHandler: TraitHandler<ColorGradeConfig> = {
  name: 'color_grade',
  defaultConfig: { profile: 'neutral', exposure: 0, contrast: 1, saturation: 1 },
  onAttach(node: HSPlusNode, config: ColorGradeConfig, ctx: TraitContext): void {
    ctx.emit?.('color_grade:attached', { nodeId: node.id, profile: config.profile, lut: config.lut });
  },
  onEvent(node: HSPlusNode, config: ColorGradeConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'color_grade:apply_profile') {
      const profile = String(event.payload?.profile ?? config.profile);
      config.profile = profile;
      ctx.emit?.('color_grade:profile_applied', { nodeId: node.id, profile });
    }
  },
};

export const COLOR_GRADE_TRAIT = {
  name: 'color_grade',
  category: 'film-vfx',
  description: 'Applies color grading profiles and LUT controls.',
};
