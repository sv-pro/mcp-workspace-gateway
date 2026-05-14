import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProfileRegistry } from '../server/profileRegistry.js';

test('profile registry starts empty with no persistence', () => {
  const registry = new ProfileRegistry();
  assert.deepEqual(registry.list(), []);
});

test('profile registry upsert and get', () => {
  const registry = new ProfileRegistry();
  const profile = registry.upsert({ id: 'dev', upstreamIds: ['github', 'jira'] });
  assert.equal(profile.id, 'dev');
  assert.deepEqual(profile.upstreamIds, ['github', 'jira']);
  assert.deepEqual(registry.get('dev'), profile);
});

test('profile registry list returns sorted by id', () => {
  const registry = new ProfileRegistry();
  registry.upsert({ id: 'prod', upstreamIds: [] });
  registry.upsert({ id: 'dev', upstreamIds: ['jira'] });
  assert.deepEqual(registry.list().map((p) => p.id), ['dev', 'prod']);
});

test('profile registry remove', () => {
  const registry = new ProfileRegistry();
  registry.upsert({ id: 'dev', upstreamIds: [] });
  assert.equal(registry.remove('dev'), true);
  assert.equal(registry.remove('dev'), false);
  assert.equal(registry.get('dev'), undefined);
});

test('profile registry validates id', () => {
  const registry = new ProfileRegistry();
  assert.throws(() => registry.upsert({ id: '', upstreamIds: [] }), /id is required/);
});

test('profile registry validates upstreamIds', () => {
  const registry = new ProfileRegistry();
  assert.throws(
    () => registry.upsert({ id: 'dev', upstreamIds: 'bad' as unknown as string[] }),
    /upstreamIds must be an array/,
  );
});

test('profile registry persists and reloads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-profiles-'));
  const persistenceFile = path.join(directory, 'profiles.json');

  const first = new ProfileRegistry({ persistenceFile });
  first.upsert({ id: 'dev', upstreamIds: ['github'] });
  first.upsert({ id: 'prod', upstreamIds: ['github', 'jira'] });

  const second = new ProfileRegistry({ persistenceFile });
  assert.deepEqual(second.list().map((p) => p.id), ['dev', 'prod']);
  assert.deepEqual(second.get('prod')?.upstreamIds, ['github', 'jira']);

  second.remove('dev');
  const third = new ProfileRegistry({ persistenceFile });
  assert.equal(third.get('dev'), undefined);
  assert.ok(third.get('prod'));
});
