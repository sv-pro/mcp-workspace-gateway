export interface SessionSummary {
  session_id: string;
  status: 'connected';
  connected_at: string;
  last_seen_at: string;
  profile?: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionSummary>();

  connect(sessionId: string): SessionSummary {
    const now = new Date().toISOString();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.last_seen_at = now;
      return existing;
    }

    const created: SessionSummary = {
      session_id: sessionId,
      status: 'connected',
      connected_at: now,
      last_seen_at: now,
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.connect(sessionId);
      return;
    }
    session.last_seen_at = new Date().toISOString();
  }

  setProfile(sessionId: string, profileId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.profile = profileId;
    return true;
  }

  disconnect(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => a.session_id.localeCompare(b.session_id));
  }
}
