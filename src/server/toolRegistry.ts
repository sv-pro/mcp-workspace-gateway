import { AggregatedTool, UpstreamAdapter } from '../protocol/types.js';
import { UpstreamRegistry } from './upstreamRegistry.js';

export class ToolRegistry {
  constructor(private readonly upstreamRegistry: UpstreamRegistry) {}

  async list(upstreamFilter?: string[]): Promise<AggregatedTool[]> {
    const adapters = this.filteredAdapters(upstreamFilter);
    const toolsByUpstream = await Promise.all(adapters.map((adapter) => this.listForAdapter(adapter)));
    return toolsByUpstream.flat().sort((a, b) => a.exposed_name.localeCompare(b.exposed_name));
  }

  listCached(upstreamFilter?: string[]): AggregatedTool[] {
    return this.filteredAdapters(upstreamFilter)
      .flatMap((adapter) =>
        adapter.listToolsCached().map((rawTool) => ({
          canonical_tool_id: `upstreams/${adapter.id}/tools/${rawTool.name}`,
          exposed_name: `${adapter.id}_${rawTool.name}`,
          upstream_id: adapter.id,
          raw_name: rawTool.name,
          description: rawTool.description,
          inputSchema: rawTool.inputSchema,
        })),
      )
      .sort((a, b) => a.exposed_name.localeCompare(b.exposed_name));
  }

  async resolveByExposedName(exposedName: string, upstreamFilter?: string[]): Promise<AggregatedTool | undefined> {
    const tools = await this.list(upstreamFilter);
    return tools.find((tool) => tool.exposed_name === exposedName);
  }

  private filteredAdapters(upstreamFilter?: string[]): UpstreamAdapter[] {
    const all = this.upstreamRegistry.listAdapters();
    if (!upstreamFilter) {
      return all;
    }
    const allowed = new Set(upstreamFilter);
    return all.filter((adapter) => allowed.has(adapter.id));
  }

  private async listForAdapter(adapter: UpstreamAdapter): Promise<AggregatedTool[]> {
    const rawTools = await adapter.listTools();
    return rawTools.map((rawTool) => ({
      canonical_tool_id: `upstreams/${adapter.id}/tools/${rawTool.name}`,
      exposed_name: `${adapter.id}_${rawTool.name}`,
      upstream_id: adapter.id,
      raw_name: rawTool.name,
      description: rawTool.description,
      inputSchema: rawTool.inputSchema,
    }));
  }
}
