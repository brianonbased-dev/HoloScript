/**
 * Type definitions for App Store connector
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
    event: 'build.processing' | 'build.ready' | 'build.invalid' | 'review.approved' | 'review.rejected';
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
