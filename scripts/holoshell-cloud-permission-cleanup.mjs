#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const frameworkBoardModule = path.resolve(
  REPO_ROOT,
  '..',
  'HoloScript',
  'packages',
  'framework',
  'dist',
  'board',
  'index.js'
);
const {
  CLOUD_PERMISSION_CLEANUP_WORKFLOW,
  HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
  cloudExposureRisk,
  summarizeCloudExposure,
  validateHoloShellCloudPermissionCleanupReceiptPack,
  validateProviderMetadataInventoryWitnessReceipt,
} = await import(pathToFileURL(frameworkBoardModule));

const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'cloud-permission-cleanup-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'cloud-permission-cleanup-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'cloud-permission-cleanup-receipts');
const PROVIDER_FIELD_ALLOWLISTS = {
  google_drive_permissions: [
    'files[].id',
    'files[].name',
    'files[].mimeType',
    'files[].permissions[].id',
    'files[].permissions[].type',
    'files[].permissions[].role',
    'files[].permissions[].emailAddress',
    'files[].permissions[].displayName',
    'files[].permissions[].domain',
    'files[].permissions[].allowFileDiscovery',
    'files[].permissions[].permissionDetails[].inherited',
    'files[].permissions[].permissionDetails[].inheritedFrom',
  ],
  microsoft_graph_driveitems: [
    'value[].id',
    'value[].name',
    'value[].folder',
    'value[].file',
    'value[].permissions[].id',
    'value[].permissions[].roles',
    'value[].permissions[].link.type',
    'value[].permissions[].link.scope',
    'value[].permissions[].grantedToV2.user.email',
    'value[].permissions[].grantedToV2.user.userPrincipalName',
    'value[].permissions[].grantedToV2.user.displayName',
    'value[].permissions[].grantedToIdentitiesV2[].user.email',
    'value[].permissions[].grantedToIdentitiesV2[].group.displayName',
    'value[].permissions[].inheritedFrom.id',
  ],
  generic_items: [
    'items[].id',
    'items[].name',
    'items[].redactedName',
    'items[].itemKind',
    'items[].linkVisibility',
    'items[].subjects[].subjectKind',
    'items[].subjects[].redactedLabel',
    'items[].subjects[].labelHash',
    'items[].subjects[].boundary',
    'items[].subjects[].role',
    'items[].subjects[].inherited',
    'items[].inheritedFromItemId',
    'items[].intendedPolicy',
  ],
};

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    action: 'plan',
    provider: 'google_drive',
    accountLabel: 'account-redacted',
    subjectReceiptId: 'permission-subject-redacted',
    fixture: '',
    providerExport: '',
    providerFormat: 'auto',
    trustedDomains: [],
    selectedItemIds: [],
    approvedExposureIds: [],
    residualAccessItemIds: [],
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === 'plan' || arg === 'verify') args.action = arg;
    else if (arg === '--action') args.action = argv[++index] || args.action;
    else if (arg === '--provider') args.provider = argv[++index] || args.provider;
    else if (arg === '--account-label') args.accountLabel = argv[++index] || args.accountLabel;
    else if (arg === '--subject-receipt-id') args.subjectReceiptId = argv[++index] || args.subjectReceiptId;
    else if (arg === '--fixture') args.fixture = argv[++index] || '';
    else if (arg === '--provider-export') args.providerExport = argv[++index] || '';
    else if (arg === '--provider-format') args.providerFormat = argv[++index] || args.providerFormat;
    else if (arg === '--trusted-domain') args.trustedDomains.push(...splitList(argv[++index]));
    else if (arg === '--selected-item') args.selectedItemIds.push(...splitList(argv[++index]));
    else if (arg === '--approved-exposure') args.approvedExposureIds.push(...splitList(argv[++index]));
    else if (arg === '--residual-access') args.residualAccessItemIds.push(...splitList(argv[++index]));
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) applySelfTestFixture(args);
  return args;
}

function printHelp() {
  console.log(`HoloShell cloud permission cleanup

Usage:
  node scripts/holoshell-cloud-permission-cleanup.mjs plan --fixture shared-items.json --json
  node scripts/holoshell-cloud-permission-cleanup.mjs plan --provider-export drive-metadata.json --provider-format google_drive_permissions --json
  node scripts/holoshell-cloud-permission-cleanup.mjs plan --provider-export graph-driveitems.json --provider-format microsoft_graph_driveitems --json
  node scripts/holoshell-cloud-permission-cleanup.mjs verify --self-test --json

This adapter writes redacted HoloShellCloudPermissionCleanupReceiptPack receipts.
It never captures cloud file contents, raw OAuth tokens, refresh tokens, cookies,
unredacted account labels, or absolute local paths. Provider exports must contain
metadata only: item ids, names, link visibility, permission subjects, roles, and
inheritance markers.`);
}

function applySelfTestFixture(args) {
  args.action = 'verify';
  args.provider = 'google_drive';
  args.accountLabel = 'joseph@example.com';
  args.subjectReceiptId = 'permission-subject-self-test';
  args.selectedItemIds = ['item-public-link', 'item-external-editor'];
  args.approvedExposureIds = ['item-public-link', 'item-external-editor'];
  args.residualAccessItemIds = [];
  args.output = path.join('.tmp', 'holoshell', 'self-test', 'cloud-permission-cleanup-latest.json');
  args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'cloud-permission-cleanup-latest.js');
  args.receiptDir = path.join('.tmp', 'holoshell', 'self-test', 'cloud-permission-cleanup-receipts');
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_CLOUD_PERMISSION_CLEANUP = ${payload};\n`);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function redactLabel(label) {
  const value = String(label || 'account-redacted');
  if (value.includes('<redacted>') || value.includes('***')) return value;
  return value.replace(/^(.).+(@.+)$/, '$1***$2');
}

function redactDisplayName(label) {
  const value = String(label || 'Cloud item <redacted>');
  if (/([A-Z]:\\|\/Users\/|\/home\/)/i.test(value)) return 'Cloud item <redacted-path>';
  if (value.includes('<redacted>') || value.includes('***')) return value;
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => redactLabel(match));
}

function emailDomain(value) {
  const match = String(value || '').toLowerCase().match(/@([^@\s>]+)$/);
  return match ? match[1] : '';
}

function trustedDomainSet(args) {
  const domains = new Set(args.trustedDomains.map((domain) => domain.toLowerCase()));
  const accountDomain = emailDomain(args.accountLabel);
  if (accountDomain) domains.add(accountDomain);
  return domains;
}

function inferBoundaryFromEmail(email, trustedDomains) {
  const domain = emailDomain(email);
  if (!domain) return 'unknown';
  return trustedDomains.has(domain) ? 'organization' : 'external';
}

function normalizeRole(role) {
  const value = String(Array.isArray(role) ? role[0] : role || '').toLowerCase();
  if (['owner'].includes(value)) return 'owner';
  if (['writer', 'write', 'editor', 'edit'].includes(value)) return 'editor';
  if (['commenter', 'comment'].includes(value)) return 'commenter';
  if (['reader', 'read', 'viewer', 'view'].includes(value)) return 'viewer';
  return 'unknown';
}

function inferProviderFormat(args, parsed) {
  if (args.providerFormat !== 'auto') return args.providerFormat;
  if (args.provider === 'google_drive' || Array.isArray(parsed.files)) return 'google_drive_permissions';
  if (args.provider === 'onedrive' || Array.isArray(parsed.value) || Array.isArray(parsed.driveItems)) {
    return 'microsoft_graph_driveitems';
  }
  return 'generic_items';
}

function providerFieldAllowlist(format) {
  return PROVIDER_FIELD_ALLOWLISTS[format] || PROVIDER_FIELD_ALLOWLISTS.generic_items;
}

function providerSourceKind(args) {
  if (args.providerExport) return 'local_metadata_export';
  if (args.fixture || args.selfTest) return 'manual_fixture';
  return 'manual_fixture';
}

function providerExportPayload(args) {
  if (args.providerExport) return readJson(args.providerExport);
  if (args.fixture) return readJson(args.fixture);
  return { items: defaultItems() };
}

function providerRecordCount(parsed, format) {
  if (format === 'google_drive_permissions') {
    return Array.isArray(parsed.files) ? parsed.files.length : Array.isArray(parsed.items) ? parsed.items.length : 0;
  }
  if (format === 'microsoft_graph_driveitems') {
    if (Array.isArray(parsed.value)) return parsed.value.length;
    if (Array.isArray(parsed.driveItems)) return parsed.driveItems.length;
    return Array.isArray(parsed.items) ? parsed.items.length : 0;
  }
  if (Array.isArray(parsed)) return parsed.length;
  return Array.isArray(parsed.items) ? parsed.items.length : 0;
}

function scanProviderMetadataSafety(value, pathSegments = []) {
  const findings = {
    rawContentCaptured: false,
    rawCredentialCaptured: false,
    cookieCaptured: false,
    absolutePathCaptured: false,
  };
  const visit = (current, currentPath) => {
    if (current === null || current === undefined) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...currentPath, `[${index}]`]));
      return;
    }
    if (typeof current === 'object') {
      for (const [key, child] of Object.entries(current)) {
        if (/^(content|body|downloadUrl|webDavUrl)$/i.test(key)) findings.rawContentCaptured = true;
        if (/token|secret|password|authorization/i.test(key)) findings.rawCredentialCaptured = true;
        if (/cookie/i.test(key)) findings.cookieCaptured = true;
        visit(child, [...currentPath, key]);
      }
      return;
    }
    const text = String(current);
    if (/access_token=|refresh_token=|Bearer\s+/i.test(text)) findings.rawCredentialCaptured = true;
    if (/([A-Z]:\\|\/Users\/|\/home\/)/i.test(text)) findings.absolutePathCaptured = true;
  };
  visit(value, pathSegments);
  return findings;
}

function buildProviderMetadataWitness(args, generatedAt) {
  const parsed = providerExportPayload(args);
  const format = args.providerExport ? inferProviderFormat(args, parsed) : args.fixture ? 'generic_items' : 'generic_items';
  const safety = scanProviderMetadataSafety(parsed);
  const blockedFieldsAbsent = !(
    safety.rawContentCaptured ||
    safety.rawCredentialCaptured ||
    safety.cookieCaptured ||
    safety.absolutePathCaptured
  );
  const witness = {
    id: `provider-metadata-witness-${shortHash([args.provider, format, parsed])}`,
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
    provider: args.provider,
    providerInputFormat: format,
    sourceKind: providerSourceKind(args),
    exportHash: `sha256:${hashValue(parsed)}`,
    exportHashAlgorithm: 'sha256',
    exportRecordCount: providerRecordCount(parsed, format),
    skippedRecordCount: 0,
    unsupportedRecordCount: 0,
    fieldAllowlist: providerFieldAllowlist(format),
    redactionPolicy: 'hash provider item ids; redact account and subject labels; never include content, tokens, cookies, or absolute local paths',
    redactionApplied: true,
    metadataOnly: true,
    blockedFieldsAbsent,
    rawContentCaptured: safety.rawContentCaptured,
    rawCredentialCaptured: safety.rawCredentialCaptured,
    cookieCaptured: safety.cookieCaptured,
    absolutePathCaptured: safety.absolutePathCaptured,
    publicReceiptMayContainAbsolutePath: false,
    observedAt: generatedAt,
    hash: `sha256:${hashValue([args.provider, format, parsed, blockedFieldsAbsent])}`,
    hashAlgorithm: 'sha256',
  };
  const errors = validateProviderMetadataInventoryWitnessReceipt(witness);
  if (errors.length) {
    throw new Error(`Provider metadata witness failed validation:\n- ${errors.join('\n- ')}`);
  }
  return witness;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultItems() {
  return [
    {
      id: 'item-public-link',
      providerItemIdHash: 'sha256:self-test-public-link',
      redactedName: 'Project Folder <redacted>',
      itemKind: 'folder',
      linkVisibility: 'public',
      subjects: [
        {
          subjectKind: 'link',
          redactedLabel: 'Anyone with link',
          labelHash: 'sha256:anyone-link',
          boundary: 'public',
          role: 'viewer',
          inherited: false,
        },
      ],
      intendedPolicy: 'revoke',
    },
    {
      id: 'item-external-editor',
      providerItemIdHash: 'sha256:self-test-external-editor',
      redactedName: 'World Source <redacted>',
      itemKind: 'file',
      linkVisibility: 'restricted',
      subjects: [
        {
          subjectKind: 'user',
          redactedLabel: 'e***@external.example',
          labelHash: 'sha256:external-editor',
          boundary: 'external',
          role: 'editor',
          inherited: false,
        },
      ],
      intendedPolicy: 'revoke',
    },
  ];
}

function loadItems(args) {
  if (args.providerExport) return loadProviderExportItems(args);
  if (!args.fixture) return defaultItems();
  const parsed = JSON.parse(readFileSync(resolveRepoPath(args.fixture), 'utf8'));
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items)) throw new Error('Fixture must be an array or an object with an items array.');
  return items;
}

function loadProviderExportItems(args) {
  const parsed = JSON.parse(readFileSync(resolveRepoPath(args.providerExport), 'utf8'));
  const format = inferProviderFormat(args, parsed);
  if (format === 'google_drive_permissions') return googleDriveItems(parsed, args);
  if (format === 'microsoft_graph_driveitems') return oneDriveItems(parsed, args);
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items)) throw new Error(`Unsupported provider export format: ${format}.`);
  return items;
}

function googleDriveItems(parsed, args) {
  const files = Array.isArray(parsed.files) ? parsed.files : Array.isArray(parsed.items) ? parsed.items : [];
  const trustedDomains = trustedDomainSet(args);
  return files.map((file) => {
    const permissions = Array.isArray(file.permissions) ? file.permissions : [];
    const subjects = permissions.map((permission) => googleDriveSubject(permission, trustedDomains));
    return {
      id: String(file.id || `google-drive-item-${shortHash(file)}`),
      providerItemIdHash: `sha256:${hashValue(file.id || file.webViewLink || file.name || file)}`,
      redactedName: redactDisplayName(file.redactedName || file.name || 'Google Drive item <redacted>'),
      itemKind: file.mimeType === 'application/vnd.google-apps.folder' || file.folder ? 'folder' : 'file',
      linkVisibility: googleDriveLinkVisibility(permissions),
      subjects,
      ...(googleDriveInheritedFrom(permissions) ? { inheritedFromItemId: googleDriveInheritedFrom(permissions) } : {}),
      intendedPolicy: subjects.some((subject) => subject.boundary === 'public' || subject.boundary === 'external')
        ? 'revoke'
        : 'review',
    };
  });
}

function googleDriveSubject(permission, trustedDomains) {
  const type = String(permission.type || 'unknown').toLowerCase();
  const role = normalizeRole(permission.role);
  const inherited = Boolean(
    permission.inherited ||
      permission.inheritedFrom ||
      (Array.isArray(permission.permissionDetails) &&
        permission.permissionDetails.some((detail) => detail.inherited))
  );
  if (type === 'anyone') {
    return {
      subjectKind: 'link',
      redactedLabel: 'Anyone with link',
      labelHash: 'sha256:anyone-link',
      boundary: 'public',
      role,
      inherited,
    };
  }
  if (type === 'domain') {
    const domain = String(permission.domain || 'domain-redacted').toLowerCase();
    return {
      subjectKind: 'domain',
      redactedLabel: domain ? `domain:${domain.replace(/^(.).+(\..+)$/, '$1***$2')}` : 'domain <redacted>',
      labelHash: `sha256:${hashValue(domain || permission.id || permission)}`,
      boundary: trustedDomains.has(domain) ? 'organization' : 'external',
      role,
      inherited,
    };
  }
  const email = permission.emailAddress || permission.displayName || permission.id || 'subject <redacted>';
  return {
    subjectKind: type === 'group' ? 'group' : type === 'user' ? 'user' : 'unknown',
    redactedLabel: redactLabel(email),
    labelHash: `sha256:${hashValue(email)}`,
    boundary: inferBoundaryFromEmail(permission.emailAddress, trustedDomains),
    role,
    inherited,
  };
}

function googleDriveLinkVisibility(permissions) {
  if (permissions.some((permission) => String(permission.type || '').toLowerCase() === 'anyone')) return 'public';
  if (permissions.some((permission) => String(permission.type || '').toLowerCase() === 'domain')) return 'domain';
  return permissions.length ? 'restricted' : 'private';
}

function googleDriveInheritedFrom(permissions) {
  const inherited = permissions.find(
    (permission) =>
      permission.inheritedFrom ||
      (Array.isArray(permission.permissionDetails) &&
        permission.permissionDetails.find((detail) => detail.inheritedFrom))
  );
  if (!inherited) return '';
  const inheritedFrom =
    inherited.inheritedFrom ||
    inherited.permissionDetails?.find((detail) => detail.inheritedFrom)?.inheritedFrom ||
    '';
  return inheritedFrom ? `sha256:${hashValue(inheritedFrom)}` : '';
}

function oneDriveItems(parsed, args) {
  const items = Array.isArray(parsed.value)
    ? parsed.value
    : Array.isArray(parsed.driveItems)
      ? parsed.driveItems
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
  const trustedDomains = trustedDomainSet(args);
  return items.map((item) => {
    const permissions = Array.isArray(item.permissions) ? item.permissions : [];
    const subjects = permissions.flatMap((permission) => oneDriveSubjects(permission, trustedDomains));
    return {
      id: String(item.id || `onedrive-item-${shortHash(item)}`),
      providerItemIdHash: `sha256:${hashValue(item.id || item.webUrl || item.name || item)}`,
      redactedName: redactDisplayName(item.redactedName || item.name || 'OneDrive item <redacted>'),
      itemKind: item.folder ? 'folder' : item.file ? 'file' : 'unknown',
      linkVisibility: oneDriveLinkVisibility(permissions),
      subjects,
      ...(permissions.some((permission) => permission.inheritedFrom)
        ? { inheritedFromItemId: `sha256:${hashValue(permissions.find((permission) => permission.inheritedFrom).inheritedFrom)}` }
        : {}),
      intendedPolicy: subjects.some((subject) => subject.boundary === 'public' || subject.boundary === 'external')
        ? 'revoke'
        : 'review',
    };
  });
}

function oneDriveSubjects(permission, trustedDomains) {
  const role = normalizeRole(permission.roles);
  const inherited = Boolean(permission.inheritedFrom);
  const subjects = [];
  if (permission.link) {
    const scope = String(permission.link.scope || 'unknown').toLowerCase();
    subjects.push({
      subjectKind: 'link',
      redactedLabel: scope === 'anonymous' ? 'Anyone with link' : `Link scope: ${scope}`,
      labelHash: `sha256:${hashValue([permission.id, permission.link.scope, permission.link.type])}`,
      boundary: scope === 'anonymous' ? 'public' : scope === 'organization' ? 'organization' : 'unknown',
      role,
      inherited,
    });
  }
  const identities = [
    permission.grantedToV2,
    ...(Array.isArray(permission.grantedToIdentitiesV2) ? permission.grantedToIdentitiesV2 : []),
    permission.grantedTo,
    ...(Array.isArray(permission.grantedToIdentities) ? permission.grantedToIdentities : []),
  ].filter(Boolean);
  for (const identity of identities) {
    const subject = identity.user || identity.group || identity.siteUser || identity.application || identity;
    const email = subject.email || subject.userPrincipalName || subject.displayName || subject.id || 'subject <redacted>';
    subjects.push({
      subjectKind: identity.group ? 'group' : identity.application ? 'unknown' : 'user',
      redactedLabel: redactLabel(email),
      labelHash: `sha256:${hashValue(email)}`,
      boundary: inferBoundaryFromEmail(subject.email || subject.userPrincipalName, trustedDomains),
      role,
      inherited,
    });
  }
  return subjects.length
    ? subjects
    : [
        {
          subjectKind: 'unknown',
          redactedLabel: 'permission subject <redacted>',
          labelHash: `sha256:${hashValue(permission.id || permission)}`,
          boundary: 'unknown',
          role,
          inherited,
        },
      ];
}

function oneDriveLinkVisibility(permissions) {
  if (permissions.some((permission) => String(permission.link?.scope || '').toLowerCase() === 'anonymous')) {
    return 'public';
  }
  if (permissions.some((permission) => String(permission.link?.scope || '').toLowerCase() === 'organization')) {
    return 'domain';
  }
  return permissions.length ? 'restricted' : 'private';
}

function normalizeItem(item) {
  const normalized = {
    id: String(item.id || `item-${shortHash(item)}`),
    providerItemIdHash: String(item.providerItemIdHash || `sha256:${hashValue(item.providerItemId || item.id || item)}`),
    redactedName: redactDisplayName(item.redactedName || item.name || 'Cloud item <redacted>'),
    itemKind: String(item.itemKind || 'file'),
    linkVisibility: String(item.linkVisibility || 'restricted'),
    subjects: Array.isArray(item.subjects) ? item.subjects.map(normalizeSubject) : [],
    ...(item.inheritedFromItemId ? { inheritedFromItemId: String(item.inheritedFromItemId) } : {}),
    intendedPolicy: String(item.intendedPolicy || 'review'),
  };
  return {
    ...normalized,
    riskLevel: cloudExposureRisk(normalized),
  };
}

function normalizeSubject(subject) {
  return {
    subjectKind: String(subject.subjectKind || 'unknown'),
    redactedLabel: redactLabel(subject.redactedLabel || subject.label || 'subject <redacted>'),
    labelHash: String(subject.labelHash || `sha256:${hashValue(subject.label || subject.redactedLabel || subject)}`),
    boundary: String(subject.boundary || 'unknown'),
    role: String(subject.role || 'viewer'),
    inherited: Boolean(subject.inherited),
  };
}

function buildReceipt(args) {
  const generatedAt = nowIso();
  const items = loadItems(args).map(normalizeItem);
  const providerMetadataWitness = buildProviderMetadataWitness(args, generatedAt);
  const exposure = summarizeCloudExposure(items);
  const allRiskItemIds = [
    ...new Set([
      ...exposure.publicLinkItemIds,
      ...exposure.externalEditorItemIds,
      ...exposure.inheritedAccessItemIds,
      ...exposure.unknownGroupItemIds,
      ...exposure.domainWideItemIds,
    ]),
  ];
  const selectedItemIds = args.selectedItemIds.length ? args.selectedItemIds : allRiskItemIds;
  const approvedExposureIds = args.approvedExposureIds.length ? args.approvedExposureIds : selectedItemIds;
  const residualAccessItemIds = args.residualAccessItemIds;
  const status =
    args.action === 'verify'
      ? residualAccessItemIds.length === 0
        ? 'clean'
        : 'residual_access_warning'
      : 'exposure_classified';
  const inventoryId = `cloud-inventory-${shortHash([args.provider, args.accountLabel, items])}`;
  const exposureDiffId = `cloud-exposure-${shortHash([inventoryId, exposure])}`;
  const revokePlanId = `cloud-revoke-plan-${shortHash([exposureDiffId, selectedItemIds])}`;
  const verificationId = `cloud-verification-${shortHash([revokePlanId, residualAccessItemIds])}`;

  const inventory = {
    id: inventoryId,
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    subjectReceiptId: args.subjectReceiptId,
    provider: args.provider,
    redactedAccountLabel: redactLabel(args.accountLabel),
    accountLabelHash: `sha256:${hashValue(args.accountLabel)}`,
    items,
    skippedItemCount: 0,
    inventoryComplete: true,
    publicReceiptMayContainAbsolutePath: false,
    rawContentCaptured: false,
    credentialExtrusionAllowed: false,
    providerMetadataWitnessReceiptId: providerMetadataWitness.id,
    observedAt: generatedAt,
    hash: `sha256:${hashValue([args.provider, items])}`,
    hashAlgorithm: 'sha256',
  };

  const exposureDiff = {
    id: exposureDiffId,
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    inventoryReceiptId: inventory.id,
    ...exposure,
    residualAccessCount: residualAccessItemIds.length,
    readyForRevocationPlan: allRiskItemIds.length > 0,
    hash: `sha256:${hashValue(exposure)}`,
    hashAlgorithm: 'sha256',
  };

  const revokePlan =
    args.action === 'verify'
      ? {
          id: revokePlanId,
          schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
          exposureDiffReceiptId: exposureDiff.id,
          selectedItemIds,
          approvedExposureIds,
          blockedActions: ['delete_cloud_file', 'move_cloud_file', 'transfer_owner'],
          permissionEnvelope: 'guarded_execute',
          freshApproval: true,
          approvalId: `cloud-approval-${shortHash([selectedItemIds, generatedAt])}`,
          bulkMutationRequested: false,
          deleteOrMoveRequested: false,
          ownerTransferRequested: false,
          rawCredentialCaptured: false,
          hiddenAutomationUsed: false,
          approvedAt: generatedAt,
          hash: `sha256:${hashValue([selectedItemIds, approvedExposureIds])}`,
          hashAlgorithm: 'sha256',
        }
      : undefined;

  const verification =
    args.action === 'verify'
      ? {
          id: verificationId,
          schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
          revokePlanReceiptId: revokePlan.id,
          providerStateVerified: true,
          revokedExposureIds: approvedExposureIds,
          residualAccessItemIds,
          residualAccessCount: residualAccessItemIds.length,
          readyToClaimClean: residualAccessItemIds.length === 0,
          verificationMethod: 'manual_redacted_witness',
          verifiedAt: generatedAt,
          hash: `sha256:${hashValue([approvedExposureIds, residualAccessItemIds])}`,
          hashAlgorithm: 'sha256',
        }
      : undefined;

  const replay = {
    id: `cloud-replay-${shortHash([inventory.id, exposureDiff.id, status])}`,
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
    status,
    inventoryReceiptId: inventory.id,
    exposureDiffReceiptId: exposureDiff.id,
    ...(revokePlan ? { revokePlanReceiptId: revokePlan.id } : {}),
    ...(verification ? { verificationReceiptId: verification.id } : {}),
    replayKey: `sha256:${hashValue([args.provider, inventory.accountLabelHash, exposure, status])}`,
    residualAccessCount: residualAccessItemIds.length,
    readyToClaimClean: Boolean(verification?.readyToClaimClean),
    rawCredentialCaptured: false,
    hiddenAutomationUsed: false,
    createdAt: generatedAt,
    hash: `sha256:${hashValue([status, exposure, residualAccessItemIds])}`,
    hashAlgorithm: 'sha256',
  };

  const pack = {
    id: `cloud-permission-cleanup-pack-${shortHash([inventory.id, exposureDiff.id, status])}`,
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
    status,
    providerMetadataWitness,
    inventory,
    exposureDiff,
    ...(revokePlan ? { revokePlan } : {}),
    ...(verification ? { verification } : {}),
    replay,
    hash: `sha256:${hashValue([inventory, exposureDiff, revokePlan, verification, replay])}`,
    hashAlgorithm: 'sha256',
  };

  const validationErrors = validateHoloShellCloudPermissionCleanupReceiptPack(pack);
  if (validationErrors.length) {
    throw new Error(`Cloud permission cleanup receipt failed validation:\n- ${validationErrors.join('\n- ')}`);
  }
  return {
    ...pack,
    sourceAnchors: {
      room: 'apps/holoshell/source/holoshell-cloud-permission-cleanup-room.holo',
      policy: 'apps/holoshell/source/holoshell-cloud-permission-cleanup-policy.hsplus',
      pipeline: 'apps/holoshell/source/holoshell-cloud-permission-cleanup-pipeline.hs',
      adapter: 'scripts/holoshell-cloud-permission-cleanup.mjs',
      upstreamValidator: 'packages/framework/src/board/holoshell-cloud-permission-cleanup-receipts.ts',
    },
    summary: {
      provider: args.provider,
      status,
      itemCount: items.length,
      publicLinkCount: exposure.publicLinkItemIds.length,
      externalEditorCount: exposure.externalEditorItemIds.length,
      inheritedAccessCount: exposure.inheritedAccessItemIds.length,
      residualAccessCount: residualAccessItemIds.length,
      readyToClaimClean: Boolean(verification?.readyToClaimClean),
      providerInputFormat: args.providerExport ? inferProviderFormat(args, readJson(args.providerExport)) : args.fixture ? 'generic_fixture' : 'self_test_fixture',
      providerMetadataWitnessId: providerMetadataWitness.id,
      providerExportMetadataOnly: true,
      rawCredentialCaptured: false,
      hiddenAutomationUsed: false,
    },
  };
}

function writeReceipt(args, receipt) {
  const outputPath = writeJson(args.output, receipt);
  const jsPath = writeBrowserBootstrap(args.jsOutput, receipt);
  mkdirSync(resolveRepoPath(args.receiptDir), { recursive: true });
  const receiptPath = path.join(args.receiptDir, `${receipt.id}.json`);
  const providerMetadataWitnessPath = receipt.providerMetadataWitness
    ? path.join(args.receiptDir, `${receipt.providerMetadataWitness.id}.json`)
    : '';
  writeJson(receiptPath, receipt);
  if (receipt.providerMetadataWitness) writeJson(providerMetadataWitnessPath, receipt.providerMetadataWitness);
  receipt.output = {
    latestPath: publicPath(outputPath),
    jsPath: publicPath(jsPath),
    receiptPath: publicPath(receiptPath),
    ...(providerMetadataWitnessPath ? { providerMetadataWitnessPath: publicPath(providerMetadataWitnessPath) } : {}),
    receiptDir: publicPath(args.receiptDir),
  };
  writeJson(args.output, receipt);
  writeBrowserBootstrap(args.jsOutput, receipt);
  writeJson(receiptPath, receipt);
  if (receipt.providerMetadataWitness) writeJson(providerMetadataWitnessPath, receipt.providerMetadataWitness);
  return receipt;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function runSelfTest(receipt) {
  if (!existsSync(resolveRepoPath(receipt.output.latestPath))) {
    throw new Error('Self-test expected latest receipt output to exist.');
  }
  const diskReceipt = readJson(receipt.output.latestPath);
  if (diskReceipt.replay.rawCredentialCaptured !== false) {
    throw new Error('Self-test detected raw credential capture.');
  }
  if (diskReceipt.replay.readyToClaimClean !== true) {
    throw new Error('Self-test expected readyToClaimClean true.');
  }
  if (diskReceipt.summary.publicLinkCount !== 1 || diskReceipt.summary.externalEditorCount !== 1) {
    throw new Error('Self-test expected one public link and one external editor.');
  }
}

try {
  const args = parseArgs();
  const receipt = writeReceipt(args, buildReceipt(args));
  if (args.selfTest) runSelfTest(receipt);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`cloud permission cleanup receipt: ${receipt.id} (${receipt.status}) -> ${receipt.output.latestPath}`);
} catch (error) {
  console.error(`holoshell-cloud-permission-cleanup failed: ${error.message}`);
  process.exit(1);
}
