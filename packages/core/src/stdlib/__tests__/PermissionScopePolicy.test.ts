import { describe, expect, it } from 'vitest';
import {
  buildStdlibPermissionScopeDiff,
  evaluateStdlibPermissionScopePolicy,
  findExtraPermissionScopes,
  findMissingRequiredPermissionScopes,
  isValidPermissionScopeName,
  normalizePermissionScopeName,
  redactStdlibPermissionPreview,
  stdlibPermissionPreviewHasPublicLeak,
  type StdlibPermissionScopeGrant,
} from '../PermissionScopePolicy';

const driveFileScope: StdlibPermissionScopeGrant = {
  scope: 'drive.file',
  purpose: 'Read and write only files created by the app.',
  required: true,
  riskLevel: 'medium',
};

const driveReadonlyScope: StdlibPermissionScopeGrant = {
  scope: 'drive.readonly',
  purpose: 'Provider-added readonly access.',
  required: false,
  riskLevel: 'medium',
};

describe('PermissionScopePolicy', () => {
  it('normalizes and validates provider scope names without rejecting URL scopes', () => {
    expect(normalizePermissionScopeName(' Drive.File ')).toBe('drive.file');
    expect(isValidPermissionScopeName('https://www.googleapis.com/auth/drive.file')).toBe(true);
    expect(isValidPermissionScopeName('drive file')).toBe(false);
    expect(isValidPermissionScopeName('')).toBe(false);
  });

  it('evaluates neverScopes, wildcards, and broad administrative authority', () => {
    expect(evaluateStdlibPermissionScopePolicy('drive.file', ['*', 'admin'])).toEqual({
      scope: 'drive.file',
      normalizedScope: 'drive.file',
      allowed: true,
    });
    expect(evaluateStdlibPermissionScopePolicy('admin', ['*', 'admin'])).toEqual({
      scope: 'admin',
      normalizedScope: 'admin',
      allowed: false,
      reason: 'is listed in neverScopes',
    });
    expect(evaluateStdlibPermissionScopePolicy('project.owner', [])).toEqual({
      scope: 'project.owner',
      normalizedScope: 'project.owner',
      allowed: false,
      reason: 'requests broad administrative authority',
    });
    expect(evaluateStdlibPermissionScopePolicy('drive.*', [])).toEqual({
      scope: 'drive.*',
      normalizedScope: 'drive.*',
      allowed: false,
      reason: 'uses a wildcard',
    });
  });

  it('builds minimum-scope diffs for requested and granted scopes', () => {
    const diff = buildStdlibPermissionScopeDiff({
      requestedScopes: [driveFileScope],
      minimumRequiredScopes: [driveFileScope],
      grantedScopes: [driveFileScope, driveReadonlyScope],
      neverScopes: ['admin', 'billing'],
    });

    expect(diff.policyInputValid).toBe(true);
    expect(diff.minimumScopeSatisfied).toBe(true);
    expect(diff.excessScopesAbsent).toBe(false);
    expect(diff.missingRequestedRequiredScopes).toEqual([]);
    expect(diff.missingGrantedRequiredScopes).toEqual([]);
    expect(diff.extraGrantedScopes).toEqual(['drive.readonly']);
  });

  it('reports invalid names and missing required scopes', () => {
    const diff = buildStdlibPermissionScopeDiff({
      requestedScopes: [{ ...driveFileScope, scope: 'drive file' }],
      minimumRequiredScopes: [driveFileScope],
      grantedScopes: [],
      neverScopes: ['admin', 'bad never'],
    });

    expect(diff.policyInputValid).toBe(false);
    expect(diff.invalidRequestedScopes).toEqual(['drive file']);
    expect(diff.invalidNeverScopes).toEqual(['bad never']);
    expect(diff.missingRequestedRequiredScopes).toEqual(['drive.file']);
    expect(diff.missingGrantedRequiredScopes).toEqual(['drive.file']);
    expect(diff.minimumScopeSatisfied).toBe(false);
  });

  it('exposes targeted helpers for adapters that only need one comparison', () => {
    expect(findMissingRequiredPermissionScopes([driveFileScope], [])).toEqual(['drive.file']);
    expect(
      findExtraPermissionScopes([driveFileScope, driveReadonlyScope], [driveFileScope])
    ).toEqual(['drive.readonly']);
  });

  it('redacts raw credentials and public absolute paths from previews', () => {
    const redaction = redactStdlibPermissionPreview(
      'node C:/Users/private/oauth-helper.js --url https://provider.example/callback?access_token=secret'
    );

    expect(redaction.redacted).toBe(true);
    expect(redaction.absolutePathRedacted).toBe(true);
    expect(redaction.credentialMaterialRedacted).toBe(true);
    expect(redaction.preview).toContain('<absolute-path-redacted>');
    expect(redaction.preview).toContain('access_token=<redacted>');
    expect(stdlibPermissionPreviewHasPublicLeak('Bearer abc.def.ghi')).toBe(true);
    expect(
      stdlibPermissionPreviewHasPublicLeak('https://accounts.example/auth?scope=drive.file')
    ).toBe(false);
  });
});
