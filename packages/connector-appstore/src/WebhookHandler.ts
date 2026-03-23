import { WebhookNotification } from './types.js';

/**
 * Webhook notification handler for app store build status updates
 *
 * Handles:
 * - Apple App Store Connect notifications (via App Store Server Notifications API)
 * - Google Play Developer notifications (via Cloud Pub/Sub)
 *
 * Both platforms send webhook notifications for:
 * - Build processing status changes
 * - Review approval/rejection
 * - TestFlight status changes
 * - Release status changes
 */
export class WebhookHandler {
    private listeners: Map<string, Array<(notification: WebhookNotification) => void>> = new Map();

    /**
     * Register a listener for specific event types
     *
     * @param event - Event type to listen for (e.g., 'build.ready', 'review.approved')
     * @param callback - Function to call when event occurs
     */
    on(event: string, callback: (notification: WebhookNotification) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        this.listeners.get(event)!.push(callback);
    }

    /**
     * Remove a listener
     */
    off(event: string, callback: (notification: WebhookNotification) => void): void {
        const listeners = this.listeners.get(event);

        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Handle incoming Apple App Store Connect webhook
     *
     * Apple sends JWT-signed notifications via HTTPS POST
     * Reference: https://developer.apple.com/documentation/appstoreservernotifications
     */
    async handleAppleWebhook(payload: any): Promise<void> {
        // Extract notification type and data
        const notificationType = payload.notificationType;
        const data = payload.data;

        let event: WebhookNotification['event'];

        // Map Apple notification types to our event types
        switch (notificationType) {
            case 'BUILD_PROCESSING_STARTED':
                event = 'build.processing';
                break;

            case 'BUILD_PROCESSING_COMPLETE':
                event = 'build.ready';
                break;

            case 'BUILD_INVALID':
                event = 'build.invalid';
                break;

            case 'BETA_APP_APPROVED':
            case 'APP_APPROVED':
                event = 'review.approved';
                break;

            case 'BETA_APP_REJECTED':
            case 'APP_REJECTED':
                event = 'review.rejected';
                break;

            default:
                console.warn(`[WebhookHandler] Unknown Apple notification type: ${notificationType}`);
                return;
        }

        const notification: WebhookNotification = {
            event,
            platform: 'apple',
            timestamp: new Date().toISOString(),
            payload: data
        };

        this.emit(event, notification);
    }

    /**
     * Handle incoming Google Play Developer webhook
     *
     * Google sends notifications via Cloud Pub/Sub
     * Reference: https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks
     */
    async handleGoogleWebhook(payload: any): Promise<void> {
        // Decode Pub/Sub message
        const message = payload.message;
        const data = message.data ? JSON.parse(Buffer.from(message.data, 'base64').toString()) : {};

        const notificationType = data.notificationType;

        let event: WebhookNotification['event'];

        // Map Google notification types to our event types
        switch (notificationType) {
            case 'TRACK_UPDATED':
                // Determine if this is a new build or status change
                if (data.trackStatus === 'inReview') {
                    event = 'build.processing';
                } else if (data.trackStatus === 'completed') {
                    event = 'build.ready';
                } else {
                    return; // Ignore other status changes
                }
                break;

            case 'REVIEW_APPROVED':
                event = 'review.approved';
                break;

            case 'REVIEW_REJECTED':
                event = 'review.rejected';
                break;

            default:
                console.warn(`[WebhookHandler] Unknown Google notification type: ${notificationType}`);
                return;
        }

        const notification: WebhookNotification = {
            event,
            platform: 'google',
            timestamp: new Date().toISOString(),
            payload: data
        };

        this.emit(event, notification);
    }

    /**
     * Emit notification to all registered listeners
     */
    private emit(event: WebhookNotification['event'], notification: WebhookNotification): void {
        // Emit to specific event listeners
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                try {
                    listener(notification);
                } catch (error) {
                    console.error(`[WebhookHandler] Error in listener for ${event}:`, error);
                }
            }
        }

        // Emit to wildcard listeners (*)
        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            for (const listener of wildcardListeners) {
                try {
                    listener(notification);
                } catch (error) {
                    console.error('[WebhookHandler] Error in wildcard listener:', error);
                }
            }
        }
    }

    /**
     * Verify Apple webhook signature (JWT validation)
     *
     * Apple signs notifications with their private key
     * You should verify the JWT signature using Apple's public key
     */
    verifyAppleSignature(signedPayload: string): boolean {
        // Implementation would verify JWT signature using Apple's public key
        // For now, return true (implement proper verification in production)
        // Reference: https://developer.apple.com/documentation/appstoreservernotifications/jwstransaction
        return true;
    }

    /**
     * Verify Google webhook authenticity
     *
     * Google Pub/Sub messages include authentication tokens
     */
    verifyGoogleSignature(payload: any, token: string): boolean {
        // Implementation would verify Pub/Sub push authentication token
        // For now, return true (implement proper verification in production)
        // Reference: https://cloud.google.com/pubsub/docs/push#authentication_and_authorization
        return true;
    }
}
