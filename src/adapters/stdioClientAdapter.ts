import readline from 'node:readline';
import { GatewayClient } from './gatewayClient';
import { parseJsonRpcMessage } from '../protocol/mcpJsonRpc';

export interface StdioClientAdapterOptions {
  sessionId: string;
  gatewayUrl: string;
}

export async function runStdioClientAdapter(options: StdioClientAdapterOptions): Promise<void> {
  const client = new GatewayClient({
    baseUrl: options.gatewayUrl,
    sessionId: options.sessionId,
  });

  await client.connect();

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  const cleanup = async (): Promise<void> => {
    try {
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => {
    void cleanup();
  });
  process.once('SIGTERM', () => {
    void cleanup();
  });

  rl.on('line', (line) => {
    void (async () => {
      if (!line.trim()) {
        return;
      }

      try {
        const request = parseJsonRpcMessage(line);
        const response = await client.sendRpc(request);
        if (response) {
          process.stdout.write(`${JSON.stringify(response)}\n`);
        }
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: (error as Error).message,
            },
          })}\n`,
        );
      }
    })();
  });

  rl.once('close', () => {
    void cleanup();
  });
}
