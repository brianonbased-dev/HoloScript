/**
 * Local file storage service for builds and user data
 */
export interface StoredBuild {
    id: string;
    userId: string;
    name: string;
    code: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}
export declare class StorageService {
    basePath: string;
    private buildsPath;
    private usersPath;
    constructor(basePath: string);
    init(): Promise<void>;
    saveBuild(userId: string, build: Omit<StoredBuild, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredBuild>;
    getBuild(id: string, userId: string): Promise<StoredBuild | null>;
    getBuildsByUser(userId: string): Promise<StoredBuild[]>;
    deleteBuild(id: string, userId: string): Promise<boolean>;
    writeJSON(filePath: string, data: any): Promise<void>;
    readJSON(filePath: string): Promise<any>;
}
