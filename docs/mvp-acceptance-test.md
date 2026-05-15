# MVP Acceptance Test

Items marked *(automated)* are covered by `src/test/e2e.test.ts`.

- [x] Start one gateway with `mcp-mux serve` *(automated)*
- [ ] Open Web UI *(manual — browser required)*
- [x] Register at least two mock upstreams *(automated)*
- [x] Start adapter for Inspector with `mcp-mux client --session inspector` *(automated)*
- [x] Inspector receives aggregated `tools/list` *(automated)*
- [x] Start adapter for Codex with `mcp-mux client --session codex` *(automated)*
- [x] Codex receives aggregated `tools/list` *(automated)*
- [x] Web UI shows both sessions — verified via `GET /api/sessions` *(automated)*
- [x] Stop Inspector *(automated)*
- [x] Codex session remains active *(automated)*
- [x] Stop Codex *(automated)*
- [x] Gateway remains running *(automated)*
- [ ] No second gateway process was spawned *(not tested)*
