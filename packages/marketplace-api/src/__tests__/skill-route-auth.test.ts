import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthService, type UserPayload } from '@holoscript/auth';
import {
  InMemorySkillDatabase,
  SkillDownloadStatsTracker,
  SkillMarketplaceService,
  SkillRatingService,
} from '../SkillMarketplaceService.js';
import { createSkillMarketplaceRoutes } from '../skillRoutes.js';
import { sharedAuth } from '../routes.js';
import type { SkillPublishRequest } from '../types.js';

const owner: UserPayload = {
  id: 'owner-1',
  email: 'owner@example.com',
  roles: ['user'],
  permissions: [],
};

const otherUser: UserPayload = {
  id: 'other-2',
  email: 'other@example.com',
  roles: ['user'],
  permissions: [],
};

const forgedAuth = new AuthService({ jwtSecret: 'forged-secret-not-jwt-secret' });

function makePublishRequest(name = 'Owned Workflow'): SkillPublishRequest {
  return {
    name,
    version: '1.0.0',
    description: 'Workflow used to verify skill publish authorization',
    category: 'workflow',
    targetPlatform: 'claude',
    entrypoint: 'SKILL.md',
    files: [
      {
        path: 'SKILL.md',
        content: '# Owned Workflow',
        mimeType: 'text/markdown',
        sizeBytes: 16,
      },
    ],
    license: 'MIT',
    keywords: ['auth'],
    pricingModel: 'free',
    price: 0,
    permissions: ['read_files'],
    sandboxed: true,
  };
}

function publishBody(name = 'Owned Workflow'): Record<string, unknown> {
  return {
    ...makePublishRequest(name),
    author: {
      name: 'pretend-author',
      email: 'pretend@example.com',
      verified: true,
    },
  };
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function algNoneToken(user: UserPayload): string {
  const header = encodeJson({ alg: 'none', typ: 'JWT' });
  const payload = encodeJson(user);
  return `${header}.${payload}.`;
}

function garbageSignatureToken(user: UserPayload): string {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson(user);
  return `${header}.${payload}.not-a-valid-signature`;
}

function createService(): SkillMarketplaceService {
  return new SkillMarketplaceService(
    new InMemorySkillDatabase(),
    new SkillDownloadStatsTracker(),
    new SkillRatingService()
  );
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function appFor(service: SkillMarketplaceService): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/skills', createSkillMarketplaceRoutes(service));
  return app;
}

describe('skill publish and delete JWT auth', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    const closingServer = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      closingServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function start(): Promise<string> {
    const listener = await listen(appFor(createService()));
    server = listener.server;
    return listener.baseUrl;
  }

  async function publish(
    baseUrl: string,
    token?: string,
    name = 'Owned Workflow'
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/skills/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(publishBody(name)),
    });
  }

  async function searchTotal(baseUrl: string, name: string): Promise<number> {
    const response = await fetch(
      `${baseUrl}/api/v1/skills/search?q=${encodeURIComponent(name)}`
    );
    const body = (await response.json()) as { data: { total: number } };
    return body.data.total;
  }

  async function publishOwned(baseUrl: string): Promise<string> {
    const response = await publish(baseUrl, sharedAuth.generateToken(owner));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { skillId: string } };
    return body.data.skillId;
  }

  it('rejects skill publish when the bearer token is missing', async () => {
    const baseUrl = await start();
    const response = await publish(baseUrl);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(await searchTotal(baseUrl, 'Owned Workflow')).toBe(0);
  });

  it('rejects skill publish for a token signed with a different secret', async () => {
    const baseUrl = await start();
    const response = await publish(baseUrl, forgedAuth.generateToken(owner));
    expect(response.status).toBe(401);
    expect(await searchTotal(baseUrl, 'Owned Workflow')).toBe(0);
  });

  it('rejects skill publish for an unsigned alg none token', async () => {
    const baseUrl = await start();
    const response = await publish(baseUrl, algNoneToken(owner));
    expect(response.status).toBe(401);
    expect(await searchTotal(baseUrl, 'Owned Workflow')).toBe(0);
  });

  it('rejects skill publish for a token with a garbage signature', async () => {
    const baseUrl = await start();
    const response = await publish(baseUrl, garbageSignatureToken(owner));
    expect(response.status).toBe(401);
    expect(await searchTotal(baseUrl, 'Owned Workflow')).toBe(0);
  });

  it('records the verified user as author and ignores a body author', async () => {
    const baseUrl = await start();
    const response = await publish(baseUrl, sharedAuth.generateToken(owner));
    expect(response.status).toBe(201);
    const published = (await response.json()) as { data: { skillId: string } };

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${published.data.skillId}`);
    expect(skillResponse.status).toBe(200);
    const skill = (await skillResponse.json()) as {
      data: { author: { name: string; email?: string; verified: boolean } };
    };
    expect(skill.data.author.name).toBe(owner.id);
    expect(skill.data.author.email).toBe(owner.email);
    expect(skill.data.author.verified).toBe(false);
    expect(skill.data.author.name).not.toBe('pretend-author');
  });

  it('rejects skill delete when the bearer token is missing and keeps the skill', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, { method: 'DELETE' });
    expect(response.status).toBe(401);

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(200);
  });

  it('rejects skill delete for a token signed with a different secret', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${forgedAuth.generateToken(owner)}` },
    });
    expect(response.status).toBe(401);

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(200);
  });

  it('rejects skill delete for an unsigned alg none token', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${algNoneToken(owner)}` },
    });
    expect(response.status).toBe(401);

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(200);
  });

  it('rejects skill delete for a token with a garbage signature', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${garbageSignatureToken(otherUser)}` },
    });
    expect(response.status).toBe(401);

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(200);
  });

  it('rejects skill delete for a verified token belonging to a different user', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${sharedAuth.generateToken(otherUser)}` },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(200);
    const skill = (await skillResponse.json()) as { data: { author: { name: string } } };
    expect(skill.data.author.name).toBe(owner.id);
  });

  it('deletes a skill for the verified owner', async () => {
    const baseUrl = await start();
    const skillId = await publishOwned(baseUrl);

    const response = await fetch(`${baseUrl}/api/v1/skills/${skillId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${sharedAuth.generateToken(owner)}` },
    });
    expect(response.status).toBe(204);

    const skillResponse = await fetch(`${baseUrl}/api/v1/skills/${skillId}`);
    expect(skillResponse.status).toBe(404);
  });

  it('returns 401 for an unknown skill when the token is missing', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/v1/skills/skill-does-not-exist`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown skill only after the token verifies', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/v1/skills/skill-does-not-exist`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${sharedAuth.generateToken(owner)}` },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
