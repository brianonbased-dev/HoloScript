type CapturePrivacyRecord = Record<string, unknown>;

export type CaptureSurface = 'HoloMap' | 'HoloGram';
export type CaptureMediaKind = 'image' | 'gif' | 'video' | 'frame';

const PUBLIC_CAPTURE_CONTEXTS = new Set([
  'public',
  'consumer',
  'consumer-public',
  'external',
  'public-consumer',
]);

const BYSTANDER_MITIGATIONS = new Set([
  'face_blur',
  'no_bystanders',
  'operator_reviewed',
  'private_space',
  'not_applicable',
]);

export const capturePrivacyInputSchema = {
  type: 'object',
  description:
    'Capture privacy gate for public/consumer media. For captureContext public/consumer, consent.tosAccepted, consent.bystanderPrivacyAccepted, consent.mediaRightsConfirmed, and bystanderMitigation are required before ingest/render.',
  properties: {
    captureContext: {
      type: 'string',
      enum: ['internal-authenticated', 'private', 'public', 'consumer', 'consumer-public'],
      description:
        'Use public/consumer for media submitted through a consumer-facing capture surface.',
    },
    bystanderMitigation: {
      type: 'string',
      enum: Array.from(BYSTANDER_MITIGATIONS),
      description:
        'Public capture mitigation decision: face_blur, no_bystanders, operator_reviewed, private_space, or not_applicable.',
    },
    consent: {
      type: 'object',
      properties: {
        tosAccepted: { type: 'boolean' },
        bystanderPrivacyAccepted: { type: 'boolean' },
        mediaRightsConfirmed: { type: 'boolean' },
        acknowledgedAt: { type: 'string' },
        acknowledgedBy: { type: 'string' },
      },
    },
  },
} as const;

function asRecord(value: unknown): CapturePrivacyRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as CapturePrivacyRecord;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readBooleanTrue(...values: unknown[]): boolean {
  return values.some((value) => value === true);
}

function isPublicCapture(args: CapturePrivacyRecord, privacy?: CapturePrivacyRecord): boolean {
  const context = readString(privacy?.captureContext, args.captureContext).toLowerCase();
  return (
    PUBLIC_CAPTURE_CONTEXTS.has(context) ||
    args.publicExposure === true ||
    privacy?.publicExposure === true
  );
}

export function assertPublicCaptureConsent(
  args: CapturePrivacyRecord,
  options: { toolName: string; surface: CaptureSurface; mediaKind: CaptureMediaKind }
): void {
  const privacy = asRecord(args.privacy);
  if (!isPublicCapture(args, privacy)) return;

  const consent = asRecord(privacy?.consent) ?? asRecord(args.consent) ?? asRecord(args.consentReceipt);
  const tosAccepted = readBooleanTrue(
    consent?.tosAccepted,
    consent?.termsAccepted,
    privacy?.tosAccepted,
    args.tosAccepted
  );
  const bystanderPrivacyAccepted = readBooleanTrue(
    consent?.bystanderPrivacyAccepted,
    consent?.bystanderPrivacyAcknowledged,
    privacy?.bystanderPrivacyAccepted,
    args.bystanderPrivacyAccepted
  );
  const mediaRightsConfirmed = readBooleanTrue(
    consent?.mediaRightsConfirmed,
    consent?.rightsConfirmed,
    privacy?.mediaRightsConfirmed,
    args.mediaRightsConfirmed
  );
  const bystanderMitigation = readString(
    privacy?.bystanderMitigation,
    consent?.bystanderMitigation,
    args.bystanderMitigation
  );

  if (
    tosAccepted &&
    bystanderPrivacyAccepted &&
    mediaRightsConfirmed &&
    BYSTANDER_MITIGATIONS.has(bystanderMitigation)
  ) {
    return;
  }

  throw new Error(
    `${options.toolName}: public ${options.surface} ${options.mediaKind} capture requires privacy.consent.tosAccepted, privacy.consent.bystanderPrivacyAccepted, privacy.consent.mediaRightsConfirmed, and privacy.bystanderMitigation before ingest/render`
  );
}
