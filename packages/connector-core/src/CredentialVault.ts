export interface CredentialVault {
    /**
     * Store a credential securely.
     */
    store(key: string, value: string): Promise<void>;

    /**
     * Retrieve a credential by generic key.
     */
    retrieve(key: string): Promise<string | null>;

    /**
     * Revoke and destroy a credential.
     */
    revoke(key: string): Promise<void>;

    /**
     * Refresh an expiring token like an OAuth token.
     */
    refresh(key: string): Promise<string | null>;
}
