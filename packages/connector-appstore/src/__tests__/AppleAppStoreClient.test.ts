import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppleAppStoreClient } from '../AppleAppStoreClient.js';
import type { AppleCredentials, BuildArtifact, AppleAppMetadata } from '../types.js';

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

        vi.clearAllMocks();
    });

    describe('Token Generation', () => {
        it('should generate valid JWT token', () => {
            // Access private method through any type
            const token = (client as any).generateToken();

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT has 3 parts
        });

        it('should include correct JWT claims', () => {
            const token = (client as any).generateToken();
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

            expect(payload.iss).toBe(mockCredentials.issuerId);
            expect(payload.aud).toBe('appstoreconnect-v1');
            expect(payload.iat).toBeDefined();
            expect(payload.exp).toBeDefined();
        });

        it('should reuse token if not expired', () => {
            const token1 = (client as any).getToken();
            const token2 = (client as any).getToken();

            expect(token1).toBe(token2);
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

        it('should submit build to TestFlight', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({})
            };

            (global.fetch as any).mockResolvedValue(mockResponse);

            await expect(client.submitToTestFlight('build-123')).resolves.not.toThrow();
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
