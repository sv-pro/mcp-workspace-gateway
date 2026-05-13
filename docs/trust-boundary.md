# Trust Boundary

MCP Workspace Gateway coordinates the resources it manages.

It prevents accidental conflicts inside one gateway instance.

It is not an OS sandbox.

It does not prevent another process, container, or gateway instance from accessing the same files, credentials, sockets, or upstream services.

For hard isolation, use OS permissions, Docker, read-only mounts, separate volumes, VMs, or an orchestrator.

Gateway coordinates. Docker isolates. OS enforces.
