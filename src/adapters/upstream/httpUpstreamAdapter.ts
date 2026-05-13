import { UpstreamAdapter, UpstreamTool } from '../../protocol/types';

export class HttpUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'http' as const;

  constructor(public readonly id: string, public readonly name: string) {}

  async listTools(): Promise<UpstreamTool[]> {
    return [];
  }

  async callTool(): Promise<unknown> {
    throw new Error('HTTP upstream adapter not implemented in MVP');
  }
}
