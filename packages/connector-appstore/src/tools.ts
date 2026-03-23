import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tools for dual-platform app store operations
 */
export const appStoreTools: Tool[] = [
    // Apple App Store Connect Tools
    {
        name: 'apple_app_get',
        description: 'Get Apple app information by bundle ID',
        inputSchema: {
            type: 'object',
            properties: {
                bundleId: {
                    type: 'string',
                    description: 'App bundle identifier (e.g., com.company.app)'
                }
            },
            required: ['bundleId']
        }
    },
    {
        name: 'apple_build_upload',
        description: 'Upload iOS/visionOS build to App Store Connect',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to .ipa build file'
                },
                bundleId: {
                    type: 'string',
                    description: 'App bundle identifier'
                },
                version: {
                    type: 'string',
                    description: 'Version string (e.g., 1.0.0)'
                },
                buildNumber: {
                    type: 'string',
                    description: 'Build number (e.g., 42)'
                },
                platform: {
                    type: 'string',
                    enum: ['ios', 'visionos'],
                    description: 'Target platform'
                },
                releaseNotes: {
                    type: 'string',
                    description: 'Optional release notes'
                }
            },
            required: ['filePath', 'bundleId', 'version', 'buildNumber', 'platform']
        }
    },
    {
        name: 'apple_build_get',
        description: 'Get Apple build details by ID',
        inputSchema: {
            type: 'object',
            properties: {
                buildId: {
                    type: 'string',
                    description: 'Build ID from App Store Connect'
                }
            },
            required: ['buildId']
        }
    },
    {
        name: 'apple_builds_list',
        description: 'List all builds for an Apple app',
        inputSchema: {
            type: 'object',
            properties: {
                bundleId: {
                    type: 'string',
                    description: 'App bundle identifier'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of builds to return',
                    default: 50
                }
            },
            required: ['bundleId']
        }
    },
    {
        name: 'apple_testflight_submit',
        description: 'Submit build to TestFlight beta testing',
        inputSchema: {
            type: 'object',
            properties: {
                buildId: {
                    type: 'string',
                    description: 'Build ID to submit'
                }
            },
            required: ['buildId']
        }
    },
    {
        name: 'apple_beta_review_status',
        description: 'Get TestFlight beta review status',
        inputSchema: {
            type: 'object',
            properties: {
                buildId: {
                    type: 'string',
                    description: 'Build ID'
                }
            },
            required: ['buildId']
        }
    },
    {
        name: 'apple_metadata_update',
        description: 'Update Apple app metadata (name, locale, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                bundleId: {
                    type: 'string',
                    description: 'App bundle identifier'
                },
                name: {
                    type: 'string',
                    description: 'App name'
                },
                primaryLocale: {
                    type: 'string',
                    description: 'Primary locale (e.g., en-US)'
                }
            },
            required: ['bundleId']
        }
    },

    // Google Play Developer Tools
    {
        name: 'google_app_get',
        description: 'Get Google Play app information by package name',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name (e.g., com.company.app)'
                }
            },
            required: ['packageName']
        }
    },
    {
        name: 'google_build_upload',
        description: 'Upload Android APK/AAB to Google Play',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to .apk or .aab build file'
                },
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                },
                version: {
                    type: 'string',
                    description: 'Version string (e.g., 1.0.0)'
                },
                buildNumber: {
                    type: 'string',
                    description: 'Version code'
                },
                track: {
                    type: 'string',
                    enum: ['internal', 'alpha', 'beta', 'production'],
                    description: 'Release track',
                    default: 'internal'
                },
                releaseNotes: {
                    type: 'string',
                    description: 'Optional release notes'
                }
            },
            required: ['filePath', 'packageName', 'version', 'buildNumber']
        }
    },
    {
        name: 'google_track_get',
        description: 'Get Google Play track information',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                },
                track: {
                    type: 'string',
                    enum: ['internal', 'alpha', 'beta', 'production'],
                    description: 'Track name'
                }
            },
            required: ['packageName', 'track']
        }
    },
    {
        name: 'google_tracks_list',
        description: 'List all tracks for a Google Play app',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                }
            },
            required: ['packageName']
        }
    },
    {
        name: 'google_release_promote',
        description: 'Promote release from one track to another',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                },
                fromTrack: {
                    type: 'string',
                    enum: ['internal', 'alpha', 'beta'],
                    description: 'Source track'
                },
                toTrack: {
                    type: 'string',
                    enum: ['alpha', 'beta', 'production'],
                    description: 'Destination track'
                },
                versionCodes: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Version codes to promote'
                }
            },
            required: ['packageName', 'fromTrack', 'toTrack', 'versionCodes']
        }
    },
    {
        name: 'google_rollout_update',
        description: 'Update staged rollout percentage for production release',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                },
                versionCodes: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Version codes in rollout'
                },
                percentage: {
                    type: 'number',
                    description: 'Rollout percentage (0-100)',
                    minimum: 0,
                    maximum: 100
                }
            },
            required: ['packageName', 'versionCodes', 'percentage']
        }
    },
    {
        name: 'google_listing_update',
        description: 'Update Google Play store listing metadata',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'Android package name'
                },
                language: {
                    type: 'string',
                    description: 'Language code (e.g., en-US)',
                    default: 'en-US'
                },
                title: {
                    type: 'string',
                    description: 'App title'
                },
                shortDescription: {
                    type: 'string',
                    description: 'Short description'
                },
                fullDescription: {
                    type: 'string',
                    description: 'Full description'
                }
            },
            required: ['packageName', 'language']
        }
    },

    // Cross-platform Tools
    {
        name: 'appstore_health',
        description: 'Check health status of both Apple and Google API connections',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'appstore_unity_publish',
        description: 'Publish Unity build output to app stores (iOS to Apple, Android to Google)',
        inputSchema: {
            type: 'object',
            properties: {
                unityOutputPath: {
                    type: 'string',
                    description: 'Path to Unity build output directory'
                },
                platforms: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['ios', 'visionos', 'android']
                    },
                    description: 'Platforms to publish'
                },
                version: {
                    type: 'string',
                    description: 'Version string'
                },
                buildNumber: {
                    type: 'string',
                    description: 'Build number'
                },
                releaseNotes: {
                    type: 'string',
                    description: 'Release notes'
                },
                androidTrack: {
                    type: 'string',
                    enum: ['internal', 'alpha', 'beta', 'production'],
                    default: 'internal',
                    description: 'Google Play track for Android'
                },
                submitToTestFlight: {
                    type: 'boolean',
                    default: true,
                    description: 'Submit iOS build to TestFlight'
                }
            },
            required: ['unityOutputPath', 'platforms', 'version', 'buildNumber']
        }
    }
];
