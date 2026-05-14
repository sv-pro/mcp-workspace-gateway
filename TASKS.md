# Tasks

## Done

- [x] Scaffold MVP — gateway server, stdio adapters, mock adapters, HTTP API, web UI, tests
- [x] `CLAUDE.md` — codebase orientation for future Claude sessions
- [x] Non-invasive `/api/status` — polling no longer spawns stdio processes; tool counts use a cache populated on first real fetch
- [x] HTTP upstream adapter — plain HTTP POST JSON-RPC; initialize handshake, tool cache, headers, persistence, CLI `add-http`, web UI type selector

## Up next

### 1. Profiles / Worlds

Let different sessions see different upstream/tool sets. Today every session sees every upstream. Profiles make visibility scoped.

**What to build:**

- `ProfileRegistry` (new `src/server/profileRegistry.ts`): stores named profiles, each a list of upstream IDs the session is allowed to see. Persists to `.mcp-mux-profiles.json` using the same atomic-write pattern as `UpstreamRegistry`.
- `SessionManager`: add `profile?: string` to `SessionSummary`. Add `setProfile(sessionId, profileId)` method.
- `ToolRegistry.list(upstreamFilter?: string[])`: accept an optional upstream allowlist and skip tools from upstreams not in the list. Same for `listCached()` and `resolveByExposedName()`.
- `Router`: on `tools/list` and `tools/call`, look up the session's profile from `SessionManager`, resolve its upstream list from `ProfileRegistry`, pass the filter to `ToolRegistry`. A session with no profile sees all upstreams (current behavior is preserved as the default).
- HTTP API: CRUD for profiles (`GET/POST /api/profiles`, `GET/DELETE /api/profiles/{id}`), plus `POST /api/sessions/{id}/profile` to assign a profile to a connected session.
- CLI: `mcp-mux client --session inspector --profile <name>`. The client posts the profile name to the gateway during connect.
- Web UI: profile management section; sessions panel shows the assigned profile and lets you change it.

**Design note:** profiles filter at the upstream level (coarse-grained), not individual tool names. Fine-grained tool filtering belongs in governance (task 2), which builds on top of profiles.

---

### 2. Tool governance

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

**Dependency:** governance sits on top of profiles — profiles define which tools are *visible*, governance defines what happens when they are *called*. Implement profiles first.
