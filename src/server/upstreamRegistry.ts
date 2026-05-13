import path from 'node:path';
import { MockUpstreamAdapter } from '../adapters/upstream/mockUpstreamAdapter';
import { UpstreamAdapter } from '../protocol/types';

export interface UpstreamSummary {
  id: string;
  type: UpstreamAdapter['type'];
  name: string;
  tool_count: number;
}

export class UpstreamRegistry {
  private readonly upstreams = new Map<string, UpstreamAdapter>();

  async addMock(id: string, file: string): Promise<void> {
    const resolved = path.resolve(process.cwd(), file);
    const adapter = await MockUpstreamAdapter.fromFile(id, resolved);
    this.upstreams.set(id, adapter);
  }

  get(id: string): UpstreamAdapter | undefined {
    return this.upstreams.get(id);
  }

  listAdapters(): UpstreamAdapter[] {
    return [...this.upstreams.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async listSummaries(): Promise<UpstreamSummary[]> {
    const adapters = this.listAdapters();
    const summaries = await Promise.all(
      adapters.map(async (adapter) => ({
        id: adapter.id,
        type: adapter.type,
        name: adapter.name,
        tool_count: (await adapter.listTools()).length,
      })),
    );

    return summaries;
  }
}
