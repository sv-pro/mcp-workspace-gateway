import { promises as fs, readFileSync } from 'node:fs';
import { MockToolDefinition, MockUpstreamFile, UpstreamAdapter, UpstreamTool } from '../../protocol/types';

export class MockUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'mock' as const;

  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly sourceFile: string | undefined,
    private readonly tools: MockToolDefinition[],
  ) {}

  static async fromFile(id: string, filePath: string): Promise<MockUpstreamAdapter> {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as MockUpstreamFile;
    return MockUpstreamAdapter.fromDefinition(id, parsed, filePath);
  }

  static fromFileSync(id: string, filePath: string): MockUpstreamAdapter {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content) as MockUpstreamFile;
    return MockUpstreamAdapter.fromDefinition(id, parsed, filePath);
  }

  static fromDefinition(id: string, parsed: MockUpstreamFile, sourceFile?: string): MockUpstreamAdapter {
    if (!Array.isArray(parsed.tools)) {
      throw new Error(`Invalid mock upstream definition: tools must be an array`);
    }

    return new MockUpstreamAdapter(id, parsed.name ?? id, sourceFile, parsed.tools);
  }

  toDefinition(): MockUpstreamFile {
    return {
      id: this.id,
      name: this.name,
      tools: this.tools,
    };
  }

  listToolsCached(): UpstreamTool[] {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async listTools(): Promise<UpstreamTool[]> {
    return this.listToolsCached();
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
