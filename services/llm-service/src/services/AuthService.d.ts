/**
 * Simple auth service
 *
 * Default credentials: user / password
 * In production, use proper authentication and password hashing
 */
import { StorageService } from './StorageService';
export declare class AuthService {
    private storage;
    private validUsers;
    constructor(storage: StorageService);
    authenticate(username: string, password: string): Promise<boolean>;
    registerUser(username: string, password: string): Promise<boolean>;
}
