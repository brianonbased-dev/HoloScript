/**
 * Simple auth service
 *
 * Default credentials: user / password
 * In production, use proper authentication and password hashing
 */
import { logger } from '../utils/logger';
export class AuthService {
    constructor(storage) {
        this.validUsers = new Map([['user', 'password']]);
        this.storage = storage;
    }
    async authenticate(username, password) {
        const correctPassword = this.validUsers.get(username);
        if (!correctPassword) {
            logger.warn(`[Auth] Failed login attempt for user: ${username}`);
            return false;
        }
        if (correctPassword !== password) {
            logger.warn(`[Auth] Invalid password for user: ${username}`);
            return false;
        }
        logger.info(`[Auth] Successful login for user: ${username}`);
        return true;
    }
    async registerUser(username, password) {
        if (this.validUsers.has(username)) {
            return false;
        }
        this.validUsers.set(username, password);
        logger.info(`[Auth] New user registered: ${username}`);
        return true;
    }
}
