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

/**
 * Process-local vault for tests and dev only — not for production secrets.
 */
export class InMemoryCredentialVault implements CredentialVault {
  private readonly values = new Map<string, string>();

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async retrieve(key: string): Promise<string | null> {
    const v = this.values.get(key);
    return v === undefined ? null : v;
  }

  async revoke(key: string): Promise<void> {
    this.values.delete(key);
  }

  async refresh(key: string): Promise<string | null> {
    return this.retrieve(key);
  }
}
