# MCP Workspace Gateway

**alias: mcp-mux**

```text
Many fake local MCP servers.
One real workspace gateway.
Many upstream MCP servers.
```

## Problem

MCP clients launch local stdio server commands. This works for single-client
setups, but falls apart when multiple clients (Inspector, Codex, a web UI) need
to share one managed workspace of upstream MCP servers.

Without a shared gateway, every MCP client becomes its own isolated universe of
upstream processes, state, and traces.

- Each client spawns its own upstream processes — no coordination, duplicated
  state, no shared traces.
- There is no place to attach session bindings or a shared tool namespace.
- Restarting a client loses all session context.

## Solution

Run one long-running gateway process. Each MCP client launches a lightweight
stdio-compatible adapter process that looks like a local MCP server from the
client's perspective, but is really just a transport bridge into the shared
gateway.

The gateway is the authoritative coordinator for upstream definitions and
instances, sessions, tool namespaces, and traces.

The gateway turns isolated MCP client runtimes into a shared, observable
workspace substrate.

## How it fits in the stack

```text
MCP
  ↓
MCP Workspace Gateway (this project)
  ↓
Safe MCP Proxy              [future — governs capability visibility]
  ↓
Agent Hypervisor            [future — virtualizes executable worlds]
```

MCP Workspace Gateway is the **substrate**. It solves coordination.
It does not solve governance or world virtualization — those belong to the
layers above.

## Architecture in one diagram

```text
                       ┌────────────────────────────────┐
Web UI ───────────────▶│                                │
                       │    MCP Workspace Gateway       │
Inspector ─┐           │                                │
           │ stdio     │  upstream prototypes           │
           ▼           │  upstream definitions+instances│──▶ filesystem (stdio)
   mcp-mux client ────▶│  sessions                      │──▶ github (http)
                       │  session bindings              │──▶ jira (mock)
Codex ─────┐           │  tool namespace                │
           │ stdio     │  router + traces               │
           ▼           │                                │
   mcp-mux client ────▶│                                │
                       └────────────────────────────────┘
```

See [docs/ontology.md](docs/ontology.md) for the full concept model
(Prototype → Definition → Instance → Session → Binding → Projection → World).

See [docs/architecture.md](docs/architecture.md) for component detail.

## Quickstart

1. Start the gateway:

   ```bash
   npm install
   npm run build
   npx mcp-mux serve
   ```

2. Register upstream definitions:

   ```bash
   npx mcp-mux upstream add-mock filesystem examples/mock-upstreams/filesystem.json
   npx mcp-mux upstream add-mock jira      examples/mock-upstreams/jira.json
   npx mcp-mux upstream add-mock github    examples/mock-upstreams/github.json
   ```

3. Connect Inspector as a stdio MCP client:

   ```bash
   npx mcp-mux client --session inspector
   ```

4. Connect a second client (for example Codex):

   ```bash
   npx mcp-mux client --session codex
   ```

5. Open the Web UI at `http://127.0.0.1:8787` to observe sessions, upstreams,
   tools, and traces.

## Trust boundary

The gateway coordinates. Docker isolates. OS enforces.

This project prevents accidental conflicts inside one gateway instance. It does
not sandbox upstream processes from each other or from the host OS.

See [docs/trust-boundary.md](docs/trust-boundary.md) for details.

## MVP scope

Each layer of the stack solves a distinct problem:

| Layer | Solves |
|---|---|
| **MCP Workspace Gateway** (this project) | coordination, sessions, multiplexing, upstream lifecycle, namespace routing |
| **Safe MCP Proxy** (future) | governed visibility, policy, approvals, capability shaping |
| **Agent Hypervisor** (future) | executable world virtualization, deterministic world semantics |

This project is the coordination substrate. It is **not** yet:

- Safe MCP Proxy (projection, governed capability visibility)
- Agent Hypervisor (world virtualization, agent lifecycle)

Not in scope for this project:
- hard process sandboxing
- cryptographic client identity
- distributed coordination
- policy/approval engine (scaffolded but not the design target here)
