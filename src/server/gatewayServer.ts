import path from 'node:path';
import { JsonRpcRequest, JsonRpcResponse } from '../protocol/types.js';
import { ApprovalQueue } from './approvalQueue.js';
import { PolicyRegistry } from './policyRegistry.js';
import { ProfileRegistry } from './profileRegistry.js';
import { Router } from './router.js';
import { SessionManager } from './sessionManager.js';
import { ToolRegistry } from './toolRegistry.js';
import { TraceStore } from './traceStore.js';
import { UpstreamTemplateRegistry } from './upstreamTemplateRegistry.js';
import { UpstreamRegistry } from './upstreamRegistry.js';

export interface GatewayServerOptions {
  upstreamsFile?: string | null;
  templatesFile?: string | null;
  profilesFile?: string | null;
  policiesFile?: string | null;
  tracesFile?: string | null;
  sessionsFile?: string | null;
}

export class GatewayServer {
  readonly sessions: SessionManager;
  readonly upstreams: UpstreamRegistry;
  readonly templates: UpstreamTemplateRegistry;
  readonly profiles: ProfileRegistry;
  readonly policies: PolicyRegistry;
  readonly approvals = new ApprovalQueue();
  readonly traces: TraceStore;
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
    const profilesFile =
      options.profilesFile === undefined
        ? path.resolve(process.cwd(), '.mcp-mux-profiles.json')
        : options.profilesFile;
    const policiesFile =
      options.policiesFile === undefined
        ? path.resolve(process.cwd(), '.mcp-mux-policies.json')
        : options.policiesFile;
    const sessionsFile =
      options.sessionsFile === undefined
        ? path.resolve(process.cwd(), '.mcp-mux-sessions.json')
        : options.sessionsFile;

    const tracesFile =
      options.tracesFile === undefined
        ? path.resolve(process.cwd(), '.mcp-mux-traces.jsonl')
        : options.tracesFile;

    this.traces = new TraceStore(500, tracesFile);
    this.upstreams = new UpstreamRegistry({ persistenceFile: upstreamsFile });
    this.templates = new UpstreamTemplateRegistry({ persistenceFile: templatesFile });
    this.profiles = new ProfileRegistry({ persistenceFile: profilesFile });
    this.policies = new PolicyRegistry({ persistenceFile: policiesFile });
    this.sessions = new SessionManager({ persistenceFile: sessionsFile });
    this.tools = new ToolRegistry(this.upstreams);
    this.router = new Router(
      this.sessions,
      this.upstreams,
      this.tools,
      this.traces,
      this.profiles,
      this.policies,
      this.approvals,
    );
  }

  connectSession(sessionId: string, profileId?: string): void {
    this.sessions.connect(sessionId);
    if (profileId) {
      this.sessions.setProfile(sessionId, profileId);
    }
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
