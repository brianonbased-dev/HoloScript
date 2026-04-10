import { describe, it, expect, vi } from 'vitest';
import {
  shareableHandler,
  collaborativeHandler,
  tweetableHandler,
  generateTweetUrl,
  generateQRCodeUrl,
} from './SocialTraits';

describe('SocialTraits', () => {
  const mockNode = {};
  const mockContext = {
    emit: vi.fn(),
    head: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    time: 0,
    deltaTime: 0.16,
  };

  describe('ShareableHandler', () => {
    it('should initialize state on attach', () => {
      shareableHandler.onAttach!(mockNode, {}, mockContext);
      expect((mockNode as any).__shareableState).toBeDefined();
      expect((mockNode as any).__shareableState.previewGenerated).toBe(false);
    });

    it('should emit on_share event', () => {
      shareableHandler.onEvent!(mockNode, {}, mockContext, { type: 'share', platform: 'x' } as any);
      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_share',
        expect.objectContaining({
          platform: 'x',
        })
      );
    });

    it('should cleanup on detach', () => {
      shareableHandler.onDetach!(mockNode, {}, mockContext);
      expect((mockNode as any).__shareableState).toBeUndefined();
    });
  });

  describe('CollaborativeHandler', () => {
    it('should initialize collaborative state', () => {
      collaborativeHandler.onAttach!(mockNode, {}, mockContext);
      expect((mockNode as any).__collaborativeState).toBeDefined();
      expect((mockNode as any).__collaborativeState.users).toBeInstanceOf(Map);
    });

    it('should emit user join/leave events', () => {
      // Join
      collaborativeHandler.onEvent!(mockNode, {}, mockContext, {
        type: 'user_join',
        user: { id: 'u1' },
      } as any);
      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_user_join',
        expect.objectContaining({
          user: { id: 'u1' },
        })
      );

      // Leave
      collaborativeHandler.onEvent!(mockNode, {}, mockContext, {
        type: 'user_leave',
        user: { id: 'u1' },
      } as any);
      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_user_leave',
        expect.objectContaining({
          user: { id: 'u1' },
        })
      );
    });
  });

  describe('TweetableHandler', () => {
    it('should emit tweet events', () => {
      tweetableHandler.onEvent!(mockNode, {}, mockContext, { type: 'tweet' } as any);
      expect(mockContext.emit).toHaveBeenCalledWith('on_tweet', { node: mockNode });
    });
  });

  describe('Helpers', () => {
    it('should generate valid tweet URL', () => {
      const url = generateTweetUrl('MyScene', 'https://holo.land/s/123', {
        template: 'Check out {name}!',
        hashtags: ['VR', 'AI'],
        mention: '@holoscript',
        includePreview: true,
        autoThread: false,
      });

      expect(url).toContain('https://twitter.com/intent/tweet');
      expect(decodeURIComponent(url)).toContain('Check out MyScene!');
      expect(decodeURIComponent(url)).toContain('@holoscript');
      expect(decodeURIComponent(url)).toContain('#VR #AI');
      expect(decodeURIComponent(url)).toContain('https://holo.land/s/123');
    });

    it('should generate QR code URL', () => {
      const url = generateQRCodeUrl('https://holo.land/s/123');
      expect(url).toContain('api.qrserver.com');
      expect(url).toContain(encodeURIComponent('https://holo.land/s/123'));
    });
  });
});
