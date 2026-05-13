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
        return writeJson(res, 200, await gateway.status());
      }

      if (method === 'GET' && pathname === '/api/upstreams') {
        return writeJson(res, 200, await gateway.upstreams.listSummaries());
      }

      if (method === 'POST' && pathname === '/api/upstreams/mock') {
        const body = await readJson<{ id?: string; file?: string }>(req);
        if (!body.id || !body.file) {
          return writeJson(res, 400, { error: 'id and file are required' });
        }
        await gateway.upstreams.addMock(body.id, body.file);
        return writeJson(res, 201, { ok: true });
      }

      if (method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/connect')) {
        const sessionId = decodeURIComponent(pathname.split('/')[3] ?? '');
        if (!sessionId) {
          return writeJson(res, 400, { error: 'session_id is required' });
        }
        gateway.connectSession(sessionId);
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

      if (method === 'GET' && pathname === '/') {
        const filePath = path.resolve(process.cwd(), 'src/web/index.html');
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
