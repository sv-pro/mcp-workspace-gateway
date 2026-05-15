import { randomUUID } from 'node:crypto';
import { ApprovalSummary } from '../protocol/types.js';
import { EventBus } from './eventBus.js';

interface PendingApproval {
  id: string;
  session_id: string;
  exposed_name: string;
  args: unknown;
  created_at: string;
  timer: NodeJS.Timeout;
  resolve: (allow: boolean) => void;
}

export class ApprovalQueue {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly events: EventBus | null;

  constructor(events: EventBus | null = null) {
    this.events = events;
  }

  enqueue(sessionId: string, exposedName: string, args: unknown, timeoutMs = 60_000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.decide(id, false);
      }, timeoutMs);

      const entry: PendingApproval = {
        id,
        session_id: sessionId,
        exposed_name: exposedName,
        args,
        created_at: new Date().toISOString(),
        timer,
        resolve,
      };
      this.pending.set(id, entry);
      this.events?.publish({
        kind: 'approval',
        action: 'enqueued',
        approval: { id, session_id: sessionId, exposed_name: exposedName, args, created_at: entry.created_at },
      });
    });
  }

  list(): ApprovalSummary[] {
    return [...this.pending.values()]
      .map(({ id, session_id, exposed_name, args, created_at }) => ({
        id,
        session_id,
        exposed_name,
        args,
        created_at,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  decide(id: string, allow: boolean): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    this.events?.publish({ kind: 'approval', action: 'decided', id, allowed: allow });
    entry.resolve(allow);
    return true;
  }
}
