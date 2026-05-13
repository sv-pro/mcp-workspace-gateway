import { UpstreamAdapter, UpstreamTool } from '../../protocol/types';

export class StdioUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'stdio' as const;

  constructor(public readonly id: string, public readonly name: string) {}

  async listTools(): Promise<UpstreamTool[]> {
    return [];
  }

  async callTool(): Promise<unknown> {
    throw Object.assign(new Error('UPSTREAM_BUSY: stdio upstream not implemented in MVP'), { code: -32010 });
  }
}
