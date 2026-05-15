import { EventEmitter } from 'node:events';
import { ApprovalSummary, TraceEvent } from '../protocol/types.js';
import { SessionEvent } from '../protocol/sessionEvents.js';

export interface ApprovalGatewayEvent {
  kind: 'approval';
  action: 'enqueued' | 'decided';
  approval?: ApprovalSummary;
  id?: string;
  allowed?: boolean;
}

export interface TraceGatewayEvent {
  kind: 'trace';
  trace: TraceEvent;
}

export interface SessionGatewayEvent {
  kind: 'session';
  data: SessionEvent;
}

export type GatewayEvent = ApprovalGatewayEvent | TraceGatewayEvent | SessionGatewayEvent;

export class EventBus extends EventEmitter {
  publish(event: GatewayEvent): void {
    this.emit('event', event);
  }

  subscribe(listener: (event: GatewayEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}
