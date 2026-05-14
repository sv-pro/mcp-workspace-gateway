export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export interface MockToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  mockResult?: unknown;
}

export interface MockUpstreamFile {
  id?: string;
  name?: string;
  tools: MockToolDefinition[];
}

export interface StdioUpstreamDefinition {
  id: string;
  name?: string;
  executable: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface HttpUpstreamDefinition {
  id: string;
  name?: string;
  url: string;
  headers?: Record<string, string>;
}

export interface UpstreamTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface UpstreamAdapter {
  id: string;
  type: 'mock' | 'stdio' | 'http';
  name: string;
  listTools(): Promise<UpstreamTool[]>;
  listToolsCached(): UpstreamTool[];
  callTool(rawToolName: string, args: unknown): Promise<unknown>;
}

export interface AggregatedTool {
  canonical_tool_id: string;
  exposed_name: string;
  upstream_id: string;
  raw_name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Profile {
  id: string;
  upstreamIds: string[];
}

export type PolicyDecision = 'allow' | 'deny' | 'absent' | 'simulate' | 'ask';

export interface PolicyRule {
  pattern: string;
  decision: PolicyDecision;
  mock_result?: unknown;
}

export interface GovernancePolicy {
  id: string;
  rules: PolicyRule[];
  default_decision: 'allow' | 'deny';
}

export interface ApprovalSummary {
  id: string;
  session_id: string;
  exposed_name: string;
  args: unknown;
  created_at: string;
}

export interface TraceEvent {
  timestamp: string;
  session_id: string;
  direction: string;
  method: string;
  exposed_tool_name: string | null;
  upstream_id: string | null;
  raw_tool_name: string | null;
  status: 'ok' | 'error';
  error_code: string | null;
  policy_id: string | null;
  policy_decision: PolicyDecision | null;
  policy_rule_pattern: string | null;
}
