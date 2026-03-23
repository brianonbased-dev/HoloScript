import { Client, Receiver } from '@upstash/qstash';
import type {
    ScheduleConfig,
    PublishConfig,
    ScheduleSummary,
    DLQMessage,
    WebhookVerification
} from '../types.js';

export type { ScheduleConfig, PublishConfig } from '../types.js';

/**
 * QStashSubsystem manages scheduled compilation triggers, health monitoring,
 * and deployment scheduling via Upstash QStash.
 *
 * Features:
 * - Cron-based compilation schedules
 * - One-time delayed tasks
 * - Webhook callbacks for CI/CD
 * - Dead letter queue (DLQ) for failures
 * - Health monitoring pings
 */
export class QStashSubsystem {
    private client: Client | null = null;
    private receiver: Receiver | null = null;
    private isConnected = false;

    /**
     * Connect to Upstash QStash using environment variables.
     * Requires QSTASH_TOKEN.
     * Optionally initializes webhook signature verification with
     * QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
     */
    async connect(): Promise<void> {
        const token = process.env.QSTASH_TOKEN;

        if (!token) {
            throw new Error('QSTASH_TOKEN environment variable is required');
        }

        this.client = new Client({
            token
        });

        // Initialize webhook signature receiver if signing keys are available
        const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
        const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
        if (currentSigningKey && nextSigningKey) {
            this.receiver = new Receiver({
                currentSigningKey,
                nextSigningKey
            });
        }

        // Verify connection by listing schedules
        try {
            await this.client.schedules.list();
            this.isConnected = true;
        } catch (error) {
            this.isConnected = false;
            throw new Error(`Upstash QStash connection failed: ${error}`);
        }
    }

    /**
     * Disconnect and cleanup.
     */
    async disconnect(): Promise<void> {
        this.client = null;
        this.receiver = null;
        this.isConnected = false;
    }

    /**
     * Health check - verify QStash connectivity.
     */
    async health(): Promise<boolean> {
        if (!this.isConnected || !this.client) {
            return false;
        }

        try {
            await this.client.schedules.list();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a scheduled cron job.
     * @param config - Schedule configuration
     * @returns Schedule ID
     */
    async createSchedule(config: ScheduleConfig): Promise<string> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        const result = await this.client.schedules.create({
            destination: config.url,
            cron: config.cron,
            body: config.body ? JSON.stringify(config.body) : undefined,
            headers: config.headers,
            retries: config.retries,
            callback: config.callback,
            failureCallback: config.failureCallback
        });

        return result.scheduleId;
    }

    /**
     * List all scheduled jobs.
     * @returns Array of schedules with metadata
     */
    async listSchedules(): Promise<ScheduleSummary[]> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        const schedules = await this.client.schedules.list();
        return schedules.map((schedule) => ({
            scheduleId: schedule.scheduleId,
            cron: schedule.cron,
            destination: schedule.destination,
            createdAt: schedule.createdAt,
            isPaused: schedule.isPaused || false
        }));
    }

    /**
     * Get schedule details by ID.
     * @param scheduleId - Schedule identifier
     * @returns Schedule configuration
     */
    async getSchedule(scheduleId: string): Promise<ScheduleSummary> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        const schedule = await this.client.schedules.get(scheduleId);
        return {
            scheduleId: schedule.scheduleId,
            cron: schedule.cron,
            destination: schedule.destination,
            createdAt: schedule.createdAt,
            isPaused: schedule.isPaused || false
        };
    }

    /**
     * Delete a scheduled job.
     * @param scheduleId - Schedule ID to delete
     */
    async deleteSchedule(scheduleId: string): Promise<void> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        await this.client.schedules.delete(scheduleId);
    }

    /**
     * Pause a schedule (without deleting).
     * @param scheduleId - Schedule ID to pause
     */
    async pauseSchedule(scheduleId: string): Promise<void> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        await this.client.schedules.pause({ schedule: scheduleId });
    }

    /**
     * Resume a paused schedule.
     * @param scheduleId - Schedule ID to resume
     */
    async resumeSchedule(scheduleId: string): Promise<void> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        await this.client.schedules.resume({ schedule: scheduleId });
    }

    /**
     * Publish a one-time message (with optional delay).
     * @param config - Publish configuration
     * @returns Message ID
     */
    async publishMessage(config: PublishConfig): Promise<string> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        const result = await this.client.publishJSON({
            url: config.url,
            body: config.body || {},
            headers: config.headers,
            delay: config.delay,
            retries: config.retries,
            callback: config.callback
        });

        return result.messageId;
    }

    /**
     * List messages in the dead letter queue (DLQ).
     * These are messages that failed after all retries.
     * @returns Array of failed messages
     */
    async listDLQ(): Promise<DLQMessage[]> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        const dlqResult = await this.client.dlq.listMessages();
        return dlqResult.messages.map((msg: any) => ({
            messageId: msg.messageId,
            url: msg.url,
            body: msg.body || '',
            createdAt: msg.createdAt,
            responseStatus: msg.responseStatus || 0,
            responseBody: msg.responseBody || ''
        }));
    }

    /**
     * Delete a message from the DLQ.
     * @param messageId - DLQ message ID
     */
    async deleteDLQMessage(messageId: string): Promise<void> {
        if (!this.client) {
            throw new Error('QStashSubsystem not connected');
        }

        await this.client.dlq.delete([messageId]);
    }

    /**
     * Schedule a nightly compilation job (convenience method).
     * @param url - Compilation webhook URL
     * @param target - Compiler target (unity, unreal, etc.)
     * @param scene - Scene file path
     * @param hour - Hour of day (0-23, default 2 for 2 AM)
     * @returns Schedule ID
     */
    async scheduleNightlyCompilation(
        url: string,
        target: string,
        scene: string,
        hour = 2
    ): Promise<string> {
        return this.createSchedule({
            cron: `0 ${hour} * * *`,
            url,
            body: {
                target,
                scene,
                scheduled: true
            },
            retries: 3,
            headers: {
                'Content-Type': 'application/json',
                'X-HoloScript-Scheduled': 'true'
            }
        });
    }

    /**
     * Schedule a health monitoring ping.
     * @param url - Health check endpoint
     * @param intervalMinutes - Ping interval in minutes (default 5)
     * @returns Schedule ID
     */
    async scheduleHealthPing(url: string, intervalMinutes = 5): Promise<string> {
        return this.createSchedule({
            cron: `*/${intervalMinutes} * * * *`,
            url,
            body: {
                ping: true,
                timestamp: Date.now()
            },
            retries: 1
        });
    }

    /**
     * Trigger a deployment after delay (CI/CD integration).
     * @param deploymentUrl - Deployment webhook
     * @param delaySeconds - Delay before deployment (default 300 = 5 min)
     * @param metadata - Additional deployment metadata
     * @returns Message ID
     */
    async triggerDeployment(
        deploymentUrl: string,
        delaySeconds = 300,
        metadata?: Record<string, unknown>
    ): Promise<string> {
        return this.publishMessage({
            url: deploymentUrl,
            delay: delaySeconds,
            body: {
                deploy: true,
                timestamp: Date.now(),
                ...metadata
            },
            retries: 2,
            headers: {
                'Content-Type': 'application/json',
                'X-HoloScript-Deployment': 'true'
            }
        });
    }

    /**
     * Verify a QStash webhook signature.
     * Requires QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
     *
     * @param signature - The Upstash-Signature header value
     * @param body - The raw request body string
     * @param url - The webhook URL that received the request
     * @returns WebhookVerification result
     */
    async verifyWebhookSignature(
        signature: string,
        body: string,
        url?: string
    ): Promise<WebhookVerification> {
        if (!this.receiver) {
            return {
                isValid: false,
                error: 'Webhook verification not configured. Set QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.'
            };
        }

        try {
            const isValid = await this.receiver.verify({
                signature,
                body,
                url
            });
            return {
                isValid,
                body: isValid ? body : undefined
            };
        } catch (error) {
            return {
                isValid: false,
                error: `Signature verification failed: ${error}`
            };
        }
    }

    /**
     * Check if webhook verification is available.
     * @returns true if signing keys are configured
     */
    isWebhookVerificationEnabled(): boolean {
        return this.receiver !== null;
    }
}
