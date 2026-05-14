import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HttpUpstreamAdapter } from '../adapters/upstream/httpUpstreamAdapter';
import { MockUpstreamAdapter } from '../adapters/upstream/mockUpstreamAdapter';
import { StdioUpstreamAdapter } from '../adapters/upstream/stdioUpstreamAdapter';
import { HttpUpstreamDefinition, MockUpstreamFile, StdioUpstreamDefinition, UpstreamAdapter } from '../protocol/types';

export interface UpstreamSummary {
  id: string;
  type: UpstreamAdapter['type'];
  name: string;
  tool_count: number;
  source_file?: string;
  executable?: string;
  args?: string[];
  cwd?: string;
  url?: string;
}

interface PersistedRegistry {
  version: 1;
  upstreams: PersistedUpstream[];
}

type PersistedUpstream =
  | {
      type: 'mock';
      id: string;
      file?: string;
      definition?: MockUpstreamFile;
    }
  | {
      type: 'stdio';
      definition: StdioUpstreamDefinition;
    }
  | {
      type: 'http';
      definition: HttpUpstreamDefinition;
    };

export interface UpstreamRegistryOptions {
  persistenceFile?: string | null;
}

export interface UpstreamTestResult {
  id: string;
  ok: boolean;
  duration_ms: number;
  tool_count?: number;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
}

export class UpstreamRegistry {
  private readonly upstreams = new Map<string, UpstreamAdapter>();
  private readonly persistenceFile: string | null;

  constructor(options: UpstreamRegistryOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? null;
    this.loadPersisted();
  }

  async addMock(id: string, file: string): Promise<void> {
    const resolved = path.resolve(process.cwd(), file);
    const adapter = await MockUpstreamAdapter.fromFile(id, resolved);
    this.set(id, adapter, true);
  }

  addMockDefinition(id: string, definition: MockUpstreamFile): void {
    const adapter = MockUpstreamAdapter.fromDefinition(id, definition);
    this.set(id, adapter, true);
  }

  getMockDefinition(id: string): MockUpstreamFile | undefined {
    const adapter = this.upstreams.get(id);
    if (!(adapter instanceof MockUpstreamAdapter)) {
      return undefined;
    }

    return adapter.toDefinition();
  }

  addStdioDefinition(definition: StdioUpstreamDefinition): void {
    const adapter = StdioUpstreamAdapter.fromDefinition(definition);
    this.set(definition.id, adapter, true);
  }

  addHttpDefinition(definition: HttpUpstreamDefinition): void {
    const adapter = HttpUpstreamAdapter.fromDefinition(definition);
    this.set(definition.id, adapter, true);
  }

  getHttpDefinition(id: string): HttpUpstreamDefinition | undefined {
    const adapter = this.upstreams.get(id);
    if (!(adapter instanceof HttpUpstreamAdapter)) {
      return undefined;
    }
    return adapter.toDefinition();
  }

  getStdioDefinition(id: string): StdioUpstreamDefinition | undefined {
    const adapter = this.upstreams.get(id);
    if (!(adapter instanceof StdioUpstreamAdapter)) {
      return undefined;
    }

    return adapter.toDefinition();
  }

  remove(id: string): boolean {
    const adapter = this.upstreams.get(id);
    if (!adapter) {
      return false;
    }

    this.closeAdapter(adapter);
    const removed = this.upstreams.delete(id);
    this.persist();
    return removed;
  }

  closeAll(): void {
    for (const adapter of this.upstreams.values()) {
      this.closeAdapter(adapter);
    }
    this.upstreams.clear();
  }

  get(id: string): UpstreamAdapter | undefined {
    return this.upstreams.get(id);
  }

  getDiagnostics(id: string): Record<string, unknown> | undefined {
    const adapter = this.upstreams.get(id);
    if (!adapter) {
      return undefined;
    }

    if (adapter instanceof MockUpstreamAdapter) {
      return {
        id: adapter.id,
        type: adapter.type,
        name: adapter.name,
        status: 'ready',
        source_file: adapter.sourceFile ?? null,
      };
    }

    if (adapter instanceof StdioUpstreamAdapter) {
      return adapter.diagnostics();
    }

    if (adapter instanceof HttpUpstreamAdapter) {
      return adapter.diagnostics();
    }

    return {
      id: adapter.id,
      type: adapter.type,
      name: adapter.name,
      status: 'unknown',
    };
  }

  restart(id: string): boolean {
    const adapter = this.upstreams.get(id);
    if (!(adapter instanceof StdioUpstreamAdapter)) {
      return false;
    }

    adapter.close();
    return true;
  }

  async test(id: string): Promise<UpstreamTestResult | undefined> {
    const adapter = this.upstreams.get(id);
    if (!adapter) {
      return undefined;
    }

    const started = Date.now();
    try {
      const tools = await adapter.listTools();
      return {
        id,
        ok: true,
        duration_ms: Date.now() - started,
        tool_count: tools.length,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      };
    } catch (error) {
      return {
        id,
        ok: false,
        duration_ms: Date.now() - started,
        error: (error as Error).message,
      };
    }
  }

  listAdapters(): UpstreamAdapter[] {
    return [...this.upstreams.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  listSummaries(): UpstreamSummary[] {
    return this.listAdapters().map((adapter) => {
      const summary: UpstreamSummary = {
        id: adapter.id,
        type: adapter.type,
        name: adapter.name,
        tool_count: adapter.listToolsCached().length,
      };

      if (adapter instanceof MockUpstreamAdapter && adapter.sourceFile) {
        summary.source_file = adapter.sourceFile;
      }

      if (adapter instanceof StdioUpstreamAdapter) {
        summary.executable = adapter.executable;
        if (adapter.args.length) {
          summary.args = adapter.args;
        }
        if (adapter.cwd) {
          summary.cwd = adapter.cwd;
        }
      }

      if (adapter instanceof HttpUpstreamAdapter) {
        summary.url = adapter.url;
      }

      return summary;
    });
  }

  private set(id: string, adapter: UpstreamAdapter, shouldPersist: boolean): void {
    const existing = this.upstreams.get(id);
    if (existing) {
      this.closeAdapter(existing);
    }
    this.upstreams.set(id, adapter);
    if (shouldPersist) {
      this.persist();
    }
  }

  private closeAdapter(adapter: UpstreamAdapter): void {
    if (adapter instanceof StdioUpstreamAdapter) {
      adapter.close();
    }
  }

  private loadPersisted(): void {
    if (!this.persistenceFile || !existsSync(this.persistenceFile)) {
      return;
    }

    const persisted = JSON.parse(readFileSync(this.persistenceFile, 'utf8')) as PersistedRegistry;
    if (persisted.version !== 1 || !Array.isArray(persisted.upstreams)) {
      throw new Error(`Invalid upstream registry file: ${this.persistenceFile}`);
    }

    for (const upstream of persisted.upstreams) {
      if (upstream.type === 'mock') {
        if (upstream.file) {
          this.set(upstream.id, MockUpstreamAdapter.fromFileSync(upstream.id, upstream.file), false);
          continue;
        }

        if (!upstream.definition) {
          throw new Error(`Invalid persisted mock upstream '${upstream.id}': file or definition is required`);
        }

        this.set(upstream.id, MockUpstreamAdapter.fromDefinition(upstream.id, upstream.definition), false);
        continue;
      }

      if (upstream.type === 'stdio') {
        this.set(upstream.definition.id, StdioUpstreamAdapter.fromDefinition(upstream.definition), false);
        continue;
      }

      if (upstream.type === 'http') {
        this.set(upstream.definition.id, HttpUpstreamAdapter.fromDefinition(upstream.definition), false);
      }
    }
  }

  private persist(): void {
    if (!this.persistenceFile) {
      return;
    }

    const directory = path.dirname(this.persistenceFile);
    mkdirSync(directory, { recursive: true });
    const payload: PersistedRegistry = {
      version: 1,
      upstreams: this.listAdapters().map((adapter) => this.toPersisted(adapter)),
    };
    const temporaryFile = `${this.persistenceFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(temporaryFile, this.persistenceFile);
  }

  private toPersisted(adapter: UpstreamAdapter): PersistedUpstream {
    if (adapter instanceof MockUpstreamAdapter) {
      if (adapter.sourceFile) {
        return {
          type: 'mock',
          id: adapter.id,
          file: adapter.sourceFile,
        };
      }

      return {
        type: 'mock',
        id: adapter.id,
        definition: adapter.toDefinition(),
      };
    }

    if (adapter instanceof StdioUpstreamAdapter) {
      return {
        type: 'stdio',
        definition: adapter.toDefinition(),
      };
    }

    if (adapter instanceof HttpUpstreamAdapter) {
      return {
        type: 'http',
        definition: adapter.toDefinition(),
      };
    }

    throw new Error(`Unsupported upstream type for persistence: ${adapter.type}`);
  }
}
