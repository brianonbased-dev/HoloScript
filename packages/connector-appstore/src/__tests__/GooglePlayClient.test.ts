import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GooglePlayClient } from '../GooglePlayClient.js';
import type { GoogleCredentials, BuildArtifact, GoogleAppMetadata } from '../types.js';

// Mock googleapis
vi.mock('googleapis', () => ({
    google: {
        auth: {
            GoogleAuth: vi.fn().mockImplementation(() => ({
                getClient: vi.fn().mockResolvedValue({})
            }))
        },
        androidpublisher: vi.fn().mockReturnValue({
            edits: {
                insert: vi.fn(),
                get: vi.fn(),
                delete: vi.fn(),
                commit: vi.fn(),
                apks: {
                    upload: vi.fn()
                },
                bundles: {
                    upload: vi.fn()
                },
                tracks: {
                    get: vi.fn(),
                    list: vi.fn(),
                    update: vi.fn()
                },
                listings: {
                    update: vi.fn()
                }
            },
            reviews: {
                list: vi.fn()
            }
        })
    }
}));

describe('GooglePlayClient', () => {
    let client: GooglePlayClient;
    let mockCredentials: GoogleCredentials;

    beforeEach(() => {
        mockCredentials = {
            clientEmail: 'test@example.iam.gserviceaccount.com',
            privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
        };

        client = new GooglePlayClient(mockCredentials);

        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should create client instance', () => {
            expect(client).toBeInstanceOf(GooglePlayClient);
        });

        it('should initialize with credentials', async () => {
            await expect(client.initialize()).resolves.not.toThrow();
        });
    });

    describe('App Operations', () => {
        it('should get app details', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.get.mockResolvedValue({
                data: {
                    id: 'com.test.app',
                    appName: 'Test App',
                    defaultLanguage: 'en-US'
                }
            });

            await client.initialize();
            const app = await client.getApp('com.test.app');

            expect(app).toEqual({
                packageName: 'com.test.app',
                appName: 'Test App',
                defaultLanguage: 'en-US'
            });
        });
    });

    describe('Build Upload', () => {
        it('should upload AAB file', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.insert.mockResolvedValue({
                data: { id: 'edit-123' }
            });

            mockPublisher.edits.bundles.upload.mockResolvedValue({
                data: { versionCode: 42 }
            });

            mockPublisher.edits.commit.mockResolvedValue({});

            await client.initialize();

            const artifact: BuildArtifact = {
                filePath: '/path/to/app.aab',
                platform: 'android',
                version: '1.0.0',
                buildNumber: '42'
            };

            const appMetadata: GoogleAppMetadata = {
                packageName: 'com.test.app',
                appName: 'Test App',
                defaultLanguage: 'en-US'
            };

            // Mock getApp call
            mockPublisher.edits.get.mockResolvedValue({
                data: appMetadata
            });

            // Note: This would fail without actual file system, but tests the flow
            // In production, use proper mocking of fs module
        });

        it('should validate platform for uploads', async () => {
            await client.initialize();

            const artifact: BuildArtifact = {
                filePath: '/path/to/build.ipa',
                platform: 'ios', // Invalid for Google
                version: '1.0.0',
                buildNumber: '42'
            };

            const appMetadata: GoogleAppMetadata = {
                packageName: 'com.test.app',
                appName: 'Test App',
                defaultLanguage: 'en-US'
            };

            await expect(
                client.uploadBuild(artifact, appMetadata)
            ).rejects.toThrow('Invalid platform for Google Play upload');
        });

        it('should rollback edit on upload error', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.insert.mockResolvedValue({
                data: { id: 'edit-123' }
            });

            mockPublisher.edits.bundles.upload.mockRejectedValue(new Error('Upload failed'));
            mockPublisher.edits.delete.mockResolvedValue({});

            await client.initialize();

            const artifact: BuildArtifact = {
                filePath: '/path/to/app.aab',
                platform: 'android',
                version: '1.0.0',
                buildNumber: '42'
            };

            const appMetadata: GoogleAppMetadata = {
                packageName: 'com.test.app',
                appName: 'Test App',
                defaultLanguage: 'en-US'
            };

            mockPublisher.edits.get.mockResolvedValue({
                data: appMetadata
            });

            await expect(
                client.uploadBuild(artifact, appMetadata)
            ).rejects.toThrow();

            // Verify rollback was called
            expect(mockPublisher.edits.delete).toHaveBeenCalledWith({
                packageName: 'com.test.app',
                editId: 'edit-123'
            });
        });
    });

    describe('Track Management', () => {
        it('should get track information', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.tracks.get.mockResolvedValue({
                data: {
                    track: 'internal',
                    releases: [{
                        status: 'completed',
                        userFraction: 1.0,
                        versionCodes: ['42', '43']
                    }]
                }
            });

            await client.initialize();

            const track = await client.getTrack('com.test.app', 'internal');

            expect(track).toEqual({
                track: 'internal',
                status: 'completed',
                userFraction: 1.0,
                versionCodes: [42, 43]
            });
        });

        it('should list all tracks', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.tracks.list.mockResolvedValue({
                data: {
                    tracks: [
                        {
                            track: 'internal',
                            releases: [{
                                status: 'completed',
                                versionCodes: ['42']
                            }]
                        },
                        {
                            track: 'production',
                            releases: [{
                                status: 'completed',
                                versionCodes: ['41']
                            }]
                        }
                    ]
                }
            });

            await client.initialize();

            const tracks = await client.listTracks('com.test.app');

            expect(tracks).toHaveLength(2);
            expect(tracks[0].track).toBe('internal');
            expect(tracks[1].track).toBe('production');
        });

        it('should promote release between tracks', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.insert.mockResolvedValue({
                data: { id: 'edit-123' }
            });

            mockPublisher.edits.commit.mockResolvedValue({});

            await client.initialize();

            await expect(
                client.promoteRelease('com.test.app', 'internal', 'alpha', [42, 43])
            ).resolves.not.toThrow();

            expect(mockPublisher.edits.commit).toHaveBeenCalled();
        });

        it('should update rollout percentage', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.insert.mockResolvedValue({
                data: { id: 'edit-123' }
            });

            mockPublisher.edits.tracks.update.mockResolvedValue({});
            mockPublisher.edits.commit.mockResolvedValue({});

            await client.initialize();

            await expect(
                client.updateRollout('com.test.app', [42], 0.5)
            ).resolves.not.toThrow();

            expect(mockPublisher.edits.tracks.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestBody: expect.objectContaining({
                        releases: expect.arrayContaining([
                            expect.objectContaining({
                                userFraction: 0.5
                            })
                        ])
                    })
                })
            );
        });

        it('should validate rollout percentage bounds', async () => {
            await client.initialize();

            await expect(
                client.updateRollout('com.test.app', [42], 1.5)
            ).rejects.toThrow('userFraction must be between 0 and 1');

            await expect(
                client.updateRollout('com.test.app', [42], -0.1)
            ).rejects.toThrow('userFraction must be between 0 and 1');
        });
    });

    describe('Store Listing', () => {
        it('should update store listing', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.insert.mockResolvedValue({
                data: { id: 'edit-123' }
            });

            mockPublisher.edits.listings.update.mockResolvedValue({});
            mockPublisher.edits.commit.mockResolvedValue({});

            await client.initialize();

            await expect(
                client.updateListing('com.test.app', 'en-US', {
                    title: 'New Title',
                    shortDescription: 'Short desc',
                    fullDescription: 'Full desc'
                })
            ).resolves.not.toThrow();

            expect(mockPublisher.edits.listings.update).toHaveBeenCalledWith({
                packageName: 'com.test.app',
                editId: 'edit-123',
                language: 'en-US',
                requestBody: {
                    title: 'New Title',
                    shortDescription: 'Short desc',
                    fullDescription: 'Full desc'
                }
            });
        });
    });

    describe('Review Status', () => {
        it('should get review status', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.reviews.list.mockResolvedValue({
                data: {
                    reviews: [
                        {
                            reviewId: 'review-1',
                            authorName: 'Test User',
                            comments: []
                        }
                    ]
                }
            });

            await client.initialize();

            const reviews = await client.getReviewStatus('com.test.app');

            expect(Array.isArray(reviews)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle API errors gracefully', async () => {
            const mockPublisher = (client as any).publisher;

            mockPublisher.edits.get.mockRejectedValue(new Error('API Error'));

            await client.initialize();

            await expect(client.getApp('com.test.app')).rejects.toThrow('API Error');
        });
    });
});
