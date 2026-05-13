export type SessionEventType = 'connected' | 'disconnected' | 'rpc';

export interface SessionEvent {
  timestamp: string;
  session_id: string;
  type: SessionEventType;
  method?: string;
}
