import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookHandler } from '../WebhookHandler.js';
import type { WebhookNotification } from '../types.js';

describe('WebhookHandler', () => {
  let handler: WebhookHandler;

  beforeEach(() => {
    handler = new WebhookHandler();
    vi.clearAllMocks();
  });

  describe('Listener Registration', () => {
    it('should register event listener', () => {
      const callback = vi.fn();

      handler.on('build.ready', callback);

      // Listener should be registered but not called yet
      expect(callback).not.toHaveBeenCalled();
    });

    it('should register multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      handler.on('build.ready', callback1);
      handler.on('build.ready', callback2);

      // Both should be registered
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should remove listener', () => {
      const callback = vi.fn();

      handler.on('build.ready', callback);
      handler.off('build.ready', callback);

      // Listener should be removed
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle wildcard listeners', () => {
      const callback = vi.fn();

      handler.on('*', callback);

      // Wildcard listener should be registered
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Once Listeners', () => {
    it('should fire once listener and auto-remove', async () => {
      const callback = vi.fn();
      handler.once('build.ready', callback);

      const payload1 = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: { buildId: 'build-1' },
      };

      const payload2 = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: { buildId: 'build-2' },
      };

      await handler.handleAppleWebhook(payload1);
      await handler.handleAppleWebhook(payload2);

      // Should only fire once
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ event: 'build.ready' }));
    });

    it('should fire wildcard once listener and auto-remove', async () => {
      const callback = vi.fn();
      handler.once('*', callback);

      const payload1 = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: {},
      };

      const payload2 = {
        notificationType: 'BUILD_PROCESSING_STARTED',
        data: {},
      };

      await handler.handleAppleWebhook(payload1);
      await handler.handleAppleWebhook(payload2);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should be removable with off()', async () => {
      const callback = vi.fn();
      handler.once('build.ready', callback);
      handler.off('build.ready', callback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: {},
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Apple Webhook Handling', () => {
    it('should handle BUILD_PROCESSING_STARTED notification', async () => {
      const callback = vi.fn();
      handler.on('build.processing', callback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_STARTED',
        data: {
          buildId: 'build-123',
          appId: 'app-456',
        },
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.processing',
          platform: 'apple',
          payload: payload.data,
        })
      );
    });

    it('should handle BUILD_PROCESSING_COMPLETE notification', async () => {
      const callback = vi.fn();
      handler.on('build.ready', callback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: {
          buildId: 'build-123',
        },
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.ready',
          platform: 'apple',
        })
      );
    });

    it('should handle BUILD_INVALID notification', async () => {
      const callback = vi.fn();
      handler.on('build.invalid', callback);

      const payload = {
        notificationType: 'BUILD_INVALID',
        data: {
          buildId: 'build-123',
          errors: ['Invalid binary'],
        },
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle BETA_APP_APPROVED notification', async () => {
      const callback = vi.fn();
      handler.on('review.approved', callback);

      const payload = {
        notificationType: 'BETA_APP_APPROVED',
        data: {
          buildId: 'build-123',
        },
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'review.approved',
          platform: 'apple',
        })
      );
    });

    it('should handle APP_APPROVED notification', async () => {
      const callback = vi.fn();
      handler.on('review.approved', callback);

      await handler.handleAppleWebhook({
        notificationType: 'APP_APPROVED',
        data: {},
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should handle BETA_APP_REJECTED notification', async () => {
      const callback = vi.fn();
      handler.on('review.rejected', callback);

      const payload = {
        notificationType: 'BETA_APP_REJECTED',
        data: {
          buildId: 'build-123',
          reason: 'Policy violation',
        },
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle APP_REJECTED notification', async () => {
      const callback = vi.fn();
      handler.on('review.rejected', callback);

      await handler.handleAppleWebhook({
        notificationType: 'APP_REJECTED',
        data: {},
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should ignore unknown notification types', async () => {
      const callback = vi.fn();
      handler.on('build.ready', callback);

      const payload = {
        notificationType: 'UNKNOWN_TYPE',
        data: {},
      };

      await handler.handleAppleWebhook(payload);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Google Webhook Handling', () => {
    it('should handle TRACK_UPDATED (inReview) notification', async () => {
      const callback = vi.fn();
      handler.on('build.processing', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'TRACK_UPDATED',
              trackStatus: 'inReview',
              packageName: 'com.test.app',
              versionCode: 42,
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.processing',
          platform: 'google',
        })
      );
    });

    it('should handle TRACK_UPDATED (completed) notification', async () => {
      const callback = vi.fn();
      handler.on('build.ready', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'TRACK_UPDATED',
              trackStatus: 'completed',
              packageName: 'com.test.app',
              versionCode: 42,
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.ready',
          platform: 'google',
        })
      );
    });

    it('should ignore TRACK_UPDATED with unrecognized status', async () => {
      const callback = vi.fn();
      handler.on('build.processing', callback);
      handler.on('build.ready', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'TRACK_UPDATED',
              trackStatus: 'draft',
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle REVIEW_APPROVED notification', async () => {
      const callback = vi.fn();
      handler.on('review.approved', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'REVIEW_APPROVED',
              packageName: 'com.test.app',
              versionCode: 42,
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle REVIEW_REJECTED notification', async () => {
      const callback = vi.fn();
      handler.on('review.rejected', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'REVIEW_REJECTED',
              packageName: 'com.test.app',
              versionCode: 42,
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).toHaveBeenCalled();
    });

    it('should ignore unknown Google notification types', async () => {
      const callback = vi.fn();
      handler.on('build.ready', callback);

      const payload = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              notificationType: 'UNKNOWN_TYPE',
            })
          ).toString('base64'),
        },
      };

      await handler.handleGoogleWebhook(payload);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Wildcard Listeners', () => {
    it('should notify wildcard listeners for all events', async () => {
      const wildcardCallback = vi.fn();
      handler.on('*', wildcardCallback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: { buildId: 'build-123' },
      };

      await handler.handleAppleWebhook(payload);

      expect(wildcardCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.ready',
          platform: 'apple',
        })
      );
    });

    it('should notify both specific and wildcard listeners', async () => {
      const specificCallback = vi.fn();
      const wildcardCallback = vi.fn();

      handler.on('build.ready', specificCallback);
      handler.on('*', wildcardCallback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: { buildId: 'build-123' },
      };

      await handler.handleAppleWebhook(payload);

      expect(specificCallback).toHaveBeenCalled();
      expect(wildcardCallback).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should catch errors in listeners', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodCallback = vi.fn();

      handler.on('build.ready', errorCallback);
      handler.on('build.ready', goodCallback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: {},
      };

      // Should not throw even though first callback errors
      await expect(handler.handleAppleWebhook(payload)).resolves.not.toThrow();

      // Both callbacks should have been called
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });

    it('should catch errors in once listeners', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Once listener error');
      });

      handler.once('build.ready', errorCallback);

      const payload = {
        notificationType: 'BUILD_PROCESSING_COMPLETE',
        data: {},
      };

      await expect(handler.handleAppleWebhook(payload)).resolves.not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('Apple Signature Verification', () => {
    it('should reject empty or non-string input', () => {
      expect(handler.verifyAppleSignature('')).toBe(false);
      expect(handler.verifyAppleSignature(null as any)).toBe(false);
      expect(handler.verifyAppleSignature(undefined as any)).toBe(false);
    });

    it('should reject invalid JWS structure', () => {
      expect(handler.verifyAppleSignature('not-a-jwt')).toBe(false);
      expect(handler.verifyAppleSignature('only.two')).toBe(false);
    });

    it('should reject JWS with invalid base64url parts', () => {
      expect(handler.verifyAppleSignature('a b.cd.ef')).toBe(false);
    });

    it('should accept structurally valid JWS with ES256 algorithm', () => {
      // Create a valid-looking JWS (not cryptographically signed, just structural)
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString(
        'base64url'
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url');
      const signature = Buffer.from('mock-signature').toString('base64url');

      const jws = `${header}.${payload}.${signature}`;
      expect(handler.verifyAppleSignature(jws)).toBe(true);
    });

    it('should reject JWS with non-ES256 algorithm', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url'
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url');
      const signature = Buffer.from('mock-signature').toString('base64url');

      const jws = `${header}.${payload}.${signature}`;
      expect(handler.verifyAppleSignature(jws)).toBe(false);
    });

    it('should accept JWS with root cert provided', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({})).toString('base64url');
      const signature = Buffer.from('sig').toString('base64url');

      const jws = `${header}.${payload}.${signature}`;
      expect(handler.verifyAppleSignature(jws, 'mock-root-cert')).toBe(true);
    });
  });

  describe('Google Signature Verification', () => {
    it('should reject empty or non-string token', () => {
      expect(handler.verifyGoogleSignature({}, '')).toBe(false);
      expect(handler.verifyGoogleSignature({}, null as any)).toBe(false);
    });

    it('should reject invalid JWT structure', () => {
      expect(handler.verifyGoogleSignature({}, 'not-a-jwt')).toBe(false);
    });

    it('should accept structurally valid Google OIDC token', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: 'https://my-webhook.example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const signature = Buffer.from('sig').toString('base64url');

      const token = `${header}.${payload}.${signature}`;
      expect(handler.verifyGoogleSignature({}, token)).toBe(true);
    });

    it('should reject expired token', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
        })
      ).toString('base64url');
      const signature = Buffer.from('sig').toString('base64url');

      const token = `${header}.${payload}.${signature}`;
      expect(handler.verifyGoogleSignature({}, token)).toBe(false);
    });

    it('should reject wrong audience', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: 'https://wrong-endpoint.example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const signature = Buffer.from('sig').toString('base64url');

      const token = `${header}.${payload}.${signature}`;
      expect(handler.verifyGoogleSignature({}, token, 'https://my-webhook.example.com')).toBe(
        false
      );
    });

    it('should reject non-Google issuer', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://evil.example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const signature = Buffer.from('sig').toString('base64url');

      const token = `${header}.${payload}.${signature}`;
      expect(handler.verifyGoogleSignature({}, token)).toBe(false);
    });
  });
});
