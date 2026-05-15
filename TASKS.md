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

## Backlog

- [ ] MVP acceptance test — прогнать чеклист из `docs/mvp-acceptance-test.md` вручную; отметить выполненные пункты
- [ ] E2E тест — автоматизировать MVP acceptance test: spawn gateway + двух клиентов в одном тест-файле (`src/test/e2e.test.ts`)
- [ ] Web UI: traces view — real-time лента событий с фильтрацией по сессии/инструменту
- [ ] Web UI: управление профилями и политиками — CRUD прямо из UI вместо CLI
- [ ] CLI: `mcp-mux session list` — вывод активных сессий с profile/policy
- [ ] Upstream health monitoring — периодический ping stdio/http апстримов; heartbeat-статус в `/api/status` и Web UI

## In progress

(none)
