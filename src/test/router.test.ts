import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { GatewayServer } from '../server/gatewayServer.js';

test('router handles initialize and tools/list over gateway session', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null });
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

test('router filters tools by profile', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  await gateway.upstreams.addMock('github', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));

  gateway.profiles.upsert({ id: 'jira-only', upstreamIds: ['jira'] });
  gateway.connectSession('restricted', 'jira-only');

  const toolsListResponse = await gateway.handleRpc('restricted', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  const toolNames = ((toolsListResponse?.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name);
  assert.ok(toolNames.every((name) => name.startsWith('jira_')), 'only jira tools visible');
  assert.ok(!toolNames.some((name) => name.startsWith('github_')), 'github tools hidden');
});

test('router tools/call denied for tool outside profile', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  await gateway.upstreams.addMock('github', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));

  gateway.profiles.upsert({ id: 'jira-only', upstreamIds: ['jira'] });
  gateway.connectSession('restricted', 'jira-only');

  const response = await gateway.handleRpc('restricted', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'github_create_issue', arguments: {} },
  });

  assert.ok(response?.error, 'should return error');
  assert.equal(response?.error?.code, -32601);
});

test('router session without profile sees all tools', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  await gateway.upstreams.addMock('github', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));

  gateway.connectSession('unrestricted');

  const toolsListResponse = await gateway.handleRpc('unrestricted', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  const toolNames = ((toolsListResponse?.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name);
  assert.ok(toolNames.some((name) => name.startsWith('jira_')), 'jira tools visible');
  assert.ok(toolNames.some((name) => name.startsWith('github_')), 'github tools visible');
});
