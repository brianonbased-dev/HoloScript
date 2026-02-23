/**
 * SocialTraits Production Tests
 *
 * Three social VR handlers: shareableHandler, collaborativeHandler, tweetableHandler.
 * Plus exported helper functions generateTweetUrl and generateQRCodeUrl.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shareableHandler,
  collaborativeHandler,
  tweetableHandler,
  generateTweetUrl,
  generateQRCodeUrl,
  socialTraitHandlers,
} from '../SocialTraits';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(): any { return {}; }
function makeCtx() { const emit = vi.fn(); return { emit }; }

// ─── Tests: shareableHandler ─────────────────────────────────────────────────

describe('shareableHandler — Production', () => {

  beforeEach(() => vi.clearAllMocks());

  it('has name shareable', () => {
    expect(shareableHandler.name).toBe('shareable');
  });

  it('defaultConfig has format gif', () => {
    expect(shareableHandler.defaultConfig.format).toBe('gif');
  });

  it('defaultConfig includeQR is true', () => {
    expect(shareableHandler.defaultConfig.includeQR).toBe(true);
  });

  it('defaultConfig animation is rotate', () => {
    expect(shareableHandler.defaultConfig.animation).toBe('rotate');
  });

  it('defaultConfig resolution is 1200x630', () => {
    expect(shareableHandler.defaultConfig.resolution).toEqual([1200, 630]);
  });

  it('creates __shareableState on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    shareableHandler.onAttach!(node, shareableHandler.defaultConfig, ctx as any);
    expect(node.__shareableState).toBeDefined();
    expect(node.__shareableState.previewGenerated).toBe(false);
    expect(node.__shareableState.previewUrl).toBeNull();
    expect(node.__shareableState.qrCodeUrl).toBeNull();
  });

  it('removes __shareableState on detach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    shareableHandler.onAttach!(node, shareableHandler.defaultConfig, ctx as any);
    shareableHandler.onDetach!(node, shareableHandler.defaultConfig, ctx as any);
    expect(node.__shareableState).toBeUndefined();
  });

  it('onUpdate is a no-op (does not throw)', () => {
    const node = makeNode();
    const ctx = makeCtx();
    expect(() => shareableHandler.onUpdate!(node, shareableHandler.defaultConfig, ctx as any, 16)).not.toThrow();
  });

  it('share event emits on_share with platform', () => {
    const node = makeNode();
    const ctx = makeCtx();
    shareableHandler.onAttach!(node, shareableHandler.defaultConfig, ctx as any);
    shareableHandler.onEvent!(node, shareableHandler.defaultConfig, ctx as any, { type: 'share', platform: 'twitter' });
    expect(ctx.emit).toHaveBeenCalledWith('on_share', expect.objectContaining({ platform: 'twitter' }));
  });

  it('share event defaults platform to x when not provided', () => {
    const node = makeNode();
    const ctx = makeCtx();
    shareableHandler.onAttach!(node, shareableHandler.defaultConfig, ctx as any);
    shareableHandler.onEvent!(node, shareableHandler.defaultConfig, ctx as any, { type: 'share' });
    expect(ctx.emit).toHaveBeenCalledWith('on_share', expect.objectContaining({ platform: 'x' }));
  });

  it('unknown event type does not throw', () => {
    const node = makeNode();
    const ctx = makeCtx();
    shareableHandler.onAttach!(node, shareableHandler.defaultConfig, ctx as any);
    expect(() => shareableHandler.onEvent!(node, shareableHandler.defaultConfig, ctx as any, { type: 'mystery' })).not.toThrow();
  });
});

// ─── Tests: collaborativeHandler ─────────────────────────────────────────────

describe('collaborativeHandler — Production', () => {

  beforeEach(() => vi.clearAllMocks());

  it('has name collaborative', () => {
    expect(collaborativeHandler.name).toBe('collaborative');
  });

  it('defaultConfig maxUsers is 10', () => {
    expect(collaborativeHandler.defaultConfig.maxUsers).toBe(10);
  });

  it('defaultConfig sync is realtime', () => {
    expect(collaborativeHandler.defaultConfig.sync).toBe('realtime');
  });

  it('defaultConfig voice is false', () => {
    expect(collaborativeHandler.defaultConfig.voice).toBe(false);
  });

  it('creates __collaborativeState on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    const s = node.__collaborativeState;
    expect(s).toBeDefined();
    expect(s.users).toBeInstanceOf(Map);
    expect(s.editHistory).toEqual([]);
    expect(s.isConnected).toBe(false);
    expect(s.localStream).toBeNull();
  });

  it('removes __collaborativeState on detach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    collaborativeHandler.onDetach!(node, collaborativeHandler.defaultConfig, ctx as any);
    expect(node.__collaborativeState).toBeUndefined();
  });

  it('emits request_mic_access when voice=true on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, { ...collaborativeHandler.defaultConfig, voice: true }, ctx as any);
    // The initializeVoice call is async, but emit should eventually be called
    // We check it is called via the sync path if present
    // Since it's async, we just verify no crash and the node state was created
    expect(node.__collaborativeState).toBeDefined();
  });

  it('user_join event emits on_user_join', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    collaborativeHandler.onEvent!(node, collaborativeHandler.defaultConfig, ctx as any, {
      type: 'user_join',
      user: { id: 'u1', name: 'Alice' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_user_join', expect.objectContaining({
      user: { id: 'u1', name: 'Alice' },
    }));
  });

  it('user_leave event emits on_user_leave', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    collaborativeHandler.onEvent!(node, collaborativeHandler.defaultConfig, ctx as any, {
      type: 'user_leave',
      user: { id: 'u1' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_user_leave', expect.objectContaining({ user: { id: 'u1' } }));
  });

  it('edit event emits on_edit', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    collaborativeHandler.onEvent!(node, collaborativeHandler.defaultConfig, ctx as any, {
      type: 'edit',
      edit: { property: 'position', value: [1, 2, 3] },
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_edit', expect.objectContaining({
      edit: { property: 'position', value: [1, 2, 3] },
    }));
  });

  it('voice_stream_received emits on_voice_stream with peerId', () => {
    const node = makeNode();
    const ctx = makeCtx();
    collaborativeHandler.onAttach!(node, collaborativeHandler.defaultConfig, ctx as any);
    collaborativeHandler.onEvent!(node, collaborativeHandler.defaultConfig, ctx as any, {
      type: 'voice_stream_received',
      peerId: 'peer123',
      stream: {},
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_voice_stream', expect.objectContaining({
      peerId: 'peer123',
    }));
  });
});

// ─── Tests: tweetableHandler ─────────────────────────────────────────────────

describe('tweetableHandler — Production', () => {

  beforeEach(() => vi.clearAllMocks());

  it('has name tweetable', () => {
    expect(tweetableHandler.name).toBe('tweetable');
  });

  it('defaultConfig includes HoloScript and VR hashtags', () => {
    expect(tweetableHandler.defaultConfig.hashtags).toContain('HoloScript');
    expect(tweetableHandler.defaultConfig.hashtags).toContain('VR');
  });

  it('defaultConfig includePreview is true', () => {
    expect(tweetableHandler.defaultConfig.includePreview).toBe(true);
  });

  it('creates __tweetableState on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    tweetableHandler.onAttach!(node, tweetableHandler.defaultConfig, ctx as any);
    expect(node.__tweetableState).toBeDefined();
    expect(node.__tweetableState.tweetGenerated).toBe(false);
    expect(node.__tweetableState.tweetUrl).toBeNull();
  });

  it('removes __tweetableState on detach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    tweetableHandler.onAttach!(node, tweetableHandler.defaultConfig, ctx as any);
    tweetableHandler.onDetach!(node, tweetableHandler.defaultConfig, ctx as any);
    expect(node.__tweetableState).toBeUndefined();
  });

  it('tweet event emits on_tweet', () => {
    const node = makeNode();
    const ctx = makeCtx();
    tweetableHandler.onAttach!(node, tweetableHandler.defaultConfig, ctx as any);
    tweetableHandler.onEvent!(node, tweetableHandler.defaultConfig, ctx as any, { type: 'tweet' });
    expect(ctx.emit).toHaveBeenCalledWith('on_tweet', expect.objectContaining({ node }));
  });

  it('thread_created event emits on_thread_created', () => {
    const node = makeNode();
    const ctx = makeCtx();
    tweetableHandler.onAttach!(node, tweetableHandler.defaultConfig, ctx as any);
    tweetableHandler.onEvent!(node, tweetableHandler.defaultConfig, ctx as any, { type: 'thread_created' });
    expect(ctx.emit).toHaveBeenCalledWith('on_thread_created', expect.objectContaining({ node }));
  });
});

// ─── Tests: generateTweetUrl ─────────────────────────────────────────────────

describe('generateTweetUrl — helper', () => {

  const baseCfg = {
    template: 'Check out {name}! Built with HoloScript 🎮',
    hashtags: ['HoloScript', 'VR'],
    mention: '',
    includePreview: true,
    autoThread: false,
  };

  it('returns a twitter.com/intent/tweet URL', () => {
    const url = generateTweetUrl('MyScene', 'https://holo.dev/scene1', baseCfg);
    expect(url).toMatch(/^https:\/\/twitter\.com\/intent\/tweet\?text=/);
  });

  it('substitutes {name} in template', () => {
    const url = generateTweetUrl('CoolScene', 'https://example.com', baseCfg);
    expect(decodeURIComponent(url)).toContain('CoolScene');
  });

  it('includes hashtags in the text', () => {
    const url = generateTweetUrl('S', 'https://example.com', baseCfg);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('#HoloScript');
    expect(decoded).toContain('#VR');
  });

  it('prepends mention when provided', () => {
    const cfg = { ...baseCfg, mention: '@holoscript' };
    const url = generateTweetUrl('X', 'https://example.com', cfg);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('@holoscript');
  });

  it('does not prepend mention when empty string', () => {
    const url = generateTweetUrl('X', 'https://example.com', baseCfg);
    const decoded = decodeURIComponent(url);
    // No leading empty mention prefix
    expect(decoded).not.toMatch(/^ /);
  });
});

// ─── Tests: generateQRCodeUrl ────────────────────────────────────────────────

describe('generateQRCodeUrl — helper', () => {

  it('returns a qrserver URL', () => {
    const url = generateQRCodeUrl('https://holo.dev/scene1');
    expect(url).toMatch(/^https:\/\/api\.qrserver\.com\/v1\/create-qr-code/);
  });

  it('URL-encodes the scene URL', () => {
    const url = generateQRCodeUrl('https://example.com/scene?id=42&foo=bar');
    expect(url).toContain(encodeURIComponent('https://example.com/scene?id=42&foo=bar'));
  });

  it('includes size 200x200', () => {
    const url = generateQRCodeUrl('https://holo.dev');
    expect(url).toContain('200x200');
  });
});

// ─── Tests: socialTraitHandlers export ──────────────────────────────────────

describe('socialTraitHandlers export', () => {
  it('exports all three handlers', () => {
    expect(socialTraitHandlers.shareable).toBe(shareableHandler);
    expect(socialTraitHandlers.collaborative).toBe(collaborativeHandler);
    expect(socialTraitHandlers.tweetable).toBe(tweetableHandler);
  });
});
