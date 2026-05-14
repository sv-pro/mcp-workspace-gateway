import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { StdioUpstreamDefinition } from '../protocol/types';

export interface UpstreamTemplate {
  id: string;
  label: string;
  definition: StdioUpstreamDefinition;
  built_in?: boolean;
}

interface PersistedTemplates {
  version: 1;
  templates: UpstreamTemplate[];
}

export interface UpstreamTemplateRegistryOptions {
  persistenceFile?: string | null;
}

const DEFAULT_TEMPLATES: UpstreamTemplate[] = [
  {
    id: 'filesystem',
    label: 'Filesystem',
    built_in: true,
    definition: {
      id: 'filesystem',
      name: 'Filesystem',
      executable: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
  },
  {
    id: 'memory',
    label: 'Memory',
    built_in: true,
    definition: {
      id: 'memory',
      name: 'Memory',
      executable: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    id: 'github',
    label: 'GitHub',
    built_in: true,
    definition: {
      id: 'github',
      name: 'GitHub',
      executable: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: '',
      },
    },
  },
];

export class UpstreamTemplateRegistry {
  private readonly templates = new Map<string, UpstreamTemplate>();
  private readonly persistenceFile: string | null;

  constructor(options: UpstreamTemplateRegistryOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? null;
    this.load();
  }

  list(): UpstreamTemplate[] {
    return [...this.templates.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  get(id: string): UpstreamTemplate | undefined {
    return this.templates.get(id);
  }

  upsert(template: UpstreamTemplate): UpstreamTemplate {
    this.validate(template);
    const normalized: UpstreamTemplate = {
      id: template.id,
      label: template.label,
      definition: template.definition,
      built_in: template.built_in ?? false,
    };
    this.templates.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  remove(id: string): boolean {
    const removed = this.templates.delete(id);
    if (removed) {
      this.persist();
    }
    return removed;
  }

  private load(): void {
    if (!this.persistenceFile || !existsSync(this.persistenceFile)) {
      for (const template of DEFAULT_TEMPLATES) {
        this.templates.set(template.id, template);
      }
      this.persist();
      return;
    }

    const persisted = JSON.parse(readFileSync(this.persistenceFile, 'utf8')) as PersistedTemplates;
    if (persisted.version !== 1 || !Array.isArray(persisted.templates)) {
      throw new Error(`Invalid upstream templates file: ${this.persistenceFile}`);
    }

    for (const template of persisted.templates) {
      this.validate(template);
      this.templates.set(template.id, template);
    }
  }

  private persist(): void {
    if (!this.persistenceFile) {
      return;
    }

    mkdirSync(path.dirname(this.persistenceFile), { recursive: true });
    const payload: PersistedTemplates = {
      version: 1,
      templates: this.list(),
    };
    const temporaryFile = `${this.persistenceFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(temporaryFile, this.persistenceFile);
  }

  private validate(template: UpstreamTemplate): void {
    if (!template.id?.trim()) {
      throw new Error('Template id is required');
    }
    if (!template.label?.trim()) {
      throw new Error('Template label is required');
    }
    if (!template.definition?.id?.trim()) {
      throw new Error('Template definition id is required');
    }
    if (!template.definition.executable?.trim()) {
      throw new Error('Template definition executable is required');
    }
  }
}
