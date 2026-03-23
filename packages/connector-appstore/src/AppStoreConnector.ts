import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AppleAppStoreClient } from './AppleAppStoreClient.js';
import { GooglePlayClient } from './GooglePlayClient.js';
import { WebhookHandler } from './WebhookHandler.js';
import { appStoreTools } from './tools.js';
import {
    AppleCredentials,
    GoogleCredentials,
    BuildArtifact,
    AppleAppMetadata,
    GoogleAppMetadata
} from './types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Dual-platform App Store connector for HoloScript
 *
 * Integrates with:
 * - Apple App Store Connect (iOS, visionOS)
 * - Google Play Developer (Android)
 *
 * Supports:
 * - Build artifact upload from Unity/UnityCompiler output
 * - TestFlight beta distribution (Apple)
 * - Internal/Alpha/Beta/Production tracks (Google)
 * - App metadata management
 * - Webhook notifications for build status
 *
 * Environment variables:
 * - APPLE_KEY_ID: App Store Connect API Key ID
 * - APPLE_ISSUER_ID: App Store Connect Issuer ID
 * - APPLE_PRIVATE_KEY: Private key content or path to .p8 file
 * - GOOGLE_SERVICE_ACCOUNT: Service account JSON or path to file
 */
export class AppStoreConnector extends ServiceConnector {
    private appleClient: AppleAppStoreClient | null = null;
    private googleClient: GooglePlayClient | null = null;
    private webhookHandler: WebhookHandler;
    private registrar = new McpRegistrar();

    constructor() {
        super();
        this.webhookHandler = new WebhookHandler();
    }

    /**
     * Connect to Apple App Store Connect and Google Play Developer APIs
     */
    async connect(): Promise<void> {
        const errors: string[] = [];

        // Initialize Apple client if credentials available
        try {
            const appleCredentials = this.loadAppleCredentials();
            if (appleCredentials) {
                this.appleClient = new AppleAppStoreClient(appleCredentials);
                console.log('[AppStoreConnector] Apple App Store Connect initialized');
            } else {
                console.warn('[AppStoreConnector] Apple credentials not found - Apple tools will be unavailable');
            }
        } catch (error) {
            errors.push(`Apple initialization failed: ${error}`);
        }

        // Initialize Google client if credentials available
        try {
            const googleCredentials = this.loadGoogleCredentials();
            if (googleCredentials) {
                this.googleClient = new GooglePlayClient(googleCredentials);
                await this.googleClient.initialize();
                console.log('[AppStoreConnector] Google Play Developer initialized');
            } else {
                console.warn('[AppStoreConnector] Google credentials not found - Google tools will be unavailable');
            }
        } catch (error) {
            errors.push(`Google initialization failed: ${error}`);
        }

        // At least one platform must be connected
        if (!this.appleClient && !this.googleClient) {
            throw new Error(`No app store platforms connected. Errors: ${errors.join(', ')}`);
        }

        this.isConnected = true;

        // Register with MCP orchestrator
        await this.registrar.register({
            name: 'holoscript-appstore',
            url: 'http://localhost:0',
            tools: appStoreTools.map(t => t.name)
        });
    }

    /**
     * Load Apple credentials from environment
     */
    private loadAppleCredentials(): AppleCredentials | null {
        const keyId = process.env.APPLE_KEY_ID;
        const issuerId = process.env.APPLE_ISSUER_ID;
        const privateKeyEnv = process.env.APPLE_PRIVATE_KEY;

        if (!keyId || !issuerId || !privateKeyEnv) {
            return null;
        }

        // Check if privateKeyEnv is a file path or the key itself
        let privateKey: string;

        if (privateKeyEnv.includes('-----BEGIN PRIVATE KEY-----')) {
            // Direct key content
            privateKey = privateKeyEnv;
        } else {
            // Assume it's a file path
            try {
                privateKey = readFileSync(resolve(privateKeyEnv), 'utf-8');
            } catch (error) {
                console.error('[AppStoreConnector] Failed to read Apple private key file:', error);
                return null;
            }
        }

        return { keyId, issuerId, privateKey };
    }

    /**
     * Load Google credentials from environment
     */
    private loadGoogleCredentials(): GoogleCredentials | null {
        const serviceAccountEnv = process.env.GOOGLE_SERVICE_ACCOUNT;

        if (!serviceAccountEnv) {
            return null;
        }

        // Check if it's JSON string or file path
        let credentials: any;

        try {
            // Try parsing as JSON
            credentials = JSON.parse(serviceAccountEnv);
        } catch {
            // Assume it's a file path
            try {
                const fileContent = readFileSync(resolve(serviceAccountEnv), 'utf-8');
                credentials = JSON.parse(fileContent);
            } catch (error) {
                console.error('[AppStoreConnector] Failed to read Google service account file:', error);
                return null;
            }
        }

        return {
            clientEmail: credentials.client_email,
            privateKey: credentials.private_key
        };
    }

    async disconnect(): Promise<void> {
        this.appleClient = null;
        this.googleClient = null;
        this.isConnected = false;
    }

    async health(): Promise<boolean> {
        if (!this.isConnected) {
            return false;
        }

        // At least one platform should be healthy
        const appleHealthy = this.appleClient !== null;
        const googleHealthy = this.googleClient !== null;

        return appleHealthy || googleHealthy;
    }

    async listTools(): Promise<Tool[]> {
        return appStoreTools;
    }

    async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        if (!this.isConnected) {
            throw new Error('AppStoreConnector is not connected. Call connect() first.');
        }

        // Route to appropriate platform or cross-platform handler
        if (name.startsWith('apple_')) {
            return this.executeAppleTool(name, args);
        } else if (name.startsWith('google_')) {
            return this.executeGoogleTool(name, args);
        } else if (name.startsWith('appstore_')) {
            return this.executeCrossPlatformTool(name, args);
        }

        throw new Error(`Unknown tool: ${name}`);
    }

    /**
     * Execute Apple App Store Connect tool
     */
    private async executeAppleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        if (!this.appleClient) {
            throw new Error('Apple App Store Connect is not configured. Set APPLE_KEY_ID, APPLE_ISSUER_ID, and APPLE_PRIVATE_KEY environment variables.');
        }

        switch (name) {
            case 'apple_app_get': {
                const app = await this.appleClient.getApp(args.bundleId as string);
                return app;
            }

            case 'apple_build_upload': {
                const app = await this.appleClient.getApp(args.bundleId as string);

                const artifact: BuildArtifact = {
                    filePath: args.filePath as string,
                    platform: args.platform as any,
                    version: args.version as string,
                    buildNumber: args.buildNumber as string,
                    releaseNotes: args.releaseNotes as string | undefined
                };

                const build = await this.appleClient.uploadBuild(artifact, app, (progress) => {
                    console.log(`[Apple Upload] ${progress.status} ${progress.percentage}%`);
                });

                return build;
            }

            case 'apple_build_get': {
                const build = await this.appleClient.getBuild(args.buildId as string);
                return build;
            }

            case 'apple_builds_list': {
                const app = await this.appleClient.getApp(args.bundleId as string);
                const builds = await this.appleClient.listBuilds(app.appId, args.limit as number | undefined);
                return builds;
            }

            case 'apple_testflight_submit': {
                await this.appleClient.submitToTestFlight(args.buildId as string);
                return { success: true, message: 'Build submitted to TestFlight' };
            }

            case 'apple_beta_review_status': {
                const status = await this.appleClient.getBetaReviewStatus(args.buildId as string);
                return status;
            }

            case 'apple_metadata_update': {
                const app = await this.appleClient.getApp(args.bundleId as string);
                await this.appleClient.updateAppMetadata(app.appId, {
                    name: args.name as string | undefined,
                    primaryLocale: args.primaryLocale as string | undefined
                });
                return { success: true, message: 'Metadata updated' };
            }

            default:
                throw new Error(`Unknown Apple tool: ${name}`);
        }
    }

    /**
     * Execute Google Play Developer tool
     */
    private async executeGoogleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        if (!this.googleClient) {
            throw new Error('Google Play Developer is not configured. Set GOOGLE_SERVICE_ACCOUNT environment variable.');
        }

        switch (name) {
            case 'google_app_get': {
                const app = await this.googleClient.getApp(args.packageName as string);
                return app;
            }

            case 'google_build_upload': {
                const app = await this.googleClient.getApp(args.packageName as string);

                const artifact: BuildArtifact = {
                    filePath: args.filePath as string,
                    platform: 'android',
                    version: args.version as string,
                    buildNumber: args.buildNumber as string,
                    releaseNotes: args.releaseNotes as string | undefined
                };

                const result = await this.googleClient.uploadBuild(
                    artifact,
                    app,
                    args.track as any || 'internal',
                    (progress) => {
                        console.log(`[Google Upload] ${progress.status} ${progress.percentage}%`);
                    }
                );

                return result;
            }

            case 'google_track_get': {
                const track = await this.googleClient.getTrack(
                    args.packageName as string,
                    args.track as string
                );
                return track;
            }

            case 'google_tracks_list': {
                const tracks = await this.googleClient.listTracks(args.packageName as string);
                return tracks;
            }

            case 'google_release_promote': {
                await this.googleClient.promoteRelease(
                    args.packageName as string,
                    args.fromTrack as string,
                    args.toTrack as string,
                    args.versionCodes as number[]
                );
                return { success: true, message: `Release promoted from ${args.fromTrack} to ${args.toTrack}` };
            }

            case 'google_rollout_update': {
                await this.googleClient.updateRollout(
                    args.packageName as string,
                    args.versionCodes as number[],
                    (args.percentage as number) / 100 // Convert percentage to fraction
                );
                return { success: true, message: `Rollout updated to ${args.percentage}%` };
            }

            case 'google_listing_update': {
                await this.googleClient.updateListing(
                    args.packageName as string,
                    args.language as string || 'en-US',
                    {
                        title: args.title as string | undefined,
                        shortDescription: args.shortDescription as string | undefined,
                        fullDescription: args.fullDescription as string | undefined
                    }
                );
                return { success: true, message: 'Store listing updated' };
            }

            default:
                throw new Error(`Unknown Google tool: ${name}`);
        }
    }

    /**
     * Execute cross-platform tool
     */
    private async executeCrossPlatformTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        switch (name) {
            case 'appstore_health': {
                return {
                    apple: this.appleClient !== null,
                    google: this.googleClient !== null
                };
            }

            case 'appstore_unity_publish': {
                return this.publishUnityBuild(args);
            }

            default:
                throw new Error(`Unknown cross-platform tool: ${name}`);
        }
    }

    /**
     * Publish Unity build output to app stores
     *
     * Automatically detects build artifacts in Unity output directory
     * and publishes to appropriate platforms
     */
    private async publishUnityBuild(args: Record<string, unknown>): Promise<unknown> {
        const unityOutputPath = args.unityOutputPath as string;
        const platforms = args.platforms as string[];
        const version = args.version as string;
        const buildNumber = args.buildNumber as string;
        const releaseNotes = args.releaseNotes as string | undefined;
        const androidTrack = (args.androidTrack as string) || 'internal';
        const submitToTestFlight = args.submitToTestFlight !== false;

        const results: Record<string, any> = {};

        for (const platform of platforms) {
            try {
                if (platform === 'ios' || platform === 'visionos') {
                    if (!this.appleClient) {
                        results[platform] = { success: false, error: 'Apple client not configured' };
                        continue;
                    }

                    // Unity iOS builds output to .ipa file
                    const ipaPath = resolve(unityOutputPath, `${platform}.ipa`);

                    // You would need to configure bundle ID elsewhere
                    // For now, assume it's passed in args
                    const bundleId = args.appleBundleId as string;

                    if (!bundleId) {
                        results[platform] = { success: false, error: 'appleBundleId not provided' };
                        continue;
                    }

                    const app = await this.appleClient.getApp(bundleId);

                    const artifact: BuildArtifact = {
                        filePath: ipaPath,
                        platform: platform as any,
                        version,
                        buildNumber,
                        releaseNotes
                    };

                    const build = await this.appleClient.uploadBuild(artifact, app);

                    if (submitToTestFlight && build.processingState === 'VALID') {
                        await this.appleClient.submitToTestFlight(build.id);
                    }

                    results[platform] = { success: true, build };

                } else if (platform === 'android') {
                    if (!this.googleClient) {
                        results[platform] = { success: false, error: 'Google client not configured' };
                        continue;
                    }

                    // Unity Android builds output to .aab or .apk
                    const aabPath = resolve(unityOutputPath, 'android.aab');
                    const apkPath = resolve(unityOutputPath, 'android.apk');

                    // Prefer AAB over APK
                    const artifactPath = aabPath; // In production, check which exists

                    const packageName = args.googlePackageName as string;

                    if (!packageName) {
                        results[platform] = { success: false, error: 'googlePackageName not provided' };
                        continue;
                    }

                    const app = await this.googleClient.getApp(packageName);

                    const artifact: BuildArtifact = {
                        filePath: artifactPath,
                        platform: 'android',
                        version,
                        buildNumber,
                        releaseNotes
                    };

                    const result = await this.googleClient.uploadBuild(artifact, app, androidTrack as any);

                    results[platform] = { success: true, result };
                }
            } catch (error) {
                results[platform] = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        }

        return {
            platforms: results,
            summary: {
                total: platforms.length,
                successful: Object.values(results).filter((r: any) => r.success).length,
                failed: Object.values(results).filter((r: any) => !r.success).length
            }
        };
    }

    /**
     * Get webhook handler for registering event listeners
     */
    getWebhookHandler(): WebhookHandler {
        return this.webhookHandler;
    }
}
