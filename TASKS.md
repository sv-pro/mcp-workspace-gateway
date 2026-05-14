# Tasks

## Done

- [x] Scaffold MVP — gateway server, stdio adapters, mock adapters, HTTP API, web UI, tests
- [x] `CLAUDE.md` — codebase orientation for future Claude sessions
- [x] Non-invasive `/api/status` — polling no longer spawns stdio processes; tool counts use a cache populated on first real fetch
- [x] HTTP upstream adapter — plain HTTP POST JSON-RPC; initialize handshake, tool cache, headers, persistence, CLI `add-http`, web UI type selector
- [x] Profiles / Worlds — per-session upstream visibility scoping; ProfileRegistry, upstreamFilter in ToolRegistry, Router integration, HTTP CRUD API, CLI `--profile`, web UI panel
- [x] Tool governance — per-session, per-tool decisions (`allow`/`deny`/`absent`/`simulate`/`ask`); PolicyRegistry, ApprovalQueue, Router decision logic, HTTP CRUD API, real-time approval queue in web UI

## In progress

### 1. Governance-aware trace log

TraceEvent currently captures method, session, tool, and status — but nothing about governance. You can't tell from the trace that a call was denied, simulated, or held for approval. TraceStore is also in-memory (capped at 500 events); restarting the gateway clears the entire audit trail.

**What to build:**

- [ ] Add `policy_id: string | null`, `policy_decision: PolicyDecision | null`, `policy_rule_pattern: string | null` to `TraceEvent` in `src/protocol/types.ts`.
- [ ] Capture governance decision in `Router` (`src/server/router.ts`) and include it in the trace event for every `tools/call`.
- [ ] Persist traces to `.mcp-mux-traces.jsonl` (append-only JSONL; load last N entries on startup) in `src/server/traceStore.ts`.
- [ ] Update web UI trace panel to show `policy_decision` inline when present.
- [ ] Extend `router.test.ts` to assert governance decisions appear in traces; add `traceStore.test.ts`.

### 2. Session persistence

`SessionManager` is purely in-memory. Every gateway restart wipes all profile and policy assignments. Operators have to manually reconnect sessions and reassign, which makes governance brittle in practice.

**What to build:**

- [ ] Persist session→profile and session→policy assignments to `.mcp-mux-sessions.json` using the same atomic-write pattern as other registries.
- [ ] Restore assignments on startup; auto-expire entries older than a configurable TTL (e.g. 24 h) so stale sessions don't accumulate.
- [ ] Add `GET /api/sessions` as a dedicated endpoint (currently session state is only available embedded in `/api/status`).
- [ ] New `src/test/sessionManager.test.ts` covering persistence roundtrip, TTL expiry, and the new HTTP endpoint.

### 3. CLI for profiles and policies

`GatewayClient` and the CLI only cover upstream management. There are no terminal commands for profiles or policies — everything governance-related is web-UI-only from the command line.

**What to build:**

- [ ] Add `listProfiles`, `createProfile`, `deleteProfile`, `listPolicies`, `createPolicy`, `deletePolicy`, `setSessionPolicy` to `GatewayClient` (`src/adapters/gatewayClient.ts`).
- [ ] Add `mcp-mux profile` sub-commands (`list`, `create`, `delete`, `assign`) in new `src/cli/commands/profile.ts`.
- [ ] Add `mcp-mux policy` sub-commands (`list`, `create`, `delete`, `assign`) in new `src/cli/commands/policy.ts`.
- [ ] Wire both into `src/cli/index.ts`.
