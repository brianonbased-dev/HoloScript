import { createHash } from 'node:crypto';

export type X402SettlementMode = 'disabled' | 'dry_run' | 'mock' | 'live';

export interface EconomicContractRequest {
  contractId: string;
  payer: string;
  amount: number;
  resourceType?: 'compute' | 'storage' | 'data' | 'inference';
}

export type X402SettlementResult =
  | {
      success: false;
      status:
        | 'no_x402_facilitator'
        | 'invalid_request'
        | 'invalid_configuration'
        | 'live_unavailable';
      amount: number | null;
      message: string;
    }
  | {
      success: false;
      status: 'dry_run';
      amount: number;
      transactionId: null;
      receiptId: string;
      provisioning: 'none';
      message: string;
    }
  | {
      status: 'mock_payment';
      transactionId: string;
      amount: number;
      balanceRemaining: -1;
      provisioning: 'none';
      message: string;
    };

export interface X402SettlementAdapterConfig {
  mode?: X402SettlementMode;
  configurationError?: string;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function parseRequest(value: unknown): EconomicContractRequest | null {
  const input = objectValue(value);
  if (
    !input ||
    !nonEmptyString(input.contractId) ||
    !nonEmptyString(input.payer, 128) ||
    typeof input.amount !== 'number' ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0
  ) {
    return null;
  }
  const resourceType = input.resourceType;
  if (
    resourceType !== undefined &&
    !['compute', 'storage', 'data', 'inference'].includes(String(resourceType))
  ) {
    return null;
  }
  return {
    contractId: input.contractId.trim(),
    payer: input.payer.trim(),
    amount: input.amount,
    resourceType: resourceType as EconomicContractRequest['resourceType'],
  };
}

function deterministicId(request: EconomicContractRequest, prefix: string): string {
  const canonical = JSON.stringify({
    amount: request.amount,
    contractId: request.contractId,
    payer: request.payer,
    resourceType: request.resourceType ?? null,
  });
  return `${prefix}-${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
}

/**
 * Preparation-only x402 adapter.
 *
 * No mode performs network I/O. Live settlement remains unavailable until the
 * official x402 SDK envelope, paymentRequirements binding, atomic scoped daily
 * reserve/commit ledger, and indeterminate-transaction reconciliation exist.
 */
export class X402SettlementAdapter {
  private readonly mode: X402SettlementMode;

  constructor(private readonly config: X402SettlementAdapterConfig = {}) {
    this.mode = config.mode ?? 'disabled';
  }

  execute(value: unknown): X402SettlementResult {
    const request = parseRequest(value);
    if (!request) {
      return {
        success: false,
        status: 'invalid_request',
        amount: null,
        message: 'Economic contract input is invalid. No transaction occurred.',
      };
    }
    if (this.config.configurationError) {
      return {
        success: false,
        status: 'invalid_configuration',
        amount: request.amount,
        message: this.config.configurationError,
      };
    }
    if (this.mode === 'dry_run') {
      return {
        success: false,
        status: 'dry_run',
        amount: request.amount,
        transactionId: null,
        receiptId: deterministicId(request, 'x402-dry-run'),
        provisioning: 'none',
        message: 'Dry run only. No network call, wallet signature, transaction, or spend occurred.',
      };
    }
    if (this.mode === 'mock') {
      return {
        status: 'mock_payment',
        transactionId: deterministicId(request, 'mock-tx'),
        amount: request.amount,
        balanceRemaining: -1,
        provisioning: 'none',
        message: `MOCK: Economic contract ${request.contractId} was simulated. No real x402 transaction occurred.`,
      };
    }
    if (this.mode === 'live') {
      return {
        success: false,
        status: 'live_unavailable',
        amount: request.amount,
        message:
          'Live x402 settlement is unavailable. It requires the official SDK envelope and paymentRequirements binding, an atomic scoped daily reserve/commit ledger, and reconciliation for indeterminate transactions.',
      };
    }
    return {
      success: false,
      status: 'no_x402_facilitator',
      amount: request.amount,
      message:
        'No x402 facilitator is connected. execute_economic_contract remains preparation-only; no wallet signature, provisioning, network call, or real transaction occurred. Set ALLOW_MOCK_X402=1 for the deterministic development mock.',
    };
  }
}

export function createX402SettlementAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env
): X402SettlementAdapter {
  const configuredMode = env.X402_FACILITATOR_MODE?.trim();
  const allowedModes: X402SettlementMode[] = ['disabled', 'dry_run', 'mock', 'live'];
  const validMode = configuredMode && allowedModes.includes(configuredMode as X402SettlementMode);
  const mode: X402SettlementMode = validMode
    ? (configuredMode as X402SettlementMode)
    : env.ALLOW_MOCK_X402 === '1'
      ? 'mock'
      : 'disabled';
  return new X402SettlementAdapter({
    mode,
    configurationError:
      configuredMode && !validMode
        ? `Unsupported X402_FACILITATOR_MODE: ${configuredMode}. No transaction occurred.`
        : undefined,
  });
}
