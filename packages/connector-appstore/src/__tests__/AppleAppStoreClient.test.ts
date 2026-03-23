import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppleAppStoreClient } from '../AppleAppStoreClient.js';
import type { AppleCredentials, BuildArtifact, AppleAppMetadata } from '../types.js';

// Mock jsonwebtoken to avoid needing a real EC key
vi.mock('jsonwebtoken', () => ({
    default: {
        sign: vi.fn().mockReturnValue(
            'eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5LWlkIiwidHlwIjoiSldUIn0.' +
            'eyJpc3MiOiJ0ZXN0LWlzc3Vlci1pZCIsImlhdCI6MTcxMTAwMDAwMCwiZXhwIjoxNzExMDAxMjAwLCJhdWQiOiJhcHBzdG9yZWNvbm5lY3QtdjEifQ.' +
            'mock-signature'
        )
    }
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('AppleAppStoreClient', () => {
    let client: AppleAppStoreClient;
    let mockCredentials: AppleCredentials;

    beforeEach(() => {
        mockCredentials = {
            keyId: 'test-key-id',
            issuerId: 'test-issuer-id',
            privateKey: '-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgtest\n-----END PRIVATE KEY-----'
        };

        client = new AppleAppStoreClient(mockCredentials);

        (global.fetch as any).mockReset();
    });

    describe('Token Generation', () => {
        it('should generate JWT token string', () => {
            const token = (client as any).generateToken();

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT has 3 parts
        });

        it('should store token and expiry on the instance', () => {
            (client as any).generateToken();

            expect((client as any).token).toBeTruthy();
            expect((client as any).tokenExpiry).toBeGreaterThan(0);
        });

        it('should reuse token if not expired', () => {
            const token1 = (client as any).getToken();
            const token2 = (client as any).getToken();

            expect(token1).toBe(token2);
        });

        it('should regenerate token if expired', () => {
            (client as any).generateToken();
            // Force expiry
            (client as any).tokenExpiry = 0;

            const token = (client as any).getToken();
            expect(token).toBeTruthy();
        });
    });

    describe('API Requests', () => {
        it('should make authenticated requests', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [{
                        id: 'app-id-123',
                        attributes: {
                            bundleId: 'com.test.app',
                            name: 'Test App',
                            primaryLocale: 'en-US'
                        }
                    }]
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const app = await client.getApp('com.test.app');

            expect(app).toEqual({
                bundleId: 'com.test.app',
                appId: 'app-id-123',
                name: 'Test App',
                primaryLocale: 'en-US'
            });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/apps?filter[bundleId]='),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': expect.stringMatching(/^Bearer /)
                    })
                })
            );
        });

        it('should handle API errors', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                text: async () => 'Unauthorized'
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(client.getApp('com.test.app')).rejects.toThrow('Apple API Error (401)');
        });

        it('should throw error if app not found', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({ data: [] })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(client.getApp('com.nonexistent.app')).rejects.toThrow('App not found');
        });
    });

    describe('Build Operations', () => {
        it('should get build details', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        id: 'build-123',
                        attributes: {
                            version: '1.0.0',
                            buildNumber: '42',
                            processingState: 'VALID',
                            uploadedDate: '2026-03-21T00:00:00Z',
                            testFlightStatus: 'READY_FOR_BETA_TESTING'
                        }
                    }
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const build = await client.getBuild('build-123');

            expect(build).toEqual({
                id: 'build-123',
                version: '1.0.0',
                buildNumber: '42',
                processingState: 'VALID',
                uploadedDate: '2026-03-21T00:00:00Z',
                testFlightStatus: 'READY_FOR_BETA_TESTING'
            });
        });

        it('should list builds for app', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: 'build-1',
                            attributes: {
                                version: '1.0.0',
                                buildNumber: '42',
                                processingState: 'VALID',
                                uploadedDate: '2026-03-21T00:00:00Z'
                            }
                        },
                        {
                            id: 'build-2',
                            attributes: {
                                version: '1.0.1',
                                buildNumber: '43',
                                processingState: 'PROCESSING',
                                uploadedDate: '2026-03-22T00:00:00Z'
                            }
                        }
                    ]
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const builds = await client.listBuilds('app-123');

            expect(builds).toHaveLength(2);
            expect(builds[0].id).toBe('build-1');
            expect(builds[1].id).toBe('build-2');
        });

        it('should submit build to TestFlight with default group', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(client.submitToTestFlight('build-123')).resolves.not.toThrow();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/builds/build-123/relationships/betaGroups'),
                expect.objectContaining({
                    method: 'POST'
                })
            );

            // Verify body contains internal group
            const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
            expect(callBody.data[0].id).toBe('internal');
        });

        it('should submit build to TestFlight with specific beta groups', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await client.submitToTestFlight('build-123', ['group-1', 'group-2']);

            const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
            expect(callBody.data).toHaveLength(2);
            expect(callBody.data[0].id).toBe('group-1');
            expect(callBody.data[1].id).toBe('group-2');
        });

        it('should get beta review status', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: 'localization-1',
                            attributes: {
                                locale: 'en-US',
                                whatsNew: 'Bug fixes and improvements'
                            }
                        }
                    ]
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const status = await client.getBetaReviewStatus('build-123');

            expect(status).toBeDefined();
            expect(Array.isArray(status)).toBe(true);
        });
    });

    describe('Beta Group Management', () => {
        it('should list beta groups for an app', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: 'group-1',
                            attributes: {
                                name: 'Internal Testers',
                                isInternalGroup: true,
                                testerCount: 5
                            }
                        },
                        {
                            id: 'group-2',
                            attributes: {
                                name: 'External Beta',
                                isInternalGroup: false,
                                testerCount: 100
                            }
                        }
                    ]
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const groups = await client.listBetaGroups('app-123');

            expect(groups).toHaveLength(2);
            expect(groups[0]).toEqual({
                id: 'group-1',
                name: 'Internal Testers',
                isInternal: true,
                testerCount: 5
            });
            expect(groups[1].isInternal).toBe(false);
            expect(groups[1].testerCount).toBe(100);
        });
    });

    describe('App Store Version Management', () => {
        it('should create an App Store version', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        id: 'version-1',
                        attributes: {
                            versionString: '1.2.0',
                            appStoreState: 'PREPARE_FOR_SUBMISSION',
                            platform: 'IOS',
                            releaseType: 'AFTER_APPROVAL'
                        }
                    }
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const version = await client.createAppStoreVersion('app-123', '1.2.0');

            expect(version.id).toBe('version-1');
            expect(version.versionString).toBe('1.2.0');
            expect(version.appStoreState).toBe('PREPARE_FOR_SUBMISSION');
            expect(version.platform).toBe('IOS');

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/appStoreVersions'),
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('should create a scheduled version with earliest release date', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        id: 'version-2',
                        attributes: {
                            versionString: '2.0.0',
                            appStoreState: 'PREPARE_FOR_SUBMISSION',
                            platform: 'IOS',
                            releaseType: 'SCHEDULED',
                            earliestReleaseDate: '2026-04-01T00:00:00Z'
                        }
                    }
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const version = await client.createAppStoreVersion(
                'app-123', '2.0.0', 'IOS', 'SCHEDULED', '2026-04-01T00:00:00Z'
            );

            expect(version.releaseType).toBe('SCHEDULED');
            expect(version.earliestReleaseDate).toBe('2026-04-01T00:00:00Z');

            // Verify the request body includes earliestReleaseDate
            const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
            expect(callBody.data.attributes.earliestReleaseDate).toBe('2026-04-01T00:00:00Z');
        });

        it('should get current App Store version', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [{
                        id: 'version-1',
                        attributes: {
                            versionString: '1.0.0',
                            appStoreState: 'READY_FOR_SALE',
                            platform: 'IOS',
                            releaseType: 'AFTER_APPROVAL'
                        }
                    }]
                })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const version = await client.getAppStoreVersion('app-123');

            expect(version).not.toBeNull();
            expect(version!.versionString).toBe('1.0.0');
            expect(version!.appStoreState).toBe('READY_FOR_SALE');
        });

        it('should return null if no App Store version exists', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({ data: [] })
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            const version = await client.getAppStoreVersion('app-123');
            expect(version).toBeNull();
        });

        it('should attach build to version', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(
                client.attachBuildToVersion('version-1', 'build-123')
            ).resolves.not.toThrow();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/appStoreVersions/version-1/relationships/build'),
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        it('should submit version for review', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(
                client.submitForReview('version-1')
            ).resolves.not.toThrow();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/appStoreVersionSubmissions'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('Localized Metadata', () => {
        it('should update existing localization', async () => {
            // First call: get localizations (returns existing en-US)
            const getLocalizationsResponse = {
                ok: true,
                json: async () => ({
                    data: [{
                        id: 'loc-1',
                        attributes: { locale: 'en-US' }
                    }]
                })
            };

            // Second call: patch localization
            const patchResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any)
                .mockResolvedValueOnce(getLocalizationsResponse)
                .mockResolvedValueOnce(patchResponse);

            await client.updateVersionLocalization('version-1', {
                locale: 'en-US',
                description: 'Updated description',
                whatsNew: 'New features'
            });

            // Second call should be a PATCH to the existing localization
            expect((global.fetch as any).mock.calls[1][0]).toContain('/appStoreVersionLocalizations/loc-1');
            expect((global.fetch as any).mock.calls[1][1].method).toBe('PATCH');
        });

        it('should create new localization if not existing', async () => {
            // First call: get localizations (returns none matching)
            const getLocalizationsResponse = {
                ok: true,
                json: async () => ({
                    data: [{
                        id: 'loc-1',
                        attributes: { locale: 'en-US' }
                    }]
                })
            };

            // Second call: create new localization
            const createResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any)
                .mockResolvedValueOnce(getLocalizationsResponse)
                .mockResolvedValueOnce(createResponse);

            await client.updateVersionLocalization('version-1', {
                locale: 'ja',
                description: 'Japanese description'
            });

            // Second call should be a POST (creating new)
            expect((global.fetch as any).mock.calls[1][0]).toContain('/appStoreVersionLocalizations');
            expect((global.fetch as any).mock.calls[1][1].method).toBe('POST');
        });
    });

    describe('Metadata Management', () => {
        it('should update app metadata', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(
                client.updateAppMetadata('app-123', {
                    name: 'New App Name',
                    primaryLocale: 'en-GB'
                })
            ).resolves.not.toThrow();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/apps/app-123'),
                expect.objectContaining({
                    method: 'PATCH'
                })
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors', async () => {
            (global.fetch as any).mockRejectedValue(new Error('Network error'));

            await expect(client.getApp('com.test.app')).rejects.toThrow('Network error');
        });

        it('should validate platform for uploads', async () => {
            const artifact: BuildArtifact = {
                filePath: '/path/to/build.apk',
                platform: 'android', // Invalid for Apple
                version: '1.0.0',
                buildNumber: '42'
            };

            const appMetadata: AppleAppMetadata = {
                bundleId: 'com.test.app',
                appId: 'app-123',
                name: 'Test App',
                primaryLocale: 'en-US'
            };

            await expect(
                client.uploadBuild(artifact, appMetadata)
            ).rejects.toThrow('Invalid platform for Apple upload');
        });
    });
});
