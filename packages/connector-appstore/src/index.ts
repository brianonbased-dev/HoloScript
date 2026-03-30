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
 * - CI pipeline integration with automatic artifact detection
 * - TestFlight beta distribution with beta group management
 * - Internal/Alpha/Beta/Production release tracks
 * - App Store version creation and submission workflow
 * - App metadata management (including localized descriptions)
 * - Webhook notifications for build status changes
 * - Deobfuscation file upload (Google Play)
 * - Staged rollout control and halt
 *
 * MCP Tools: 27 tools (12 Apple + 10 Google + 5 cross-platform)
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
  BetaGroup,
  AppStoreVersion,
  AppStoreLocalization,
  GooglePlayTrack,
  WebhookNotification,
  UploadProgress,
  ArtifactDetectionResult,
  DetectedArtifact,
  PublishResult,
  PlatformPublishResult,
} from './types.js';
