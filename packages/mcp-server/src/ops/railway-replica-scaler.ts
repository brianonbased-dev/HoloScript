/**
 * Railway GraphQL scaler — implements ops Scaler for AutoScalingLoop (P.008.01).
 *
 * Uses serviceInstanceUpdate + multiRegionConfig (see Railway public API docs).
 * Auth: RAILWAY_API_TOKEN or RAILWAY_TOKEN (Bearer), or RAILWAY_PROJECT_TOKEN (Project-Access-Token).
 */

import type { Scaler } from './pipeline.js';

const RAILWAY_GQL = 'https://backboard.railway.com/graphql/v2';

export interface RailwayReplicaScalerOptions {
  token?: string;
  projectToken?: string;
  serviceId: string;
  environmentId: string;
  /** Region key from Railway dashboard / regions query (e.g. us-west1, us-east4-eqdc4a). */
  region: string;
}

export class RailwayReplicaScaler implements Scaler {
  private readonly token?: string;
  private readonly projectToken?: string;
  private readonly serviceId: string;
  private readonly environmentId: string;
  private readonly region: string;

  constructor(opts: RailwayReplicaScalerOptions) {
    this.token = opts.token;
    this.projectToken = opts.projectToken;
    this.serviceId = opts.serviceId;
    this.environmentId = opts.environmentId;
    this.region = opts.region;
  }

  async setReplicas(n: number): Promise<void> {
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      throw new Error(`Invalid replica count: ${n}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.projectToken) {
      headers['Project-Access-Token'] = this.projectToken;
    } else if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else {
      throw new Error('RailwayReplicaScaler: missing token or projectToken');
    }

    const multiRegionConfig: Record<string, { numReplicas: number }> = {
      [this.region]: { numReplicas: Math.floor(n) },
    };

    const body = {
      query: `mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){
        serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input){ __typename }
      }`,
      variables: {
        serviceId: this.serviceId,
        environmentId: this.environmentId,
        input: { multiRegionConfig },
      },
    };

    const res = await fetch(RAILWAY_GQL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Railway HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    let json: { data?: unknown; errors?: Array<{ message?: string }> };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(`Railway response not JSON: ${text.slice(0, 200)}`);
    }

    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message || 'Railway GraphQL error');
    }
  }
}
