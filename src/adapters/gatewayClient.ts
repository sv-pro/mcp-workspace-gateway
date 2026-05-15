import { GovernancePolicy, JsonRpcRequest, JsonRpcResponse, Profile } from '../protocol/types.js';

export interface GatewayClientOptions {
  baseUrl: string;
  sessionId: string;
}

export class GatewayClient {
  constructor(private readonly options: GatewayClientOptions) {}

  async connect(profile?: string): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(this.options.sessionId)}/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: profile ? JSON.stringify({ profile }) : '{}',
    });
  }

  async disconnect(): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(this.options.sessionId)}/disconnect`, {
      method: 'POST',
    });
  }

  async sendRpc(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const response = await this.request(`/api/rpc/${encodeURIComponent(this.options.sessionId)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as JsonRpcResponse;
  }

  async listUpstreams(): Promise<unknown> {
    const response = await this.request('/api/upstreams', { method: 'GET' });
    return response.json();
  }

  async addMockUpstream(id: string, file: string): Promise<void> {
    await this.request('/api/upstreams/mock', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id, file }),
    });
  }

  async addMockUpstreamJson(id: string, mockJson: string): Promise<void> {
    await this.request('/api/upstreams/mock', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id, mock_json: mockJson }),
    });
  }

  async addStdioUpstream(definition: {
    id: string;
    name?: string;
    executable: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<void> {
    await this.request('/api/upstreams/stdio', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(definition),
    });
  }

  async addHttpUpstream(definition: {
    id: string;
    name?: string;
    url: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    await this.request('/api/upstreams/http', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(definition),
    });
  }

  async removeUpstream(id: string): Promise<void> {
    await this.request(`/api/upstreams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async listProfiles(): Promise<Profile[]> {
    const response = await this.request('/api/profiles', { method: 'GET' });
    return response.json();
  }

  async createProfile(profile: Profile): Promise<void> {
    await this.request('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile),
    });
  }

  async deleteProfile(id: string): Promise<void> {
    await this.request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async listPolicies(): Promise<GovernancePolicy[]> {
    const response = await this.request('/api/policies', { method: 'GET' });
    return response.json();
  }

  async listSessions(): Promise<unknown[]> {
    const response = await this.request('/api/sessions', { method: 'GET' });
    return response.json();
  }

  async createPolicy(policy: GovernancePolicy): Promise<void> {
    await this.request('/api/policies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(policy),
    });
  }

  async deletePolicy(id: string): Promise<void> {
    await this.request(`/api/policies/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async setSessionProfile(sessionId: string, profileId: string): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId }),
    });
  }

  async setSessionPolicy(sessionId: string, policyId: string): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/policy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policyId }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}${path}`, init);
    } catch (error) {
      throw new Error(`Gateway unavailable at ${this.options.baseUrl}: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway request failed (${response.status}): ${text}`);
    }

    return response;
  }
}
