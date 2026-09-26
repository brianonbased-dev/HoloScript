import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postGithubStatuses } from '../holo-ci-tools';

const STATUS_TOKEN_ENV_KEYS = ['PERSONAL_ACCESS_TOKEN', 'PAT_TOKEN', 'GITHUB_TOKEN'] as const;
const REPO = 'brianonbased-dev/HoloScript';
const SHA = 'b'.repeat(40);
const CONTEXT = 'holo-ci/lint';

function snapshotStatusTokenEnv(): Record<
  (typeof STATUS_TOKEN_ENV_KEYS)[number],
  string | undefined
> {
  return Object.fromEntries(STATUS_TOKEN_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof STATUS_TOKEN_ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreStatusTokenEnv(
  snapshot: Record<(typeof STATUS_TOKEN_ENV_KEYS)[number], string | undefined>
): void {
  for (const key of STATUS_TOKEN_ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function clearStatusTokenEnv(): void {
  for (const key of STATUS_TOKEN_ENV_KEYS) delete process.env[key];
}

function warnLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((args) => args.map((part) => String(part)).join(' '));
}

describe('postGithubStatuses failure logging', () => {
  let envSnapshot: Record<(typeof STATUS_TOKEN_ENV_KEYS)[number], string | undefined>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    envSnapshot = snapshotStatusTokenEnv();
    clearStatusTokenEnv();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    restoreStatusTokenEnv(envSnapshot);
    vi.unstubAllGlobals();
  });

  it('logs the env vars it checked when no status token is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postGithubStatuses(REPO, SHA, [CONTEXT, 'holo-ci/secrets'], 'pending', 'HoloCI queued')
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    const lines = warnLines(warn);
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';
    expect(line).toContain('PERSONAL_ACCESS_TOKEN');
    expect(line).toContain('PAT_TOKEN');
    expect(line).toContain('GITHUB_TOKEN');
    expect(line).toContain(REPO);
    expect(line).toContain(SHA);
    expect(line).not.toContain('\n');
  });

  it('logs HTTP status, repo, sha, context, and a truncated body on non-2xx', async () => {
    const secret = 'ghp_test_status_token_should_not_appear';
    process.env.PAT_TOKEN = secret;
    const tail = 'TAIL_MARKER_SHOULD_BE_CUT';
    const body = `Bad credentials\ntoken=${secret}\n${'y'.repeat(400)}${tail}`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postGithubStatuses(REPO, SHA, [CONTEXT], 'failure', 'gate failed')
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);

    const lines = warnLines(warn);
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';
    expect(line).toContain('401');
    expect(line).toContain(REPO);
    expect(line).toContain(SHA);
    expect(line).toContain(CONTEXT);
    expect(line).toContain('Bad credentials');
    expect(line).not.toContain(secret);
    expect(line).not.toContain(tail);
    expect(line).not.toContain('\n');
    expect(line.toLowerCase()).not.toContain('authorization');
  });

  it('logs a fetch network error per context and still resolves', async () => {
    const secret = 'ghp_network_test_token_should_not_appear';
    process.env.GITHUB_TOKEN = secret;
    const fetchMock = vi.fn().mockRejectedValue(new Error(`connect ECONNREFUSED ${secret}`));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postGithubStatuses(REPO, SHA, [CONTEXT, 'holo-ci/secrets'], 'pending', 'HoloCI queued')
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lines = warnLines(warn);
    expect(lines).toHaveLength(2);
    const joined = lines.join('\n');
    expect(joined).toContain('ECONNREFUSED');
    expect(joined).toContain(REPO);
    expect(joined).toContain(SHA);
    expect(joined).toContain(CONTEXT);
    expect(joined).toContain('holo-ci/secrets');
    expect(joined).not.toContain(secret);
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(line.toLowerCase()).not.toContain('authorization');
    }
  });

  it('does not warn when GitHub accepts the status', async () => {
    process.env.PERSONAL_ACCESS_TOKEN = 'ghp_ok_status_token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () => 'created',
      })
    );

    await expect(
      postGithubStatuses(REPO, SHA, [CONTEXT], 'pending', 'HoloCI queued')
    ).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });
});
