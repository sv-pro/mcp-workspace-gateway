import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { HttpUpstreamAdapter } from '../adapters/upstream/httpUpstreamAdapter';

function withMcpHttpServer(
  handler: (body: { method: string; params?: unknown; id?: unknown }) => unknown,
  run: (url: string) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            method: string;
            params?: unknown;
            id?: unknown;
          };
          let rpcResponse: unknown;
          try {
            const result = handler(body);
            rpcResponse = body.id !== undefined ? { jsonrpc: '2.0', id: body.id, result } : null;
          } catch (handlerError) {
            rpcResponse =
              body.id !== undefined
                ? { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: (handlerError as Error).message } }
                : null;
          }
          res.writeHead(rpcResponse ? 200 : 202, { 'content-type': 'application/json' });
          res.end(rpcResponse ? JSON.stringify(rpcResponse) : '{}');
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}`;
      run(url)
        .then(() => server.close(() => resolve()))
        .catch((error) => server.close(() => reject(error)));
    });
  });
}

test('http upstream adapter lists and calls tools via JSON-RPC POST', async () => {
  await withMcpHttpServer(
    (body) => {
      if (body.method === 'initialize') {
        return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'test' } };
      }
      if (body.method === 'tools/list') {
        return { tools: [{ name: 'greet', description: 'Say hello', inputSchema: { type: 'object', properties: {} } }] };
      }
      if (body.method === 'tools/call') {
        return { content: [{ type: 'text', text: 'Hello!' }] };
      }
      return {};
    },
    async (url) => {
      const adapter = new HttpUpstreamAdapter('remote', 'Remote', url);

      assert.deepEqual(adapter.listToolsCached(), []);

      const tools = await adapter.listTools();
      assert.equal(tools.length, 1);
      assert.equal(tools[0]?.name, 'greet');

      assert.equal(adapter.listToolsCached().length, 1);

      const result = await adapter.callTool('greet', { name: 'world' });
      assert.deepEqual(result, { content: [{ type: 'text', text: 'Hello!' }] });
    },
  );
});

test('http upstream adapter fromDefinition validates id and url', () => {
  assert.throws(() => HttpUpstreamAdapter.fromDefinition({ id: '', url: 'http://example.com' }), /id is required/);
  assert.throws(() => HttpUpstreamAdapter.fromDefinition({ id: 'x', url: '' }), /url is required/);
});

test('http upstream adapter toDefinition round-trips', () => {
  const adapter = new HttpUpstreamAdapter('svc', 'My Service', 'http://example.com/mcp', { Authorization: 'Bearer tok' });
  assert.deepEqual(adapter.toDefinition(), {
    id: 'svc',
    name: 'My Service',
    url: 'http://example.com/mcp',
    headers: { Authorization: 'Bearer tok' },
  });
});

test('http upstream adapter diagnostics reflects initialization state', async () => {
  await withMcpHttpServer(
    (body) => {
      if (body.method === 'initialize') {
        return { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'test' } };
      }
      if (body.method === 'tools/list') {
        return { tools: [] };
      }
      return {};
    },
    async (url) => {
      const adapter = new HttpUpstreamAdapter('svc', 'Svc', url);
      assert.equal((adapter.diagnostics() as { status: string }).status, 'not-initialized');

      await adapter.listTools();
      assert.equal((adapter.diagnostics() as { status: string }).status, 'connected');
    },
  );
});

test('http upstream adapter surfaces server errors', async () => {
  await withMcpHttpServer(
    (body) => {
      if (body.method === 'initialize') {
        return { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'test' } };
      }
      if (body.method === 'tools/list') {
        return { tools: [] };
      }
      throw new Error('tool failed');
    },
    async (url) => {
      const adapter = new HttpUpstreamAdapter('svc', 'Svc', url);
      await adapter.listTools();
      await assert.rejects(() => adapter.callTool('boom', {}), /tool failed/);
    },
  );
});
