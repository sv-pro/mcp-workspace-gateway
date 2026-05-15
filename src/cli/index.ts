#!/usr/bin/env node
import { runClientCommand } from './commands/client.js';
import { runPolicyAssignCommand, runPolicyCreateCommand, runPolicyDeleteCommand, runPolicyListCommand } from './commands/policy.js';
import { runProfileAssignCommand, runProfileCreateCommand, runProfileDeleteCommand, runProfileListCommand } from './commands/profile.js';
import { runServeCommand } from './commands/serve.js';
import { runSessionListCommand } from './commands/session.js';
import { runUpstreamAddHttpCommand, runUpstreamAddMockCommand, runUpstreamListCommand } from './commands/upstream.js';

function usage(): string {
  return `Usage:
  mcp-mux serve
  mcp-mux client --session <name> [--profile <profile>] [--wait]
  
  mcp-mux upstream list
  mcp-mux upstream add-mock <id> <file>
  mcp-mux upstream add-http <id> <url>

  mcp-mux profile list
  mcp-mux profile create <id> <upstream_id1,upstream_id2,...>
  mcp-mux profile delete <id>
  mcp-mux profile assign <session_id> <profile_id>

  mcp-mux policy list
  mcp-mux policy create <id> <allow|deny>
  mcp-mux policy delete <id>
  mcp-mux policy assign <session_id> <policy_id>

  mcp-mux session list`;
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

  if (command === 'upstream') {
    if (subcommand === 'list') {
      await runUpstreamListCommand();
      return;
    }
    if (subcommand === 'add-mock') {
      const id = args[2];
      const file = args[3];
      if (!id || !file) {
        throw new Error(`add-mock requires <id> <file>\n\n${usage()}`);
      }
      await runUpstreamAddMockCommand(id, file);
      return;
    }
    if (subcommand === 'add-http') {
      const id = args[2];
      const url = args[3];
      if (!id || !url) {
        throw new Error(`add-http requires <id> <url>\n\n${usage()}`);
      }
      await runUpstreamAddHttpCommand(id, url);
      return;
    }
  }

  if (command === 'profile') {
    if (subcommand === 'list') {
      await runProfileListCommand();
      return;
    }
    if (subcommand === 'create') {
      const id = args[2];
      const upstreams = args[3]?.split(',');
      if (!id || !upstreams) {
        throw new Error(`create requires <id> <upstream_id1,upstream_id2,...>\n\n${usage()}`);
      }
      await runProfileCreateCommand(id, upstreams);
      return;
    }
    if (subcommand === 'delete') {
      const id = args[2];
      if (!id) {
        throw new Error(`delete requires <id>\n\n${usage()}`);
      }
      await runProfileDeleteCommand(id);
      return;
    }
    if (subcommand === 'assign') {
      const sessionId = args[2];
      const profileId = args[3];
      if (!sessionId || !profileId) {
        throw new Error(`assign requires <session_id> <profile_id>\n\n${usage()}`);
      }
      await runProfileAssignCommand(sessionId, profileId);
      return;
    }
  }

  if (command === 'policy') {
    if (subcommand === 'list') {
      await runPolicyListCommand();
      return;
    }
    if (subcommand === 'create') {
      const id = args[2];
      const decision = args[3];
      if (!id || (decision !== 'allow' && decision !== 'deny')) {
        throw new Error(`create requires <id> <allow|deny>\n\n${usage()}`);
      }
      await runPolicyCreateCommand(id, decision);
      return;
    }
    if (subcommand === 'delete') {
      const id = args[2];
      if (!id) {
        throw new Error(`delete requires <id>\n\n${usage()}`);
      }
      await runPolicyDeleteCommand(id);
      return;
    }
    if (subcommand === 'assign') {
      const sessionId = args[2];
      const policyId = args[3];
      if (!sessionId || !policyId) {
        throw new Error(`assign requires <session_id> <policy_id>\n\n${usage()}`);
      }
      await runPolicyAssignCommand(sessionId, policyId);
      return;
    }
  }

  if (command === 'session') {
    if (subcommand === 'list') {
      await runSessionListCommand();
      return;
    }
  }

  throw new Error(usage());
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
