import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PolicyRegistry } from '../server/policyRegistry.js';

test('policyRegistry creates and retrieves a policy', () => {
  const registry = new PolicyRegistry();
  const policy = registry.upsert({
    id: 'strict',
    rules: [{ pattern: 'github_*', decision: 'deny' }],
    default_decision: 'allow',
  });
  assert.equal(policy.id, 'strict');
  assert.equal(policy.rules.length, 1);
  assert.equal(policy.default_decision, 'allow');

  const found = registry.get('strict');
  assert.ok(found);
  assert.equal(found.id, 'strict');
});

test('policyRegistry lists all policies sorted by id', () => {
  const registry = new PolicyRegistry();
  registry.upsert({ id: 'z-policy', rules: [], default_decision: 'deny' });
  registry.upsert({ id: 'a-policy', rules: [], default_decision: 'allow' });
  const list = registry.list();
  assert.equal(list[0].id, 'a-policy');
  assert.equal(list[1].id, 'z-policy');
});

test('policyRegistry removes a policy', () => {
  const registry = new PolicyRegistry();
  registry.upsert({ id: 'to-delete', rules: [], default_decision: 'allow' });
  assert.ok(registry.remove('to-delete'));
  assert.equal(registry.get('to-delete'), undefined);
  assert.equal(registry.remove('to-delete'), false);
});

test('policyRegistry upserts replace existing policy', () => {
  const registry = new PolicyRegistry();
  registry.upsert({ id: 'p', rules: [{ pattern: '*', decision: 'deny' }], default_decision: 'allow' });
  registry.upsert({ id: 'p', rules: [], default_decision: 'deny' });
  const p = registry.get('p');
  assert.equal(p?.rules.length, 0);
  assert.equal(p?.default_decision, 'deny');
});

test('policyRegistry validates missing id', () => {
  const registry = new PolicyRegistry();
  assert.throws(
    () => registry.upsert({ id: '', rules: [], default_decision: 'allow' }),
    /id is required/i,
  );
});

test('policyRegistry validates invalid default_decision', () => {
  const registry = new PolicyRegistry();
  assert.throws(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => registry.upsert({ id: 'p', rules: [], default_decision: 'maybe' as any }),
    /default_decision must be/i,
  );
});

test('policyRegistry validates invalid rule decision', () => {
  const registry = new PolicyRegistry();
  assert.throws(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => registry.upsert({ id: 'p', rules: [{ pattern: '*', decision: 'ignore' as any }], default_decision: 'allow' }),
    /invalid rule decision/i,
  );
});

test('policyRegistry validates missing rule pattern', () => {
  const registry = new PolicyRegistry();
  assert.throws(
    () => registry.upsert({ id: 'p', rules: [{ pattern: '', decision: 'deny' }], default_decision: 'allow' }),
    /non-empty pattern/i,
  );
});

test('policyRegistry persists and loads from file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'policy-test-'));
  const file = path.join(dir, 'policies.json');
  try {
    const registry = new PolicyRegistry({ persistenceFile: file });
    registry.upsert({ id: 'saved', rules: [{ pattern: 'fs_*', decision: 'ask' }], default_decision: 'deny' });

    const registry2 = new PolicyRegistry({ persistenceFile: file });
    const policy = registry2.get('saved');
    assert.ok(policy);
    assert.equal(policy.default_decision, 'deny');
    assert.equal(policy.rules[0].decision, 'ask');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
