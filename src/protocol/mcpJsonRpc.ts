import { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from './types';

export const JSON_RPC_VERSION = '2.0';

export const JSON_RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  upstreamBusy: -32010,
  gatewayUnavailable: -32011,
} as const;

export function parseJsonRpcMessage(line: string): JsonRpcRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw createError(JSON_RPC_ERRORS.parse, 'Parse error');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as JsonRpcRequest).jsonrpc !== JSON_RPC_VERSION ||
    typeof (parsed as JsonRpcRequest).method !== 'string'
  ) {
    throw createError(JSON_RPC_ERRORS.invalidRequest, 'Invalid Request');
  }

  return parsed as JsonRpcRequest;
}

export function createSuccess(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    result,
  };
}

export function createErrorResponse(id: JsonRpcRequest['id'], error: JsonRpcError): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    error,
  };
}

export function createError(code: number, message: string, data?: unknown): JsonRpcError {
  return { code, message, data };
}
