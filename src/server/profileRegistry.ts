import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Profile } from '../protocol/types.js';

interface PersistedProfiles {
  version: 1;
  profiles: Profile[];
}

export interface ProfileRegistryOptions {
  persistenceFile?: string | null;
}

export class ProfileRegistry {
  private readonly profiles = new Map<string, Profile>();
  private readonly persistenceFile: string | null;

  constructor(options: ProfileRegistryOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? null;
    this.load();
  }

  list(): Profile[] {
    return [...this.profiles.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  upsert(profile: Profile): Profile {
    this.validate(profile);
    const normalized: Profile = { id: profile.id, upstreamIds: [...profile.upstreamIds] };
    this.profiles.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  remove(id: string): boolean {
    const removed = this.profiles.delete(id);
    if (removed) {
      this.persist();
    }
    return removed;
  }

  private load(): void {
    if (!this.persistenceFile || !existsSync(this.persistenceFile)) {
      return;
    }

    const persisted = JSON.parse(readFileSync(this.persistenceFile, 'utf8')) as PersistedProfiles;
    if (persisted.version !== 1 || !Array.isArray(persisted.profiles)) {
      throw new Error(`Invalid profiles file: ${this.persistenceFile}`);
    }

    for (const profile of persisted.profiles) {
      this.validate(profile);
      this.profiles.set(profile.id, profile);
    }
  }

  private persist(): void {
    if (!this.persistenceFile) {
      return;
    }

    mkdirSync(path.dirname(this.persistenceFile), { recursive: true });
    const payload: PersistedProfiles = { version: 1, profiles: this.list() };
    const temporaryFile = `${this.persistenceFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(temporaryFile, this.persistenceFile);
  }

  private validate(profile: Profile): void {
    if (!profile.id?.trim()) {
      throw new Error('Profile id is required');
    }
    if (!Array.isArray(profile.upstreamIds)) {
      throw new Error('Profile upstreamIds must be an array');
    }
  }
}
