import { GatewayServer } from '../../server/gatewayServer';
import { startHttpApi } from '../../server/httpApi';

export async function runServeCommand(): Promise<void> {
  const host = process.env.MCP_MUX_HOST ?? '127.0.0.1';
  const port = Number(process.env.MCP_MUX_PORT ?? '8787');

  const gateway = new GatewayServer();
  await startHttpApi(gateway, { host, port });

  process.stdout.write(`mcp-mux gateway running on http://${host}:${port}\n`);
  process.stdout.write(`Web UI: http://${host}:${port}\n`);

  await new Promise(() => {
    // intentionally never resolves while process is running
  });
}
