import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { GatewayServer } from '../server/gatewayServer';
import { startHttpApi } from '../server/httpApi';

async function withApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const gateway = new GatewayServer({ upstreamsFile: null });
  const server = await startHttpApi(gateway, { host: '127.0.0.1', port: 0 });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run(baseUrl);
  } finally {
    gateway.upstreams.closeAll();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const fakeMcpServerScript = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (!('id' in request)) {
    return;
  }
  if (request.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-upstream' } }
    }) + '\\n');
    return;
  }
  if (request.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: {} } }] }
    }) + '\\n');
    return;
  }
});
`;

test('http api adds, replaces, and removes mock upstreams', async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const jiraFile = path.join(repoRoot, 'examples/mock-upstreams/jira.json');
  const githubFile = path.join(repoRoot, 'examples/mock-upstreams/github.json');

  await withApi(async (baseUrl) => {
    const addResponse = await fetch(`${baseUrl}/api/upstreams/mock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'workspace', file: jiraFile }),
    });
    assert.equal(addResponse.status, 201);

    let upstreams = (await (await fetch(`${baseUrl}/api/upstreams`)).json()) as Array<{
      id: string;
      name: string;
      source_file?: string;
    }>;
    assert.deepEqual(upstreams.map((upstream) => upstream.id), ['workspace']);
    assert.equal(upstreams[0]?.name, 'Jira Mock');
    assert.equal(upstreams[0]?.source_file, jiraFile);

    const replaceResponse = await fetch(`${baseUrl}/api/upstreams/mock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'workspace', file: githubFile }),
    });
    assert.equal(replaceResponse.status, 201);

    upstreams = (await (await fetch(`${baseUrl}/api/upstreams`)).json()) as Array<{
      id: string;
      name: string;
      source_file?: string;
    }>;
    assert.equal(upstreams[0]?.name, 'GitHub Mock');
    assert.equal(upstreams[0]?.source_file, githubFile);

    const deleteResponse = await fetch(`${baseUrl}/api/upstreams/workspace`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/upstreams`)).json(), []);
  });
});

test('http api returns 404 when deleting an unknown upstream', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/upstreams/missing`, { method: 'DELETE' });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Upstream not found: missing' });
  });
});

test('http api returns 400 when adding a mock upstream without id or file', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/upstreams/mock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'workspace' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'id and file or mock_json are required' });
  });
});

test('http api adds inline mock json and returns it for editing', async () => {
  await withApi(async (baseUrl) => {
    const mockJson = JSON.stringify({
      name: 'Inline Mock',
      tools: [{ name: 'search' }],
    });

    const addResponse = await fetch(`${baseUrl}/api/upstreams/mock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'inline', mock_json: mockJson }),
    });
    assert.equal(addResponse.status, 201);

    const upstreams = (await (await fetch(`${baseUrl}/api/upstreams`)).json()) as Array<{
      id: string;
      name: string;
      source_file?: string;
    }>;
    assert.deepEqual(upstreams, [
      {
        id: 'inline',
        type: 'mock',
        name: 'Inline Mock',
        tool_count: 1,
      },
    ]);

    const definitionResponse = await fetch(`${baseUrl}/api/upstreams/inline/mock`);
    assert.equal(definitionResponse.status, 200);
    assert.deepEqual(await definitionResponse.json(), {
      id: 'inline',
      name: 'Inline Mock',
      tools: [{ name: 'search' }],
    });
  });
});

test('http api adds stdio upstream config and returns it for editing', async () => {
  await withApi(async (baseUrl) => {
    const definition = {
      id: 'fake',
      type: 'stdio',
      name: 'Fake',
      executable: process.execPath,
      args: ['-e', fakeMcpServerScript],
      env: { LOG_LEVEL: 'debug' },
    };

    const addResponse = await fetch(`${baseUrl}/api/upstreams/stdio`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(definition),
    });
    assert.equal(addResponse.status, 201);

    const upstreams = (await (await fetch(`${baseUrl}/api/upstreams`)).json()) as Array<{
      id: string;
      type: string;
      name: string;
      executable?: string;
      args?: string[];
      cwd?: string;
    }>;
    assert.deepEqual(upstreams, [
      {
        id: 'fake',
        type: 'stdio',
        name: 'Fake',
        tool_count: 1,
        executable: process.execPath,
        args: ['-e', fakeMcpServerScript],
      },
    ]);

    const configResponse = await fetch(`${baseUrl}/api/upstreams/fake/stdio`);
    assert.equal(configResponse.status, 200);
    assert.deepEqual(await configResponse.json(), {
      id: 'fake',
      name: 'Fake',
      executable: process.execPath,
      args: ['-e', fakeMcpServerScript],
      env: { LOG_LEVEL: 'debug' },
    });
  });
});
