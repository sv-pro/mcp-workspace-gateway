import fs from 'node:fs';
import { TraceEvent } from '../protocol/types.js';
import { EventBus } from './eventBus.js';

export class TraceStore {
  private readonly events: TraceEvent[] = [];
  private readonly bus: EventBus | null;

  constructor(
    private readonly maxEvents = 500,
    private readonly tracesFile: string | null = null,
    bus: EventBus | null = null,
  ) {
    this.bus = bus;
    if (tracesFile) {
      this.loadFromDisk();
    }
  }

  add(event: TraceEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    if (this.tracesFile) {
      try {
        fs.appendFileSync(this.tracesFile, JSON.stringify(event) + '\n', 'utf8');
      } catch {
        // non-fatal: in-memory ring buffer still works
      }
    }
    this.bus?.publish({ kind: 'trace', trace: event });
  }

  list(): TraceEvent[] {
    return [...this.events].reverse();
  }

  private loadFromDisk(): void {
    try {
      const raw = fs.readFileSync(this.tracesFile!, 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim());
      // take only the last maxEvents lines to bound startup time
      const slice = lines.slice(-this.maxEvents);
      for (const line of slice) {
        try {
          this.events.push(JSON.parse(line) as TraceEvent);
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file doesn't exist yet — that's fine
    }
  }
}
