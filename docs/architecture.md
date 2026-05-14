# Architecture

See [ontology.md](./ontology.md) for definitions of Prototype, Definition,
Instance, Session, Binding, Projection, Policy, and World.

---

## Core model

**Principle: the adapter process is disposable; the gateway process is authoritative.**

```text
                       ┌──────────────────────────────────┐
Web UI ───────────────▶│                                  │
                       │     MCP Workspace Gateway        │
Inspector ─┐           │                                  │
           │ stdio     │  UpstreamTemplateRegistry        │
           ▼           │    (prototype catalogue)         │
   mcp-mux client ────▶│                                  │
       (session A)     │  UpstreamRegistry                │──▶ Instance A (stdio)
                       │    (definitions + instances)     │──▶ Instance B (http)
Codex ─────┐           │                                  │──▶ Instance C (mock)
           │ stdio     │  SessionManager                  │
           ▼           │    (sessions A, B, …)            │
   mcp-mux client ────▶│                                  │
       (session B)     │  Profiles / Bindings             │
                       │    (session→upstream sets)       │
                       │                                  │
                       │  ToolRegistry                    │
                       │    (aggregated exposed namespace) │
                       │                                  │
                       │  Router                          │
                       │    (JSON-RPC dispatch)           │
                       └──────────────────────────────────┘
```

---

## Layers

### Prototype layer — `UpstreamTemplateRegistry`

Stores the catalogue of known upstream types (Prototypes). Three built-in
prototypes ship with the gateway: `filesystem`, `memory`, `github`. Operators
can register custom prototypes via the API.

Source: `src/server/upstreamTemplateRegistry.ts`
Persisted to: `.mcp-mux-templates.json`

### Definition + Instance layer — `UpstreamRegistry`

Stores upstream Definitions (configured logical resources) and owns their
runtime Instances (adapter lifecycle). Each definition maps 1:1 to an adapter
object that lazily initializes its underlying process or connection on first use.

Adapter types:
- `MockUpstreamAdapter` — static JSON tool list; no subprocess
- `StdioUpstreamAdapter` — spawns a real MCP server process; stdio JSON-RPC
- `HttpUpstreamAdapter` — POSTs JSON-RPC to a remote URL

Source: `src/server/upstreamRegistry.ts`, `src/adapters/upstream/`
Persisted to: `.mcp-mux-upstreams.json`

### Session layer — `SessionManager`

Manages in-memory Session records. Sessions are auto-created on first RPC
contact (`touch()`). Each session carries optional `profileId` and `policyId`
references resolved at call time.

Source: `src/server/sessionManager.ts`
Not persisted (in-memory only).

### Binding layer — `ProfileRegistry`

Profiles are the current binding mechanism. A profile names the set of upstream
definitions whose instances a session may use. A session with no profile sees
all upstreams; a session with a profile sees only the named subset.

Future work will add per-binding namespace and mode controls.

Source: `src/server/profileRegistry.ts`
Persisted to: `.mcp-mux-profiles.json`

### Tool namespace — `ToolRegistry`

Aggregates tools across all instances visible to a session and applies the
naming convention:

```text
exposed_name      = {upstream_id}_{raw_tool_name}
canonical_tool_id = upstreams/{upstream_id}/tools/{raw_tool_name}
```

Source: `src/server/toolRegistry.ts`

### Routing — `Router`

Dispatches MCP JSON-RPC 2.0 requests: `initialize`, `tools/list`, `tools/call`.
Enforces profile-based visibility filtering and (scaffolded) policy rules.

Source: `src/server/router.ts`

### HTTP API — `httpApi.ts`

REST layer over `GatewayServer`. Exposes CRUD for upstreams, templates,
sessions, profiles, policies, approvals, and traces. Serves the Web UI at
`GET /`.

Source: `src/server/httpApi.ts`

---

## Client adapter

`mcp-mux client --session <id>` is a disposable stdio bridge. It reads
newline-delimited JSON-RPC from stdin, forwards to the gateway via HTTP, and
writes responses to stdout. It carries no state. MCP hosts (Inspector, Codex,
etc.) interact with it as if it were a local MCP server.

Source: `src/adapters/stdioClientAdapter.ts`

---

## Naming conventions

| Term | Meaning | Example |
|------|---------|---------|
| `raw_name` | upstream-local tool name | `search` |
| `canonical_tool_id` | stable internal ID | `upstreams/jira/tools/search` |
| `exposed_name` | gateway-visible name | `jira_search` |
| `upstream_id` | definition identity | `jira` |
| `session_id` | session identity | `inspector11` |

---

## Request lifecycle

1. MCP host sends JSON-RPC to the adapter process over stdio.
2. Adapter forwards the request to `POST /api/rpc/{sessionId}` on the gateway.
3. Gateway `SessionManager.touch()` auto-creates the session if needed.
4. `Router` dispatches the method:
   - `initialize` → returns gateway capabilities.
   - `tools/list` → `ToolRegistry` aggregates tools from instances bound to the
     session's profile, filtered by policy.
   - `tools/call` → `Router` resolves the exposed name, applies policy, calls
     the upstream instance, returns result.
5. Response flows back through the adapter to the MCP host.

---

## What is intentionally out of scope

- Policy engine, approvals, and governance → Safe MCP Proxy layer.
- World compilation and agent lifecycle → Agent Hypervisor layer.
- Hard process sandboxing → OS / Docker.
- Distributed coordination → not needed for single-node gateway.
