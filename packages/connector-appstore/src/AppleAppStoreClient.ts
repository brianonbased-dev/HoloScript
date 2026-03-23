import jwt from 'jsonwebtoken';
import FormData from 'form-data';
import { createReadStream, statSync } from 'fs';
import { AppleCredentials, AppleAppMetadata, TestFlightBuild, BuildArtifact, UploadProgress } from './types.js';

/**
 * Apple App Store Connect REST API client
 *
 * Handles:
 * - JWT authentication with App Store Connect API
 * - Build artifact upload to App Store Connect
 * - TestFlight beta testing management
 * - App metadata management
 * - Build processing status monitoring
 *
 * Requires:
 * - App Store Connect API Key (from https://appstoreconnect.apple.com/access/api)
 * - Issuer ID and Key ID
 * - Private key (.p8 file)
 */
export class AppleAppStoreClient {
    private credentials: AppleCredentials;
    private baseUrl = 'https://api.appstoreconnect.apple.com/v1';
    private token: string | null = null;
    private tokenExpiry: number = 0;

    constructor(credentials: AppleCredentials) {
        this.credentials = credentials;
    }

    /**
     * Generate JWT token for App Store Connect API authentication
     * Token valid for 20 minutes (Apple's maximum)
     */
    private generateToken(): string {
        const now = Math.floor(Date.now() / 1000);

        // Token expires in 20 minutes (Apple's max is 20 minutes)
        const expiresIn = 20 * 60;

        const payload = {
            iss: this.credentials.issuerId,
            iat: now,
            exp: now + expiresIn,
            aud: 'appstoreconnect-v1'
        };

        const token = jwt.sign(payload, this.credentials.privateKey, {
            algorithm: 'ES256',
            header: {
                alg: 'ES256',
                kid: this.credentials.keyId,
                typ: 'JWT'
            }
        });

        this.token = token;
        this.tokenExpiry = now + expiresIn;

        return token;
    }

    /**
     * Get valid authentication token (generate new if expired)
     */
    private getToken(): string {
        const now = Math.floor(Date.now() / 1000);

        // Regenerate token if it's expired or will expire in the next minute
        if (!this.token || now >= this.tokenExpiry - 60) {
            return this.generateToken();
        }

        return this.token;
    }

    /**
     * Make authenticated request to App Store Connect API
     */
    private async makeRequest<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const token = this.getToken();

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Apple API Error (${response.status}): ${errorText}`);
        }

        return await response.json() as T;
    }

    /**
     * Get app information by bundle ID
     */
    async getApp(bundleId: string): Promise<AppleAppMetadata> {
        const response = await this.makeRequest<any>(
            `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`
        );

        if (!response.data || response.data.length === 0) {
            throw new Error(`App not found with bundle ID: ${bundleId}`);
        }

        const app = response.data[0];

        return {
            bundleId: app.attributes.bundleId,
            appId: app.id,
            name: app.attributes.name,
            primaryLocale: app.attributes.primaryLocale
        };
    }

    /**
     * Upload build artifact to App Store Connect
     *
     * Multi-step process:
     * 1. Create build upload session
     * 2. Upload binary parts
     * 3. Commit upload
     * 4. Monitor processing status
     */
    async uploadBuild(
        artifact: BuildArtifact,
        appMetadata: AppleAppMetadata,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<TestFlightBuild> {
        if (artifact.platform !== 'ios' && artifact.platform !== 'visionos') {
            throw new Error(`Invalid platform for Apple upload: ${artifact.platform}`);
        }

        // Step 1: Create upload session
        const uploadSession = await this.createUploadSession(appMetadata);

        // Step 2: Upload binary
        const fileStats = statSync(artifact.filePath);
        const totalBytes = fileStats.size;
        let bytesUploaded = 0;

        if (onProgress) {
            onProgress({ bytesUploaded: 0, totalBytes, percentage: 0, status: 'Starting upload...' });
        }

        // Upload in chunks (Apple recommends 20MB chunks)
        const chunkSize = 20 * 1024 * 1024; // 20MB
        const chunks = Math.ceil(totalBytes / chunkSize);

        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, totalBytes);

            await this.uploadChunk(uploadSession.id, artifact.filePath, start, end);

            bytesUploaded = end;

            if (onProgress) {
                onProgress({
                    bytesUploaded,
                    totalBytes,
                    percentage: Math.round((bytesUploaded / totalBytes) * 100),
                    status: `Uploading... (${i + 1}/${chunks})`
                });
            }
        }

        // Step 3: Commit upload
        await this.commitUpload(uploadSession.id);

        if (onProgress) {
            onProgress({ bytesUploaded: totalBytes, totalBytes, percentage: 100, status: 'Processing...' });
        }

        // Step 4: Wait for processing to complete
        const build = await this.waitForProcessing(uploadSession.buildId);

        return build;
    }

    /**
     * Create upload session for new build
     */
    private async createUploadSession(appMetadata: AppleAppMetadata): Promise<any> {
        return await this.makeRequest('/uploadSessions', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    type: 'uploadSessions',
                    attributes: {
                        platform: 'IOS'
                    },
                    relationships: {
                        app: {
                            data: {
                                type: 'apps',
                                id: appMetadata.appId
                            }
                        }
                    }
                }
            })
        });
    }

    /**
     * Upload a chunk of the binary file
     */
    private async uploadChunk(sessionId: string, filePath: string, start: number, end: number): Promise<void> {
        const stream = createReadStream(filePath, { start, end: end - 1 });

        const formData = new FormData();
        formData.append('file', stream);

        const response = await fetch(`${this.baseUrl}/uploadSessions/${sessionId}/parts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                ...formData.getHeaders()
            },
            body: formData as any
        });

        if (!response.ok) {
            throw new Error(`Upload chunk failed: ${response.statusText}`);
        }
    }

    /**
     * Commit upload session after all chunks uploaded
     */
    private async commitUpload(sessionId: string): Promise<void> {
        await this.makeRequest(`/uploadSessions/${sessionId}/commit`, {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    type: 'uploadSessionCommits'
                }
            })
        });
    }

    /**
     * Wait for build to finish processing
     * Poll every 30 seconds until status is VALID or INVALID
     */
    private async waitForProcessing(buildId: string, maxWaitMinutes: number = 30): Promise<TestFlightBuild> {
        const maxAttempts = (maxWaitMinutes * 60) / 30; // Poll every 30 seconds
        let attempts = 0;

        while (attempts < maxAttempts) {
            const build = await this.getBuild(buildId);

            if (build.processingState === 'VALID' || build.processingState === 'INVALID') {
                return build;
            }

            // Wait 30 seconds before next poll
            await new Promise(resolve => setTimeout(resolve, 30000));
            attempts++;
        }

        throw new Error(`Build processing timeout after ${maxWaitMinutes} minutes`);
    }

    /**
     * Get build details by ID
     */
    async getBuild(buildId: string): Promise<TestFlightBuild> {
        const response = await this.makeRequest<any>(`/builds/${buildId}`);
        const build = response.data;

        return {
            id: build.id,
            version: build.attributes.version,
            buildNumber: build.attributes.buildNumber,
            processingState: build.attributes.processingState,
            uploadedDate: build.attributes.uploadedDate,
            testFlightStatus: build.attributes.testFlightStatus
        };
    }

    /**
     * List all builds for an app
     */
    async listBuilds(appId: string, limit: number = 50): Promise<TestFlightBuild[]> {
        const response = await this.makeRequest<any>(
            `/builds?filter[app]=${appId}&limit=${limit}&sort=-uploadedDate`
        );

        return response.data.map((build: any) => ({
            id: build.id,
            version: build.attributes.version,
            buildNumber: build.attributes.buildNumber,
            processingState: build.attributes.processingState,
            uploadedDate: build.attributes.uploadedDate,
            testFlightStatus: build.attributes.testFlightStatus
        }));
    }

    /**
     * Submit build to TestFlight beta testing
     */
    async submitToTestFlight(buildId: string): Promise<void> {
        await this.makeRequest(`/builds/${buildId}/relationships/betaGroups`, {
            method: 'POST',
            body: JSON.stringify({
                data: [{
                    type: 'betaGroups',
                    id: 'internal' // Internal testing group
                }]
            })
        });
    }

    /**
     * Get TestFlight beta review status
     */
    async getBetaReviewStatus(buildId: string): Promise<any> {
        const response = await this.makeRequest<any>(`/builds/${buildId}/betaBuildLocalizations`);
        return response.data;
    }

    /**
     * Update app metadata (name, description, etc.)
     */
    async updateAppMetadata(appId: string, metadata: Partial<AppleAppMetadata>): Promise<void> {
        await this.makeRequest(`/apps/${appId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                data: {
                    type: 'apps',
                    id: appId,
                    attributes: {
                        name: metadata.name,
                        primaryLocale: metadata.primaryLocale
                    }
                }
            })
        });
    }
}
