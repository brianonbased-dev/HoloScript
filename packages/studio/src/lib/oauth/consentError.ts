/**
 * Messages for ?error=<code>, set by POST /api/oauth/consent when a form post
 * fails. Only known codes get their own text; anything else is generic, so the
 * query can't put arbitrary text on the page.
 */
const ERROR_TEXT: Record<string, string> = {
  invalid_request: 'The approval was missing some details.',
  consent_unavailable: 'Approvals are temporarily unavailable.',
  login_required: 'Your sign-in could not be confirmed.',
  invalid_client: 'This app is not registered.',
  invalid_scope: 'This app asked for permissions it is not allowed to have.',
  temporarily_unavailable: 'HoloScript is busy right now.',
  rate_limit_exceeded: 'Too many attempts. Wait a minute.',
  authorize_failed: 'HoloScript could not complete the approval.',
};

export function consentErrorText(code: string | undefined): string | null {
  if (!code) return null;
  return `Approval failed: ${ERROR_TEXT[code] ?? 'HoloScript refused the request.'} Try again, and if it keeps failing, deny and contact the app.`;
}
