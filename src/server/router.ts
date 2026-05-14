import { JSON_RPC_ERRORS, createError, createErrorResponse, createSuccess } from '../protocol/mcpJsonRpc.js';
import { JsonRpcRequest, JsonRpcResponse, PolicyDecision, TraceEvent } from '../protocol/types.js';
import { ApprovalQueue } from './approvalQueue.js';
import { PolicyRegistry } from './policyRegistry.js';
import { ProfileRegistry } from './profileRegistry.js';
import { SessionManager } from './sessionManager.js';
import { ToolRegistry } from './toolRegistry.js';
import { TraceStore } from './traceStore.js';
import { UpstreamRegistry } from './upstreamRegistry.js';

interface ToolsCallParams {
  name?: string;
  arguments?: unknown;
}

export class Router {
  constructor(
    private readonly sessions: SessionManager,
    private readonly upstreamRegistry: UpstreamRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly traces: TraceStore,
    private readonly profiles: ProfileRegistry,
    private readonly policyRegistry: PolicyRegistry,
    private readonly approvalQueue: ApprovalQueue,
  ) {}

  async handle(sessionId: string, request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    this.sessions.touch(sessionId);

    let response: JsonRpcResponse | null = null;
    let trace: TraceEvent = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      direction: 'client->gateway',
      method: request.method,
      exposed_tool_name: null,
      upstream_id: null,
      raw_tool_name: null,
      status: 'ok',
      error_code: null,
    };

    try {
      switch (request.method) {
        case 'initialize': {
          response = createSuccess(request.id, {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'mcp-workspace-gateway',
              version: '0.1.0',
            },
            capabilities: {
              tools: {},
            },
          });
          break;
        }
        case 'tools/list': {
          const upstreamFilter = this.resolveUpstreamFilter(sessionId);
          const tools = await this.toolRegistry.list(upstreamFilter);
          const visible = tools.filter(
            (t) => this.resolveDecision(sessionId, t.exposed_name).decision !== 'absent',
          );
          response = createSuccess(request.id, {
            tools: visible.map((tool) => ({
              name: tool.exposed_name,
              description: tool.description,
              inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
            })),
          });
          break;
        }
        case 'tools/call': {
          const params = (request.params ?? {}) as ToolsCallParams;
          if (!params.name || typeof params.name !== 'string') {
            throw createError(JSON_RPC_ERRORS.invalidParams, 'tools/call requires params.name');
          }

          const upstreamFilter = this.resolveUpstreamFilter(sessionId);
          const resolved = await this.toolRegistry.resolveByExposedName(params.name, upstreamFilter);
          if (!resolved) {
            throw createError(JSON_RPC_ERRORS.methodNotFound, `Unknown tool: ${params.name}`);
          }

          trace = {
            ...trace,
            exposed_tool_name: resolved.exposed_name,
            upstream_id: resolved.upstream_id,
            raw_tool_name: resolved.raw_name,
          };

          const upstream = this.upstreamRegistry.get(resolved.upstream_id);
          if (!upstream) {
            throw createError(JSON_RPC_ERRORS.internal, `Upstream missing: ${resolved.upstream_id}`);
          }

          const { decision, mock_result } = this.resolveDecision(sessionId, resolved.exposed_name);

          if (decision === 'deny' || decision === 'absent') {
            throw createError(JSON_RPC_ERRORS.invalidParams, `Tool call denied by policy: ${params.name}`);
          }

          if (decision === 'simulate') {
            response = createSuccess(request.id, mock_result ?? {});
            break;
          }

          if (decision === 'ask') {
            const allowed = await this.approvalQueue.enqueue(
              sessionId,
              resolved.exposed_name,
              params.arguments ?? {},
            );
            if (!allowed) {
              throw createError(JSON_RPC_ERRORS.invalidParams, `Tool call rejected by operator: ${params.name}`);
            }
          }

          const result = await upstream.callTool(resolved.raw_name, params.arguments ?? {});
          response = createSuccess(request.id, result);
          break;
        }
        case 'notifications/initialized': {
          return null;
        }
        default:
          throw createError(JSON_RPC_ERRORS.methodNotFound, `Method not found: ${request.method}`);
      }
    } catch (error) {
      const err = error as { code?: number; message?: string; data?: unknown };
      trace = {
        ...trace,
        status: 'error',
        error_code: String(err.code ?? JSON_RPC_ERRORS.internal),
      };
      response = createErrorResponse(request.id, {
        code: err.code ?? JSON_RPC_ERRORS.internal,
        message: err.message ?? 'Internal error',
        data: err.data,
      });
    }

    this.traces.add(trace);
    return response;
  }

  private resolveUpstreamFilter(sessionId: string): string[] | undefined {
    const session = this.sessions.list().find((s) => s.session_id === sessionId);
    if (!session?.profile) {
      return undefined;
    }
    const profile = this.profiles.get(session.profile);
    return profile?.upstreamIds;
  }

  private resolveDecision(
    sessionId: string,
    exposedName: string,
  ): { decision: PolicyDecision; mock_result?: unknown } {
    const session = this.sessions.list().find((s) => s.session_id === sessionId);
    if (!session?.policy) {
      return { decision: 'allow' };
    }
    const policy = this.policyRegistry.get(session.policy);
    if (!policy) {
      return { decision: 'allow' };
    }
    for (const rule of policy.rules) {
      if (this.matchesPattern(rule.pattern, exposedName)) {
        return { decision: rule.decision, mock_result: rule.mock_result };
      }
    }
    return { decision: policy.default_decision };
  }

  private matchesPattern(pattern: string, name: string): boolean {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`).test(name);
  }
}
