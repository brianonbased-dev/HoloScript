// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MigrationWizard } from '../MigrationWizard';
import type {
  ExportPackage,
  FinalizeHappyResponse,
  FinalizeReplayResponse,
  PackageResponse,
  PrepareResponse,
  SelfCustodyApiError,
  VerifyPackageOK,
} from '@/lib/self-custody-client';

// ── Test fixtures ──────────────────────────────────────────────────────────

const TEST_NONCE =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function makePrepareOk(): PrepareResponse {
  return {
    success: true,
    export_session_id: 'sess_test_1',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    nonce: TEST_NONCE,
  };
}

function makeExportPackage(): ExportPackage {
  return {
    version: 'v3.0',
    user_id: 'user_test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    encryption: {
      kdf: 'scrypt',
      kdf_params: {
        memory: 131072,
        iterations: 8,
        parallelism: 1,
        salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
      },
      cipher: 'chacha20-poly1305',
      nonce: 'bm9uY2Vub25jZW5v',
    },
    payload: 'ZmFrZXBheWxvYWQ=',
    manifest_hash:
      'sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    signature: 'ZmFrZXNpZw==',
  };
}

function makePackageOk(pkg: ExportPackage): PackageResponse {
  return {
    success: true,
    package: pkg,
    manifest_hash: pkg.manifest_hash,
  };
}

function makeFinalizeHappy(): FinalizeHappyResponse {
  return {
    success: true,
    status: 'self_custody_active',
    retired_custodial_signer_id: 'custodial_test_1',
    effective_at: new Date().toISOString(),
  };
}

function makeFinalizeReplay(): FinalizeReplayResponse {
  return {
    success: true,
    status: 'self_custody_active',
    replay: true,
    message: 'Already finalized.',
  };
}

function makeApiError(
  error: string,
  http = 400,
  extras: Partial<SelfCustodyApiError> = {}
): SelfCustodyApiError {
  return {
    success: false,
    error,
    http_status: http,
    ...extras,
  };
}

function makeVerifyOk(): VerifyPackageOK {
  return {
    ok: true,
    manifest_hash_ok: true,
    decrypt_ok: true,
    user_id: 'user_test',
    issued_at: new Date().toISOString(),
  };
}

// ── Module mocks ───────────────────────────────────────────────────────────

const mockPrepare = vi.fn();
const mockPackageExport = vi.fn();
const mockFinalize = vi.fn();
const mockVerifyPackageLocally = vi.fn();
const mockGenerateBrowserWalletKeypair = vi.fn();
const mockSignServerNonce = vi.fn();

vi.mock('@/lib/self-custody-client', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    prepare: (...args: unknown[]) => mockPrepare(...args),
    packageExport: (...args: unknown[]) => mockPackageExport(...args),
    finalize: (...args: unknown[]) => mockFinalize(...args),
    verifyPackageLocally: (...args: unknown[]) =>
      mockVerifyPackageLocally(...args),
    generateBrowserWalletKeypair: (...args: unknown[]) =>
      mockGenerateBrowserWalletKeypair(...args),
    signServerNonce: (...args: unknown[]) => mockSignServerNonce(...args),
  };
});

// ── Crypto global (jsdom doesn't ship subtle) ──────────────────────────────

beforeEach(() => {
  // Most browsers in jsdom supply crypto.getRandomValues; supply a minimal
  // crypto.subtle polyfill so Step5 + keypair generation don't crash.
  if (typeof globalThis.crypto === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = i;
          return arr;
        },
        randomUUID: () => '00000000-0000-4000-8000-000000000000',
        subtle: {},
      },
      writable: true,
    });
  } else if (!globalThis.crypto.getRandomValues) {
    (globalThis.crypto as Crypto & { getRandomValues: typeof crypto.getRandomValues }).getRandomValues = ((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i;
      return arr;
    }) as unknown as typeof crypto.getRandomValues;
  }

  mockPrepare.mockReset();
  mockPackageExport.mockReset();
  mockFinalize.mockReset();
  mockVerifyPackageLocally.mockReset();
  mockGenerateBrowserWalletKeypair.mockReset();
  mockSignServerNonce.mockReset();

  // Default keypair / signing: resolved objects the components can
  // structurally use.
  mockGenerateBrowserWalletKeypair.mockResolvedValue({
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMCow...\n-----END PUBLIC KEY-----\n',
    privateKey: {} as unknown as CryptoKey,
    publicKeyHex: '0x' + 'a'.repeat(64),
  });
  mockSignServerNonce.mockResolvedValue('c2lnYjY0Zm9ydGVzdA==');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MigrationWizard', () => {
  it('renders Step 1 (2FA) by default with devSkipBanner', () => {
    render(
      <MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />
    );
    expect(screen.getByText(/Verify it.+you/i)).toBeInTheDocument();
    expect(screen.getByLabelText('dev-banner')).toBeInTheDocument();
  });

  it('renders Step 1 without banner when devSkipBanner is false', () => {
    render(<MigrationWizard bearerToken="test-bearer" />);
    expect(screen.queryByLabelText('dev-banner')).not.toBeInTheDocument();
  });

  it('progresses from Step 1 to Step 2 (password)', async () => {
    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);

    // Dev banner + skip checkbox defaults to true; Continue is enabled.
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument();
    });
  });

  it('Step 2 blocks advance with weak password', async () => {
    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );

    const pw = screen.getByLabelText('recovery-password') as HTMLInputElement;
    const pwc = screen.getByLabelText(
      'recovery-password-confirm'
    ) as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'weak' } });
    fireEvent.change(pwc, { target: { value: 'weak' } });

    const genBtn = screen.getByRole('button', { name: /generate package/i });
    expect(genBtn).toBeDisabled();
  });

  it('Step 2 advance calls prepare + package in sequence', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );

    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /generate package/i })
    );

    await waitFor(() => {
      expect(mockPrepare).toHaveBeenCalledTimes(1);
      expect(mockPackageExport).toHaveBeenCalledTimes(1);
    });

    // Step 3 (Package) should now be showing.
    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );
  });

  it('Step 3 shows countdown + download button + requires download before continue', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );

    expect(screen.getByLabelText('countdown')).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', {
      name: /saved it.+continue/i,
    });
    expect(continueBtn).toBeDisabled();
  });

  it('Step 4 confirmation: wrong password surfaces alert', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));
    mockVerifyPackageLocally.mockResolvedValue({
      ok: true,
      manifest_hash_ok: true,
      decrypt_ok: false,
      user_id: 'user_test',
      issued_at: new Date().toISOString(),
    });

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );

    // Download (required) and continue to Step 4.
    const downloadBtn = screen.getByRole('button', { name: /download package file/i });
    // jsdom blob/url shims
    const createObjSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fireEvent.click(downloadBtn);
    createObjSpy.mockRestore();

    fireEvent.click(
      screen.getByRole('button', { name: /saved it.+continue/i })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password-verify')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('recovery-password-verify'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify locally/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('verify-wrong-password')).toBeInTheDocument()
    );
  });

  it('full happy path: Step 1 → 2 → 3 → 4 → 5 → finalize → success', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));
    mockVerifyPackageLocally.mockResolvedValue(makeVerifyOk());
    mockFinalize.mockResolvedValue(makeFinalizeHappy());

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    // Step 1
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Step 2
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    // Step 3
    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /download package file/i }));
    fireEvent.click(screen.getByRole('button', { name: /saved it.+continue/i }));

    // Step 4
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password-verify')).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText('recovery-password-verify'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify locally/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('verify-success')).toBeInTheDocument()
    );
    const step4Continue = screen.getAllByRole('button', { name: /continue/i });
    fireEvent.click(step4Continue[step4Continue.length - 1]);

    // Step 5 — wait for keypair to be ready
    await waitFor(() =>
      expect(screen.getByLabelText('wallet-address')).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole('button', { name: /finalize migration/i })
    );

    // Step 6
    await waitFor(() =>
      expect(screen.getByText(/Migration complete/i)).toBeInTheDocument()
    );
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it('finalize replay: cached retired-id from first call renders on replay', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));
    mockVerifyPackageLocally.mockResolvedValue(makeVerifyOk());
    mockFinalize.mockResolvedValue(makeFinalizeReplay());

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /download package file/i }));
    fireEvent.click(screen.getByRole('button', { name: /saved it.+continue/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password-verify')).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText('recovery-password-verify'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify locally/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('verify-success')).toBeInTheDocument()
    );
    const step4Continue = screen.getAllByRole('button', { name: /continue/i });
    fireEvent.click(step4Continue[step4Continue.length - 1]);

    await waitFor(() =>
      expect(screen.getByLabelText('wallet-address')).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole('button', { name: /finalize migration/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/Migration complete/i)).toBeInTheDocument()
    );
    // Replay banner appears.
    expect(screen.getByText(/server reported this as a replay/i)).toBeInTheDocument();
  });

  it('session_expired error from prepare renders ErrorPanel with restart', async () => {
    mockPrepare.mockResolvedValue(makeApiError('session_expired', 400));

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(
        screen.getByLabelText('self-custody-error-session_expired')
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
  });

  it('already_self_custody error renders info-tone panel', async () => {
    mockPrepare.mockResolvedValue(makeApiError('already_self_custody', 409));

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(
        screen.getByLabelText('self-custody-error-already_self_custody')
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/Already migrated/i)).toBeInTheDocument();
  });

  it('registry_transaction_failed (500) from finalize is retry-safe', async () => {
    mockPrepare.mockResolvedValue(makePrepareOk());
    mockPackageExport.mockResolvedValue(makePackageOk(makeExportPackage()));
    mockVerifyPackageLocally.mockResolvedValue(makeVerifyOk());
    mockFinalize.mockResolvedValue(
      makeApiError('registry_transaction_failed', 500, {
        code: 'registry_error',
      })
    );

    render(<MigrationWizard bearerToken="test-bearer" devSkipBanner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password')).toBeInTheDocument()
    );
    const strong = 'CorrectHorseBatteryStaple-42!';
    fireEvent.change(screen.getByLabelText('recovery-password'), {
      target: { value: strong },
    });
    fireEvent.change(screen.getByLabelText('recovery-password-confirm'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('package-summary')).toBeInTheDocument()
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /download package file/i }));
    fireEvent.click(screen.getByRole('button', { name: /saved it.+continue/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('recovery-password-verify')).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText('recovery-password-verify'), {
      target: { value: strong },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify locally/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('verify-success')).toBeInTheDocument()
    );
    const step4Continue = screen.getAllByRole('button', { name: /continue/i });
    fireEvent.click(step4Continue[step4Continue.length - 1]);

    await waitFor(() =>
      expect(screen.getByLabelText('wallet-address')).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole('button', { name: /finalize migration/i })
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText('self-custody-error-registry_transaction_failed')
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/retry is safe/i)).toBeInTheDocument();
  });
});
