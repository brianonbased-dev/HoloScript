import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { Wallet } from 'ethers';

const HANDLE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

export interface ProvisionRequest {
  handle: string;
  meshApiBase?: string;
  founderBearer: string;
  seatsRoot?: string;
  fetchImpl?: typeof fetch;
  autoJoinTeamId?: string;
}

export interface ProvisionDryRun {
  status: 'dry-run';
  handle: string;
  surface: string;
  seatId: string;
  seatDir: string;
  willGenerateWallet: boolean;
  willCallEndpoints: string[];
}

export interface ProvisionExecuted {
  status: 'executed' | 'reused';
  handle: string;
  surface: string;
  seatId: string;
  seatDir: string;
  walletAddress: string;
  bearer?: string;
  agentId?: string;
  envVarLines: string[];
  joinedTeam?: { teamId: string; role: string; members: number } | { teamId: string; error: string };
}

export type ProvisionResult = ProvisionDryRun | ProvisionExecuted;

const EIP712_DOMAIN = { name: 'HoloMesh', version: '1' };
const EIP712_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  Registration: [{ name: 'nonce', type: 'string' }],
};

export async function provisionAgent(
  req: ProvisionRequest,
  opts: { execute: boolean; force?: boolean } = { execute: false }
): Promise<ProvisionResult> {
  if (!HANDLE_PATTERN.test(req.handle)) {
    throw new Error(`handle "${req.handle}" must match ${HANDLE_PATTERN}`);
  }
  if (!req.founderBearer || req.founderBearer.trim().length === 0) {
    throw new Error('founderBearer is required (HOLOMESH_API_KEY of an agent that can call /register)');
  }

  const meshApiBase = (req.meshApiBase ?? 'https://mcp.holoscript.net/api/holomesh').replace(/\/$/, '');
  const seatsRoot = req.seatsRoot ?? defaultSeatsRoot();
  const surface = req.handle;
  const seatId = makeSeatId(surface);
  const seatDir = join(seatsRoot, seatId);
  const walletPath = join(seatDir, 'wallet.enc');
  const regPath = join(seatDir, 'registration.json');

  if (!opts.execute) {
    return {
      status: 'dry-run',
      handle: req.handle,
      surface,
      seatId,
      seatDir,
      willGenerateWallet: !existsSync(walletPath),
      willCallEndpoints: [
        `POST ${meshApiBase}/register/challenge`,
        `POST ${meshApiBase}/register`,
      ],
    };
  }

  if (existsSync(walletPath) && !opts.force) {
    const blob = JSON.parse(readFileSync(walletPath, 'utf8')) as { address: string };
    const reused: ProvisionExecuted = {
      status: 'reused',
      handle: req.handle,
      surface,
      seatId,
      seatDir,
      walletAddress: blob.address,
      envVarLines: envVarLinesFor(req.handle, blob.address, undefined),
    };
    return reused;
  }

  const wallet = Wallet.createRandom();
  mkdirSync(seatDir, { recursive: true });

  const masterKey = ensureMasterKey(seatsRoot);
  const encryptedBlob = {
    seat_id: seatId,
    surface,
    handle: req.handle,
    address: wallet.address,
    encrypted_privkey: encryptPrivateKey(wallet.privateKey, masterKey),
    created_at: new Date().toISOString(),
    source: 'holoscript-agent.provision',
  };
  writeFileSync(walletPath, JSON.stringify(encryptedBlob, null, 2), 'utf8');
  try { chmodSync(walletPath, 0o600); } catch {}

  const fetchImpl = req.fetchImpl ?? fetch;

  const challenge = await postJson<{ nonce: string }>(
    fetchImpl,
    `${meshApiBase}/register/challenge`,
    req.founderBearer,
    { wallet_address: wallet.address }
  );
  if (!challenge.nonce) {
    throw new Error(`/register/challenge returned no nonce: ${JSON.stringify(challenge)}`);
  }

  const signature = await wallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, { nonce: challenge.nonce });

  const registration = await postJson<{
    agent?: { id: string; api_key: string };
    wallet?: { private_key?: string };
  }>(
    fetchImpl,
    `${meshApiBase}/register`,
    req.founderBearer,
    {
      name: req.handle,
      wallet_address: wallet.address,
      nonce: challenge.nonce,
      signature,
    }
  );
  writeFileSync(
    regPath,
    JSON.stringify({ status: 201, response: registration, registered_at: new Date().toISOString(), flow: 'x402' }, null, 2),
    'utf8'
  );

  const agentId = registration.agent?.id;
  const bearer = registration.agent?.api_key;
  if (!agentId || !bearer) {
    throw new Error(`/register did not return agent.id + agent.api_key: ${JSON.stringify(registration).slice(0, 400)}`);
  }
  if (registration.wallet?.private_key) {
    console.warn('[provision] WARN — server returned private_key despite x402 flow; ignoring (using local key).');
  }

  let joinedTeam: ProvisionExecuted['joinedTeam'];
  if (req.autoJoinTeamId) {
    try {
      const joinRes = await postJson<{ success?: boolean; role?: string; members?: number }>(
        fetchImpl,
        `${meshApiBase}/team/${req.autoJoinTeamId}/join`,
        bearer,
        {}
      );
      joinedTeam = {
        teamId: req.autoJoinTeamId,
        role: joinRes.role ?? 'member',
        members: joinRes.members ?? 0,
      };
    } catch (err) {
      joinedTeam = {
        teamId: req.autoJoinTeamId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    status: 'executed',
    handle: req.handle,
    surface,
    seatId,
    seatDir,
    walletAddress: wallet.address,
    bearer,
    agentId,
    envVarLines: envVarLinesFor(req.handle, wallet.address, bearer),
    joinedTeam,
  };
}

function defaultSeatsRoot(): string {
  return process.env.HOLOSCRIPT_AGENT_SEATS_ROOT
    ?? join(homedir(), '.holoscript-agent', 'seats');
}

function makeSeatId(surface: string): string {
  const fp = createHash('sha256').update(hostname() + homedir()).digest('hex').slice(0, 8);
  return `holoscript-${surface}-${fp}-x402`;
}

function ensureMasterKey(seatsRoot: string): Buffer {
  const keyPath = join(seatsRoot, '.master-key');
  if (!existsSync(seatsRoot)) mkdirSync(seatsRoot, { recursive: true });
  if (!existsSync(keyPath)) {
    const k = randomBytes(32);
    writeFileSync(keyPath, k);
    try { chmodSync(keyPath, 0o600); } catch {}
  }
  return readFileSync(keyPath);
}

function encryptPrivateKey(
  privKey: string,
  masterKey: Buffer
): { iv: string; ct: string; tag: string; alg: 'aes-256-gcm' } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([cipher.update(privKey, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64'), alg: 'aes-256-gcm' };
}

async function postJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  bearer: string,
  body: unknown
): Promise<T> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${url} ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`POST ${url} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function envVarLinesFor(handle: string, walletAddress: string, bearer?: string): string[] {
  const suffix = handle.toUpperCase().replace(/-/g, '_');
  const lines = [`HOLOSCRIPT_AGENT_WALLET_${suffix}=${walletAddress}`];
  if (bearer) {
    lines.push(`HOLOMESH_API_KEY_${suffix}_X402=${bearer}`);
  }
  return lines;
}
