import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SessionManager } from '../server/sessionManager.js';

test('session manager persists and reloads sessions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sessions-persist-'));
  const persistenceFile = path.join(directory, 'sessions.json');

  const first = new SessionManager({ persistenceFile });
  first.connect('sess1');
  first.setProfile('sess1', 'prof1');
  first.setPolicy('sess1', 'pol1');
  
  first.connect('sess2');
  first.setProfile('sess2', 'prof2');

  const second = new SessionManager({ persistenceFile });
  const sessions = second.list();
  assert.equal(sessions.length, 2);
  
  assert.equal(sessions[0].session_id, 'sess1');
  assert.equal(sessions[0].profile, 'prof1');
  assert.equal(sessions[0].policy, 'pol1');
  
  assert.equal(sessions[1].session_id, 'sess2');
  assert.equal(sessions[1].profile, 'prof2');
});

test('session manager expires old sessions', async () => {
  const ttlMs = 100;
  const sessions = new SessionManager({ ttlMs });
  
  sessions.connect('sess1');
  assert.equal(sessions.list().length, 1);
  
  await new Promise(resolve => setTimeout(resolve, ttlMs + 50));
  assert.equal(sessions.list().length, 0);
});

test('session manager loads and expires old sessions from disk', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sessions-expiry-'));
  const persistenceFile = path.join(directory, 'sessions.json');
  
  const first = new SessionManager({ persistenceFile });
  first.connect('sess1');
  
  // Manually modify the file to make the session old
  const data = JSON.parse(await fs.readFile(persistenceFile, 'utf8'));
  data.sessions[0].last_seen_at = new Date(Date.now() - 1000).toISOString();
  await fs.writeFile(persistenceFile, JSON.stringify(data));
  
  const second = new SessionManager({ persistenceFile, ttlMs: 500 });
  assert.equal(second.list().length, 0);
});

test('session manager touch updates last_seen_at but does not necessarily persist immediately', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sessions-touch-'));
  const persistenceFile = path.join(directory, 'sessions.json');
  
  const first = new SessionManager({ persistenceFile });
  first.connect('sess1');
  const initialLastSeen = first.list()[0].last_seen_at;
  
  await new Promise(resolve => setTimeout(resolve, 10));
  first.touch('sess1');
  const touchedLastSeen = first.list()[0].last_seen_at;
  assert.notEqual(initialLastSeen, touchedLastSeen);
  
  // Reload from disk should still show old last_seen_at because touch optimization skips persist
  const second = new SessionManager({ persistenceFile });
  assert.equal(second.list()[0].last_seen_at, initialLastSeen);
});

test('disconnect removes from disk', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sessions-disconnect-'));
  const persistenceFile = path.join(directory, 'sessions.json');
  
  const sessions = new SessionManager({ persistenceFile });
  sessions.connect('sess1');
  assert.equal(sessions.list().length, 1);
  
  sessions.disconnect('sess1');
  assert.equal(sessions.list().length, 0);
  
  const reloaded = new SessionManager({ persistenceFile });
  assert.equal(reloaded.list().length, 0);
});
