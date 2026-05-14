# MCP Workspace Gateway — Ontology

This document defines the core concepts used throughout the MCP Workspace Gateway
architecture. The MCP ecosystem tends to collapse these into one vague term
("MCP server"), which causes architectural drift. We give each layer an explicit
name.

---

## The layers at a glance

```text
Prototype    — generic capability family (filesystem, github, jira)
Definition   — configured logical resource (my-docs, prod-github)
Instance     — live runtime process/connection
Session      — client interaction context
Binding      — connects a session to an instance
Projection   — shapes what a session can see  [future]
Policy       — governs what a session can do  [future]
World        — compiled executable environment [future]
```

---

## 1. Prototype

A **Prototype** is a generic, reusable capability family. It describes a type of
MCP server: what transport it uses, what configuration it expects, and what kind
of tools it provides. A prototype is not yet configured and not yet running.

Examples: `filesystem`, `github`, `jira`, `browser`, `postgres`

```yaml
prototype:
  id: filesystem
  transport: stdio
  config_schema:
    root: path
    readonly: boolean
```

Prototypes appear in the gateway as **upstream templates** — they are the
registry of known server types that an operator can instantiate.

---

## 2. Definition

A **Definition** is a configured logical MCP resource. It references a prototype
and supplies concrete configuration: path, credentials, environment, etc. A
definition has a stable identity and represents *desired state* — it does not
guarantee that a process is running.

Examples: `my-docs`, `prod-github`, `team-jira`

```yaml
definition:
  id: my-docs
  prototype: filesystem
  config:
    root: /home/user/docs
    readonly: true
```

Definitions appear in the gateway as **upstream registrations** — they are
persisted to `.mcp-mux-upstreams.json` and survive gateway restarts.

---

## 3. Instance

An **Instance** is a live, executing runtime that corresponds to a definition.
It has a lifecycle: starting, running, failing, restarting, stopped. One
definition can in principle produce multiple instances (for isolation or load).

Examples: a running stdio subprocess (pid=123890), an HTTP connection, a
container (container=abc123)

```yaml
instance:
  id: filesystem-inst-17
  definition: my-docs
  pid: 123890
  status: running
```

Instances are *runtime reality*. They may be absent even when a definition
exists. They may restart without the definition changing.

In the current implementation the gateway maintains one instance per upstream
definition (lazy-initialized on first use). Future versions may support multiple
instances per definition for isolation or redundancy.

---

## 4. Session

A **Session** is a logical client interaction context. It is created when a
client adapter connects to the gateway and persists independently of any
particular upstream instance lifecycle.

Examples: `inspector11`, `codex-main`, `web-debug`

```yaml
session:
  id: inspector11
  client_type: inspector
  connected: true
```

Sessions are in-memory only — they are not persisted across gateway restarts.
A session does not own an upstream instance. It **attaches** to instances via
Bindings.

---

## 5. Binding (Attachment / Route)

A **Binding** connects a session to one or more instances. It controls which
upstream tools are exposed to a session, under what namespace, and with what
access mode.

This is the **missing conceptual layer** that most MCP discussions omit. Without
explicit bindings, the only model is "every session sees everything" — which
does not scale to multi-client or multi-tenant workspaces.

```yaml
binding:
  session: inspector11
  instance: filesystem-inst-17
  exposed_namespace: docs
  mode: readonly
```

**Critical invariant:**

```text
A session does not own an instance.
A session attaches to an instance via a binding.
```

This decoupling means:
- The same instance can serve multiple sessions simultaneously.
- A session can be re-bound to a different instance without disrupting the client.
- Access scope is controlled at the binding layer, not baked into the instance.

In the current implementation, bindings are expressed implicitly through
**profiles** — a profile names a set of upstream definitions whose instances a
session may use. Explicit per-binding namespace and mode controls are on the
roadmap.

---

## 6. Projection  *(future layer)*

A **Projection** defines what tools and resources become visible to a specific
session after bindings are applied. It may rename tools, filter capabilities,
or transform namespaces to present a coherent per-session world-view.

```yaml
projection:
  session: codex-main
  tools:
    docs_read_file:
      instance_tool: filesystem-inst-17.read_file
    docs_list_dir:
      instance_tool: filesystem-inst-17.list_directory
```

Projection is the foundation of **Safe MCP Proxy**. It allows a governance layer
to decide not just *whether* a tool can be called, but *what* a session believes
exists. An `absent` decision (tool hidden from `tools/list`) is a projection
concern, not just a policy concern.

---

## 7. Policy  *(future layer)*

A **Policy** governs what actions a session may take within its projection.
Policy decisions:

| Decision   | tools/list | tools/call |
|------------|------------|------------|
| `allow`    | visible    | executed   |
| `deny`     | visible    | blocked    |
| `absent`   | hidden     | blocked    |
| `simulate` | visible    | mock result returned |
| `ask`      | visible    | blocked pending operator approval |

Policy belongs to the **Safe MCP Proxy** layer, not the current MVP.

The current gateway has a partial policy implementation (rules, approval queue).
This should be considered scaffolding — the full policy model will be defined
when Safe MCP Proxy is designed as its own layer.

---

## 8. World  *(future layer)*

A **World** is a compiled, deterministic capability universe. It is the
executable ontology for an agent: a specific, bounded set of tools, resources,
and namespaces that together define what the agent can perceive and do.

A World is built by combining:
- A set of definitions (what resources exist)
- A set of bindings (which instances the world uses)
- A projection (what the agent sees)
- A policy (what the agent may do)

Worlds belong to the **Agent Hypervisor** layer.

---

## Architecture principles

### Principle 1 — Layers are distinct

```text
Definitions are configured intent.
Instances are runtime reality.
Sessions are client contexts.
Bindings connect them.
Projections shape visibility.
```

### Principle 2 — The adapter is disposable

```text
The adapter process (mcp-mux client) is disposable.
The gateway process (mcp-mux serve) is authoritative.
```

Client adapters carry no state. They are throwaway stdio bridges. All session
state, upstream state, and tool routing live in the gateway.

### Principle 3 — One gateway, many everything else

```text
One workspace gateway.
Many client sessions.
Many upstream MCP servers.
```

The gateway is the single coordination point. Clients and upstreams are
independently scalable on either side.

### Principle 4 — Transport is not the architecture

```text
Do not treat stdio as the architecture.
Treat it as one transport adapter.
```

stdio, HTTP, WebSocket, and future transports are all substitutable at the
adapter layer. The protocol and session model above the adapter layer must not
assume any particular transport.

### Principle 5 — Coordination, not sandboxing

```text
Gateway coordinates.
Docker isolates.
OS enforces.
```

The gateway coordinates the resources it manages within one process boundary.
It is not an OS sandbox. Hard isolation requires OS permissions, read-only
mounts, separate containers, VMs, or an orchestrator.

---

## The full stack

```text
MCP
  ↓
MCP Workspace Gateway     ← this project
  ↓
Safe MCP Proxy            ← governs capability visibility (projection + policy)
  ↓
Agent Hypervisor          ← virtualizes executable worlds
```

**MCP** defines the wire protocol and capability model.

**MCP Workspace Gateway** organizes sessions, upstream instances, and bindings.
It is the substrate. It solves coordination, not governance.

**Safe MCP Proxy** applies projection and policy. It decides what each session
may see and do. It is the governance layer.

**Agent Hypervisor** compiles Worlds and manages agent lifecycle. It is the
execution layer.
