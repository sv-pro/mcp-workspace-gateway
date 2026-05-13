#!/usr/bin/env node
import { runClientCommand } from './commands/client';
import { runServeCommand } from './commands/serve';
import { runUpstreamAddMockCommand, runUpstreamListCommand } from './commands/upstream';

function usage(): string {
  return `Usage:
  mcp-mux serve
  mcp-mux client --session <name>
  mcp-mux upstream list
  mcp-mux upstream add-mock <id> <file>`;
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, subcommand] = args;

  if (command === 'serve') {
    await runServeCommand();
    return;
  }

  if (command === 'client') {
    const sessionId = readFlag(args, '--session');
    if (!sessionId) {
      throw new Error(`--session is required\n\n${usage()}`);
    }
    await runClientCommand(sessionId);
    return;
  }

  if (command === 'upstream' && subcommand === 'list') {
    await runUpstreamListCommand();
    return;
  }

  if (command === 'upstream' && subcommand === 'add-mock') {
    const id = args[2];
    const file = args[3];
    if (!id || !file) {
      throw new Error(`add-mock requires <id> <file>\n\n${usage()}`);
    }
    await runUpstreamAddMockCommand(id, file);
    return;
  }

  throw new Error(usage());
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
