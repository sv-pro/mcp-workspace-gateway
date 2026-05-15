import { GatewayClient } from '../../adapters/gatewayClient.js';

function createAdminClient(): GatewayClient {
  const gatewayUrl = process.env.MCP_MUX_GATEWAY_URL ?? `http://${process.env.MCP_MUX_HOST ?? '127.0.0.1'}:${process.env.MCP_MUX_PORT ?? '8787'}`;
  return new GatewayClient({
    baseUrl: gatewayUrl,
    sessionId: '__admin__',
  });
}

export async function runProfileListCommand(): Promise<void> {
  const client = createAdminClient();
  const profiles = await client.listProfiles();
  process.stdout.write(`${JSON.stringify(profiles, null, 2)}\n`);
}

export async function runProfileCreateCommand(id: string, upstreamIds: string[]): Promise<void> {
  const client = createAdminClient();
  await client.createProfile({ id, upstreamIds });
  process.stdout.write(`Created profile '${id}' with upstreams: ${upstreamIds.join(', ')}\n`);
}

export async function runProfileDeleteCommand(id: string): Promise<void> {
  const client = createAdminClient();
  await client.deleteProfile(id);
  process.stdout.write(`Deleted profile '${id}'\n`);
}

export async function runProfileAssignCommand(sessionId: string, profileId: string): Promise<void> {
  const client = createAdminClient();
  await client.setSessionProfile(sessionId, profileId);
  process.stdout.write(`Assigned profile '${profileId}' to session '${sessionId}'\n`);
}
