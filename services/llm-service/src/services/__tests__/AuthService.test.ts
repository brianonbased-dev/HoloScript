import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from '../AuthService';
import { StorageService } from '../StorageService';

const roots: string[] = [];
const originalNodeEnv = process.env.NODE_ENV;

async function makeStorage() {
  const root = await mkdtemp(join(tmpdir(), 'llm-auth-'));
  roots.push(root);
  const storage = new StorageService(root);
  await storage.init();
  return storage;
}

afterEach(async () => {
  process.env.NODE_ENV = originalNodeEnv;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AuthService', () => {
  it('stores registered users with password hashes instead of plaintext passwords', async () => {
    const storage = await makeStorage();
    const auth = new AuthService(storage, { allowDevBootstrap: false });
    await auth.init();

    await expect(auth.registerUser('Ada', 'correct horse battery staple')).resolves.toBe(true);
    await expect(auth.authenticate('ada', 'correct horse battery staple')).resolves.toBe(true);

    const usersFile = await readFile(join(storage.basePath, 'auth', 'users.json'), 'utf-8');
    expect(usersFile).toContain('scrypt$');
    expect(usersFile).not.toContain('correct horse battery staple');
  });

  it('persists sessions across AuthService instances', async () => {
    const storage = await makeStorage();
    const auth = new AuthService(storage, { allowDevBootstrap: false });
    await auth.init();
    await auth.registerUser('Grace', 'durable-password');

    const login = await auth.login('grace', 'durable-password');
    expect(login?.token).toBeTruthy();

    const restarted = new AuthService(storage, { allowDevBootstrap: false });
    await restarted.init();
    await expect(restarted.validateBearer(login!.token)).resolves.toMatchObject({
      username: 'grace',
      role: 'user',
    });
  });

  it('fails closed in production without bootstrap users or static API keys', async () => {
    process.env.NODE_ENV = 'production';
    const storage = await makeStorage();
    const auth = new AuthService(storage, { allowDevBootstrap: false, staticApiKeys: [] });

    await expect(auth.init()).rejects.toThrow(/Production auth is fail-closed/);
  });
});
