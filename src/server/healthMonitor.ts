import { UpstreamRegistry } from './upstreamRegistry.js';

const INITIAL_DELAY_MS = 2000;
const DEFAULT_INTERVAL_MS = 30_000;

export class HealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly registry: UpstreamRegistry,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
  ) {}

  start(): void {
    this.running = true;
    setTimeout(() => {
      if (this.running) void this.checkAll();
    }, INITIAL_DELAY_MS);
    this.timer = setInterval(() => {
      if (this.running) void this.checkAll();
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkAll(): Promise<void> {
    const summaries = this.registry.listSummaries();
    await Promise.allSettled(
      summaries.map(async (s) => {
        const result = await this.registry.test(s.id);
        if (!result) return;
        this.registry.recordHealthCheck(s.id, {
          ok: result.ok,
          duration_ms: result.duration_ms,
          error: result.error,
          checked_at: new Date().toISOString(),
        });
      }),
    );
  }
}
