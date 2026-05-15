#!/usr/bin/env node
import { runClientCommand } from './commands/client';
import { runServeCommand } from './commands/serve';
import { runUpstreamAddHttpCommand, runUpstreamAddMockCommand, runUpstreamListCommand } from './commands/upstream';

function usage(): string {
  return `Usage:
  mcp-mux serve
  mcp-mux client --session <name> [--profile <profile>] [--wait]
  mcp-mux upstream list
  mcp-mux upstream add-mock <id> <file>
  mcp-mux upstream add-http <id> <url>`;
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
    const profile = readFlag(args, '--profile');
    const wait = args.includes('--wait');
    await runClientCommand(sessionId, profile, wait);
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

  if (command === 'upstream' && subcommand === 'add-http') {
    const id = args[2];
    const url = args[3];
    if (!id || !url) {
      throw new Error(`add-http requires <id> <url>\n\n${usage()}`);
    }
    await runUpstreamAddHttpCommand(id, url);
    return;
  }

  throw new Error(usage());
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
