import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TraceStore } from '../server/traceStore.js';
import { TraceEvent } from '../protocol/types.js';

function makeEvent(override: Partial<TraceEvent> = {}): TraceEvent {
  return {
    timestamp: new Date().toISOString(),
    session_id: 'sess',
    direction: 'client->gateway',
    method: 'tools/call',
    exposed_tool_name: 'jira_search',
    upstream_id: 'jira',
    raw_tool_name: 'search',
    status: 'ok',
    error_code: null,
    policy_id: null,
    policy_decision: null,
    policy_rule_pattern: null,
    ...override,
  };
}

test('traceStore: in-memory ring buffer caps at maxEvents', () => {
  const store = new TraceStore(3, null);
  store.add(makeEvent({ method: 'a' }));
  store.add(makeEvent({ method: 'b' }));
  store.add(makeEvent({ method: 'c' }));
  store.add(makeEvent({ method: 'd' }));
  const events = store.list();
  assert.equal(events.length, 3);
  assert.equal(events[0].method, 'd'); // newest first
  assert.equal(events[2].method, 'b'); // oldest retained
});

test('traceStore: persists events to JSONL and loads them on startup', () => {
  const file = path.join(os.tmpdir(), `trace-test-${Date.now()}.jsonl`);
  try {
    const store1 = new TraceStore(500, file);
    store1.add(makeEvent({ method: 'first', policy_decision: 'deny', policy_id: 'p1', policy_rule_pattern: 'jira_*' }));
    store1.add(makeEvent({ method: 'second' }));

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);

    const store2 = new TraceStore(500, file);
    const loaded = store2.list();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].method, 'second');
    assert.equal(loaded[1].method, 'first');
    assert.equal(loaded[1].policy_id, 'p1');
    assert.equal(loaded[1].policy_decision, 'deny');
    assert.equal(loaded[1].policy_rule_pattern, 'jira_*');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('traceStore: loads only last maxEvents lines from file', () => {
  const file = path.join(os.tmpdir(), `trace-test-${Date.now()}.jsonl`);
  try {
    // write 5 lines directly
    const lines = Array.from({ length: 5 }, (_, i) => JSON.stringify(makeEvent({ method: `m${i}` }))).join('\n') + '\n';
    fs.writeFileSync(file, lines, 'utf8');

    const store = new TraceStore(3, file);
    const loaded = store.list();
    assert.equal(loaded.length, 3);
    assert.equal(loaded[0].method, 'm4');
    assert.equal(loaded[2].method, 'm2');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('traceStore: gracefully handles missing file on startup', () => {
  const store = new TraceStore(500, '/tmp/does-not-exist-trace.jsonl');
  assert.equal(store.list().length, 0);
});

test('traceStore: list() returns newest-first', () => {
  const store = new TraceStore(500, null);
  store.add(makeEvent({ method: 'old' }));
  store.add(makeEvent({ method: 'new' }));
  const [first] = store.list();
  assert.equal(first.method, 'new');
});
