/**
 * Local file storage service for builds and user data
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';
export class StorageService {
    constructor(basePath) {
        this.basePath = basePath;
        this.buildsPath = join(basePath, 'builds');
        this.usersPath = join(basePath, 'users');
    }
    async init() {
        try {
            await fs.mkdir(this.basePath, { recursive: true });
            await fs.mkdir(this.buildsPath, { recursive: true });
            await fs.mkdir(this.usersPath, { recursive: true });
        }
        catch (error) {
            logger.error('Storage init failed:', error);
            throw error;
        }
    }
    async saveBuild(userId, build) {
        const id = uuid();
        const now = new Date().toISOString();
        const stored = {
            id,
            ...build,
            createdAt: now,
            updatedAt: now,
        };
        const filePath = join(this.buildsPath, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(stored, null, 2));
        return stored;
    }
    async getBuild(id, userId) {
        try {
            const filePath = join(this.buildsPath, `${id}.json`);
            const data = await fs.readFile(filePath, 'utf-8');
            const build = JSON.parse(data);
            // Verify ownership
            if (build.userId !== userId) {
                return null;
            }
            return build;
        }
        catch {
            return null;
        }
    }
    async getBuildsByUser(userId) {
        try {
            const files = await fs.readdir(this.buildsPath);
            const builds = [];
            for (const file of files) {
                if (!file.endsWith('.json'))
                    continue;
                const filePath = join(this.buildsPath, file);
                const data = await fs.readFile(filePath, 'utf-8');
                const build = JSON.parse(data);
                if (build.userId === userId) {
                    builds.push(build);
                }
            }
            return builds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        catch (error) {
            logger.error('Failed to read builds:', error);
            return [];
        }
    }
    async deleteBuild(id, userId) {
        try {
            const build = await this.getBuild(id, userId);
            if (!build) {
                return false;
            }
            const filePath = join(this.buildsPath, `${id}.json`);
            await fs.unlink(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async writeJSON(filePath, data) {
        const fullPath = join(this.basePath, filePath);
        await fs.mkdir(join(fullPath, '..'), { recursive: true });
        await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
    }
    async readJSON(filePath) {
        const fullPath = join(this.basePath, filePath);
        const data = await fs.readFile(fullPath, 'utf-8');
        return JSON.parse(data);
    }
}
