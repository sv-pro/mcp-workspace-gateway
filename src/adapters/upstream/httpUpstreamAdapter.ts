import { HttpUpstreamDefinition, UpstreamAdapter, UpstreamTool } from '../../protocol/types';

interface JsonRpcResult {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class HttpUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'http' as const;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private cachedTools: UpstreamTool[] | null = null;
  private nextRequestId = 1;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly url: string,
    public readonly headers: Record<string, string> = {},
  ) {}

  static fromDefinition(definition: HttpUpstreamDefinition): HttpUpstreamAdapter {
    if (!definition.id.trim()) {
      throw new Error('Invalid HTTP upstream definition: id is required');
    }
    if (!definition.url.trim()) {
      throw new Error('Invalid HTTP upstream definition: url is required');
    }
    return new HttpUpstreamAdapter(
      definition.id,
      definition.name?.trim() || definition.id,
      definition.url,
      definition.headers ?? {},
    );
  }

  toDefinition(): HttpUpstreamDefinition {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
      ...(Object.keys(this.headers).length ? { headers: this.headers } : {}),
    };
  }

  listToolsCached(): UpstreamTool[] {
    return this.cachedTools ?? [];
  }

  async listTools(): Promise<UpstreamTool[]> {
    await this.initialize();
    const result = (await this.request('tools/list', {})) as { tools?: UpstreamTool[] };
    const tools = result.tools ?? [];
    this.cachedTools = tools;
    return tools;
  }

  async callTool(rawToolName: string, args: unknown): Promise<unknown> {
    await this.initialize();
    return this.request('tools/call', { name: rawToolName, arguments: args });
  }

  diagnostics(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      url: this.url,
      status: this.initialized ? 'connected' : 'not-initialized',
      initialized: this.initialized,
      cached_tool_count: this.cachedTools?.length ?? null,
    };
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = (async () => {
      try {
        await this.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-workspace-gateway', version: '0.1.0' },
        });
        this.initialized = true;
        // fire-and-forget; ignore errors
        void this.notify('notifications/initialized', {});
      } catch (error) {
        this.initializePromise = null;
        throw error;
      }
    })();

    return this.initializePromise;
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.headers },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP upstream '${this.id}' responded with ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as JsonRpcResult;
      if (json.error) {
        throw Object.assign(new Error(json.error.message), {
          code: json.error.code,
          data: json.error.data,
        });
      }
      return json.result;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`HTTP upstream '${this.id}' timed out during ${method}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private notify(method: string, params: unknown): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    return fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .then(() => undefined)
      .finally(() => clearTimeout(timer));
  }
}
