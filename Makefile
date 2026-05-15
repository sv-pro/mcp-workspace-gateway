SHELL := /usr/bin/env bash

HOST ?= 127.0.0.1
PORT ?= 8787
PID_FILE ?= .mcp-mux.pid
LOG_FILE ?= .mcp-mux.log

INSPECTOR_PORT ?= 6274
INSPECTOR_PROXY_PORT ?= 6277
INSPECTOR_PID_FILE ?= .mcp-inspector.pid
INSPECTOR_LOG_FILE ?= .mcp-inspector.log
INSPECTOR_SESSION ?= inspector

NODE_BIN ?= $(shell command -v node 2>/dev/null || find "$(HOME)/.nvm/versions/node" -path "*/bin/node" -type f 2>/dev/null | sort -V | tail -n 1)
NPM_BIN ?= $(shell command -v npm 2>/dev/null || if [ -n "$(NODE_BIN)" ]; then printf "%s/npm" "$$(dirname "$(NODE_BIN)")"; fi)
NODE_DIR := $(dir $(NODE_BIN))
RUN_ENV := PATH=$(NODE_DIR):$$PATH MCP_MUX_HOST=$(HOST) MCP_MUX_PORT=$(PORT)

.PHONY: help build start stop status restart logs inspector-start inspector-stop inspector-status

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Gateway:"
	@echo "  build              Compile TypeScript → dist/"
	@echo "  start              Build and start gateway as background daemon"
	@echo "  stop               Stop the running gateway"
	@echo "  restart            Stop then start"
	@echo "  status             Check if gateway is running"
	@echo "  logs               Tail the gateway log"
	@echo ""
	@echo "Inspector:"
	@echo "  inspector-start    Start MCP Inspector as background daemon"
	@echo "  inspector-stop     Stop the running inspector"
	@echo "  inspector-status   Check if inspector is running"
	@echo ""
	@echo "Variables: HOST=$(HOST)  PORT=$(PORT)  INSPECTOR_PORT=$(INSPECTOR_PORT)  INSPECTOR_SESSION=$(INSPECTOR_SESSION)"

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

inspector-start:
	@if [ -f "$(INSPECTOR_PID_FILE)" ] && kill -0 "$$(cat "$(INSPECTOR_PID_FILE)")" 2>/dev/null; then \
		echo "inspector already running: pid $$(cat "$(INSPECTOR_PID_FILE)")"; \
		echo "UI: http://localhost:$(INSPECTOR_PORT)"; \
		exit 0; \
	fi
	@for port in $(INSPECTOR_PORT) $(INSPECTOR_PROXY_PORT); do \
		pid="$$(ss -ltnp "( sport = :$$port )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"; \
		if [ -n "$$pid" ]; then \
			echo "inspector cannot start: port $$port is already in use by pid $$pid (run make inspector-stop)"; \
			exit 1; \
		fi; \
	done
	@echo "Starting MCP Inspector on http://localhost:$(INSPECTOR_PORT)"
	@$(RUN_ENV) nohup "$(NODE_DIR)npx" @modelcontextprotocol/inspector dist/mcp-mux client --session "$(INSPECTOR_SESSION)" --wait >"$(INSPECTOR_LOG_FILE)" 2>&1 </dev/null & echo $$! >"$(INSPECTOR_PID_FILE)"
	@sleep 2
	@if kill -0 "$$(cat "$(INSPECTOR_PID_FILE)")" 2>/dev/null; then \
		echo "inspector started: pid $$(cat "$(INSPECTOR_PID_FILE)")"; \
		echo "UI: http://localhost:$(INSPECTOR_PORT)"; \
	else \
		echo "inspector failed to start. Log:"; \
		cat "$(INSPECTOR_LOG_FILE)"; \
		rm -f "$(INSPECTOR_PID_FILE)"; \
		exit 1; \
	fi

inspector-stop:
	@pid=""; \
	if [ -f "$(INSPECTOR_PID_FILE)" ]; then \
		pid="$$(cat "$(INSPECTOR_PID_FILE)")"; \
	fi; \
	if [ -n "$$pid" ] && kill -0 "$$pid" 2>/dev/null; then \
		echo "Stopping inspector: pid $$pid"; \
		kill "$$pid" 2>/dev/null || true; \
	fi; \
	rm -f "$(INSPECTOR_PID_FILE)"; \
	for port in $(INSPECTOR_PORT) $(INSPECTOR_PROXY_PORT); do \
		orphan="$$(ss -ltnp "( sport = :$$port )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"; \
		if [ -n "$$orphan" ]; then \
			echo "Killing orphaned process on port $$port: pid $$orphan"; \
			kill "$$orphan" 2>/dev/null || true; \
		fi; \
	done; \
	echo "inspector stopped"

inspector-status:
	@if [ -f "$(INSPECTOR_PID_FILE)" ] && kill -0 "$$(cat "$(INSPECTOR_PID_FILE)")" 2>/dev/null; then \
		echo "inspector running: pid $$(cat "$(INSPECTOR_PID_FILE)")"; \
		echo "UI: http://localhost:$(INSPECTOR_PORT)"; \
	else \
		echo "inspector not running"; \
	fi
