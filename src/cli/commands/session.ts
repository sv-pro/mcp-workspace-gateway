import { GatewayClient } from '../../adapters/gatewayClient.js';

function createAdminClient(): GatewayClient {
  const gatewayUrl = process.env.MCP_MUX_GATEWAY_URL ?? `http://${process.env.MCP_MUX_HOST ?? '127.0.0.1'}:${process.env.MCP_MUX_PORT ?? '8787'}`;
  return new GatewayClient({ baseUrl: gatewayUrl, sessionId: '__admin__' });
}

export async function runSessionListCommand(): Promise<void> {
  const client = createAdminClient();
  const sessions = await client.listSessions();
  process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
}
