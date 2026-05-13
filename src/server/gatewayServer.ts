import { JsonRpcRequest, JsonRpcResponse } from '../protocol/types';
import { Router } from './router';
import { SessionManager } from './sessionManager';
import { ToolRegistry } from './toolRegistry';
import { TraceStore } from './traceStore';
import { UpstreamRegistry } from './upstreamRegistry';

export class GatewayServer {
  readonly sessions = new SessionManager();
  readonly upstreams = new UpstreamRegistry();
  readonly traces = new TraceStore();
  readonly tools = new ToolRegistry(this.upstreams);
  private readonly router = new Router(this.sessions, this.upstreams, this.tools, this.traces);

  connectSession(sessionId: string): void {
    this.sessions.connect(sessionId);
  }

  disconnectSession(sessionId: string): void {
    this.sessions.disconnect(sessionId);
  }

  async handleRpc(sessionId: string, request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    return this.router.handle(sessionId, request);
  }

  async status(): Promise<{
    running: boolean;
    upstreams: Awaited<ReturnType<UpstreamRegistry['listSummaries']>>;
    sessions: ReturnType<SessionManager['list']>;
    tools: Awaited<ReturnType<ToolRegistry['list']>>;
    traces: ReturnType<TraceStore['list']>;
  }> {
    return {
      running: true,
      upstreams: await this.upstreams.listSummaries(),
      sessions: this.sessions.list(),
      tools: await this.tools.list(),
      traces: this.traces.list(),
    };
  }
}
