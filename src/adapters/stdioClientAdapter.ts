import readline from 'node:readline';
import { GatewayClient } from './gatewayClient';
import { parseJsonRpcMessage, createSuccess, createErrorResponse, createError, JSON_RPC_ERRORS } from '../protocol/mcpJsonRpc';
import { JsonRpcRequest } from '../protocol/types';

export interface StdioClientAdapterOptions {
  sessionId: string;
  gatewayUrl: string;
  profile?: string;
  wait?: boolean;
}

const PROBE_INTERVAL_MS = 3000;

const READINESS_TOOL_WAITING = {
  name: 'readiness',
  description:
    'Returns gateway connection status. This is the only tool available while the gateway is starting up.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

const READINESS_TOOL_CONNECTED = {
  name: 'readiness',
  description: 'Returns gateway connection status.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export async function runStdioClientAdapter(options: StdioClientAdapterOptions): Promise<void> {
  const client = new GatewayClient({
    baseUrl: options.gatewayUrl,
    sessionId: options.sessionId,
  });

  if (!options.wait) {
    await client.connect(options.profile);
    return runLoop(client, options.gatewayUrl);
  }

  // --wait mode: readline starts immediately; gateway connection happens asynchronously
  let state: 'waiting' | 'connecting' | 'connected' = 'waiting';
  const waitingSince = new Date().toISOString();
  let connectedSince: string | undefined;

  const tryConnect = async (): Promise<void> => {
    if (state !== 'waiting') return;
    state = 'connecting';
    try {
      await client.connect(options.profile);
      connectedSince = new Date().toISOString();
      state = 'connected';
      clearInterval(probeTimer);
      write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    } catch {
      state = 'waiting';
    }
  };

  // eslint-disable-next-line prefer-const
  let probeTimer = setInterval(() => void tryConnect(), PROBE_INTERVAL_MS);
  void tryConnect();

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  const cleanup = async (): Promise<void> => {
    clearInterval(probeTimer);
    try {
      if (state === 'connected') await client.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());

  rl.on('line', (line) => {
    void (async () => {
      if (!line.trim()) return;

      let request: JsonRpcRequest;
      try {
        request = parseJsonRpcMessage(line);
      } catch (err) {
        write({ jsonrpc: '2.0', id: null, error: (err as { code: number; message: string }) });
        return;
      }

      if (state === 'connected') {
        const { id, method, params } = request;
        if (method === 'tools/call' && (params as Record<string, unknown>)?.name === 'readiness') {
          write(
            createSuccess(id, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    available: true,
                    gateway_url: options.gatewayUrl,
                    connected_since: connectedSince,
                  }),
                },
              ],
            }),
          );
          return;
        }
        try {
          const response = await client.sendRpc(request);
          if (response) {
            if (method === 'tools/list' && response.result) {
              const result = response.result as { tools: unknown[] };
              result.tools = [...(result.tools ?? []), READINESS_TOOL_CONNECTED];
            }
            write(response);
          }
        } catch (err) {
          if (id !== undefined) {
            write(createErrorResponse(id, createError(JSON_RPC_ERRORS.internal, (err as Error).message)));
          }
        }
        return;
      }

      // waiting / connecting — handle synthetically
      const { id, method, params } = request;

      if (method === 'initialize') {
        write(
          createSuccess(id, {
            protocolVersion: (params as Record<string, unknown>)?.protocolVersion ?? '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-mux', version: '0.1.0' },
          }),
        );
        return;
      }

      if (method === 'initialized') return; // notification, no response

      if (method === 'ping') {
        write(createSuccess(id, {}));
        return;
      }

      if (method === 'tools/list') {
        write(createSuccess(id, { tools: [READINESS_TOOL_WAITING] }));
        return;
      }

      if (method === 'tools/call') {
        const callParams = params as Record<string, unknown>;
        if (callParams?.name === 'readiness') {
          write(
            createSuccess(id, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    available: false,
                    gateway_url: options.gatewayUrl,
                    waiting_since: waitingSince,
                    message: `Waiting for gateway at ${options.gatewayUrl}`,
                  }),
                },
              ],
            }),
          );
          return;
        }
        write(
          createErrorResponse(
            id,
            createError(JSON_RPC_ERRORS.gatewayUnavailable, `Gateway not yet available — use the 'readiness' tool to check status`),
          ),
        );
        return;
      }

      if (id !== undefined) {
        write(
          createErrorResponse(
            id,
            createError(JSON_RPC_ERRORS.gatewayUnavailable, `Gateway not yet available at ${options.gatewayUrl}`),
          ),
        );
      }
    })();
  });

  rl.once('close', () => void cleanup());
}

async function runLoop(client: GatewayClient, gatewayUrl: string): Promise<void> {
  const connectedSince = new Date().toISOString();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  const cleanup = async (): Promise<void> => {
    try {
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());

  rl.on('line', (line) => {
    void (async () => {
      if (!line.trim()) return;
      try {
        const request = parseJsonRpcMessage(line);
        const { id, method, params } = request;

        if (method === 'tools/call' && (params as Record<string, unknown>)?.name === 'readiness') {
          write(
            createSuccess(id, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ available: true, gateway_url: gatewayUrl, connected_since: connectedSince }),
                },
              ],
            }),
          );
          return;
        }

        const response = await client.sendRpc(request);
        if (response) {
          if (method === 'tools/list' && response.result) {
            const result = response.result as { tools: unknown[] };
            result.tools = [...(result.tools ?? []), READINESS_TOOL_CONNECTED];
          }
          write(response);
        }
      } catch (error) {
        write({ jsonrpc: '2.0', id: null, error: { code: -32603, message: (error as Error).message } });
      }
    })();
  });

  rl.once('close', () => void cleanup());
}
