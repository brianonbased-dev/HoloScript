/**
 * ImageResizeTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { imageResizeHandler } from '../ImageResizeTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __imgResizeState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_width: 2048, max_height: 2048, quality: 85 };

describe('ImageResizeTrait', () => {
  it('has name "image_resize"', () => {
    expect(imageResizeHandler.name).toBe('image_resize');
  });

  it('defaultConfig max_width=2048, quality=85', () => {
    expect(imageResizeHandler.defaultConfig?.max_width).toBe(2048);
    expect(imageResizeHandler.defaultConfig?.quality).toBe(85);
  });

  it('onAttach sets processed=0', () => {
    const node = makeNode();
    imageResizeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__imgResizeState as { processed: number }).processed).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    imageResizeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    imageResizeHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__imgResizeState).toBeUndefined();
  });

  it('image:resize emits image:resized clamped to max dimensions', () => {
    const node = makeNode();
    imageResizeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    imageResizeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'image:resize', src: 'photo.jpg', width: 4096, height: 1000, format: 'webp',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('image:resized', expect.objectContaining({
      width: 2048,
      height: 1000,
      quality: 85,
    }));
  });

  it('image:resize increments processed counter', () => {
    const node = makeNode();
    imageResizeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    imageResizeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'image:resize', src: 'a.jpg', width: 100, height: 100,
    } as never);
    imageResizeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'image:resize', src: 'b.jpg', width: 200, height: 200,
    } as never);
    expect((node.__imgResizeState as { processed: number }).processed).toBe(2);
  });

  it('defaults format to webp when not specified', () => {
    const node = makeNode();
    imageResizeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    imageResizeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'image:resize', src: 'img.png', width: 100, height: 100,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('image:resized', expect.objectContaining({ format: 'webp' }));
  });
});
