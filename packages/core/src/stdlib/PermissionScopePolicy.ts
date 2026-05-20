export interface StdlibPermissionScopeGrant {
  scope: string;
  purpose?: string;
  required?: boolean;
  riskLevel?: string;
  providerLabel?: string;
}

export interface StdlibPermissionScopePolicyEvaluation {
  scope: string;
  normalizedScope: string;
  allowed: boolean;
  reason?: string;
}

export interface StdlibPermissionScopeDiffInput {
  requestedScopes: StdlibPermissionScopeGrant[];
  minimumRequiredScopes: StdlibPermissionScopeGrant[];
  grantedScopes?: StdlibPermissionScopeGrant[];
  neverScopes?: string[];
}

export interface StdlibPermissionScopeDiffResult {
  requestedScopes: string[];
  minimumRequiredScopes: string[];
  grantedScopes: string[];
  invalidRequestedScopes: string[];
  invalidMinimumRequiredScopes: string[];
  invalidGrantedScopes: string[];
  invalidNeverScopes: string[];
  missingRequestedRequiredScopes: string[];
  missingGrantedRequiredScopes: string[];
  extraGrantedScopes: string[];
  forbiddenRequestedScopes: StdlibPermissionScopePolicyEvaluation[];
  forbiddenGrantedScopes: StdlibPermissionScopePolicyEvaluation[];
  minimumScopeSatisfied: boolean;
  excessScopesAbsent: boolean;
  policyInputValid: boolean;
}

export interface StdlibPermissionPreviewRedactionResult {
  preview: string;
  redacted: boolean;
  absolutePathRedacted: boolean;
  credentialMaterialRedacted: boolean;
}

export function normalizePermissionScopeName(scope: string): string {
  return scope.trim().toLowerCase();
}

export function isValidPermissionScopeName(scope: string | undefined): scope is string {
  if (typeof scope !== 'string') return false;
  const normalized = normalizePermissionScopeName(scope);
  return normalized.length > 0 && !/[\u0000-\u001f\s]/.test(normalized);
}

function normalizedScopeNames(scopes: StdlibPermissionScopeGrant[]): Set<string> {
  return new Set(
    scopes
      .map((scope) => normalizePermissionScopeName(scope.scope))
      .filter((scope) => scope.length > 0)
  );
}

function invalidScopeNames(scopes: StdlibPermissionScopeGrant[]): string[] {
  return scopes.map((scope) => scope.scope).filter((scope) => !isValidPermissionScopeName(scope));
}

function invalidNeverScopeNames(neverScopes: string[]): string[] {
  return neverScopes.filter((scope) => !isValidPermissionScopeName(scope));
}

function forbiddenScopeReason(scope: string, neverScopes: string[]): string | undefined {
  const normalized = normalizePermissionScopeName(scope);
  const explicitNever = neverScopes.map(normalizePermissionScopeName);
  if (explicitNever.includes(normalized)) return 'is listed in neverScopes';
  if (normalized === '*' || normalized.includes('*')) return 'uses a wildcard';
  if (/\b(admin|billing|owner|delete|full_access|write_all|manage_all)\b/.test(normalized)) {
    return 'requests broad administrative authority';
  }
  return undefined;
}

export function evaluateStdlibPermissionScopePolicy(
  scope: string,
  neverScopes: string[] = []
): StdlibPermissionScopePolicyEvaluation {
  const normalizedScope = normalizePermissionScopeName(scope);
  const reason = isValidPermissionScopeName(scope)
    ? forbiddenScopeReason(scope, neverScopes)
    : 'is empty or contains whitespace/control characters';
  return {
    scope,
    normalizedScope,
    allowed: !reason,
    ...(reason ? { reason } : {}),
  };
}

export function findMissingRequiredPermissionScopes(
  requiredScopes: StdlibPermissionScopeGrant[],
  candidateScopes: StdlibPermissionScopeGrant[]
): string[] {
  const candidateNames = normalizedScopeNames(candidateScopes);
  return requiredScopes
    .filter((scope) => scope.required === true)
    .map((scope) => scope.scope)
    .filter((scope) => !candidateNames.has(normalizePermissionScopeName(scope)));
}

export function findExtraPermissionScopes(
  grantedScopes: StdlibPermissionScopeGrant[],
  minimumRequiredScopes: StdlibPermissionScopeGrant[]
): string[] {
  const minimumNames = normalizedScopeNames(minimumRequiredScopes);
  return grantedScopes
    .map((scope) => scope.scope)
    .filter((scope) => !minimumNames.has(normalizePermissionScopeName(scope)));
}

export function buildStdlibPermissionScopeDiff(
  input: StdlibPermissionScopeDiffInput
): StdlibPermissionScopeDiffResult {
  const requested = input.requestedScopes ?? [];
  const minimum = input.minimumRequiredScopes ?? [];
  const granted = input.grantedScopes ?? [];
  const neverScopes = input.neverScopes ?? [];
  const invalidRequestedScopes = invalidScopeNames(requested);
  const invalidMinimumRequiredScopes = invalidScopeNames(minimum);
  const invalidGrantedScopes = invalidScopeNames(granted);
  const invalidNeverScopes = invalidNeverScopeNames(neverScopes);
  const missingRequestedRequiredScopes = findMissingRequiredPermissionScopes(minimum, requested);
  const missingGrantedRequiredScopes = findMissingRequiredPermissionScopes(minimum, granted);
  const extraGrantedScopes = findExtraPermissionScopes(granted, minimum);
  const forbiddenRequestedScopes = requested
    .map((scope) => evaluateStdlibPermissionScopePolicy(scope.scope, neverScopes))
    .filter((scope) => !scope.allowed);
  const forbiddenGrantedScopes = granted
    .map((scope) => evaluateStdlibPermissionScopePolicy(scope.scope, neverScopes))
    .filter((scope) => !scope.allowed);
  const policyInputValid =
    invalidRequestedScopes.length === 0 &&
    invalidMinimumRequiredScopes.length === 0 &&
    invalidGrantedScopes.length === 0 &&
    invalidNeverScopes.length === 0;

  return {
    requestedScopes: requested.map((scope) => scope.scope),
    minimumRequiredScopes: minimum.map((scope) => scope.scope),
    grantedScopes: granted.map((scope) => scope.scope),
    invalidRequestedScopes,
    invalidMinimumRequiredScopes,
    invalidGrantedScopes,
    invalidNeverScopes,
    missingRequestedRequiredScopes,
    missingGrantedRequiredScopes,
    extraGrantedScopes,
    forbiddenRequestedScopes,
    forbiddenGrantedScopes,
    minimumScopeSatisfied:
      policyInputValid &&
      missingRequestedRequiredScopes.length === 0 &&
      missingGrantedRequiredScopes.length === 0 &&
      forbiddenRequestedScopes.length === 0 &&
      forbiddenGrantedScopes.length === 0,
    excessScopesAbsent: extraGrantedScopes.length === 0,
    policyInputValid,
  };
}

export function redactStdlibPermissionPreview(
  value: string | undefined
): StdlibPermissionPreviewRedactionResult {
  const original = value ?? '';
  let preview = original;
  let absolutePathRedacted = false;
  let credentialMaterialRedacted = false;

  preview = preview.replace(
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/g,
    (match, prefix: string) => {
      absolutePathRedacted = true;
      return `${prefix}<absolute-path-redacted>`;
    }
  );
  preview = preview.replace(
    /\b(access_token|refresh_token|id_token|client_secret|authorization|cookie|code)=([^&\s]+)/gi,
    (_match, key: string, secret: string) => {
      if (secret === '<redacted>') return `${key}=<redacted>`;
      credentialMaterialRedacted = true;
      return `${key}=<redacted>`;
    }
  );
  preview = preview.replace(
    /\bBearer\s+([A-Za-z0-9._~+/=-]+|<redacted>)/gi,
    (_match, secret: string) => {
      if (secret === '<redacted>') return 'Bearer <redacted>';
      credentialMaterialRedacted = true;
      return 'Bearer <redacted>';
    }
  );

  return {
    preview,
    redacted: preview !== original,
    absolutePathRedacted,
    credentialMaterialRedacted,
  };
}

export function stdlibPermissionPreviewHasPublicLeak(value: string | undefined): boolean {
  const redaction = redactStdlibPermissionPreview(value);
  return redaction.absolutePathRedacted || redaction.credentialMaterialRedacted;
}
