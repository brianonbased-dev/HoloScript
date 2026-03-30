import { google } from 'googleapis';
import {
  GoogleCredentials,
  GoogleAppMetadata,
  GooglePlayTrack,
  BuildArtifact,
  UploadProgress,
} from './types.js';
import { createReadStream, statSync } from 'fs';

/**
 * Google Play Developer API client
 *
 * Handles:
 * - Service account authentication
 * - APK/AAB build upload
 * - Internal/Alpha/Beta/Production track management
 * - Release rollout control
 * - Store listing metadata
 *
 * Requires:
 * - Google Cloud service account with Google Play Developer API access
 * - Service account JSON key file
 */
export class GooglePlayClient {
  private credentials: GoogleCredentials;
  private publisher: any;
  private auth: any;

  constructor(credentials: GoogleCredentials) {
    this.credentials = credentials;
  }

  /**
   * Initialize Google Play API client with service account auth
   */
  async initialize(): Promise<void> {
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: this.credentials.clientEmail,
        private_key: this.credentials.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const authClient = await this.auth.getClient();

    this.publisher = google.androidpublisher({
      version: 'v3',
      auth: authClient,
    });
  }

  /**
   * Get app details by package name
   */
  async getApp(packageName: string): Promise<GoogleAppMetadata> {
    const response = await this.publisher.edits.get({
      packageName,
      editId: 'current',
    });

    return {
      packageName: response.data.id,
      appName: response.data.appName || packageName,
      defaultLanguage: response.data.defaultLanguage || 'en-US',
    };
  }

  /**
   * Upload build artifact to Google Play
   *
   * Steps:
   * 1. Create new edit session
   * 2. Upload APK or AAB
   * 3. Assign to track
   * 4. Commit edit
   */
  async uploadBuild(
    artifact: BuildArtifact,
    appMetadata: GoogleAppMetadata,
    track: 'internal' | 'alpha' | 'beta' | 'production' = 'internal',
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ versionCode: number; editId: string }> {
    if (artifact.platform !== 'android') {
      throw new Error(`Invalid platform for Google Play upload: ${artifact.platform}`);
    }

    // Step 1: Create edit session
    const editResponse = await this.publisher.edits.insert({
      packageName: appMetadata.packageName,
    });

    const editId = editResponse.data.id;

    try {
      // Step 2: Upload APK or AAB based on file extension
      const fileStats = statSync(artifact.filePath);
      const totalBytes = fileStats.size;

      if (onProgress) {
        onProgress({ bytesUploaded: 0, totalBytes, percentage: 0, status: 'Starting upload...' });
      }

      const fileExtension = artifact.filePath.toLowerCase();
      let uploadResponse;

      if (fileExtension.endsWith('.aab')) {
        // Upload Android App Bundle
        uploadResponse = await this.publisher.edits.bundles.upload(
          {
            packageName: appMetadata.packageName,
            editId,
            media: {
              mimeType: 'application/octet-stream',
              body: createReadStream(artifact.filePath),
            },
          },
          {
            onUploadProgress: (evt: any) => {
              if (onProgress && evt.bytesRead) {
                onProgress({
                  bytesUploaded: evt.bytesRead,
                  totalBytes,
                  percentage: Math.round((evt.bytesRead / totalBytes) * 100),
                  status: 'Uploading bundle...',
                });
              }
            },
          }
        );
      } else if (fileExtension.endsWith('.apk')) {
        // Upload APK
        uploadResponse = await this.publisher.edits.apks.upload(
          {
            packageName: appMetadata.packageName,
            editId,
            media: {
              mimeType: 'application/vnd.android.package-archive',
              body: createReadStream(artifact.filePath),
            },
          },
          {
            onUploadProgress: (evt: any) => {
              if (onProgress && evt.bytesRead) {
                onProgress({
                  bytesUploaded: evt.bytesRead,
                  totalBytes,
                  percentage: Math.round((evt.bytesRead / totalBytes) * 100),
                  status: 'Uploading APK...',
                });
              }
            },
          }
        );
      } else {
        throw new Error('Invalid file type. Must be .apk or .aab');
      }

      const versionCode = uploadResponse.data.versionCode;

      if (onProgress) {
        onProgress({
          bytesUploaded: totalBytes,
          totalBytes,
          percentage: 100,
          status: 'Assigning to track...',
        });
      }

      // Step 3: Assign to track
      await this.assignToTrack(
        appMetadata.packageName,
        editId,
        track,
        [versionCode],
        artifact.releaseNotes
      );

      // Step 4: Commit edit
      await this.publisher.edits.commit({
        packageName: appMetadata.packageName,
        editId,
      });

      if (onProgress) {
        onProgress({
          bytesUploaded: totalBytes,
          totalBytes,
          percentage: 100,
          status: 'Upload complete',
        });
      }

      return { versionCode, editId };
    } catch (error) {
      // Rollback edit on error
      try {
        await this.publisher.edits.delete({
          packageName: appMetadata.packageName,
          editId,
        });
      } catch (deleteError) {
        // Ignore delete errors
      }

      throw error;
    }
  }

  /**
   * Assign version codes to a specific track
   */
  private async assignToTrack(
    packageName: string,
    editId: string,
    track: string,
    versionCodes: number[],
    releaseNotes?: string
  ): Promise<void> {
    const releases = [
      {
        versionCodes: versionCodes.map(String),
        status: 'completed',
        releaseNotes: releaseNotes
          ? [
              {
                language: 'en-US',
                text: releaseNotes,
              },
            ]
          : undefined,
      },
    ];

    await this.publisher.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        track,
        releases,
      },
    });
  }

  /**
   * Get track information (internal, alpha, beta, production)
   */
  async getTrack(packageName: string, track: string): Promise<GooglePlayTrack> {
    const response = await this.publisher.edits.tracks.get({
      packageName,
      editId: 'current',
      track,
    });

    const releases = response.data.releases || [];
    const latestRelease = releases[0];

    return {
      track: track as any,
      status: latestRelease?.status || 'draft',
      userFraction: latestRelease?.userFraction,
      versionCodes: latestRelease?.versionCodes?.map((v: string) => parseInt(v, 10)) || [],
    };
  }

  /**
   * List all tracks for an app
   */
  async listTracks(packageName: string): Promise<GooglePlayTrack[]> {
    const response = await this.publisher.edits.tracks.list({
      packageName,
      editId: 'current',
    });

    return (response.data.tracks || []).map((track: any) => {
      const latestRelease = track.releases?.[0];

      return {
        track: track.track,
        status: latestRelease?.status || 'draft',
        userFraction: latestRelease?.userFraction,
        versionCodes: latestRelease?.versionCodes?.map((v: string) => parseInt(v, 10)) || [],
      };
    });
  }

  /**
   * Promote a release from one track to another
   * Example: internal -> alpha -> beta -> production
   */
  async promoteRelease(
    packageName: string,
    fromTrack: string,
    toTrack: string,
    versionCodes: number[]
  ): Promise<void> {
    const editResponse = await this.publisher.edits.insert({
      packageName,
    });

    const editId = editResponse.data.id;

    try {
      // Assign version codes to destination track
      await this.assignToTrack(packageName, editId, toTrack, versionCodes);

      // Commit changes
      await this.publisher.edits.commit({
        packageName,
        editId,
      });
    } catch (error) {
      // Rollback on error
      try {
        await this.publisher.edits.delete({ packageName, editId });
      } catch {
        // Ignore delete errors
      }

      throw error;
    }
  }

  /**
   * Update staged rollout percentage (0-100)
   * Only applicable for production track
   */
  async updateRollout(
    packageName: string,
    versionCodes: number[],
    userFraction: number
  ): Promise<void> {
    if (userFraction < 0 || userFraction > 1) {
      throw new Error('userFraction must be between 0 and 1');
    }

    const editResponse = await this.publisher.edits.insert({
      packageName,
    });

    const editId = editResponse.data.id;

    try {
      await this.publisher.edits.tracks.update({
        packageName,
        editId,
        track: 'production',
        requestBody: {
          track: 'production',
          releases: [
            {
              versionCodes: versionCodes.map(String),
              status: 'inProgress',
              userFraction,
            },
          ],
        },
      });

      await this.publisher.edits.commit({
        packageName,
        editId,
      });
    } catch (error) {
      try {
        await this.publisher.edits.delete({ packageName, editId });
      } catch {
        // Ignore
      }

      throw error;
    }
  }

  /**
   * Update app store listing metadata
   */
  async updateListing(
    packageName: string,
    language: string,
    listing: {
      title?: string;
      shortDescription?: string;
      fullDescription?: string;
      video?: string;
    }
  ): Promise<void> {
    const editResponse = await this.publisher.edits.insert({
      packageName,
    });

    const editId = editResponse.data.id;

    try {
      await this.publisher.edits.listings.update({
        packageName,
        editId,
        language,
        requestBody: listing,
      });

      await this.publisher.edits.commit({
        packageName,
        editId,
      });
    } catch (error) {
      try {
        await this.publisher.edits.delete({ packageName, editId });
      } catch {
        // Ignore
      }

      throw error;
    }
  }

  /**
   * Upload deobfuscation (ProGuard/R8 mapping) file for a specific version code.
   *
   * This enables readable crash reports in the Play Console.
   * Should be called after uploadBuild with the resulting versionCode.
   */
  async uploadDeobfuscationFile(
    packageName: string,
    versionCode: number,
    mappingFilePath: string
  ): Promise<void> {
    const editResponse = await this.publisher.edits.insert({
      packageName,
    });

    const editId = editResponse.data.id;

    try {
      await this.publisher.edits.deobfuscationfiles.upload({
        packageName,
        editId,
        apkVersionCode: versionCode,
        deobfuscationFileType: 'proguard',
        media: {
          mimeType: 'application/octet-stream',
          body: createReadStream(mappingFilePath),
        },
      });

      await this.publisher.edits.commit({
        packageName,
        editId,
      });
    } catch (error) {
      try {
        await this.publisher.edits.delete({ packageName, editId });
      } catch {
        // Ignore rollback errors
      }

      throw error;
    }
  }

  /**
   * Halt a staged rollout on the production track.
   *
   * Stops the progressive rollout and prevents additional users from
   * receiving the release. Existing users keep the update.
   */
  async haltRollout(packageName: string, versionCodes: number[]): Promise<void> {
    const editResponse = await this.publisher.edits.insert({
      packageName,
    });

    const editId = editResponse.data.id;

    try {
      await this.publisher.edits.tracks.update({
        packageName,
        editId,
        track: 'production',
        requestBody: {
          track: 'production',
          releases: [
            {
              versionCodes: versionCodes.map(String),
              status: 'halted',
            },
          ],
        },
      });

      await this.publisher.edits.commit({
        packageName,
        editId,
      });
    } catch (error) {
      try {
        await this.publisher.edits.delete({ packageName, editId });
      } catch {
        // Ignore
      }

      throw error;
    }
  }

  /**
   * Get review status for the app
   */
  async getReviewStatus(packageName: string): Promise<any> {
    const response = await this.publisher.reviews.list({
      packageName,
      maxResults: 1,
    });

    return response.data.reviews || [];
  }
}
