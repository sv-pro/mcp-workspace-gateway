import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GovernancePolicy, PolicyDecision } from '../protocol/types.js';

const VALID_DECISIONS = new Set<PolicyDecision>(['allow', 'deny', 'absent', 'simulate', 'ask']);

interface PersistedPolicies {
  version: 1;
  policies: GovernancePolicy[];
}

export interface PolicyRegistryOptions {
  persistenceFile?: string | null;
}

export class PolicyRegistry {
  private readonly policies = new Map<string, GovernancePolicy>();
  private readonly persistenceFile: string | null;

  constructor(options: PolicyRegistryOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? null;
    this.load();
  }

  list(): GovernancePolicy[] {
    return [...this.policies.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): GovernancePolicy | undefined {
    return this.policies.get(id);
  }

  upsert(policy: GovernancePolicy): GovernancePolicy {
    this.validate(policy);
    const normalized: GovernancePolicy = {
      id: policy.id,
      rules: policy.rules.map((r) => ({ ...r })),
      default_decision: policy.default_decision,
    };
    this.policies.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  remove(id: string): boolean {
    const removed = this.policies.delete(id);
    if (removed) {
      this.persist();
    }
    return removed;
  }

  private load(): void {
    if (!this.persistenceFile || !existsSync(this.persistenceFile)) {
      return;
    }

    const persisted = JSON.parse(readFileSync(this.persistenceFile, 'utf8')) as PersistedPolicies;
    if (persisted.version !== 1 || !Array.isArray(persisted.policies)) {
      throw new Error(`Invalid policies file: ${this.persistenceFile}`);
    }

    for (const policy of persisted.policies) {
      this.validate(policy);
      this.policies.set(policy.id, policy);
    }
  }

  private persist(): void {
    if (!this.persistenceFile) {
      return;
    }

    mkdirSync(path.dirname(this.persistenceFile), { recursive: true });
    const payload: PersistedPolicies = { version: 1, policies: this.list() };
    const temporaryFile = `${this.persistenceFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(temporaryFile, this.persistenceFile);
  }

  private validate(policy: GovernancePolicy): void {
    if (!policy.id?.trim()) {
      throw new Error('Policy id is required');
    }
    if (!Array.isArray(policy.rules)) {
      throw new Error('Policy rules must be an array');
    }
    if (policy.default_decision !== 'allow' && policy.default_decision !== 'deny') {
      throw new Error('Policy default_decision must be "allow" or "deny"');
    }
    for (const rule of policy.rules) {
      if (!rule.pattern?.trim()) {
        throw new Error('Each rule must have a non-empty pattern');
      }
      if (!VALID_DECISIONS.has(rule.decision)) {
        throw new Error(`Invalid rule decision: ${rule.decision}`);
      }
    }
  }
}
