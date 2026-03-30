import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GooglePlayClient } from '../GooglePlayClient.js';
import type { GoogleCredentials, BuildArtifact, GoogleAppMetadata } from '../types.js';

// Mock fs module to prevent real filesystem access in tests
vi.mock('fs', () => {
  const { Readable } = require('stream');
  return {
    createReadStream: vi.fn().mockReturnValue(
      new Readable({
        read() {
          this.push(null);
        },
      })
    ),
    statSync: vi.fn().mockReturnValue({ size: 1024 }),
  };
});

// Create mock functions with vi.hoisted so they survive vi.clearAllMocks
const mockEditsInsert = vi.fn();
const mockEditsGet = vi.fn();
const mockEditsDelete = vi.fn();
const mockEditsCommit = vi.fn();
const mockApksUpload = vi.fn();
const mockBundlesUpload = vi.fn();
const mockTracksGet = vi.fn();
const mockTracksList = vi.fn();
const mockTracksUpdate = vi.fn();
const mockListingsUpdate = vi.fn();
const mockDeobfuscationUpload = vi.fn();
const mockReviewsList = vi.fn();

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: function () {
        return {
          getClient: vi.fn().mockResolvedValue({}),
        };
      },
    },
    androidpublisher: function () {
      return {
        edits: {
          insert: mockEditsInsert,
          get: mockEditsGet,
          delete: mockEditsDelete,
          commit: mockEditsCommit,
          apks: {
            upload: mockApksUpload,
          },
          bundles: {
            upload: mockBundlesUpload,
          },
          tracks: {
            get: mockTracksGet,
            list: mockTracksList,
            update: mockTracksUpdate,
          },
          listings: {
            update: mockListingsUpdate,
          },
          deobfuscationfiles: {
            upload: mockDeobfuscationUpload,
          },
        },
        reviews: {
          list: mockReviewsList,
        },
      };
    },
  },
}));

describe('GooglePlayClient', () => {
  let client: GooglePlayClient;
  let mockCredentials: GoogleCredentials;

  beforeEach(async () => {
    mockCredentials = {
      clientEmail: 'test@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    };

    client = new GooglePlayClient(mockCredentials);

    // Reset mock state but not the implementations
    mockEditsInsert.mockReset();
    mockEditsGet.mockReset();
    mockEditsDelete.mockReset();
    mockEditsCommit.mockReset();
    mockApksUpload.mockReset();
    mockBundlesUpload.mockReset();
    mockTracksGet.mockReset();
    mockTracksList.mockReset();
    mockTracksUpdate.mockReset();
    mockListingsUpdate.mockReset();
    mockDeobfuscationUpload.mockReset();
    mockReviewsList.mockReset();

    // Initialize the client so publisher is set
    await client.initialize();
  });

  describe('Initialization', () => {
    it('should create client instance', () => {
      expect(client).toBeInstanceOf(GooglePlayClient);
    });

    it('should initialize with credentials', async () => {
      const freshClient = new GooglePlayClient(mockCredentials);
      await expect(freshClient.initialize()).resolves.not.toThrow();
    });
  });

  describe('App Operations', () => {
    it('should get app details', async () => {
      mockEditsGet.mockResolvedValue({
        data: {
          id: 'com.test.app',
          appName: 'Test App',
          defaultLanguage: 'en-US',
        },
      });

      const app = await client.getApp('com.test.app');

      expect(app).toEqual({
        packageName: 'com.test.app',
        appName: 'Test App',
        defaultLanguage: 'en-US',
      });
    });
  });

  describe('Build Upload', () => {
    it('should validate platform for uploads', async () => {
      const artifact: BuildArtifact = {
        filePath: '/path/to/build.ipa',
        platform: 'ios', // Invalid for Google
        version: '1.0.0',
        buildNumber: '42',
      };

      const appMetadata: GoogleAppMetadata = {
        packageName: 'com.test.app',
        appName: 'Test App',
        defaultLanguage: 'en-US',
      };

      await expect(client.uploadBuild(artifact, appMetadata)).rejects.toThrow(
        'Invalid platform for Google Play upload'
      );
    });

    it('should rollback edit on upload error', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-123' },
      });

      mockBundlesUpload.mockRejectedValue(new Error('Upload failed'));
      mockEditsDelete.mockResolvedValue({});

      const artifact: BuildArtifact = {
        filePath: '/path/to/app.aab',
        platform: 'android',
        version: '1.0.0',
        buildNumber: '42',
      };

      const appMetadata: GoogleAppMetadata = {
        packageName: 'com.test.app',
        appName: 'Test App',
        defaultLanguage: 'en-US',
      };

      await expect(client.uploadBuild(artifact, appMetadata)).rejects.toThrow();

      // Verify rollback was called
      expect(mockEditsDelete).toHaveBeenCalledWith({
        packageName: 'com.test.app',
        editId: 'edit-123',
      });
    });
  });

  describe('Track Management', () => {
    it('should get track information', async () => {
      mockTracksGet.mockResolvedValue({
        data: {
          track: 'internal',
          releases: [
            {
              status: 'completed',
              userFraction: 1.0,
              versionCodes: ['42', '43'],
            },
          ],
        },
      });

      const track = await client.getTrack('com.test.app', 'internal');

      expect(track).toEqual({
        track: 'internal',
        status: 'completed',
        userFraction: 1.0,
        versionCodes: [42, 43],
      });
    });

    it('should list all tracks', async () => {
      mockTracksList.mockResolvedValue({
        data: {
          tracks: [
            {
              track: 'internal',
              releases: [
                {
                  status: 'completed',
                  versionCodes: ['42'],
                },
              ],
            },
            {
              track: 'production',
              releases: [
                {
                  status: 'completed',
                  versionCodes: ['41'],
                },
              ],
            },
          ],
        },
      });

      const tracks = await client.listTracks('com.test.app');

      expect(tracks).toHaveLength(2);
      expect(tracks[0].track).toBe('internal');
      expect(tracks[1].track).toBe('production');
    });

    it('should promote release between tracks', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-123' },
      });

      mockTracksUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({});

      await expect(
        client.promoteRelease('com.test.app', 'internal', 'alpha', [42, 43])
      ).resolves.not.toThrow();

      expect(mockEditsCommit).toHaveBeenCalled();
    });

    it('should update rollout percentage', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-123' },
      });

      mockTracksUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({});

      await expect(client.updateRollout('com.test.app', [42], 0.5)).resolves.not.toThrow();

      expect(mockTracksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            releases: expect.arrayContaining([
              expect.objectContaining({
                userFraction: 0.5,
              }),
            ]),
          }),
        })
      );
    });

    it('should validate rollout percentage bounds', async () => {
      await expect(client.updateRollout('com.test.app', [42], 1.5)).rejects.toThrow(
        'userFraction must be between 0 and 1'
      );

      await expect(client.updateRollout('com.test.app', [42], -0.1)).rejects.toThrow(
        'userFraction must be between 0 and 1'
      );
    });
  });

  describe('Rollout Halt', () => {
    it('should halt a staged rollout', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-halt' },
      });

      mockTracksUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({});

      await expect(client.haltRollout('com.test.app', [42, 43])).resolves.not.toThrow();

      expect(mockTracksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          track: 'production',
          requestBody: expect.objectContaining({
            releases: expect.arrayContaining([
              expect.objectContaining({
                status: 'halted',
              }),
            ]),
          }),
        })
      );

      expect(mockEditsCommit).toHaveBeenCalledWith({
        packageName: 'com.test.app',
        editId: 'edit-halt',
      });
    });

    it('should rollback on halt error', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-halt' },
      });

      mockTracksUpdate.mockRejectedValue(new Error('Halt failed'));
      mockEditsDelete.mockResolvedValue({});

      await expect(client.haltRollout('com.test.app', [42])).rejects.toThrow('Halt failed');

      expect(mockEditsDelete).toHaveBeenCalledWith({
        packageName: 'com.test.app',
        editId: 'edit-halt',
      });
    });
  });

  describe('Deobfuscation File Upload', () => {
    it('should upload deobfuscation file', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-deob' },
      });

      mockDeobfuscationUpload.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({});

      await expect(
        client.uploadDeobfuscationFile('com.test.app', 42, '/path/to/mapping.txt')
      ).resolves.not.toThrow();

      expect(mockDeobfuscationUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'com.test.app',
          editId: 'edit-deob',
          apkVersionCode: 42,
          deobfuscationFileType: 'proguard',
        })
      );
    });

    it('should rollback on deobfuscation upload error', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-deob' },
      });

      mockDeobfuscationUpload.mockRejectedValue(new Error('Deobfuscation upload failed'));
      mockEditsDelete.mockResolvedValue({});

      await expect(
        client.uploadDeobfuscationFile('com.test.app', 42, '/path/to/mapping.txt')
      ).rejects.toThrow('Deobfuscation upload failed');

      expect(mockEditsDelete).toHaveBeenCalledWith({
        packageName: 'com.test.app',
        editId: 'edit-deob',
      });
    });
  });

  describe('Store Listing', () => {
    it('should update store listing', async () => {
      mockEditsInsert.mockResolvedValue({
        data: { id: 'edit-123' },
      });

      mockListingsUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({});

      await expect(
        client.updateListing('com.test.app', 'en-US', {
          title: 'New Title',
          shortDescription: 'Short desc',
          fullDescription: 'Full desc',
        })
      ).resolves.not.toThrow();

      expect(mockListingsUpdate).toHaveBeenCalledWith({
        packageName: 'com.test.app',
        editId: 'edit-123',
        language: 'en-US',
        requestBody: {
          title: 'New Title',
          shortDescription: 'Short desc',
          fullDescription: 'Full desc',
        },
      });
    });
  });

  describe('Review Status', () => {
    it('should get review status', async () => {
      mockReviewsList.mockResolvedValue({
        data: {
          reviews: [
            {
              reviewId: 'review-1',
              authorName: 'Test User',
              comments: [],
            },
          ],
        },
      });

      const reviews = await client.getReviewStatus('com.test.app');

      expect(Array.isArray(reviews)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockEditsGet.mockRejectedValue(new Error('API Error'));

      await expect(client.getApp('com.test.app')).rejects.toThrow('API Error');
    });
  });
});
