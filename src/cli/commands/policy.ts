import { GatewayClient } from '../../adapters/gatewayClient.js';

function createAdminClient(): GatewayClient {
  const gatewayUrl = process.env.MCP_MUX_GATEWAY_URL ?? `http://${process.env.MCP_MUX_HOST ?? '127.0.0.1'}:${process.env.MCP_MUX_PORT ?? '8787'}`;
  return new GatewayClient({
    baseUrl: gatewayUrl,
    sessionId: '__admin__',
  });
}

export async function runPolicyListCommand(): Promise<void> {
  const client = createAdminClient();
  const policies = await client.listPolicies();
  process.stdout.write(`${JSON.stringify(policies, null, 2)}\n`);
}

export async function runPolicyCreateCommand(id: string, defaultDecision: 'allow' | 'deny'): Promise<void> {
  const client = createAdminClient();
  await client.createPolicy({ id, rules: [], default_decision: defaultDecision });
  process.stdout.write(`Created policy '${id}' (default: ${defaultDecision})\n`);
}

export async function runPolicyDeleteCommand(id: string): Promise<void> {
  const client = createAdminClient();
  await client.deletePolicy(id);
  process.stdout.write(`Deleted policy '${id}'\n`);
}

export async function runPolicyAssignCommand(sessionId: string, policyId: string): Promise<void> {
  const client = createAdminClient();
  await client.setSessionPolicy(sessionId, policyId);
  process.stdout.write(`Assigned policy '${policyId}' to session '${sessionId}'\n`);
}
