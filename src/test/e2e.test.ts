import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { test } from 'node:test';

const CLI = path.resolve(__dirname, '../../dist/cli/index.js');

function waitForExit(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => proc.once('exit', () => resolve()));
}

function parseGatewayUrl(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: proc.stdout!, terminal: false });
    const timer = setTimeout(() => {
      rl.close();
      reject(new Error('Timeout waiting for gateway ready line'));
    }, 5000);
    rl.on('line', (line) => {
      const m = line.match(/mcp-mux gateway running on (http:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        rl.close();
        resolve(m[1]);
      }
    });
    proc.once('error', (err) => { clearTimeout(timer); rl.close(); reject(err); });
    proc.once('exit', (code) => { clearTimeout(timer); rl.close(); reject(new Error(`Gateway exited early (code ${code})`)); });
  });
}

function rpc(
  proc: ChildProcess,
  rl: readline.Interface,
  id: number,
  method: string,
  params: unknown = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rl.off('line', handler);
      reject(new Error(`Timeout waiting for JSON-RPC response id=${id} (${method})`));
    }, 5000);
    const handler = (line: string): void => {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg['id'] === id) {
          clearTimeout(timer);
          rl.off('line', handler);
          resolve(msg);
        }
      } catch { /* skip non-JSON lines */ }
    };
    rl.on('line', handler);
    proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

test('MVP E2E: two sessions see shared upstreams; gateway survives client disconnects', async (t) => {
  const prefix = path.join(os.tmpdir(), `mcp-mux-e2e-${Date.now()}-`);

  const gw = spawn('node', [CLI, 'serve'], {
    env: {
      ...process.env,
      MCP_MUX_PORT: '0',
      MCP_MUX_UPSTREAMS_FILE: `${prefix}upstreams.json`,
      MCP_MUX_TEMPLATES_FILE: `${prefix}templates.json`,
    },
    cwd: os.tmpdir(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  gw.stderr?.resume();

  let inspector: ChildProcess | undefined;
  let codex: ChildProcess | undefined;
  let inspectorRl: readline.Interface | undefined;
  let codexRl: readline.Interface | undefined;

  try {
    const gwUrl = await parseGatewayUrl(gw);
    t.diagnostic(`Gateway at ${gwUrl}`);

    const addUpstream = async (id: string, toolName: string): Promise<void> => {
      const res = await fetch(`${gwUrl}/api/upstreams/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          mock_json: JSON.stringify({
            tools: [{
              name: toolName,
              description: `Mock ${toolName}`,
              inputSchema: { type: 'object', properties: {}, required: [] },
              mockResult: { content: [{ type: 'text', text: 'mock' }] },
            }],
          }),
        }),
      });
      assert.equal(res.status, 201, `Expected 201 adding upstream '${id}', got ${res.status}`);
    };

    await addUpstream('alpha', 'do_alpha');
    await addUpstream('beta', 'do_beta');

    const spawnClient = (session: string): [ChildProcess, readline.Interface] => {
      const proc = spawn('node', [CLI, 'client', '--session', session], {
        env: { ...process.env, MCP_MUX_GATEWAY_URL: gwUrl },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      proc.stderr?.resume();
      const rl = readline.createInterface({ input: proc.stdout!, terminal: false });
      return [proc, rl];
    };

    [inspector, inspectorRl] = spawnClient('inspector');
    [codex, codexRl] = spawnClient('codex');

    // give adapters time to connect to gateway
    await new Promise((r) => setTimeout(r, 300));

    // Inspector: initialize → tools/list
    await rpc(inspector, inspectorRl, 1, 'initialize', { protocolVersion: '2024-11-05' });
    const inspList = await rpc(inspector, inspectorRl, 2, 'tools/list');
    const inspNames = ((inspList['result'] as { tools: { name: string }[] }).tools).map((t) => t.name);
    t.diagnostic(`Inspector tools: ${inspNames.join(', ')}`);
    assert.ok(inspNames.includes('alpha_do_alpha'), `inspector sees alpha_do_alpha; got: ${inspNames.join(', ')}`);
    assert.ok(inspNames.includes('beta_do_beta'), `inspector sees beta_do_beta; got: ${inspNames.join(', ')}`);

    // Codex: initialize → tools/list
    await rpc(codex, codexRl, 1, 'initialize', { protocolVersion: '2024-11-05' });
    const codexList = await rpc(codex, codexRl, 2, 'tools/list');
    const codexNames = ((codexList['result'] as { tools: { name: string }[] }).tools).map((t) => t.name);
    assert.ok(codexNames.includes('alpha_do_alpha'), `codex sees alpha_do_alpha; got: ${codexNames.join(', ')}`);
    assert.ok(codexNames.includes('beta_do_beta'), `codex sees beta_do_beta; got: ${codexNames.join(', ')}`);

    // Both sessions visible via /api/sessions
    const sessResp = await fetch(`${gwUrl}/api/sessions`);
    const sessions = (await sessResp.json()) as { session_id: string }[];
    const sessionIds = sessions.map((s) => s.session_id);
    t.diagnostic(`Sessions: ${sessionIds.join(', ')}`);
    assert.ok(sessionIds.includes('inspector'), `inspector session visible; got: ${sessionIds.join(', ')}`);
    assert.ok(sessionIds.includes('codex'), `codex session visible; got: ${sessionIds.join(', ')}`);

    // Stop Inspector — Codex must still work
    inspector.kill('SIGTERM');
    await waitForExit(inspector);
    inspector = undefined;

    const codexList2 = await rpc(codex, codexRl, 3, 'tools/list');
    const codexNames2 = ((codexList2['result'] as { tools: { name: string }[] }).tools).map((t) => t.name);
    assert.ok(codexNames2.includes('alpha_do_alpha'), 'codex still sees tools after inspector disconnect');

    // Stop Codex — gateway must still respond
    codex.kill('SIGTERM');
    await waitForExit(codex);
    codex = undefined;

    const health = await fetch(`${gwUrl}/health`);
    assert.ok(health.ok, 'gateway healthy after all clients disconnected');

  } finally {
    inspectorRl?.close();
    codexRl?.close();
    if (inspector) { inspector.kill('SIGTERM'); await waitForExit(inspector); }
    if (codex) { codex.kill('SIGTERM'); await waitForExit(codex); }
    gw.kill('SIGTERM');
    await waitForExit(gw);
  }
});
