# MCP Workspace Gateway

## Thesis

Many fake local MCP servers. One real workspace gateway. Many upstream MCP servers.

## Problem

MCP hosts often launch local stdio server commands. This works for simple cases, but it makes it hard to share one managed MCP workspace across multiple clients such as Inspector, Codex, and Web UI.

## Solution

Run one long-running gateway. Let each MCP host launch a lightweight CLI adapter that bridges stdio to the gateway.

## Architecture

```text
                       ┌────────────────────────┐
Web UI ───────────────▶│                        │
                       │  MCP Workspace Gateway │
Inspector ─┐           │                        │
           │ stdio     │  - upstream registry   │
           ▼           │  - sessions            │
   mcp-mux client ────▶│  - tool namespace      │───▶ Upstream MCP A
                       │  - routing             │───▶ Upstream MCP B
Codex ─────┐           │  - traces              │───▶ Upstream MCP C
           │ stdio     │                        │
           ▼           └────────────────────────┘
   mcp-mux client ───────────────▲
                                 │
                       gateway session transport
```

## Quickstart

1. Start the gateway:

   ```bash
   npm install
   npm run build
   npx mcp-mux serve
   ```

2. Add mock upstreams from another terminal:

   ```bash
   npx mcp-mux upstream add-mock filesystem examples/mock-upstreams/filesystem.json
   npx mcp-mux upstream add-mock jira examples/mock-upstreams/jira.json
   npx mcp-mux upstream add-mock github examples/mock-upstreams/github.json
   ```

3. Connect Inspector as a stdio MCP server:

   ```bash
   npx mcp-mux client --session inspector
   ```

4. Connect a second host (for example Codex):

   ```bash
   npx mcp-mux client --session codex
   ```

5. Open the Web UI at `http://127.0.0.1:8787` to observe both sessions, upstreams, tools, and traces.

## Non-goals

This project is not yet Safe MCP Proxy and does not include policy worlds, allow/deny/ask/absent/simulate decisions, provenance, approvals, or hard isolation.

## Trust Boundary

This project provides coordination, not hard sandboxing.

Gateway coordinates. Docker isolates. OS enforces.

## Future

- profiles/worlds
- governed tool projection
- allow/deny/ask/absent/simulate
- audit
- Safe MCP Proxy layer
