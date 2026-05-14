SHELL := /usr/bin/env bash

HOST ?= 127.0.0.1
PORT ?= 8787
PID_FILE ?= .mcp-mux.pid
LOG_FILE ?= .mcp-mux.log

NODE_BIN ?= $(shell command -v node 2>/dev/null || find "$(HOME)/.nvm/versions/node" -path "*/bin/node" -type f 2>/dev/null | sort -V | tail -n 1)
NPM_BIN ?= $(shell command -v npm 2>/dev/null || if [ -n "$(NODE_BIN)" ]; then printf "%s/npm" "$$(dirname "$(NODE_BIN)")"; fi)
NODE_DIR := $(dir $(NODE_BIN))
RUN_ENV := PATH=$(NODE_DIR):$$PATH MCP_MUX_HOST=$(HOST) MCP_MUX_PORT=$(PORT)

.PHONY: build start stop status restart logs

build:
	@if [ -z "$(NPM_BIN)" ]; then \
		echo "npm not found. Install Node.js >=20 or set NPM_BIN=/path/to/npm."; \
		exit 1; \
	fi
	@$(RUN_ENV) "$(NPM_BIN)" run build

start: build
	@if [ -f "$(PID_FILE)" ] && kill -0 "$$(cat "$(PID_FILE)")" 2>/dev/null; then \
		echo "mcp-mux already running: pid $$(cat "$(PID_FILE)")"; \
		echo "Web UI: http://$(HOST):$(PORT)"; \
		exit 0; \
	fi
	@port_pid="$$(ss -ltnp "( sport = :$(PORT) )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"; \
	if [ -n "$$port_pid" ]; then \
		echo "mcp-mux cannot start: port $(PORT) is already in use by pid $$port_pid"; \
		exit 1; \
	fi
	@rm -f "$(PID_FILE)"
	@echo "Starting mcp-mux on http://$(HOST):$(PORT)"
	@if command -v setsid >/dev/null 2>&1; then \
		$(RUN_ENV) nohup setsid "$(NODE_BIN)" dist/cli/index.js serve >"$(LOG_FILE)" 2>&1 </dev/null & echo $$! >"$(PID_FILE)"; \
	else \
		$(RUN_ENV) nohup "$(NODE_BIN)" dist/cli/index.js serve >"$(LOG_FILE)" 2>&1 </dev/null & echo $$! >"$(PID_FILE)"; \
	fi
	@sleep 1
	@if kill -0 "$$(cat "$(PID_FILE)")" 2>/dev/null; then \
		echo "mcp-mux started: pid $$(cat "$(PID_FILE)")"; \
		echo "Web UI: http://$(HOST):$(PORT)"; \
	else \
		echo "mcp-mux failed to start. Log:"; \
		cat "$(LOG_FILE)"; \
		rm -f "$(PID_FILE)"; \
		exit 1; \
	fi

stop:
	@pid=""; \
	if [ -f "$(PID_FILE)" ]; then \
		pid="$$(cat "$(PID_FILE)")"; \
	fi; \
	if [ -z "$$pid" ] || ! kill -0 "$$pid" 2>/dev/null; then \
		pid="$$(ss -ltnp "( sport = :$(PORT) )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"; \
	fi; \
	if [ -z "$$pid" ]; then \
		echo "mcp-mux is not running on port $(PORT)"; \
		rm -f "$(PID_FILE)"; \
		exit 0; \
	fi; \
	if ! kill -0 "$$pid" 2>/dev/null; then \
		echo "mcp-mux is not running: stale pid $$pid"; \
		rm -f "$(PID_FILE)"; \
		exit 0; \
	fi; \
	echo "Stopping mcp-mux: pid $$pid"; \
	kill "$$pid"; \
	for _ in 1 2 3 4 5; do \
		if ! kill -0 "$$pid" 2>/dev/null; then \
			rm -f "$(PID_FILE)"; \
			echo "mcp-mux stopped"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "mcp-mux did not stop after SIGTERM; sending SIGKILL"; \
	kill -9 "$$pid" 2>/dev/null || true; \
	rm -f "$(PID_FILE)"

status:
	@if [ -f "$(PID_FILE)" ] && kill -0 "$$(cat "$(PID_FILE)")" 2>/dev/null; then \
		echo "mcp-mux running: pid $$(cat "$(PID_FILE)")"; \
		echo "Web UI: http://$(HOST):$(PORT)"; \
	elif port_pid="$$(ss -ltnp "( sport = :$(PORT) )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)" && [ -n "$$port_pid" ]; then \
		echo "mcp-mux running on port $(PORT): pid $$port_pid"; \
		echo "Web UI: http://$(HOST):$(PORT)"; \
	else \
		echo "mcp-mux not running"; \
	fi

restart: stop start

logs:
	@if [ -f "$(LOG_FILE)" ]; then \
		tail -f "$(LOG_FILE)"; \
	else \
		echo "Log file not found: $(LOG_FILE)"; \
	fi
