/**
 * Root-entry canary for the HS1011 likeness consent API (#590).
 * @holoscript/lsp imports `type ConsentRules` from the package root and passes
 * `consentRules` to validateCanonicalSource; both must be in the public types.
 */
import { validateCanonicalSource } from '@holoscript/core';
import type { CanonicalSourceValidationRequest, ConsentRules, LikenessSource } from '@holoscript/core';

const face: LikenessSource = 'face';
const asRecord: ConsentRules = { grant_self: [face, 'voice'] };
const asMap: ConsentRules = new Map([['grant_self', new Set<LikenessSource>(['body'])]]);

const request: CanonicalSourceValidationRequest = {
  source: 'composition "A" {}',
  surface: 'holo',
  allowEmpty: true,
  consentRules: asRecord,
  knownTraits: ['my_plugin_trait'],
};
const failClosed: CanonicalSourceValidationRequest = { source: '', consentRules: null };
void asMap;
void failClosed;
void validateCanonicalSource(request);

// @ts-expect-error consentRules must be a grant -> sources map, not a bare string
const bad: CanonicalSourceValidationRequest = { source: '', consentRules: 'yes' };
void bad;
