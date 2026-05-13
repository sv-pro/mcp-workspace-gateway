import { JsonRpcRequest, JsonRpcResponse } from '../protocol/types';

export interface GatewayClientOptions {
  baseUrl: string;
  sessionId: string;
}

export class GatewayClient {
  constructor(private readonly options: GatewayClientOptions) {}

  async connect(): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(this.options.sessionId)}/connect`, {
      method: 'POST',
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
