# MVP Acceptance Test

- [ ] Start one gateway with `mcp-mux serve`
- [ ] Open Web UI
- [ ] Register at least two mock upstreams
- [ ] Start adapter for Inspector with `mcp-mux client --session inspector`
- [ ] Inspector receives aggregated `tools/list`
- [ ] Start adapter for Codex with `mcp-mux client --session codex`
- [ ] Codex receives aggregated `tools/list`
- [ ] Web UI shows both sessions
- [ ] Stop Inspector
- [ ] Codex session remains active
- [ ] Stop Codex
- [ ] Gateway remains running
- [ ] No second gateway process was spawned
