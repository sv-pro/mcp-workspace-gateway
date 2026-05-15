import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SessionSummary {
  session_id: string;
  status: 'connected';
  connected_at: string;
  last_seen_at: string;
  profile?: string;
  policy?: string;
}

interface PersistedSessions {
  version: 1;
  sessions: SessionSummary[];
}

export interface SessionManagerOptions {
  persistenceFile?: string | null;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionManager {
  private readonly sessions = new Map<string, SessionSummary>();
  private readonly persistenceFile: string | null;
  private readonly ttlMs: number;

  constructor(options: SessionManagerOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? null;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.load();
  }

  connect(sessionId: string): SessionSummary {
    const now = new Date().toISOString();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.last_seen_at = now;
      this.persist();
      return existing;
    }

    const created: SessionSummary = {
      session_id: sessionId,
      status: 'connected',
      connected_at: now,
      last_seen_at: now,
    };
    this.sessions.set(sessionId, created);
    this.persist();
    return created;
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.connect(sessionId);
      return;
    }
    session.last_seen_at = new Date().toISOString();
    // Optimization: we don't persist on every touch to avoid I/O storms.
    // Assignments (profile/policy) are the primary persistence target.
    // last_seen_at will be updated on disk whenever an assignment changes or a new session connects.
  }

  setProfile(sessionId: string, profileId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.profile = profileId;
    this.persist();
    return true;
  }

  setPolicy(sessionId: string, policyId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.policy = policyId;
    this.persist();
    return true;
  }

  disconnect(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.persist();
    }
  }

  list(): SessionSummary[] {
    this.prune();
    return [...this.sessions.values()].sort((a, b) => a.session_id.localeCompare(b.session_id));
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      const lastSeen = new Date(session.last_seen_at).getTime();
      if (now - lastSeen >= this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  private load(): void {
    if (!this.persistenceFile || !existsSync(this.persistenceFile)) {
      return;
    }

    try {
      const persisted = JSON.parse(readFileSync(this.persistenceFile, 'utf8')) as PersistedSessions;
      if (persisted.version !== 1 || !Array.isArray(persisted.sessions)) {
        return;
      }

      const now = Date.now();
      for (const session of persisted.sessions) {
        const lastSeen = new Date(session.last_seen_at).getTime();
        if (now - lastSeen < this.ttlMs) {
          this.sessions.set(session.session_id, session);
        }
      }
    } catch (e) {
      // Ignore errors in session persistence file
    }
  }

  private persist(): void {
    if (!this.persistenceFile) {
      return;
    }

    try {
      const directory = path.dirname(this.persistenceFile);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
      }

      const payload: PersistedSessions = {
        version: 1,
        sessions: [...this.sessions.values()],
      };

      const temporaryFile = `${this.persistenceFile}.tmp`;
      writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      renameSync(temporaryFile, this.persistenceFile);
    } catch (e) {
      // Ignore errors persisting sessions
    }
  }
}
