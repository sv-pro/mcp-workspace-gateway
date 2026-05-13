import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { GatewayServer } from '../server/gatewayServer';

test('router handles initialize and tools/list over gateway session', async () => {
  const gateway = new GatewayServer();
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  gateway.connectSession('inspector');

  const initializeResponse = await gateway.handleRpc('inspector', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });

  assert.equal(initializeResponse?.error, undefined);
  assert.equal((initializeResponse?.result as { serverInfo: { name: string } }).serverInfo.name, 'mcp-workspace-gateway');

  const toolsListResponse = await gateway.handleRpc('inspector', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const toolNames = ((toolsListResponse?.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name);
  assert.deepEqual(toolNames, ['jira_create_issue', 'jira_search']);
});
