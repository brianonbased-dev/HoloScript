/**
 * SocialTraits Tests
 *
 * Tests for social VR trait handlers: @shareable, @collaborative, @tweetable
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shareableHandler,
  collaborativeHandler,
  tweetableHandler,
  generateTweetUrl,
  generateQRCodeUrl,
  socialTraitHandlers,
} from '../SocialTraits';
import {
  createMockContext,
  createMockNode,
  getLastEvent,
  sendEvent,
  attachTrait,
} from './traitTestHelpers';

describe('shareableHandler', () => {
  it('should have correct name', () => {
    expect(shareableHandler.name).toBe('shareable');
  });

  it('should have correct default configuration', () => {
    const config = shareableHandler.defaultConfig;

    expect(config.camera).toEqual([5, 2, 5]);
    expect(config.target).toEqual([0, 0, 0]);
    expect(config.animation).toBe('rotate');
    expect(config.duration).toBe(3000);
    expect(config.format).toBe('gif');
    expect(config.resolution).toEqual([1200, 630]);
    expect(config.includeQR).toBe(true);
  });

  describe('onAttach', () => {
    it('should initialize shareable state on node', () => {
      const node = createMockNode('shareable-node');
      const ctx = createMockContext();

      attachTrait(shareableHandler, node, {}, ctx);

      const state = (node as any).__shareableState;
      expect(state).toBeDefined();
      expect(state.previewGenerated).toBe(false);
      expect(state.previewUrl).toBeNull();
      expect(state.qrCodeUrl).toBeNull();
    });
  });

  describe('onDetach', () => {
    it('should remove shareable state from node', () => {
      const node = createMockNode('shareable-node');
      const ctx = createMockContext();

      attachTrait(shareableHandler, node, {}, ctx);
      expect((node as any).__shareableState).toBeDefined();

      shareableHandler.onDetach?.(node as any);
      expect((node as any).__shareableState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should emit on_share event when share event received', () => {
      const node = createMockNode('shareable-node');
      const ctx = createMockContext();

      attachTrait(shareableHandler, node, {}, ctx);
      sendEvent(shareableHandler, node, {}, ctx, { type: 'share' });

      const event = getLastEvent(ctx, 'on_share');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).node).toBe(node);
      expect((event as Record<string, unknown>).platform).toBe('x');
    });

    it('should use custom platform from event', () => {
      const node = createMockNode('shareable-node');
      const ctx = createMockContext();

      attachTrait(shareableHandler, node, {}, ctx);
      sendEvent(shareableHandler, node, {}, ctx, { type: 'share', platform: 'instagram' });

      const event = getLastEvent(ctx, 'on_share');
      expect((event as Record<string, unknown>).platform).toBe('instagram');
    });
  });
});

describe('collaborativeHandler', () => {
  it('should have correct name', () => {
    expect(collaborativeHandler.name).toBe('collaborative');
  });

  it('should have correct default configuration', () => {
    const config = collaborativeHandler.defaultConfig;

    expect(config.sync).toBe('realtime');
    expect(config.maxUsers).toBe(10);
    expect(config.permissions).toEqual(['view']);
    expect(config.cursors).toBe(true);
    expect(config.voice).toBe(false);
    expect(config.presence).toBe(true);
  });

  describe('onAttach', () => {
    it('should initialize collaborative state on node', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      attachTrait(collaborativeHandler, node, {}, ctx);

      const state = (node as any).__collaborativeState;
      expect(state).toBeDefined();
      expect(state.users).toBeInstanceOf(Map);
      expect(state.editHistory).toEqual([]);
      expect(state.isConnected).toBe(false);
    });
  });

  describe('onDetach', () => {
    it('should remove collaborative state from node', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      attachTrait(collaborativeHandler, node, {}, ctx);
      expect((node as any).__collaborativeState).toBeDefined();

      collaborativeHandler.onDetach?.(node as any);
      expect((node as any).__collaborativeState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should emit on_user_join event', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      attachTrait(collaborativeHandler, node, {}, ctx);
      sendEvent(collaborativeHandler, node, {}, ctx, {
        type: 'user_join',
        user: { id: 'user-1', name: 'Alice' },
      });

      const event = getLastEvent(ctx, 'on_user_join');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).node).toBe(node);
      expect((event as Record<string, unknown>).user).toEqual({ id: 'user-1', name: 'Alice' });
    });

    it('should emit on_user_leave event', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      attachTrait(collaborativeHandler, node, {}, ctx);
      sendEvent(collaborativeHandler, node, {}, ctx, {
        type: 'user_leave',
        user: { id: 'user-1' },
      });

      const event = getLastEvent(ctx, 'on_user_leave');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).user).toEqual({ id: 'user-1' });
    });

    it('should emit on_edit event', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      attachTrait(collaborativeHandler, node, {}, ctx);
      sendEvent(collaborativeHandler, node, {}, ctx, {
        type: 'edit',
        edit: { type: 'move', position: [1, 2, 3] },
      });

      const event = getLastEvent(ctx, 'on_edit');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).edit).toEqual({
        type: 'move',
        position: [1, 2, 3],
      });
    });

    it('should emit on_voice_stream event when voice_stream_received', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();
      const mockStream = { id: 'mock-stream' };

      attachTrait(collaborativeHandler, node, {}, ctx);
      sendEvent(collaborativeHandler, node, {}, ctx, {
        type: 'voice_stream_received',
        peerId: 'peer-42',
        stream: mockStream,
      });

      const event = getLastEvent(ctx, 'on_voice_stream');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).peerId).toBe('peer-42');
      expect((event as Record<string, unknown>).stream).toBe(mockStream);
      expect((event as Record<string, unknown>).node).toBe(node);
    });

    it('should not emit events when state not initialized', () => {
      const node = createMockNode('collab-node');
      const ctx = createMockContext();

      // Don't attach trait - no state
      sendEvent(collaborativeHandler, node, {}, ctx, { type: 'user_join', user: {} });

      expect(ctx.emittedEvents).toHaveLength(0);
    });
  });
});

describe('tweetableHandler', () => {
  it('should have correct name', () => {
    expect(tweetableHandler.name).toBe('tweetable');
  });

  it('should have correct default configuration', () => {
    const config = tweetableHandler.defaultConfig;

    expect(config.template).toBe('Check out {name}! Built with HoloScript 🎮');
    expect(config.hashtags).toEqual(['HoloScript', 'VR']);
    expect(config.mention).toBe('');
    expect(config.includePreview).toBe(true);
    expect(config.autoThread).toBe(false);
  });

  describe('onAttach', () => {
    it('should initialize tweetable state on node', () => {
      const node = createMockNode('tweetable-node');
      const ctx = createMockContext();

      attachTrait(tweetableHandler, node, {}, ctx);

      const state = (node as any).__tweetableState;
      expect(state).toBeDefined();
      expect(state.tweetGenerated).toBe(false);
      expect(state.tweetUrl).toBeNull();
    });
  });

  describe('onDetach', () => {
    it('should remove tweetable state from node', () => {
      const node = createMockNode('tweetable-node');
      const ctx = createMockContext();

      attachTrait(tweetableHandler, node, {}, ctx);
      expect((node as any).__tweetableState).toBeDefined();

      tweetableHandler.onDetach?.(node as any);
      expect((node as any).__tweetableState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should emit on_tweet event', () => {
      const node = createMockNode('tweetable-node');
      const ctx = createMockContext();

      attachTrait(tweetableHandler, node, {}, ctx);
      sendEvent(tweetableHandler, node, {}, ctx, { type: 'tweet' });

      const event = getLastEvent(ctx, 'on_tweet');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).node).toBe(node);
    });

    it('should emit on_thread_created event', () => {
      const node = createMockNode('tweetable-node');
      const ctx = createMockContext();

      attachTrait(tweetableHandler, node, {}, ctx);
      sendEvent(tweetableHandler, node, {}, ctx, { type: 'thread_created' });

      const event = getLastEvent(ctx, 'on_thread_created');
      expect(event).toBeDefined();
      expect((event as Record<string, unknown>).node).toBe(node);
    });
  });
});

describe('generateTweetUrl', () => {
  it('should generate URL with name placeholder replaced', () => {
    const url = generateTweetUrl('My Scene', 'https://example.com', {
      template: 'Check out {name}!',
      hashtags: [],
      mention: '',
      includePreview: true,
      autoThread: false,
    });

    expect(url).toContain('Check%20out%20My%20Scene');
    expect(url.startsWith('https://twitter.com/intent/tweet?text=')).toBe(true);
  });

  it('should include hashtags', () => {
    const url = generateTweetUrl('Scene', 'https://example.com', {
      template: 'Test {name}',
      hashtags: ['VR', 'HoloScript'],
      mention: '',
      includePreview: true,
      autoThread: false,
    });

    expect(url).toContain('%23VR');
    expect(url).toContain('%23HoloScript');
  });

  it('should include mention if provided', () => {
    const url = generateTweetUrl('Scene', 'https://example.com', {
      template: 'Test',
      hashtags: [],
      mention: '@holoscript',
      includePreview: true,
      autoThread: false,
    });

    expect(url).toContain('%40holoscript');
  });

  it('should include the scene URL', () => {
    const url = generateTweetUrl('Scene', 'https://my-scene.com', {
      template: 'Test',
      hashtags: [],
      mention: '',
      includePreview: true,
      autoThread: false,
    });

    expect(url).toContain(encodeURIComponent('https://my-scene.com'));
  });
});

describe('generateQRCodeUrl', () => {
  it('should generate valid QR code API URL', () => {
    const url = generateQRCodeUrl('https://my-scene.com');

    expect(url).toBe(
      'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https%3A%2F%2Fmy-scene.com'
    );
  });

  it('should encode special characters in URL', () => {
    const url = generateQRCodeUrl('https://example.com/?param=value&other=test');

    expect(url).toContain(encodeURIComponent('https://example.com/?param=value&other=test'));
  });
});

describe('socialTraitHandlers', () => {
  it('should export all three handlers', () => {
    expect(socialTraitHandlers.shareable).toBe(shareableHandler);
    expect(socialTraitHandlers.collaborative).toBe(collaborativeHandler);
    expect(socialTraitHandlers.tweetable).toBe(tweetableHandler);
  });

  it('should have exactly 3 handlers', () => {
    expect(Object.keys(socialTraitHandlers)).toHaveLength(3);
  });
});
