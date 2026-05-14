import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import readline from 'node:readline';
import { JsonRpcResponse, StdioUpstreamDefinition, UpstreamAdapter, UpstreamTool } from '../../protocol/types';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class StdioUpstreamAdapter implements UpstreamAdapter {
  readonly type = 'stdio' as const;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stderr = '';
  private initialized = false;
  private startedAt: string | null = null;
  private lastError: string | null = null;
  private lastExit: { code: number | null; signal: NodeJS.Signals | null; timestamp: string } | null = null;
  private nextRequestId = 1;
  private initializePromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest>();

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly executable: string,
    public readonly args: string[] = [],
    public readonly cwd?: string,
    public readonly env?: Record<string, string>,
  ) {}

  static fromDefinition(definition: StdioUpstreamDefinition): StdioUpstreamAdapter {
    if (!definition.id.trim()) {
      throw new Error('Invalid stdio upstream definition: id is required');
    }

    if (!definition.executable.trim()) {
      throw new Error('Invalid stdio upstream definition: executable is required');
    }

    return new StdioUpstreamAdapter(
      definition.id,
      definition.name?.trim() || definition.id,
      definition.executable,
      definition.args ?? [],
      definition.cwd?.trim() || undefined,
      definition.env,
    );
  }

  toDefinition(): StdioUpstreamDefinition {
    return {
      id: this.id,
      name: this.name,
      executable: this.executable,
      args: this.args,
      ...(this.cwd ? { cwd: this.cwd } : {}),
      ...(this.env ? { env: this.env } : {}),
    };
  }

  async listTools(): Promise<UpstreamTool[]> {
    await this.initialize();
    const result = (await this.request('tools/list', {})) as { tools?: UpstreamTool[] };
    return result.tools ?? [];
  }

  async callTool(rawToolName: string, args: unknown): Promise<unknown> {
    await this.initialize();
    return this.request('tools/call', {
      name: rawToolName,
      arguments: args,
    });
  }

  close(): void {
    if (!this.child) {
      this.initializePromise = null;
      this.initialized = false;
      return;
    }

    const child = this.child;
    this.rejectPending(new Error(`Stdio upstream '${this.id}' stopped`));
    if (process.platform !== 'win32' && this.child.pid) {
      try {
        process.kill(-this.child.pid);
      } catch {
        child.kill();
      }
    } else {
      child.kill();
    }
    this.child = null;
    this.initializePromise = null;
    this.initialized = false;
  }

  diagnostics(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.child ? 'running' : 'stopped',
      pid: this.child?.pid ?? null,
      command: [this.executable, ...this.args].join(' '),
      executable: this.executable,
      args: this.args,
      cwd: this.cwd ?? process.cwd(),
      initialized: this.initialized,
      started_at: this.startedAt,
      pending_requests: this.pendingRequests.size,
      stderr_tail: this.stderr.trim() || null,
      last_error: this.lastError,
      last_exit: this.lastExit,
    };
  }

  private async initialize(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      this.ensureStarted();
      await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-workspace-gateway',
          version: '0.1.0',
        },
      });
      this.initialized = true;
      this.notify('notifications/initialized', {});
    })();

    return this.initializePromise;
  }

  private ensureStarted(): void {
    if (this.child) {
      return;
    }

    this.child = spawn(this.executable, this.args, {
      cwd: this.cwd || process.cwd(),
      env: {
        ...process.env,
        ...this.env,
      },
      detached: process.platform !== 'win32',
    });
    this.startedAt = new Date().toISOString();
    this.lastError = null;
    this.lastExit = null;

    const rl = readline.createInterface({
      input: this.child.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      this.handleLine(line);
    });

    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString();
      if (this.stderr.length > 4000) {
        this.stderr = this.stderr.slice(-4000);
      }
    });

    this.child.once('error', (error) => {
      this.lastError = error.message;
      this.rejectPending(error);
      this.child = null;
      this.initializePromise = null;
      this.initialized = false;
    });

    this.child.once('exit', (code, signal) => {
      const suffix = this.stderr.trim() ? `: ${this.stderr.trim()}` : '';
      const error = new Error(`Stdio upstream '${this.id}' exited (${signal ?? code})${suffix}`);
      this.lastError = error.message;
      this.lastExit = { code, signal, timestamp: new Date().toISOString() };
      this.rejectPending(error);
      this.child = null;
      this.initializePromise = null;
      this.initialized = false;
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }

    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code, data: message.error.data }));
      return;
    }

    pending.resolve(message.result);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    this.ensureStarted();
    const child = this.child;
    if (!child) {
      throw new Error(`Stdio upstream '${this.id}' is not running`);
    }

    const id = this.nextRequestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Stdio upstream '${this.id}' timed out during ${method}`));
      }, 30_000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  private notify(method: string, params: unknown): void {
    this.ensureStarted();
    this.child?.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
      })}\n`,
    );
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}
