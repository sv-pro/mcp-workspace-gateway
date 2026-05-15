# Tasks

## Done

- [x] Scaffold MVP — gateway server, stdio adapters, mock adapters, HTTP API, web UI, tests
- [x] `CLAUDE.md` — codebase orientation for future Claude sessions
- [x] Non-invasive `/api/status` — polling no longer spawns stdio processes; tool counts use a cache populated on first real fetch
- [x] HTTP upstream adapter — plain HTTP POST JSON-RPC; initialize handshake, tool cache, headers, persistence, CLI `add-http`, web UI type selector
- [x] Profiles / Worlds — per-session upstream visibility scoping; ProfileRegistry, upstreamFilter in ToolRegistry, Router integration, HTTP CRUD API, CLI `--profile`, web UI panel
- [x] Tool governance — per-session, per-tool decisions (`allow`/`deny`/`absent`/`simulate`/`ask`); PolicyRegistry, ApprovalQueue, Router decision logic, HTTP CRUD API, real-time approval queue in web UI
- [x] Governance-aware trace log
- [x] Session persistence — assignments to `.mcp-mux-sessions.json`; TTL expiry; `GET /api/sessions` endpoint
- [x] CLI for profiles and policies — `mcp-mux profile` and `mcp-mux policy` sub-commands
- [x] MVP acceptance test + E2E automation — `src/test/e2e.test.ts` spawns gateway + two client adapters, verifies aggregated tool lists, session isolation, and gateway survivability; `serve` prints actual bound port so `MCP_MUX_PORT=0` works

## Backlog

- [x] Web UI: traces view — кликабельная панель Traces; менеджер с фильтрами по сессии / статусу / методу; цветные бейджи для статуса и policy decision; обновляется каждые 2 с
- [ ] Web UI: управление профилями и политиками — CRUD прямо из UI вместо CLI
- [x] CLI: `mcp-mux session list` — выводит активные сессии с profile/policy в JSON; `GatewayClient.listSessions()`; routing в index.ts
- [x] Upstream health monitoring — `HealthMonitor` запускается из `serve` каждые 30 с (первый check через 2 с); результат хранится в `UpstreamRegistry.healthChecks`; `health?` поле в `UpstreamSummary` → автоматически в `/api/status`; Web UI: цветная точка (зелёная/красная/серая) + latency + время в карточке апстрима

## In progress

(none)
