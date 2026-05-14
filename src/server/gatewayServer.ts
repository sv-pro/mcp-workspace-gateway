import path from 'node:path';
import { JsonRpcRequest, JsonRpcResponse } from '../protocol/types';
import { Router } from './router';
import { SessionManager } from './sessionManager';
import { ToolRegistry } from './toolRegistry';
import { TraceStore } from './traceStore';
import { UpstreamTemplateRegistry } from './upstreamTemplateRegistry';
import { UpstreamRegistry } from './upstreamRegistry';

export interface GatewayServerOptions {
  upstreamsFile?: string | null;
  templatesFile?: string | null;
}

export class GatewayServer {
  readonly sessions = new SessionManager();
  readonly upstreams: UpstreamRegistry;
  readonly templates: UpstreamTemplateRegistry;
  readonly traces = new TraceStore();
  readonly tools: ToolRegistry;
  private readonly router: Router;

  constructor(options: GatewayServerOptions = {}) {
    const upstreamsFile =
      options.upstreamsFile === undefined
        ? path.resolve(process.cwd(), process.env.MCP_MUX_UPSTREAMS_FILE ?? '.mcp-mux-upstreams.json')
        : options.upstreamsFile;
    const templatesFile =
      options.templatesFile === undefined
        ? path.resolve(process.cwd(), process.env.MCP_MUX_TEMPLATES_FILE ?? '.mcp-mux-templates.json')
        : options.templatesFile;

    this.upstreams = new UpstreamRegistry({ persistenceFile: upstreamsFile });
    this.templates = new UpstreamTemplateRegistry({ persistenceFile: templatesFile });
    this.tools = new ToolRegistry(this.upstreams);
    this.router = new Router(this.sessions, this.upstreams, this.tools, this.traces);
  }

  connectSession(sessionId: string): void {
    this.sessions.connect(sessionId);
  }

  disconnectSession(sessionId: string): void {
    this.sessions.disconnect(sessionId);
  }

  async handleRpc(sessionId: string, request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    return this.router.handle(sessionId, request);
  }

  status(): {
    running: boolean;
    upstreams: ReturnType<UpstreamRegistry['listSummaries']>;
    sessions: ReturnType<SessionManager['list']>;
    tools: ReturnType<ToolRegistry['listCached']>;
    traces: ReturnType<TraceStore['list']>;
  } {
    return {
      running: true,
      upstreams: this.upstreams.listSummaries(),
      sessions: this.sessions.list(),
      tools: this.tools.listCached(),
      traces: this.traces.list(),
    };
  }
}
