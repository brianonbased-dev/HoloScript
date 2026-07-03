import { describe, expect, it } from 'vitest';
import {
  isPartnerRegistryValidatePath,
  readPartnerRegistryHoloKey,
  validatePartnerRegistryCredentials,
} from '../partner-registry-route';

describe('partner registry validation route', () => {
  it('recognizes the public umbrella route and compatibility alias', () => {
    expect(isPartnerRegistryValidatePath('/api/v1/partner/validate')).toBe(true);
    expect(isPartnerRegistryValidatePath('/api/registry/v1/partner/validate')).toBe(true);
    expect(isPartnerRegistryValidatePath('/api/registry/partner/validate')).toBe(false);
  });

  it('reads HoloKey from generated SDK X-API-Key headers', () => {
    expect(readPartnerRegistryHoloKey({ 'x-api-key': 'holo-key' })).toBe('holo-key');
    expect(readPartnerRegistryHoloKey({ authorization: 'Bearer holo-key' })).toBe('holo-key');
  });

  it('returns an SDK envelope for valid HoloKey/x402 credentials', () => {
    const result = validatePartnerRegistryCredentials(
      {
        'x-api-key': 'server-holokey',
        'x-partner-id': 'partner-a',
      },
      'server-holokey'
    );

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toEqual({
      valid: true,
      partnerId: 'partner-a',
      tier: 'x402',
    });
    expect(result.body.rateLimit?.limit).toBe(1000);
  });

  it('rejects invalid HoloKey credentials without leaking expected values', () => {
    const result = validatePartnerRegistryCredentials({ 'x-api-key': 'wrong' }, 'server-holokey');

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error?.code).toBe('invalid_holokey');
    expect(JSON.stringify(result.body)).not.toContain('server-holokey');
  });
});
