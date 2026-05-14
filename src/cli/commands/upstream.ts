import { GatewayClient } from '../../adapters/gatewayClient';

function createAdminClient(): GatewayClient {
  const gatewayUrl = process.env.MCP_MUX_GATEWAY_URL ?? `http://${process.env.MCP_MUX_HOST ?? '127.0.0.1'}:${process.env.MCP_MUX_PORT ?? '8787'}`;
  return new GatewayClient({
    baseUrl: gatewayUrl,
    sessionId: '__admin__',
  });
}

export async function runUpstreamListCommand(): Promise<void> {
  const client = createAdminClient();
  const upstreams = (await client.listUpstreams()) as unknown[];
  process.stdout.write(`${JSON.stringify(upstreams, null, 2)}\n`);
}

export async function runUpstreamAddMockCommand(id: string, file: string): Promise<void> {
  const client = createAdminClient();
  await client.addMockUpstream(id, file);
  process.stdout.write(`Added mock upstream '${id}' from ${file}\n`);
}

export async function runUpstreamAddHttpCommand(id: string, url: string): Promise<void> {
  const client = createAdminClient();
  await client.addHttpUpstream({ id, url });
  process.stdout.write(`Added HTTP upstream '${id}' at ${url}\n`);
}
