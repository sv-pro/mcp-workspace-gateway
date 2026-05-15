import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseJsonRpcMessage } from '../protocol/mcpJsonRpc';
import { GatewayServer } from './gatewayServer';

interface HttpApiOptions {
  host: string;
  port: number;
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return (raw ? JSON.parse(raw) : {}) as T;
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

export function startHttpApi(gateway: GatewayServer, options: HttpApiOptions): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', `http://${options.host}:${options.port}`);
      const pathname = url.pathname;

      if (method === 'GET' && pathname === '/health') {
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'GET' && pathname === '/api/status') {
        return writeJson(res, 200, gateway.status());
      }

      if (method === 'GET' && pathname === '/api/upstreams') {
        return writeJson(res, 200, await gateway.upstreams.listSummaries());
      }

      if (method === 'GET' && pathname === '/api/upstream-templates') {
        return writeJson(res, 200, gateway.templates.list());
      }

      if (method === 'POST' && pathname === '/api/upstream-templates') {
        const body = await readJson<{
          id?: string;
          label?: string;
          definition?: {
            id?: string;
            name?: string;
            executable?: string;
            args?: string[];
            cwd?: string;
            env?: Record<string, string>;
          };
        }>(req);
        if (!body.id || !body.label || !body.definition?.id || !body.definition.executable) {
          return writeJson(res, 400, { error: 'id, label, definition.id, and definition.executable are required' });
        }

        return writeJson(
          res,
          200,
          gateway.templates.upsert({
            id: body.id,
            label: body.label,
            definition: {
              id: body.definition.id,
              name: body.definition.name,
              executable: body.definition.executable,
              args: body.definition.args,
              cwd: body.definition.cwd,
              env: body.definition.env,
            },
          }),
        );
      }

      if (method === 'POST' && pathname === '/api/upstreams/mock') {
        const body = await readJson<{ id?: string; file?: string; mock_json?: string }>(req);
        if (!body.id || (!body.file && !body.mock_json)) {
          return writeJson(res, 400, { error: 'id and file or mock_json are required' });
        }

        if (body.mock_json) {
          gateway.upstreams.addMockDefinition(body.id, JSON.parse(body.mock_json));
          return writeJson(res, 201, { ok: true });
        }

        await gateway.upstreams.addMock(body.id, body.file!);
        return writeJson(res, 201, { ok: true });
      }

      if (method === 'POST' && pathname === '/api/upstreams/stdio') {
        const body = await readJson<{
          id?: string;
          name?: string;
          executable?: string;
          args?: string[];
          cwd?: string;
          env?: Record<string, string>;
        }>(req);
        if (!body.id || !body.executable) {
          return writeJson(res, 400, { error: 'id and executable are required' });
        }

        gateway.upstreams.addStdioDefinition({
          id: body.id,
          name: body.name,
          executable: body.executable,
          args: body.args,
          cwd: body.cwd,
          env: body.env,
        });
        return writeJson(res, 201, { ok: true });
      }

      if (method === 'POST' && pathname === '/api/upstreams/http') {
        const body = await readJson<{
          id?: string;
          name?: string;
          url?: string;
          headers?: Record<string, string>;
        }>(req);
        if (!body.id || !body.url) {
          return writeJson(res, 400, { error: 'id and url are required' });
        }

        gateway.upstreams.addHttpDefinition({
          id: body.id,
          name: body.name,
          url: body.url,
          headers: body.headers,
        });
        return writeJson(res, 201, { ok: true });
      }

      const upstreamPathParts = pathname.split('/');
      const templatePathParts = pathname.split('/');
      if (
        method === 'GET' &&
        templatePathParts[1] === 'api' &&
        templatePathParts[2] === 'upstream-templates' &&
        templatePathParts.length === 4
      ) {
        const templateId = decodeURIComponent(templatePathParts[3] ?? '');
        const template = gateway.templates.get(templateId);
        if (!template) {
          return writeJson(res, 404, { error: `Template not found: ${templateId}` });
        }
        return writeJson(res, 200, template);
      }

      if (
        method === 'DELETE' &&
        templatePathParts[1] === 'api' &&
        templatePathParts[2] === 'upstream-templates' &&
        templatePathParts.length === 4
      ) {
        const templateId = decodeURIComponent(templatePathParts[3] ?? '');
        if (!gateway.templates.remove(templateId)) {
          return writeJson(res, 404, { error: `Template not found: ${templateId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (
        method === 'GET' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'diagnostics'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        const diagnostics = gateway.upstreams.getDiagnostics(upstreamId);
        if (!diagnostics) {
          return writeJson(res, 404, { error: `Upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, diagnostics);
      }

      if (
        method === 'POST' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'test'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        const result = await gateway.upstreams.test(upstreamId);
        if (!result) {
          return writeJson(res, 404, { error: `Upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, result);
      }

      if (
        method === 'POST' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'restart'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        if (!gateway.upstreams.restart(upstreamId)) {
          return writeJson(res, 404, { error: `Restartable upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, { ok: true });
      }

      if (
        method === 'GET' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'mock'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        const definition = gateway.upstreams.getMockDefinition(upstreamId);
        if (!definition) {
          return writeJson(res, 404, { error: `Mock upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, definition);
      }

      if (
        method === 'GET' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'stdio'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        const definition = gateway.upstreams.getStdioDefinition(upstreamId);
        if (!definition) {
          return writeJson(res, 404, { error: `Stdio upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, definition);
      }

      if (
        method === 'GET' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 5 &&
        upstreamPathParts[4] === 'http'
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        const definition = gateway.upstreams.getHttpDefinition(upstreamId);
        if (!definition) {
          return writeJson(res, 404, { error: `HTTP upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, definition);
      }

      if (
        method === 'DELETE' &&
        upstreamPathParts[1] === 'api' &&
        upstreamPathParts[2] === 'upstreams' &&
        upstreamPathParts.length === 4
      ) {
        const upstreamId = decodeURIComponent(upstreamPathParts[3] ?? '');
        if (!upstreamId) {
          return writeJson(res, 400, { error: 'id is required' });
        }

        if (!gateway.upstreams.remove(upstreamId)) {
          return writeJson(res, 404, { error: `Upstream not found: ${upstreamId}` });
        }

        return writeJson(res, 200, { ok: true });
      }

      if (method === 'GET' && pathname === '/api/profiles') {
        return writeJson(res, 200, gateway.profiles.list());
      }

      if (method === 'POST' && pathname === '/api/profiles') {
        const body = await readJson<{ id?: string; upstreamIds?: string[]; disabledToolIds?: string[] }>(req);
        if (!body.id || !Array.isArray(body.upstreamIds)) {
          return writeJson(res, 400, { error: 'id and upstreamIds are required' });
        }
        return writeJson(res, 201, gateway.profiles.upsert({
          id: body.id,
          upstreamIds: body.upstreamIds,
          disabledToolIds: Array.isArray(body.disabledToolIds) ? body.disabledToolIds : [],
        }));
      }

      const profilePathParts = pathname.split('/');
      if (method === 'GET' && profilePathParts[1] === 'api' && profilePathParts[2] === 'profiles' && profilePathParts.length === 4) {
        const profileId = decodeURIComponent(profilePathParts[3] ?? '');
        const profile = gateway.profiles.get(profileId);
        if (!profile) {
          return writeJson(res, 404, { error: `Profile not found: ${profileId}` });
        }
        return writeJson(res, 200, profile);
      }

      if (method === 'DELETE' && profilePathParts[1] === 'api' && profilePathParts[2] === 'profiles' && profilePathParts.length === 4) {
        const profileId = decodeURIComponent(profilePathParts[3] ?? '');
        if (!gateway.profiles.remove(profileId)) {
          return writeJson(res, 404, { error: `Profile not found: ${profileId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'GET' && pathname === '/api/policies') {
        return writeJson(res, 200, gateway.policies.list());
      }

      if (method === 'POST' && pathname === '/api/policies') {
        const body = await readJson<{ id?: string; rules?: unknown; default_decision?: string }>(req);
        if (!body.id || !Array.isArray(body.rules) || (body.default_decision !== 'allow' && body.default_decision !== 'deny')) {
          return writeJson(res, 400, { error: 'id, rules (array), and default_decision ("allow"|"deny") are required' });
        }
        try {
          return writeJson(res, 201, gateway.policies.upsert({
            id: body.id,
            rules: body.rules as never,
            default_decision: body.default_decision,
          }));
        } catch (err) {
          return writeJson(res, 400, { error: (err as Error).message });
        }
      }

      const policyPathParts = pathname.split('/');
      if (method === 'GET' && policyPathParts[1] === 'api' && policyPathParts[2] === 'policies' && policyPathParts.length === 4) {
        const policyId = decodeURIComponent(policyPathParts[3] ?? '');
        const policy = gateway.policies.get(policyId);
        if (!policy) {
          return writeJson(res, 404, { error: `Policy not found: ${policyId}` });
        }
        return writeJson(res, 200, policy);
      }

      if (method === 'DELETE' && policyPathParts[1] === 'api' && policyPathParts[2] === 'policies' && policyPathParts.length === 4) {
        const policyId = decodeURIComponent(policyPathParts[3] ?? '');
        if (!gateway.policies.remove(policyId)) {
          return writeJson(res, 404, { error: `Policy not found: ${policyId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'GET' && pathname === '/api/approvals') {
        return writeJson(res, 200, gateway.approvals.list());
      }

      if (method === 'GET' && pathname === '/api/sessions') {
        return writeJson(res, 200, gateway.sessions.list());
      }

      const approvalPathParts = pathname.split('/');
      if (
        method === 'POST' &&
        approvalPathParts[1] === 'api' &&
        approvalPathParts[2] === 'approvals' &&
        approvalPathParts.length === 5 &&
        (approvalPathParts[4] === 'allow' || approvalPathParts[4] === 'deny')
      ) {
        const approvalId = decodeURIComponent(approvalPathParts[3] ?? '');
        const allow = approvalPathParts[4] === 'allow';
        if (!gateway.approvals.decide(approvalId, allow)) {
          return writeJson(res, 404, { error: `Approval not found: ${approvalId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/connect')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }
        const body = await readJson<{ profile?: string }>(req);
        gateway.connectSession(sessionId, body.profile);
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/disconnect')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }
        gateway.disconnectSession(sessionId);
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/profile')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }
        const body = await readJson<{ profileId?: string }>(req);
        if (!body.profileId) {
          return writeJson(res, 400, { error: 'profileId is required' });
        }
        if (!gateway.sessions.setProfile(sessionId, body.profileId)) {
          return writeJson(res, 404, { error: `Session not found: ${sessionId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/policy')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }
        const body = await readJson<{ policyId?: string }>(req);
        if (!body.policyId) {
          return writeJson(res, 400, { error: 'policyId is required' });
        }
        if (!gateway.sessions.setPolicy(sessionId, body.policyId)) {
          return writeJson(res, 404, { error: `Session not found: ${sessionId}` });
        }
        return writeJson(res, 200, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/rpc/')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }

        const body = await readJson<unknown>(req);
        const request = parseJsonRpcMessage(JSON.stringify(body));
        const response = await gateway.handleRpc(sessionId, request);
        if (!response) {
          res.writeHead(204);
          return res.end();
        }
        return writeJson(res, 200, response);
      }

      if (method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        });
        res.write(': connected\n\n');

        const unsub = gateway.events.subscribe((event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });

        const heartbeat = setInterval(() => {
          res.write(': heartbeat\n\n');
        }, 30_000);

        req.on('close', () => {
          clearInterval(heartbeat);
          unsub();
        });

        return;
      }

      if (method === 'GET' && pathname === '/') {
        const filePath = path.resolve(__dirname, '../web/index.html');
        const html = await fs.readFile(filePath, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
        });
        return res.end(html);
      }

      writeJson(res, 404, { error: 'Not found' });
    } catch (error) {
      writeJson(res, 500, {
        error: 'Internal server error',
        detail: (error as Error).message,
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}
