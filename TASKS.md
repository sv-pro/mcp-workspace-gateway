# Tasks

## Done

- [x] Scaffold MVP — gateway server, stdio adapters, mock adapters, HTTP API, web UI, tests
- [x] `CLAUDE.md` — codebase orientation for future Claude sessions
- [x] Non-invasive `/api/status` — polling no longer spawns stdio processes; tool counts use a cache populated on first real fetch
- [x] HTTP upstream adapter — plain HTTP POST JSON-RPC; initialize handshake, tool cache, headers, persistence, CLI `add-http`, web UI type selector
- [x] Profiles / Worlds — per-session upstream visibility scoping; ProfileRegistry, upstreamFilter in ToolRegistry, Router integration, HTTP CRUD API, CLI `--profile`, web UI panel

## Up next

### 1. Tool governance

Per-session, per-tool decisions that intercept every `tools/call` before it reaches the upstream. This is what makes the gateway a *safe* proxy, not just a coordinator.

**Decisions:** `allow` (pass through — today's only behavior), `deny` (reject immediately), `absent` (hide from `tools/list` AND reject if called), `simulate` (return a configured mock result without calling the upstream), `ask` (hold the call, surface a pending approval to the web UI, resume or reject based on human response).

**What to build:**

- New types in `src/protocol/types.ts`: `PolicyRule { pattern: string; decision: 'allow'|'deny'|'absent'|'simulate'|'ask'; mock_result?: unknown }` and `GovernancePolicy { id: string; rules: PolicyRule[]; default_decision: 'allow'|'deny' }`. `pattern` is a glob matched against the exposed tool name (e.g. `github_*`, `filesystem_write_file`).
- `PolicyRegistry` (new `src/server/policyRegistry.ts`): stores and persists policies to `.mcp-mux-policies.json`.
- `ApprovalQueue` (new `src/server/approvalQueue.ts`): holds pending `tools/call` requests for `ask`-ruled tools. Each entry has a unique approval ID, the original request params, and a Promise that resolves/rejects when the web UI approves or denies. Configurable timeout (e.g. 60 s).
- `SessionManager`: add `policy?: string` to `SessionSummary`; add `setPolicy(sessionId, policyId)` method.
- `Router`: before forwarding `tools/call`, evaluate the tool against the session's policy rules (first match wins; fall back to `default_decision`). Apply the matched decision. For `tools/list`, filter out `absent` tools.
- HTTP API: CRUD for policies (`GET/POST /api/policies`, `GET/DELETE /api/policies/{id}`); `POST /api/sessions/{id}/policy` to assign; `GET /api/approvals` (pending queue), `POST /api/approvals/{id}/allow`, `POST /api/approvals/{id}/deny`.
- Web UI: policy editor (rule list with pattern + decision), approval queue panel that shows blocked calls and lets the operator allow/deny in real time.

**Dependency:** governance sits on top of profiles — profiles define which tools are *visible*, governance defines what happens when they are *called*. Implement profiles first. ✓ (profiles done)
