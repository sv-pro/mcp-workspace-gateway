import type { AddressInfo } from 'node:net';
import { GatewayServer } from '../../server/gatewayServer';
import { startHttpApi } from '../../server/httpApi';

export async function runServeCommand(): Promise<void> {
  const host = process.env.MCP_MUX_HOST ?? '127.0.0.1';
  const port = Number(process.env.MCP_MUX_PORT ?? '8787');

  const gateway = new GatewayServer();
  const server = await startHttpApi(gateway, { host, port });
  const actualPort = (server.address() as AddressInfo).port;

  process.stdout.write(`mcp-mux gateway running on http://${host}:${actualPort}\n`);
  process.stdout.write(`Web UI: http://${host}:${actualPort}\n`);

  gateway.health.start();

  await new Promise<void>((resolve) => {
    const keepAlive = setInterval(() => undefined, 2 ** 30);
    const stop = (): void => {
      gateway.health.stop();
      clearInterval(keepAlive);
      gateway.upstreams.closeAll();
      server.close(() => resolve());
    };

    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
}
