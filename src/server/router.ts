import { JSON_RPC_ERRORS, createError, createErrorResponse, createSuccess } from '../protocol/mcpJsonRpc.js';
import { JsonRpcRequest, JsonRpcResponse, TraceEvent } from '../protocol/types.js';
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
          response = createSuccess(request.id, {
            tools: tools.map((tool) => ({
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
}
