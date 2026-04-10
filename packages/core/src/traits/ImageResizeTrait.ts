/**
 * ImageResizeTrait — v5.1
 *
 * Image resize / crop / format conversion.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface ImageResizeConfig {
  max_width: number;
  max_height: number;
  quality: number;
}

export const imageResizeHandler: TraitHandler<ImageResizeConfig> = {
  name: 'image_resize',
  defaultConfig: { max_width: 2048, max_height: 2048, quality: 85 },

  onAttach(node: HSPlusNode): void {
    node.__imgResizeState = { processed: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__imgResizeState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: ImageResizeConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__imgResizeState as { processed: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'image:resize') {
      state.processed++;
      const width = Math.min((event.width as number) ?? config.max_width, config.max_width);
      const height = Math.min((event.height as number) ?? config.max_height, config.max_height);
      context.emit?.('image:resized', {
        src: event.src,
        width,
        height,
        quality: config.quality,
        format: event.format ?? 'webp',
      });
    }
  },
};

export default imageResizeHandler;
