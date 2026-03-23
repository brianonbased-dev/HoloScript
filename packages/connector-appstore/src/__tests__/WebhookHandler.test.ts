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

    describe('Apple Webhook Handling', () => {
        it('should handle BUILD_PROCESSING_STARTED notification', async () => {
            const callback = vi.fn();
            handler.on('build.processing', callback);

            const payload = {
                notificationType: 'BUILD_PROCESSING_STARTED',
                data: {
                    buildId: 'build-123',
                    appId: 'app-456'
                }
            };

            await handler.handleAppleWebhook(payload);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'build.processing',
                    platform: 'apple',
                    payload: payload.data
                })
            );
        });

        it('should handle BUILD_PROCESSING_COMPLETE notification', async () => {
            const callback = vi.fn();
            handler.on('build.ready', callback);

            const payload = {
                notificationType: 'BUILD_PROCESSING_COMPLETE',
                data: {
                    buildId: 'build-123'
                }
            };

            await handler.handleAppleWebhook(payload);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'build.ready',
                    platform: 'apple'
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
                    errors: ['Invalid binary']
                }
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
                    buildId: 'build-123'
                }
            };

            await handler.handleAppleWebhook(payload);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'review.approved',
                    platform: 'apple'
                })
            );
        });

        it('should handle BETA_APP_REJECTED notification', async () => {
            const callback = vi.fn();
            handler.on('review.rejected', callback);

            const payload = {
                notificationType: 'BETA_APP_REJECTED',
                data: {
                    buildId: 'build-123',
                    reason: 'Policy violation'
                }
            };

            await handler.handleAppleWebhook(payload);

            expect(callback).toHaveBeenCalled();
        });

        it('should ignore unknown notification types', async () => {
            const callback = vi.fn();
            handler.on('build.ready', callback);

            const payload = {
                notificationType: 'UNKNOWN_TYPE',
                data: {}
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
                    data: Buffer.from(JSON.stringify({
                        notificationType: 'TRACK_UPDATED',
                        trackStatus: 'inReview',
                        packageName: 'com.test.app',
                        versionCode: 42
                    })).toString('base64')
                }
            };

            await handler.handleGoogleWebhook(payload);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'build.processing',
                    platform: 'google'
                })
            );
        });

        it('should handle TRACK_UPDATED (completed) notification', async () => {
            const callback = vi.fn();
            handler.on('build.ready', callback);

            const payload = {
                message: {
                    data: Buffer.from(JSON.stringify({
                        notificationType: 'TRACK_UPDATED',
                        trackStatus: 'completed',
                        packageName: 'com.test.app',
                        versionCode: 42
                    })).toString('base64')
                }
            };

            await handler.handleGoogleWebhook(payload);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'build.ready',
                    platform: 'google'
                })
            );
        });

        it('should handle REVIEW_APPROVED notification', async () => {
            const callback = vi.fn();
            handler.on('review.approved', callback);

            const payload = {
                message: {
                    data: Buffer.from(JSON.stringify({
                        notificationType: 'REVIEW_APPROVED',
                        packageName: 'com.test.app',
                        versionCode: 42
                    })).toString('base64')
                }
            };

            await handler.handleGoogleWebhook(payload);

            expect(callback).toHaveBeenCalled();
        });

        it('should handle REVIEW_REJECTED notification', async () => {
            const callback = vi.fn();
            handler.on('review.rejected', callback);

            const payload = {
                message: {
                    data: Buffer.from(JSON.stringify({
                        notificationType: 'REVIEW_REJECTED',
                        packageName: 'com.test.app',
                        versionCode: 42
                    })).toString('base64')
                }
            };

            await handler.handleGoogleWebhook(payload);

            expect(callback).toHaveBeenCalled();
        });

        it('should ignore unknown Google notification types', async () => {
            const callback = vi.fn();
            handler.on('build.ready', callback);

            const payload = {
                message: {
                    data: Buffer.from(JSON.stringify({
                        notificationType: 'UNKNOWN_TYPE'
                    })).toString('base64')
                }
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
                data: { buildId: 'build-123' }
            };

            await handler.handleAppleWebhook(payload);

            expect(wildcardCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'build.ready',
                    platform: 'apple'
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
                data: { buildId: 'build-123' }
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
                data: {}
            };

            // Should not throw even though first callback errors
            await expect(handler.handleAppleWebhook(payload)).resolves.not.toThrow();

            // Both callbacks should have been called
            expect(errorCallback).toHaveBeenCalled();
            expect(goodCallback).toHaveBeenCalled();
        });
    });

    describe('Signature Verification', () => {
        it('should verify Apple webhook signature', () => {
            const result = handler.verifyAppleSignature('mock-jwt-token');

            // Currently returns true (placeholder implementation)
            expect(result).toBe(true);
        });

        it('should verify Google webhook signature', () => {
            const result = handler.verifyGoogleSignature({}, 'mock-token');

            // Currently returns true (placeholder implementation)
            expect(result).toBe(true);
        });
    });
});
