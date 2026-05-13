import { runStdioClientAdapter } from '../../adapters/stdioClientAdapter';

export async function runClientCommand(sessionId: string): Promise<void> {
  const gatewayUrl = process.env.MCP_MUX_GATEWAY_URL ?? `http://${process.env.MCP_MUX_HOST ?? '127.0.0.1'}:${process.env.MCP_MUX_PORT ?? '8787'}`;

  try {
    await runStdioClientAdapter({
      sessionId,
      gatewayUrl,
    });
  } catch (error) {
    process.stderr.write(
      `Failed to connect to running gateway at ${gatewayUrl}. Start it with 'mcp-mux serve'.\n${(error as Error).message}\n`,
    );
    process.exit(1);
  }
}
