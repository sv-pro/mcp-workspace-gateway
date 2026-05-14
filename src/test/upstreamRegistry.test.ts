import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ToolRegistry } from '../server/toolRegistry';
import { UpstreamRegistry } from '../server/upstreamRegistry';

async function writeMockUpstream(directory: string, fileName: string, name: string, tools: string[]): Promise<string> {
  const filePath = path.join(directory, fileName);
  await fs.writeFile(
    filePath,
    JSON.stringify({
      name,
      tools: tools.map((tool) => ({
        name: tool,
      })),
    }),
    'utf8',
  );
  return filePath;
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
      result: { tools: [{ name: 'echo' }] }
    }) + '\\n');
    return;
  }
});
`;

test('upstream registry tracks mock source files and replaces existing ids', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-upstreams-'));
  const firstFile = await writeMockUpstream(directory, 'first.json', 'First Mock', ['search']);
  const secondFile = await writeMockUpstream(directory, 'second.json', 'Second Mock', ['read', 'write']);
  const upstreams = new UpstreamRegistry();

  await upstreams.addMock('workspace', firstFile);
  assert.deepEqual(await upstreams.listSummaries(), [
    {
      id: 'workspace',
      type: 'mock',
      name: 'First Mock',
      tool_count: 1,
      source_file: firstFile,
    },
  ]);

  await upstreams.addMock('workspace', secondFile);
  assert.deepEqual(await upstreams.listSummaries(), [
    {
      id: 'workspace',
      type: 'mock',
      name: 'Second Mock',
      tool_count: 2,
      source_file: secondFile,
    },
  ]);
});

test('removing an upstream excludes it from summaries and tool aggregation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-upstreams-'));
  const filePath = await writeMockUpstream(directory, 'mock.json', 'Mock', ['search']);
  const upstreams = new UpstreamRegistry();
  const tools = new ToolRegistry(upstreams);

  await upstreams.addMock('workspace', filePath);
  assert.equal((await tools.list()).length, 1);

  assert.equal(upstreams.remove('workspace'), true);
  assert.deepEqual(await upstreams.listSummaries(), []);
  assert.deepEqual(await tools.list(), []);
  assert.equal(upstreams.remove('workspace'), false);
});

test('upstream registry supports inline mock definitions', async () => {
  const upstreams = new UpstreamRegistry();

  upstreams.addMockDefinition('inline', {
    name: 'Inline Mock',
    tools: [{ name: 'search' }],
  });

  assert.deepEqual(await upstreams.listSummaries(), [
    {
      id: 'inline',
      type: 'mock',
      name: 'Inline Mock',
      tool_count: 1,
    },
  ]);
  assert.deepEqual(upstreams.getMockDefinition('inline'), {
    id: 'inline',
    name: 'Inline Mock',
    tools: [{ name: 'search' }],
  });
});

test('upstream registry supports stdio definitions', async () => {
  const upstreams = new UpstreamRegistry();

  try {
    upstreams.addStdioDefinition({
      id: 'fake',
      name: 'Fake',
      executable: process.execPath,
      args: ['-e', fakeMcpServerScript],
      env: { LOG_LEVEL: 'debug' },
    });

    assert.deepEqual(await upstreams.listSummaries(), [
      {
        id: 'fake',
        type: 'stdio',
        name: 'Fake',
        tool_count: 1,
        executable: process.execPath,
        args: ['-e', fakeMcpServerScript],
      },
    ]);
    assert.deepEqual(upstreams.getStdioDefinition('fake'), {
      id: 'fake',
      name: 'Fake',
      executable: process.execPath,
      args: ['-e', fakeMcpServerScript],
      env: { LOG_LEVEL: 'debug' },
    });
  } finally {
    upstreams.closeAll();
  }
});

test('upstream registry persists and reloads upstream definitions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-upstreams-persist-'));
  const persistenceFile = path.join(directory, 'upstreams.json');
  const mockFile = await writeMockUpstream(directory, 'mock.json', 'Persisted Mock', ['search']);

  const first = new UpstreamRegistry({ persistenceFile });
  await first.addMock('mocked', mockFile);
  first.addStdioDefinition({
    id: 'stdio',
    name: 'Stdio',
    executable: process.execPath,
    args: ['-e', fakeMcpServerScript],
  });
  first.closeAll();

  const second = new UpstreamRegistry({ persistenceFile });
  try {
    assert.deepEqual(
      (await second.listSummaries()).map((summary) => ({
        id: summary.id,
        type: summary.type,
        name: summary.name,
        tool_count: summary.tool_count,
      })),
      [
        {
          id: 'mocked',
          type: 'mock',
          name: 'Persisted Mock',
          tool_count: 1,
        },
        {
          id: 'stdio',
          type: 'stdio',
          name: 'Stdio',
          tool_count: 1,
        },
      ],
    );

    assert.equal(second.remove('mocked'), true);
    const persisted = JSON.parse(await fs.readFile(persistenceFile, 'utf8')) as {
      upstreams: Array<{ type: string; id?: string; definition?: { id?: string } }>;
    };
    assert.deepEqual(
      persisted.upstreams.map((upstream) => upstream.id ?? upstream.definition?.id),
      ['stdio'],
    );
  } finally {
    second.closeAll();
  }
});
