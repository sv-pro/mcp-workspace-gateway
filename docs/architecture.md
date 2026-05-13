# Architecture

## Core model

- **Gateway process (`mcp-mux serve`)** is authoritative and long-running.
- **CLI adapters (`mcp-mux client --session <id>`)** are disposable stdio bridges for MCP hosts.
- **Upstreams** are managed by the gateway and projected into an aggregated tool namespace.
- **Sessions** are logical identities handled by the gateway, not by adapter process lifetime.

## Components

- `src/server/gatewayServer.ts`: central orchestration object.
- `src/server/upstreamRegistry.ts`: upstream registration and lookup.
- `src/server/toolRegistry.ts`: canonical + exposed tool naming (`<upstream_id>_<raw_tool_name>`).
- `src/server/router.ts`: MCP request routing (`initialize`, `tools/list`, `tools/call`).
- `src/server/traceStore.ts`: in-memory traces for debugging.
- `src/adapters/stdioClientAdapter.ts`: stdio-compatible bridge process.
- `src/server/httpApi.ts`: gateway API + Web UI delivery.

## Naming model

- `raw_name`: upstream-local tool name (e.g. `search`)
- `canonical_tool_id`: stable internal id (e.g. `upstreams/jira/tools/search`)
- `exposed_name`: gateway-exposed name (e.g. `jira_search`)

## MVP transport

- CLI adapters use stdio JSON-RPC on one side.
- Adapters connect to the gateway over local HTTP JSON APIs.
- The gateway keeps one internal session model across all transports.
