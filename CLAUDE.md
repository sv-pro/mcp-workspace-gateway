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

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `MCP_MUX_HOST` | `127.0.0.1` | Gateway bind address |
| `MCP_MUX_PORT` | `8787` | Gateway port |
| `MCP_MUX_UPSTREAMS_FILE` | `.mcp-mux-upstreams.json` | Upstream registry persistence file |
| `MCP_MUX_TEMPLATES_FILE` | `.mcp-mux-templates.json` | Template registry persistence file |
| `MCP_MUX_GATEWAY_URL` | `http://{HOST}:{PORT}` | Override full gateway URL (used by client) |

## Architecture

Two independent processes communicate over HTTP:

**Gateway process** (`mcp-mux serve`) — long-running HTTP server on port 8787. Owns all state. The `GatewayServer` class wires together:
- `SessionManager` — in-memory session table (lost on restart)
- `UpstreamRegistry` — adapter lifecycle + atomic persistence to `.mcp-mux-upstreams.json`
- `UpstreamTemplateRegistry` — persists to `.mcp-mux-templates.json`; ships three built-in templates (`filesystem`, `memory`, `github`)
- `ProfileRegistry` — persists to `.mcp-mux-profiles.json`
- `PolicyRegistry` — persists to `.mcp-mux-policies.json`
- `ApprovalQueue` — in-memory pending approvals with 60 s auto-deny timeout
- `TraceStore` — in-memory ring buffer capped at 500 events (newest-first)
- `ToolRegistry` — aggregates tools from all upstreams; handles profile-based filtering
- `Router` — JSON-RPC 2.0 dispatch with full governance enforcement

**Client adapter process** (`mcp-mux client --session <name>`) — lightweight stdio bridge. Reads newline-delimited JSON-RPC from stdin, forwards to gateway via `GatewayClient` (HTTP), writes responses to stdout. Stateless; MCP hosts (Inspector, Codex, etc.) speak to it via stdio.

**Upstream adapters** implement `UpstreamAdapter` (`protocol/types.ts`):
- `MockUpstreamAdapter` — reads tools from a static JSON file; returns configurable mock results; ignores call arguments
- `StdioUpstreamAdapter` — spawns a real MCP server process; speaks newline-delimited JSON-RPC 2.0 over stdio; 30 s request timeout; detached process group for clean teardown
- `HttpUpstreamAdapter` — POSTs JSON-RPC to a remote URL; 30 s request timeout; `initialize` handshake on first use

**HTTP API** (`src/server/httpApi.ts`) — REST layer over `GatewayServer`. Web UI at `GET /` is served directly from `src/web/index.html`.

## Source layout

```
src/
  adapters/
    gatewayClient.ts          # HTTP client used by CLI and stdio bridge
    stdioClientAdapter.ts     # stdio→HTTP bridge (runs as client process)
    upstream/
      mockUpstreamAdapter.ts
      stdioUpstreamAdapter.ts
      httpUpstreamAdapter.ts
  cli/
    index.ts                  # arg parsing, routes to commands
    commands/
      serve.ts                # mcp-mux serve
      client.ts               # mcp-mux client
      upstream.ts             # mcp-mux upstream list/add-mock/add-http
  protocol/
    types.ts                  # all shared interfaces and types
    mcpJsonRpc.ts             # parse/create helpers, JSON_RPC_ERRORS constants
    sessionEvents.ts          # SessionEvent types (defined, not yet wired)
  server/
    gatewayServer.ts          # root composition object
    httpApi.ts                # REST routes
    router.ts                 # JSON-RPC method dispatch + governance
    sessionManager.ts
    upstreamRegistry.ts
    upstreamTemplateRegistry.ts
    toolRegistry.ts
    policyRegistry.ts
    profileRegistry.ts
    approvalQueue.ts
    traceStore.ts
  test/                       # mirrors server/ structure
  web/
    index.html                # single-file web UI (served from disk at runtime)
    src/                      # React source (compiled into index.html; not built by npm run build)
```

## Key conventions

- **Test runner**: Node.js built-in `node:test` — `import { test, describe } from 'node:test'` and `import assert from 'node:assert/strict'`. No jest, no vitest.
- **Module system**: CommonJS output (`"type": "commonjs"` in package.json, `"module": "Node16"` in tsconfig). Use `.js` extensions on all local imports even for `.ts` source files.
- **Persistence**: atomic write via temp file + `renameSync`. All four registry files are gitignored; passing `null` as the persistence file disables it (tests always do this).
- **Tool namespacing**: exposed name is `{upstream_id}_{raw_tool_name}` (underscore separator). Canonical ID is `upstreams/{upstream_id}/tools/{raw_tool_name}`.
- **No external runtime dependencies**: only Node.js built-ins and TypeScript dev dependencies.
- **Admin session**: CLI upstream commands use session ID `__admin__`; no auth model exists yet.

## HTTP API reference

### Health / status
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/api/status` | Full gateway status (upstreams, sessions, tools, traces) |

### Upstreams
| Method | Path | Body / Notes |
|---|---|---|
| GET | `/api/upstreams` | List `UpstreamSummary[]` |
| POST | `/api/upstreams/mock` | `{ id, file? \| mock_json? }` → 201 |
| POST | `/api/upstreams/stdio` | `{ id, name?, executable, args?, cwd?, env? }` → 201 |
| POST | `/api/upstreams/http` | `{ id, name?, url, headers? }` → 201 |
| GET | `/api/upstreams/{id}/diagnostics` | Adapter diagnostics object |
| POST | `/api/upstreams/{id}/test` | `{ ok, duration_ms, tool_count?, tools?, error? }` |
| POST | `/api/upstreams/{id}/restart` | Stdio only; restarts process |
| GET | `/api/upstreams/{id}/mock` | Returns `MockUpstreamFile` |
| GET | `/api/upstreams/{id}/stdio` | Returns `StdioUpstreamDefinition` |
| GET | `/api/upstreams/{id}/http` | Returns `HttpUpstreamDefinition` |
| DELETE | `/api/upstreams/{id}` | Remove adapter |

### Upstream templates
| Method | Path | Notes |
|---|---|---|
| GET | `/api/upstream-templates` | Built-in + custom |
| POST | `/api/upstream-templates` | `{ id, label, definition: StdioUpstreamDefinition }` → 201 |
| GET | `/api/upstream-templates/{id}` | |
| DELETE | `/api/upstream-templates/{id}` | |

### Profiles
| Method | Path | Notes |
|---|---|---|
| GET | `/api/profiles` | |
| POST | `/api/profiles` | `{ id, upstreamIds: string[] }` → 201 |
| GET | `/api/profiles/{id}` | |
| DELETE | `/api/profiles/{id}` | |

### Policies
| Method | Path | Notes |
|---|---|---|
| GET | `/api/policies` | |
| POST | `/api/policies` | `{ id, rules: PolicyRule[], default_decision: 'allow'\|'deny' }` → 201 |
| GET | `/api/policies/{id}` | |
| DELETE | `/api/policies/{id}` | |

### Sessions
| Method | Path | Body |
|---|---|---|
| POST | `/api/sessions/{id}/connect` | `{ profile?: string }` |
| POST | `/api/sessions/{id}/disconnect` | — |
| POST | `/api/sessions/{id}/profile` | `{ profileId: string }` |
| POST | `/api/sessions/{id}/policy` | `{ policyId: string }` |

### Approvals
| Method | Path | Notes |
|---|---|---|
| GET | `/api/approvals` | List pending |
| POST | `/api/approvals/{id}/allow` | Resolve as allowed |
| POST | `/api/approvals/{id}/deny` | Resolve as denied |

### RPC proxy
| Method | Path | Notes |
|---|---|---|
| POST | `/api/rpc/{sessionId}` | JSON-RPC request body → response, or 204 for notifications |

## Governance (policy + approval)

A session may have an attached policy. When `tools/call` is received, the Router evaluates the policy's rules against the exposed tool name using glob-like matching (`*` → `.*`, `?` → `.`). Decisions:

| Decision | Effect on `tools/list` | Effect on `tools/call` |
|---|---|---|
| `allow` | Visible | Executed normally |
| `deny` | Visible | Error -32602 "denied by policy" |
| `absent` | Hidden | Error -32602 "denied by policy" |
| `simulate` | Visible | Returns `mock_result` from rule (no upstream call) |
| `ask` | Visible | Blocks up to 60 s waiting for operator approval via `/api/approvals`; auto-deny on timeout |

Rules are matched first-wins. `default_decision` applies when no rule matches.

## Session lifecycle

Sessions are in-memory only (no persistence). `SessionManager.touch()` auto-creates a session on first RPC call. `connect` and `disconnect` are available as explicit operations. Sessions hold optional `profile` and `policy` IDs resolved at call time.

## Stdio adapter internals

`StdioUpstreamAdapter` lazily initializes: on the first `listTools()` or `callTool()` it spawns the process, performs the MCP `initialize` handshake, caches tools, then proceeds. A pending-requests map tracks in-flight calls by JSON-RPC ID. Stderr is buffered (max 4 000 chars) and exposed via `diagnostics()`. Process is spawned detached on non-Windows so `process.kill(-pid)` kills the whole group on `close()`.

## Testing patterns

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayServer } from '../server/gatewayServer.js';

test('example', async () => {
  // Disable persistence in every test
  const gw = new GatewayServer({
    upstreamsFile: null,
    templatesFile: null,
    profilesFile: null,
    policiesFile: null,
  });

  const resp = await gw.handleRpc('sess1', {
    jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
  });
  assert.ok(resp?.result);
});
```

Key test conventions:
- Always pass `null` for all persistence files — never write to disk in tests
- Example mock upstreams live in `examples/mock-upstreams/*.json`
- Use `path.resolve(__dirname, '../..')` when you need the project root
- Approval queue tests rely on `decide()` resolving synchronously before the promise settles

## Persistence files (all gitignored)

| File | Owned by | In-memory fallback |
|---|---|---|
| `.mcp-mux-upstreams.json` | `UpstreamRegistry` | Pass `null` |
| `.mcp-mux-templates.json` | `UpstreamTemplateRegistry` | Pass `null` |
| `.mcp-mux-profiles.json` | `ProfileRegistry` | Pass `null` |
| `.mcp-mux-policies.json` | `PolicyRegistry` | Pass `null` |

All four use the same atomic-write pattern: write to `<file>.tmp`, then `renameSync` to target.

Not persisted (in-memory only, lost on restart): sessions, approval queue, trace events.
