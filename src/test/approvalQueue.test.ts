import assert from 'node:assert/strict';
import test from 'node:test';
import { ApprovalQueue } from '../server/approvalQueue.js';

test('approvalQueue enqueue + decide(allow) resolves true', async () => {
  const queue = new ApprovalQueue();
  const promise = queue.enqueue('session1', 'github_create_issue', { title: 'test' });

  const pending = queue.list();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].session_id, 'session1');
  assert.equal(pending[0].exposed_name, 'github_create_issue');

  const decided = queue.decide(pending[0].id, true);
  assert.equal(decided, true);

  const result = await promise;
  assert.equal(result, true);
  assert.equal(queue.list().length, 0);
});

test('approvalQueue enqueue + decide(deny) resolves false', async () => {
  const queue = new ApprovalQueue();
  const promise = queue.enqueue('session1', 'fs_write', {});

  const pending = queue.list();
  queue.decide(pending[0].id, false);

  const result = await promise;
  assert.equal(result, false);
});

test('approvalQueue decide on unknown id returns false', () => {
  const queue = new ApprovalQueue();
  const result = queue.decide('nonexistent-id', true);
  assert.equal(result, false);
});

test('approvalQueue timeout auto-denies', async () => {
  const queue = new ApprovalQueue();
  const promise = queue.enqueue('session1', 'tool', {}, 50);

  assert.equal(queue.list().length, 1);

  const result = await promise;
  assert.equal(result, false);
  assert.equal(queue.list().length, 0);
});

test('approvalQueue list returns entries sorted by created_at', async () => {
  const queue = new ApprovalQueue();
  const p1 = queue.enqueue('s1', 'tool_a', {}, 10_000);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const p2 = queue.enqueue('s2', 'tool_b', {}, 10_000);

  const list = queue.list();
  assert.equal(list[0].exposed_name, 'tool_a');
  assert.equal(list[1].exposed_name, 'tool_b');

  queue.decide(list[0].id, false);
  queue.decide(list[1].id, false);
  await Promise.all([p1, p2]);
});

test('approvalQueue entries include session_id, exposed_name, args, created_at', () => {
  const queue = new ApprovalQueue();
  const args = { key: 'value' };
  queue.enqueue('mysession', 'my_tool', args, 10_000);

  const [entry] = queue.list();
  assert.equal(entry.session_id, 'mysession');
  assert.equal(entry.exposed_name, 'my_tool');
  assert.deepEqual(entry.args, args);
  assert.ok(entry.id);
  assert.ok(entry.created_at);

  queue.decide(entry.id, false);
});
