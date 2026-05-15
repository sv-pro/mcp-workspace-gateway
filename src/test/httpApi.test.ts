import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { GatewayServer } from '../server/gatewayServer';
import { startHttpApi } from '../server/httpApi';

async function withApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const gateway = new GatewayServer({ upstreamsFile: null, templatesFile: null, profilesFile: null, policiesFile: null, tracesFile: null, sessionsFile: null });
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

test('http api manages upstream templates', async () => {
  await withApi(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/upstream-templates`);
    assert.equal(listResponse.status, 200);
    const initialTemplates = (await listResponse.json()) as Array<{ id: string }>;
    assert.deepEqual(
      initialTemplates.map((template) => template.id).sort(),
      ['filesystem', 'github', 'memory'],
    );

    const saveResponse = await fetch(`${baseUrl}/api/upstream-templates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'custom',
        label: 'Custom',
        definition: {
          id: 'custom-upstream',
          name: 'Custom Upstream',
          executable: 'node',
          args: ['server.js'],
        },
      }),
    });
    assert.equal(saveResponse.status, 200);

    const getResponse = await fetch(`${baseUrl}/api/upstream-templates/custom`);
    assert.equal(getResponse.status, 200);
    assert.equal(((await getResponse.json()) as { definition: { executable: string } }).definition.executable, 'node');

    const deleteResponse = await fetch(`${baseUrl}/api/upstream-templates/custom`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), { ok: true });
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
        tool_count: 0,
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

    const initialDiagnosticsResponse = await fetch(`${baseUrl}/api/upstreams/fake/diagnostics`);
    assert.equal(initialDiagnosticsResponse.status, 200);
    assert.equal(((await initialDiagnosticsResponse.json()) as { status: string }).status, 'stopped');

    const testResponse = await fetch(`${baseUrl}/api/upstreams/fake/test`, { method: 'POST' });
    assert.equal(testResponse.status, 200);
    const testResult = (await testResponse.json()) as { ok: boolean; tool_count: number; tools: Array<{ name: string }> };
    assert.equal(testResult.ok, true);
    assert.equal(testResult.tool_count, 1);
    assert.deepEqual(testResult.tools.map((tool) => tool.name), ['echo']);

    const restartResponse = await fetch(`${baseUrl}/api/upstreams/fake/restart`, { method: 'POST' });
    assert.equal(restartResponse.status, 200);
    assert.deepEqual(await restartResponse.json(), { ok: true });

    const restartedDiagnosticsResponse = await fetch(`${baseUrl}/api/upstreams/fake/diagnostics`);
    assert.equal(restartedDiagnosticsResponse.status, 200);
    assert.equal(((await restartedDiagnosticsResponse.json()) as { status: string }).status, 'stopped');
  });
});

test('http api adds http upstream config and returns it for editing', async () => {
  await withApi(async (baseUrl) => {
    const addResponse = await fetch(`${baseUrl}/api/upstreams/http`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'remote',
        name: 'Remote',
        url: 'http://example.com/mcp',
        headers: { Authorization: 'Bearer tok' },
      }),
    });
    assert.equal(addResponse.status, 201);

    const upstreams = (await (await fetch(`${baseUrl}/api/upstreams`)).json()) as Array<{
      id: string;
      type: string;
      name: string;
      tool_count: number;
      url: string;
    }>;
    assert.deepEqual(upstreams, [{ id: 'remote', type: 'http', name: 'Remote', tool_count: 0, url: 'http://example.com/mcp' }]);

    const configResponse = await fetch(`${baseUrl}/api/upstreams/remote/http`);
    assert.equal(configResponse.status, 200);
    assert.deepEqual(await configResponse.json(), {
      id: 'remote',
      name: 'Remote',
      url: 'http://example.com/mcp',
      headers: { Authorization: 'Bearer tok' },
    });

    const diagResponse = await fetch(`${baseUrl}/api/upstreams/remote/diagnostics`);
    assert.equal(diagResponse.status, 200);
    assert.equal(((await diagResponse.json()) as { status: string }).status, 'not-initialized');
  });
});

test('http api policy CRUD: create, get, list, delete', async () => {
  await withApi(async (baseUrl) => {
    const listEmpty = await fetch(`${baseUrl}/api/policies`);
    assert.equal(listEmpty.status, 200);
    assert.deepEqual(await listEmpty.json(), []);

    const create = await fetch(`${baseUrl}/api/policies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'strict',
        rules: [{ pattern: 'github_*', decision: 'deny' }],
        default_decision: 'allow',
      }),
    });
    assert.equal(create.status, 201);
    const policy = await create.json() as { id: string };
    assert.equal(policy.id, 'strict');

    const get = await fetch(`${baseUrl}/api/policies/strict`);
    assert.equal(get.status, 200);
    assert.equal((await get.json() as { id: string }).id, 'strict');

    const list = await fetch(`${baseUrl}/api/policies`);
    assert.equal((await list.json() as unknown[]).length, 1);

    const del = await fetch(`${baseUrl}/api/policies/strict`, { method: 'DELETE' });
    assert.equal(del.status, 200);

    const listAfter = await fetch(`${baseUrl}/api/policies`);
    assert.deepEqual(await listAfter.json(), []);
  });
});

test('http api policy: 400 on invalid body', async () => {
  await withApi(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/policies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p' }),
    });
    assert.equal(res.status, 400);
  });
});

test('http api policy: 404 on get/delete unknown policy', async () => {
  await withApi(async (baseUrl) => {
    const get = await fetch(`${baseUrl}/api/policies/no-such`);
    assert.equal(get.status, 404);
    const del = await fetch(`${baseUrl}/api/policies/no-such`, { method: 'DELETE' });
    assert.equal(del.status, 404);
  });
});

test('http api assign policy to session', async () => {
  await withApi(async (baseUrl) => {
    await fetch(`${baseUrl}/api/policies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1', rules: [], default_decision: 'allow' }),
    });

    await fetch(`${baseUrl}/api/sessions/s1/connect`, { method: 'POST' });

    const assign = await fetch(`${baseUrl}/api/sessions/s1/policy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policyId: 'p1' }),
    });
    assert.equal(assign.status, 200);
    assert.deepEqual(await assign.json(), { ok: true });
  });
});

test('http api assign policy: 404 for unknown session', async () => {
  await withApi(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/sessions/ghost/policy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policyId: 'p1' }),
    });
    assert.equal(res.status, 404);
  });
});

test('http api approvals: list empty, decide on unknown id returns 404', async () => {
  await withApi(async (baseUrl) => {
    const list = await fetch(`${baseUrl}/api/approvals`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), []);

    const allow = await fetch(`${baseUrl}/api/approvals/no-such-id/allow`, { method: 'POST' });
    assert.equal(allow.status, 404);

    const deny = await fetch(`${baseUrl}/api/approvals/no-such-id/deny`, { method: 'POST' });
    assert.equal(deny.status, 404);
  });
});

test('http api lists sessions', async () => {
  await withApi(async (baseUrl) => {
    const listEmpty = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(listEmpty.status, 200);
    assert.deepEqual(await listEmpty.json(), []);

    await fetch(`${baseUrl}/api/sessions/s1/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'p1' }),
    });

    const list = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(list.status, 200);
    const sessions = (await list.json()) as Array<{ session_id: string; profile?: string }>;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].session_id, 's1');
    assert.equal(sessions[0].profile, 'p1');
  });
});

test('http api returns 400 when adding an http upstream without id or url', async () => {
  await withApi(async (baseUrl) => {
    const noId = await fetch(`${baseUrl}/api/upstreams/http`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/mcp' }),
    });
    assert.equal(noId.status, 400);

    const noUrl = await fetch(`${baseUrl}/api/upstreams/http`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'remote' }),
    });
    assert.equal(noUrl.status, 400);
  });
});
