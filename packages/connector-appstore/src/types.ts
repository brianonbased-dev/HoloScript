/**
 * Type definitions for App Store connector
 *
 * Covers both Apple App Store Connect and Google Play Developer API
 * data structures plus cross-platform CI pipeline types.
 */

export interface AppleCredentials {
  /** App Store Connect API Key ID */
  keyId: string;
  /** Issuer ID from App Store Connect */
  issuerId: string;
  /** Private key content (PEM format) */
  privateKey: string;
  /** Optional: Path to .p8 private key file */
  privateKeyPath?: string;
}

export interface GoogleCredentials {
  /** Service account email */
  clientEmail: string;
  /** Service account private key */
  privateKey: string;
  /** Optional: Path to service account JSON file */
  serviceAccountPath?: string;
}

export interface BuildArtifact {
  /** Path to build artifact file */
  filePath: string;
  /** Platform: ios, visionos, android */
  platform: 'ios' | 'visionos' | 'android';
  /** Build version string */
  version: string;
  /** Build number */
  buildNumber: string;
  /** Optional: Release notes */
  releaseNotes?: string;
}

export interface AppleAppMetadata {
  /** App bundle identifier */
  bundleId: string;
  /** App Store Connect app ID */
  appId: string;
  /** App name */
  name: string;
  /** Primary locale (e.g., en-US) */
  primaryLocale: string;
}

export interface GoogleAppMetadata {
  /** Package name */
  packageName: string;
  /** App name */
  appName: string;
  /** Default language code (e.g., en-US) */
  defaultLanguage: string;
}

export interface TestFlightBuild {
  /** Build ID */
  id: string;
  /** Version string */
  version: string;
  /** Build number */
  buildNumber: string;
  /** Processing state */
  processingState: 'PROCESSING' | 'VALID' | 'INVALID';
  /** Upload date */
  uploadedDate: string;
  /** TestFlight status */
  testFlightStatus?: 'READY_FOR_BETA_TESTING' | 'IN_BETA_TESTING' | 'EXPIRED';
}

/** Beta group for TestFlight distribution */
export interface BetaGroup {
  /** Beta group ID */
  id: string;
  /** Display name */
  name: string;
  /** Whether this is an internal group (Apple employees / team members) */
  isInternal: boolean;
  /** Number of testers in the group */
  testerCount: number;
}

/** App Store version for submission workflow */
export interface AppStoreVersion {
  /** Version ID */
  id: string;
  /** Version string (e.g., 1.0.0) */
  versionString: string;
  /** App Store state */
  appStoreState:
    | 'PREPARE_FOR_SUBMISSION'
    | 'WAITING_FOR_REVIEW'
    | 'IN_REVIEW'
    | 'PENDING_DEVELOPER_RELEASE'
    | 'READY_FOR_SALE'
    | 'DEVELOPER_REMOVED_FROM_SALE'
    | 'REPLACED_WITH_NEW_VERSION'
    | 'REJECTED';
  /** Platform */
  platform: 'IOS' | 'VISION_OS';
  /** Release type */
  releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
  /** Earliest release date (for scheduled releases) */
  earliestReleaseDate?: string;
}

/** Localized App Store metadata (per-locale descriptions, keywords, etc.) */
export interface AppStoreLocalization {
  /** Locale code (e.g., en-US) */
  locale: string;
  /** App description */
  description?: string;
  /** Keywords (comma-separated) */
  keywords?: string;
  /** What's new text */
  whatsNew?: string;
  /** Marketing URL */
  marketingUrl?: string;
  /** Support URL */
  supportUrl?: string;
  /** Privacy policy URL */
  privacyPolicyUrl?: string;
}

export interface GooglePlayTrack {
  /** Track name: internal, alpha, beta, production */
  track: 'internal' | 'alpha' | 'beta' | 'production';
  /** Release status */
  status: 'draft' | 'inProgress' | 'halted' | 'completed';
  /** Rollout percentage (0-100) */
  userFraction?: number;
  /** Version codes in this release */
  versionCodes: number[];
}

export interface WebhookNotification {
  /** Event type */
  event:
    | 'build.processing'
    | 'build.ready'
    | 'build.invalid'
    | 'review.approved'
    | 'review.rejected';
  /** Platform */
  platform: 'apple' | 'google';
  /** Timestamp */
  timestamp: string;
  /** Event payload */
  payload: Record<string, unknown>;
}

export interface UploadProgress {
  /** Bytes uploaded */
  bytesUploaded: number;
  /** Total bytes */
  totalBytes: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current status message */
  status: string;
}

/** Result from the CI pipeline artifact detection */
export interface ArtifactDetectionResult {
  /** Detected artifact file paths */
  artifacts: DetectedArtifact[];
  /** Unity project path that was scanned */
  scannedPath: string;
}

/** A single detected build artifact from a Unity output directory */
export interface DetectedArtifact {
  /** Full path to the artifact file */
  filePath: string;
  /** Detected platform */
  platform: 'ios' | 'visionos' | 'android';
  /** File extension */
  extension: string;
  /** File size in bytes */
  sizeBytes: number;
}

/** Result of a multi-platform publish operation */
export interface PublishResult {
  /** Per-platform results */
  platforms: Record<string, PlatformPublishResult>;
  /** Summary statistics */
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/** Result for a single platform publish */
export interface PlatformPublishResult {
  success: boolean;
  /** Build details on success */
  build?: TestFlightBuild;
  /** Google Play result on success */
  result?: { versionCode: number; editId: string };
  /** Error message on failure */
  error?: string;
}
