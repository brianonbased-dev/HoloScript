/**
 * @holoscript/connector-appstore
 *
 * Dual-platform app store connector for HoloScript Studio Integration Hub
 *
 * Supports:
 * - Apple App Store Connect (iOS, visionOS)
 * - Google Play Developer (Android)
 *
 * Features:
 * - Build artifact upload from Unity/compiler output
 * - TestFlight beta distribution
 * - Internal/Alpha/Beta/Production release tracks
 * - App metadata management
 * - Webhook notifications for build status
 */

export { AppStoreConnector } from './AppStoreConnector.js';
export { AppleAppStoreClient } from './AppleAppStoreClient.js';
export { GooglePlayClient } from './GooglePlayClient.js';
export { WebhookHandler } from './WebhookHandler.js';
export { appStoreTools } from './tools.js';

export type {
    AppleCredentials,
    GoogleCredentials,
    BuildArtifact,
    AppleAppMetadata,
    GoogleAppMetadata,
    TestFlightBuild,
    GooglePlayTrack,
    WebhookNotification,
    UploadProgress
} from './types.js';
