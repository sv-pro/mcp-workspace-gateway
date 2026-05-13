export interface DashboardState {
  running: boolean;
  upstreams: string[];
  sessions: string[];
  tools: string[];
  traces: string[];
}

export function renderApp(state: DashboardState): string {
  return [
    `Gateway: ${state.running ? 'running' : 'stopped'}`,
    `Upstreams: ${state.upstreams.join(', ') || '(none)'}`,
    `Sessions: ${state.sessions.join(', ') || '(none)'}`,
    `Tools: ${state.tools.join(', ') || '(none)'}`,
    `Traces: ${state.traces.join(', ') || '(none)'}`,
  ].join('\n');
}
