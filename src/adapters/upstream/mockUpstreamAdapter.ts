import { promises as fs } from 'node:fs';
import { MockToolDefinition, MockUpstreamFile, UpstreamAdapter, UpstreamTool } from '../../protocol/types';

export class MockUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'mock' as const;

  private constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly tools: MockToolDefinition[],
  ) {}

  static async fromFile(id: string, filePath: string): Promise<MockUpstreamAdapter> {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as MockUpstreamFile;

    if (!Array.isArray(parsed.tools)) {
      throw new Error(`Invalid mock upstream file: ${filePath}`);
    }

    return new MockUpstreamAdapter(id, parsed.name ?? id, parsed.tools);
  }

  async listTools(): Promise<UpstreamTool[]> {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(rawToolName: string): Promise<unknown> {
    const tool = this.tools.find((candidate) => candidate.name === rawToolName);
    if (!tool) {
      throw Object.assign(new Error(`Tool not found: ${rawToolName}`), { code: -32601 });
    }

    return (
      tool.mockResult ?? {
        content: [
          {
            type: 'text',
            text: `Mock result from ${this.id}/${rawToolName}`,
          },
        ],
      }
    );
  }
}
