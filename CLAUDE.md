# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # compile TypeScript → dist/
npm test               # build + run all tests (node:test runner, not jest)
npx mcp-mux serve      # start gateway on http://127.0.0.1:8787

make start             # build + start gateway as background daemon
make stop              # stop daemon
make status            # check if running
make logs              # tail .mcp-mux.log

# Run a single test file
node --test dist/test/router.test.js
```

Environment variables: `MCP_MUX_HOST`, `MCP_MUX_PORT`, `MCP_MUX_UPSTREAMS_FILE`, `MCP_MUX_TEMPLATES_FILE`.

## Architecture

Two independent processes communicate over HTTP:

**Gateway process** (`mcp-mux serve`) — long-running HTTP server on port 8787. Owns all state:
- `GatewayServer` wires together `SessionManager`, `UpstreamRegistry`, `ToolRegistry`, `TraceStore`, and `Router`
- `Router` handles JSON-RPC 2.0 methods: `initialize`, `tools/list`, `tools/call`, `notifications/initialized`
- `ToolRegistry` aggregates tools from all upstreams; exposed name is `{upstream_id}_{raw_tool_name}`
- `UpstreamRegistry` manages adapter lifecycle and persists state atomically to `.mcp-mux-upstreams.json`
- `UpstreamTemplateRegistry` persists to `.mcp-mux-templates.json`

**Client adapter process** (`mcp-mux client --session <name>`) — lightweight stdio bridge. Reads newline-delimited JSON-RPC from stdin, forwards to gateway via `GatewayClient` (HTTP), writes responses to stdout. MCP hosts (Inspector, Codex, etc.) talk to this via stdio; it is stateless.

**Upstream adapters** implement the `UpstreamAdapter` interface (`protocol/types.ts`):
- `MockUpstreamAdapter` — serves tools from a static JSON file; returns configurable mock results
- `StdioUpstreamAdapter` — spawns a real MCP server process, speaks JSON-RPC 2.0 over stdio, 30s timeout per request
- `HttpUpstreamAdapter` — stub, not yet implemented (throws on use)

**HTTP API** (`src/server/httpApi.ts`) — REST layer over `GatewayServer`. All upstream CRUD, session connect/disconnect, RPC proxy, and `/api/status` live here. The web UI at `/` is served as static HTML from `src/web/index.html`.

## Key conventions

- **Test runner**: Node.js built-in `node:test` — use `import { test, describe } from 'node:test'` and `import assert from 'node:assert/strict'`. No jest, no vitest.
- **Module system**: CommonJS output (`"type": "commonjs"` in package.json, `"module": "Node16"` in tsconfig). Use `.js` extensions in imports even for `.ts` source files.
- **Persistence**: atomic write via temp file + `renameSync`. Both registry files are gitignored; passing `null` as `persistenceFile` disables persistence (used in tests).
- **Tool namespacing**: `{upstream_id}_{raw_tool_name}` — underscore separator, no slashes. The canonical ID format is `upstreams/{upstream_id}/tools/{raw_tool_name}`.
- **No external runtime dependencies**: only Node.js built-ins and TypeScript dev dependencies.
