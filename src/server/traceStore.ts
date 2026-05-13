import { TraceEvent } from '../protocol/types';

export class TraceStore {
  private readonly events: TraceEvent[] = [];

  constructor(private readonly maxEvents = 500) {}

  add(event: TraceEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  list(): TraceEvent[] {
    return [...this.events].reverse();
  }
}
