/**
 * Minimal Cloudflare Load Balancing pool client (origin weights).
 * @see https://developers.cloudflare.com/api/resources/load_balancers/subresources/pools/
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

export interface CfOrigin {
  name: string;
  address: string;
  weight?: number;
  enabled?: boolean;
  port?: number;
  header?: Record<string, string>;
  [key: string]: unknown;
}

export interface CfPoolResult {
  id: string;
  name?: string;
  origins: CfOrigin[];
  [key: string]: unknown;
}

async function parseCfJson(res: Response): Promise<{ success: boolean; result?: CfPoolResult; errors?: Array<{ message?: string }> }> {
  const text = await res.text();
  try {
    return JSON.parse(text) as { success: boolean; result?: CfPoolResult; errors?: Array<{ message?: string }> };
  } catch {
    throw new Error(`Cloudflare response not JSON: ${text.slice(0, 200)}`);
  }
}

export async function cfGetLoadBalancerPool(
  accountId: string,
  poolId: string,
  apiToken: string
): Promise<CfPoolResult> {
  const res = await fetch(`${CF_API}/accounts/${accountId}/load_balancers/pools/${poolId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const j = await parseCfJson(res);
  if (!res.ok || !j.success || !j.result) {
    throw new Error(j.errors?.[0]?.message || `Cloudflare GET pool HTTP ${res.status}`);
  }
  return j.result;
}

export async function cfPatchLoadBalancerPool(
  accountId: string,
  poolId: string,
  apiToken: string,
  body: Record<string, unknown>
): Promise<CfPoolResult> {
  const res = await fetch(`${CF_API}/accounts/${accountId}/load_balancers/pools/${poolId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const j = await parseCfJson(res);
  if (!res.ok || !j.success || !j.result) {
    throw new Error(j.errors?.[0]?.message || `Cloudflare PATCH pool HTTP ${res.status}`);
  }
  return j.result;
}
