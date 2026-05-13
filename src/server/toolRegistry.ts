import { AggregatedTool, UpstreamAdapter } from '../protocol/types';
import { UpstreamRegistry } from './upstreamRegistry';

export class ToolRegistry {
  constructor(private readonly upstreamRegistry: UpstreamRegistry) {}

  async list(): Promise<AggregatedTool[]> {
    const adapters = this.upstreamRegistry.listAdapters();
    const toolsByUpstream = await Promise.all(adapters.map((adapter) => this.listForAdapter(adapter)));
    return toolsByUpstream.flat().sort((a, b) => a.exposed_name.localeCompare(b.exposed_name));
  }

  async resolveByExposedName(exposedName: string): Promise<AggregatedTool | undefined> {
    const tools = await this.list();
    return tools.find((tool) => tool.exposed_name === exposedName);
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
