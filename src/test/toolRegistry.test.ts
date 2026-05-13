import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { UpstreamRegistry } from '../server/upstreamRegistry';
import { ToolRegistry } from '../server/toolRegistry';

test('tool registry namespaces exposed names by upstream id', async () => {
  const upstreams = new UpstreamRegistry();
  const repoRoot = path.resolve(__dirname, '../..');

  await upstreams.addMock('github', path.join(repoRoot, 'examples/mock-upstreams/github.json'));
  await upstreams.addMock('jira', path.join(repoRoot, 'examples/mock-upstreams/jira.json'));

  const registry = new ToolRegistry(upstreams);
  const tools = await registry.list();
  const exposedNames = tools.map((tool) => tool.exposed_name);

  assert.deepEqual(exposedNames, [
    'github_create_issue',
    'github_search',
    'jira_create_issue',
    'jira_search',
  ]);
});
