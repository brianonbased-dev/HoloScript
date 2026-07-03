import { spawnSync } from 'node:child_process';
import { createDecipheriv, type DecipherGCM } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { buildPortableMind as buildPortableMindFn } from '@holoscript/holoscript-agent/portable-mind';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { seatIdCandidatesForAgent } from './seatIds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MESH_API_BASE = 'https://mcp.holoscript.net/api/holomesh';
const MEMORY_LIMIT = 50;
const PRIVATE_KEY_RE = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const AGENT_ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/u;

type RouteContext = { params: Promise<{ agentId?: string }> };

type MindIdentity = {
  wallet?: string;
  agentId?: string;
};

type MindMemory = {
  id?: string;
  content: string;
  score?: number;
};

type SeatWallet = {
  privateKey: string;
  seatId?: string;
};

type BuildPortableMind = typeof buildPortableMindFn;

export async function GET(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const params = await context.params;
  const agentId = String(params.agentId ?? '').trim();
  if (!AGENT_ID_RE.test(agentId)) {
    return NextResponse.json({ error: 'invalid agentId' }, { status: 400 });
  }

  const teamId = process.env.PORTABLE_MIND_TEAM_ID ?? process.env.HOLOMESH_TEAM_ID;
  if (!teamId) {
    return NextResponse.json({ error: 'portable mind team is not configured' }, { status: 503 });
  }

  const seat = resolvePortableMindSeat(agentId, process.env);
  if (!seat) {
    return NextResponse.json(
      { error: 'portable mind seat is not configured', agentId },
      { status: 503 }
    );
  }

  try {
    const buildPortableMind = await loadBuildPortableMind();
    const mind = await buildPortableMind({
      privateKey: seat.privateKey,
      bearer: resolvePortableMindBearer(agentId, process.env),
      meshApiBase:
        process.env.PORTABLE_MIND_MESH_API_BASE ??
        process.env.HOLOMESH_API_BASE ??
        DEFAULT_MESH_API_BASE,
      teamId,
      agentId,
      localKnowledgePath:
        process.env.PORTABLE_MIND_LOCAL_KNOWLEDGE_PATH ??
        process.env.HOLOSCRIPT_AGENT_LOCAL_KNOWLEDGE_PATH,
    });

    const identity = mind.identity() as MindIdentity;
    const memories = (await mind.loadMemory(undefined, MEMORY_LIMIT))
      .map(toPublicMemory)
      .filter((entry): entry is MindMemory => entry !== null);

    return NextResponse.json(
      {
        identity: {
          wallet: identity.wallet ?? null,
          agentId: identity.agentId ?? agentId,
        },
        memories,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'portable mind load failed',
        detail: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 502 }
    );
  }
}

async function loadBuildPortableMind(): Promise<BuildPortableMind> {
  const mod = (await import(
    /* webpackIgnore: true */ '@holoscript/holoscript-agent/portable-mind'
  )) as {
    buildPortableMind: BuildPortableMind;
  };
  return mod.buildPortableMind;
}

function resolvePortableMindSeat(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): SeatWallet | null {
  const privateKey = normalizePrivateKey(firstSecret(privateKeySecretNames(agentId), agentId, env));
  if (privateKey) return { privateKey };

  return loadEncryptedSeatWallet(agentId, env);
}

function resolvePortableMindBearer(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return firstSecret(bearerSecretNames(agentId), agentId, env);
}

function loadEncryptedSeatWallet(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): SeatWallet | null {
  for (const root of seatRoots(env)) {
    for (const seatId of seatIdCandidatesForAgent(agentId, env)) {
      const walletPath = join(root, seatId, 'wallet.enc');
      const masterKeyPath =
        env.PORTABLE_MIND_SEAT_MASTER_KEY ??
        env.HOLOSCRIPT_AGENT_SEAT_MASTER_KEY ??
        join(root, '.master-key');
      if (!existsSync(walletPath) || !existsSync(masterKeyPath)) continue;

      const privateKey = decryptWalletPrivateKey(walletPath, masterKeyPath);
      if (privateKey) return { privateKey, seatId };
    }
  }
  return null;
}

function decryptWalletPrivateKey(walletPath: string, masterKeyPath: string): string | null {
  try {
    const blob = JSON.parse(readFileSync(walletPath, 'utf8')) as {
      encrypted_privkey?: { iv?: string; ct?: string; tag?: string; alg?: string };
    };
    const encrypted = blob.encrypted_privkey;
    if (!encrypted?.iv || !encrypted.ct || !encrypted.tag) return null;
    const masterKey = readFileSync(masterKeyPath);
    const decipher = createDecipheriv(
      encrypted.alg ?? 'aes-256-gcm',
      masterKey,
      Buffer.from(encrypted.iv, 'base64')
    ) as DecipherGCM;
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const privateKey = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return normalizePrivateKey(privateKey);
  } catch {
    return null;
  }
}

function firstSecret(
  names: string[],
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const name of names) {
    const fromVault = resolveVaultSecret(name, agentId, env);
    if (fromVault) return fromVault;

    const fromEnv = env[name];
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  }
  return undefined;
}

function resolveVaultSecret(
  name: string,
  owner: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const bin = env.HOLOKEY_VAULT_BIN;
  if (!bin) return undefined;
  try {
    const result = spawnSync(process.execPath, [bin, 'resolve', name], {
      env: { ...env, HOLOKEY_OWNER: owner },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1 << 20,
    });
    if (result.status !== 0 || !result.stdout) return undefined;
    const value = result.stdout.replace(/\r?\n$/u, '');
    return value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

function privateKeySecretNames(agentId: string): string[] {
  const suffix = envSuffix(agentId);
  return uniqueStrings([
    `PORTABLE_MIND_WALLET_PRIVATE_KEY_${suffix}`,
    'PORTABLE_MIND_WALLET_PRIVATE_KEY',
    `HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY_${suffix}`,
    'HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY',
  ]);
}

function bearerSecretNames(agentId: string): string[] {
  const suffix = envSuffix(agentId);
  return uniqueStrings([
    `PORTABLE_MIND_X402_BEARER_${suffix}`,
    'PORTABLE_MIND_X402_BEARER',
    `HOLOSCRIPT_AGENT_X402_BEARER_${suffix}`,
    'HOLOSCRIPT_AGENT_X402_BEARER',
    `HOLOMESH_API_KEY_${suffix}_X402`,
  ]);
}

function seatRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return uniqueStrings([
    env.PORTABLE_MIND_SEATS_ROOT,
    env.HOLOSCRIPT_AGENT_SEATS_ROOT,
    env.SEAT_IDENTITY_SEATS_DIR_OVERRIDE,
    join(homedir(), '.holoscript-agent', 'seats'),
    join(homedir(), '.ai-ecosystem', 'seats'),
  ]);
}

function normalizePrivateKey(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!PRIVATE_KEY_RE.test(trimmed)) return null;
  return trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? `0x${trimmed.slice(2)}`
    : `0x${trimmed}`;
}

function toPublicMemory(entry: unknown): MindMemory | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const content = obj.content;
  if (typeof content !== 'string') return null;
  return {
    ...(typeof obj.id === 'string' ? { id: obj.id } : {}),
    content,
    ...(typeof obj.score === 'number' && Number.isFinite(obj.score) ? { score: obj.score } : {}),
  };
}

function envSuffix(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  ];
}
