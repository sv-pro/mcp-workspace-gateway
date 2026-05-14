import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UpstreamTemplateRegistry } from '../server/upstreamTemplateRegistry';

test('template registry seeds defaults and persists changes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-templates-'));
  const persistenceFile = path.join(directory, 'templates.json');

  const first = new UpstreamTemplateRegistry({ persistenceFile });
  assert.deepEqual(
    first.list().map((template) => template.id).sort(),
    ['filesystem', 'github', 'memory'],
  );

  first.upsert({
    id: 'custom',
    label: 'Custom',
    definition: {
      id: 'custom-upstream',
      name: 'Custom Upstream',
      executable: 'node',
      args: ['server.js'],
    },
  });

  const second = new UpstreamTemplateRegistry({ persistenceFile });
  assert.equal(second.get('custom')?.definition.executable, 'node');
  assert.equal(second.remove('custom'), true);

  const third = new UpstreamTemplateRegistry({ persistenceFile });
  assert.equal(third.get('custom'), undefined);
});
