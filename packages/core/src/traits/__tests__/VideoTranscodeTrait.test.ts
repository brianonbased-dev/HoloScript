/**
 * VideoTranscodeTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { videoTranscodeHandler } from '../VideoTranscodeTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __videoState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_codec: 'h264', max_bitrate: 8000 };

describe('VideoTranscodeTrait', () => {
  it('has name "video_transcode"', () => {
    expect(videoTranscodeHandler.name).toBe('video_transcode');
  });

  it('video:transcode emits video:transcoded', () => {
    const node = makeNode();
    videoTranscodeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    videoTranscodeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'video:transcode', src: 'input.mp4', codec: 'vp9',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('video:transcoded', expect.objectContaining({ codec: 'vp9', jobNumber: 1 }));
  });
});
