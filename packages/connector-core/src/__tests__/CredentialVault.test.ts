import { describe, it, expect } from 'vitest';
import { InMemoryCredentialVault } from '../CredentialVault.js';

describe('InMemoryCredentialVault', () => {
  it('stores, retrieves, revokes, and refresh returns stored value', async () => {
    const vault = new InMemoryCredentialVault();
    await vault.store('api_key', 'secret');
    expect(await vault.retrieve('api_key')).toBe('secret');
    expect(await vault.refresh('api_key')).toBe('secret');
    await vault.revoke('api_key');
    expect(await vault.retrieve('api_key')).toBeNull();
  });
});
