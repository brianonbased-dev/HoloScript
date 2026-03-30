import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tools for dual-platform app store operations
 *
 * 27 tools total:
 * - 12 Apple App Store Connect tools (apple_*)
 * - 10 Google Play Developer tools (google_*)
 * - 5 Cross-platform tools (appstore_*)
 */
export const appStoreTools: Tool[] = [
  // ── Apple App Store Connect Tools ─────────────────────────────────
  {
    name: 'apple_app_get',
    description: 'Get Apple app information by bundle ID',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier (e.g., com.company.app)',
        },
      },
      required: ['bundleId'],
    },
  },
  {
    name: 'apple_build_upload',
    description: 'Upload iOS/visionOS build to App Store Connect',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to .ipa build file',
        },
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
        version: {
          type: 'string',
          description: 'Version string (e.g., 1.0.0)',
        },
        buildNumber: {
          type: 'string',
          description: 'Build number (e.g., 42)',
        },
        platform: {
          type: 'string',
          enum: ['ios', 'visionos'],
          description: 'Target platform',
        },
        releaseNotes: {
          type: 'string',
          description: 'Optional release notes',
        },
      },
      required: ['filePath', 'bundleId', 'version', 'buildNumber', 'platform'],
    },
  },
  {
    name: 'apple_build_get',
    description: 'Get Apple build details by ID',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: {
          type: 'string',
          description: 'Build ID from App Store Connect',
        },
      },
      required: ['buildId'],
    },
  },
  {
    name: 'apple_builds_list',
    description: 'List all builds for an Apple app',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of builds to return',
          default: 50,
        },
      },
      required: ['bundleId'],
    },
  },
  {
    name: 'apple_testflight_submit',
    description: 'Submit build to TestFlight beta testing with optional beta group targeting',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: {
          type: 'string',
          description: 'Build ID to submit',
        },
        betaGroupIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: specific beta group IDs to distribute to. Defaults to internal group.',
        },
      },
      required: ['buildId'],
    },
  },
  {
    name: 'apple_beta_groups_list',
    description: 'List all TestFlight beta groups for an app',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
      },
      required: ['bundleId'],
    },
  },
  {
    name: 'apple_beta_review_status',
    description: 'Get TestFlight beta review status',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: {
          type: 'string',
          description: 'Build ID',
        },
      },
      required: ['buildId'],
    },
  },
  {
    name: 'apple_metadata_update',
    description: 'Update Apple app metadata (name, locale, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
        name: {
          type: 'string',
          description: 'App name',
        },
        primaryLocale: {
          type: 'string',
          description: 'Primary locale (e.g., en-US)',
        },
      },
      required: ['bundleId'],
    },
  },
  {
    name: 'apple_version_create',
    description: 'Create a new App Store version for submission workflow',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
        versionString: {
          type: 'string',
          description: 'Version string (e.g., 1.2.0)',
        },
        platform: {
          type: 'string',
          enum: ['IOS', 'VISION_OS'],
          description: 'Platform',
          default: 'IOS',
        },
        releaseType: {
          type: 'string',
          enum: ['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED'],
          description: 'When to release after approval',
          default: 'AFTER_APPROVAL',
        },
        earliestReleaseDate: {
          type: 'string',
          description: 'Earliest release date (ISO 8601) for scheduled releases',
        },
      },
      required: ['bundleId', 'versionString'],
    },
  },
  {
    name: 'apple_version_get',
    description: 'Get the current App Store version for an app',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier',
        },
        platform: {
          type: 'string',
          enum: ['IOS', 'VISION_OS'],
          description: 'Platform',
          default: 'IOS',
        },
      },
      required: ['bundleId'],
    },
  },
  {
    name: 'apple_version_attach_build',
    description: 'Attach a processed build to an App Store version (required before submission)',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: {
          type: 'string',
          description: 'App Store version ID',
        },
        buildId: {
          type: 'string',
          description: 'Build ID to attach',
        },
      },
      required: ['versionId', 'buildId'],
    },
  },
  {
    name: 'apple_version_submit',
    description: 'Submit an App Store version for Apple review',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: {
          type: 'string',
          description: 'App Store version ID to submit',
        },
      },
      required: ['versionId'],
    },
  },
  {
    name: 'apple_version_localization_update',
    description:
      "Update localized metadata for an App Store version (description, keywords, what's new)",
    inputSchema: {
      type: 'object',
      properties: {
        versionId: {
          type: 'string',
          description: 'App Store version ID',
        },
        locale: {
          type: 'string',
          description: 'Locale code (e.g., en-US, ja, de-DE)',
        },
        description: {
          type: 'string',
          description: 'App description for this locale',
        },
        keywords: {
          type: 'string',
          description: 'Keywords (comma-separated)',
        },
        whatsNew: {
          type: 'string',
          description: "What's new in this version",
        },
        marketingUrl: {
          type: 'string',
          description: 'Marketing URL',
        },
        supportUrl: {
          type: 'string',
          description: 'Support URL',
        },
        privacyPolicyUrl: {
          type: 'string',
          description: 'Privacy policy URL',
        },
      },
      required: ['versionId', 'locale'],
    },
  },

  // ── Google Play Developer Tools ───────────────────────────────────
  {
    name: 'google_app_get',
    description: 'Get Google Play app information by package name',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name (e.g., com.company.app)',
        },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'google_build_upload',
    description: 'Upload Android APK/AAB to Google Play',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to .apk or .aab build file',
        },
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        version: {
          type: 'string',
          description: 'Version string (e.g., 1.0.0)',
        },
        buildNumber: {
          type: 'string',
          description: 'Version code',
        },
        track: {
          type: 'string',
          enum: ['internal', 'alpha', 'beta', 'production'],
          description: 'Release track',
          default: 'internal',
        },
        releaseNotes: {
          type: 'string',
          description: 'Optional release notes',
        },
      },
      required: ['filePath', 'packageName', 'version', 'buildNumber'],
    },
  },
  {
    name: 'google_track_get',
    description: 'Get Google Play track information',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        track: {
          type: 'string',
          enum: ['internal', 'alpha', 'beta', 'production'],
          description: 'Track name',
        },
      },
      required: ['packageName', 'track'],
    },
  },
  {
    name: 'google_tracks_list',
    description: 'List all tracks for a Google Play app',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'google_release_promote',
    description: 'Promote release from one track to another',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        fromTrack: {
          type: 'string',
          enum: ['internal', 'alpha', 'beta'],
          description: 'Source track',
        },
        toTrack: {
          type: 'string',
          enum: ['alpha', 'beta', 'production'],
          description: 'Destination track',
        },
        versionCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'Version codes to promote',
        },
      },
      required: ['packageName', 'fromTrack', 'toTrack', 'versionCodes'],
    },
  },
  {
    name: 'google_rollout_update',
    description: 'Update staged rollout percentage for production release',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        versionCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'Version codes in rollout',
        },
        percentage: {
          type: 'number',
          description: 'Rollout percentage (0-100)',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['packageName', 'versionCodes', 'percentage'],
    },
  },
  {
    name: 'google_rollout_halt',
    description: 'Halt a staged rollout on the production track',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        versionCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'Version codes to halt',
        },
      },
      required: ['packageName', 'versionCodes'],
    },
  },
  {
    name: 'google_listing_update',
    description: 'Update Google Play store listing metadata',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., en-US)',
          default: 'en-US',
        },
        title: {
          type: 'string',
          description: 'App title',
        },
        shortDescription: {
          type: 'string',
          description: 'Short description',
        },
        fullDescription: {
          type: 'string',
          description: 'Full description',
        },
      },
      required: ['packageName', 'language'],
    },
  },
  {
    name: 'google_deobfuscation_upload',
    description: 'Upload ProGuard/R8 deobfuscation mapping file for crash report readability',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Android package name',
        },
        versionCode: {
          type: 'number',
          description: 'Version code the mapping file belongs to',
        },
        mappingFilePath: {
          type: 'string',
          description: 'Path to the ProGuard/R8 mapping.txt file',
        },
      },
      required: ['packageName', 'versionCode', 'mappingFilePath'],
    },
  },

  // ── Cross-platform Tools ──────────────────────────────────────────
  {
    name: 'appstore_health',
    description: 'Check health status of both Apple and Google API connections',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'appstore_unity_publish',
    description:
      'Publish Unity build output to app stores (iOS to Apple, Android to Google). Automatically detects artifacts in the output directory.',
    inputSchema: {
      type: 'object',
      properties: {
        unityOutputPath: {
          type: 'string',
          description: 'Path to Unity build output directory',
        },
        platforms: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['ios', 'visionos', 'android'],
          },
          description: 'Platforms to publish',
        },
        version: {
          type: 'string',
          description: 'Version string',
        },
        buildNumber: {
          type: 'string',
          description: 'Build number',
        },
        releaseNotes: {
          type: 'string',
          description: 'Release notes',
        },
        androidTrack: {
          type: 'string',
          enum: ['internal', 'alpha', 'beta', 'production'],
          default: 'internal',
          description: 'Google Play track for Android',
        },
        submitToTestFlight: {
          type: 'boolean',
          default: true,
          description: 'Submit iOS build to TestFlight',
        },
        appleBundleId: {
          type: 'string',
          description: 'Apple bundle ID (required for iOS/visionOS)',
        },
        googlePackageName: {
          type: 'string',
          description: 'Google package name (required for Android)',
        },
      },
      required: ['unityOutputPath', 'platforms', 'version', 'buildNumber'],
    },
  },
  {
    name: 'appstore_detect_artifacts',
    description: 'Detect build artifacts (.ipa, .apk, .aab) in a Unity output directory',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Path to Unity build output directory to scan',
        },
      },
      required: ['outputPath'],
    },
  },
  {
    name: 'appstore_webhook_apple',
    description: 'Process an incoming Apple App Store Connect webhook notification',
    inputSchema: {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          description: 'The webhook payload from Apple',
        },
      },
      required: ['payload'],
    },
  },
  {
    name: 'appstore_webhook_google',
    description: 'Process an incoming Google Play Developer webhook notification (Pub/Sub)',
    inputSchema: {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          description: 'The Pub/Sub message payload from Google',
        },
      },
      required: ['payload'],
    },
  },
];
