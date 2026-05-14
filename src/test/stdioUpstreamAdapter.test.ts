import assert from 'node:assert/strict';
import test from 'node:test';
import { StdioUpstreamAdapter } from '../adapters/upstream/stdioUpstreamAdapter';

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
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-upstream', version: '0.0.0' }
      }
    }) + '\\n');
    return;
  }
  if (request.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [{
          name: 'echo',
          description: 'Echo a message',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } }
          }
        }]
      }
    }) + '\\n');
    return;
  }
  if (request.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: request.params.arguments.message }]
      }
    }) + '\\n');
    return;
  }
});
`;

test('stdio upstream adapter lists tools and calls tools over MCP stdio', async () => {
  const adapter = new StdioUpstreamAdapter('fake', 'Fake', process.execPath, ['-e', fakeMcpServerScript]);

  try {
    const tools = await adapter.listTools();
    assert.deepEqual(tools, [
      {
        name: 'echo',
        description: 'Echo a message',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    ]);

    assert.deepEqual(await adapter.callTool('echo', { message: 'hello' }), {
      content: [{ type: 'text', text: 'hello' }],
    });
  } finally {
    adapter.close();
  }
});
