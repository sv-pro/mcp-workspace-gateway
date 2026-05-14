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

test('router governance: deny blocks tools/call', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null, policiesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  gateway.policies.upsert({ id: 'no-jira', rules: [{ pattern: 'jira_*', decision: 'deny' }], default_decision: 'allow' });
  gateway.connectSession('guarded');
  gateway.sessions.setPolicy('guarded', 'no-jira');

  const response = await gateway.handleRpc('guarded', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'jira_create_issue', arguments: {} },
  });

  assert.ok(response?.error, 'expected error response');
  assert.ok(response?.error?.message.includes('denied by policy'), `unexpected message: ${response?.error?.message}`);
});

test('router governance: absent hides tool from tools/list and blocks call', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null, policiesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  gateway.policies.upsert({ id: 'hide-search', rules: [{ pattern: 'jira_search', decision: 'absent' }], default_decision: 'allow' });
  gateway.connectSession('session1');
  gateway.sessions.setPolicy('session1', 'hide-search');

  const toolsListResponse = await gateway.handleRpc('session1', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  const toolNames = ((toolsListResponse?.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
  assert.ok(!toolNames.includes('jira_search'), 'jira_search should be absent from list');
  assert.ok(toolNames.includes('jira_create_issue'), 'jira_create_issue should still appear');

  const callResponse = await gateway.handleRpc('session1', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'jira_search', arguments: {} },
  });

  assert.ok(callResponse?.error, 'expected error calling absent tool');
});

test('router governance: simulate returns mock_result without calling upstream', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null, policiesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  const mockResult = { content: [{ type: 'text', text: 'simulated' }] };
  gateway.policies.upsert({
    id: 'sim',
    rules: [{ pattern: 'jira_create_issue', decision: 'simulate', mock_result: mockResult }],
    default_decision: 'allow',
  });
  gateway.connectSession('sim-session');
  gateway.sessions.setPolicy('sim-session', 'sim');

  const response = await gateway.handleRpc('sim-session', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'jira_create_issue', arguments: {} },
  });

  assert.deepEqual(response?.result, mockResult);
  assert.equal(response?.error, undefined);
});

test('router governance: ask resolves when approved', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null, policiesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  gateway.policies.upsert({ id: 'ask-policy', rules: [{ pattern: 'jira_*', decision: 'ask' }], default_decision: 'allow' });
  gateway.connectSession('ask-session');
  gateway.sessions.setPolicy('ask-session', 'ask-policy');

  const callPromise = gateway.handleRpc('ask-session', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'jira_create_issue', arguments: {} },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pending = gateway.approvals.list();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].exposed_name, 'jira_create_issue');

  gateway.approvals.decide(pending[0].id, true);
  const response = await callPromise;
  assert.equal(response?.error, undefined);
});

test('router governance: ask rejects when denied', async () => {
  const gateway = new GatewayServer({ upstreamsFile: null, profilesFile: null, policiesFile: null });
  const repoRoot = path.resolve(__dirname, '../..');

  await gateway.upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));
  gateway.policies.upsert({ id: 'ask-policy2', rules: [{ pattern: 'jira_*', decision: 'ask' }], default_decision: 'allow' });
  gateway.connectSession('ask-session2');
  gateway.sessions.setPolicy('ask-session2', 'ask-policy2');

  const callPromise = gateway.handleRpc('ask-session2', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'jira_create_issue', arguments: {} },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pending = gateway.approvals.list();
  gateway.approvals.decide(pending[0].id, false);

  const response = await callPromise;
  assert.ok(response?.error, 'expected error when denied');
  assert.ok(response?.error?.message.includes('rejected'), `unexpected message: ${response?.error?.message}`);
});

test('router governance: no policy assigned means allow-all', async () => {
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
