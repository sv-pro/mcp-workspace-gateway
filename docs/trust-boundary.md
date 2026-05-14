# Trust Boundary

## What the gateway provides

MCP Workspace Gateway coordinates the resources it manages within a single
process. It enforces:

- **Session isolation** — each client adapter connects under its own session
  identity; sessions do not share in-flight state.
- **Namespace isolation** — tool names are prefixed by upstream ID
  (`filesystem_read_file`, not `read_file`), preventing name collisions across
  upstreams.
- **Profile-based visibility** — a session with a profile can only see the
  upstream instances named in that profile.
- **Conflict prevention** — one gateway instance owns a set of upstream
  definitions; no other process claims the same definitions.

## What the gateway does NOT provide

The gateway is a coordination layer, not a security enforcement layer.

- It does not prevent another process, container, or gateway instance from
  accessing the same files, credentials, sockets, or upstream services.
- It does not sandbox upstream processes from each other or from the host OS.
- It does not cryptographically verify client identity (no auth model yet).
- It does not enforce read-only access at the OS level even when a profile or
  binding declares `mode: readonly`.

## Where enforcement lives

```text
Gateway coordinates.
Docker isolates.
OS enforces.
```

| Concern | Correct layer |
|---------|--------------|
| Preventing cross-session tool leakage | Gateway (session bindings) |
| Preventing a subprocess from reading outside its root | OS permissions / read-only mounts |
| Preventing network exfiltration | OS firewall / network namespace |
| Preventing credential sharing between sessions | Docker containers / separate users |
| Preventing an upstream process from escaping | OS / container runtime |

## Future governance layers

Policy, approval, and provenance controls belong to the **Safe MCP Proxy** layer
that sits above the gateway. The gateway's job is to be a reliable substrate
that Safe MCP Proxy can govern — not to implement governance itself.

See [ontology.md](./ontology.md) for the full stack:

```text
MCP Workspace Gateway   — coordination substrate (this project)
Safe MCP Proxy          — capability governance
Agent Hypervisor        — world virtualization
```
