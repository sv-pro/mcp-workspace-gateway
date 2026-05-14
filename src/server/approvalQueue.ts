import { randomUUID } from 'node:crypto';
import { ApprovalSummary } from '../protocol/types.js';

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

  enqueue(sessionId: string, exposedName: string, args: unknown, timeoutMs = 60_000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.decide(id, false);
      }, timeoutMs);

      this.pending.set(id, {
        id,
        session_id: sessionId,
        exposed_name: exposedName,
        args,
        created_at: new Date().toISOString(),
        timer,
        resolve,
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
    entry.resolve(allow);
    return true;
  }
}
