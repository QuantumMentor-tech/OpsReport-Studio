import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/storage/database/migrations/migrator.ts';
import { SettingsRepository } from '../../../src/storage/database/repositories/settings-repository.ts';

describe('OpsReport Studio — Settings Repository', () => {
  let db: Database.Database;
  let repo: SettingsRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new SettingsRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('SET-01: Stores and retrieves setting key-value pairs accurately', () => {
    const setResult = repo.setSetting('export_destination', 'C:\\Reports\\Operations');
    expect(setResult.ok).toBe(true);

    const getResult = repo.getSetting('export_destination');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBe('C:\\Reports\\Operations');
    }
  });

  it('SET-02: Returns null when querying non-existent setting key', () => {
    const getResult = repo.getSetting('non_existent_key');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBeNull();
    }
  });

  it('SET-03: Upserts setting on duplicate key without error', () => {
    repo.setSetting('theme_preference', 'light');
    repo.setSetting('theme_preference', 'dark');

    const getResult = repo.getSetting('theme_preference');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toBe('dark');
    }
  });

  it('SET-04: Deletes setting by key and retrieves full dictionary', () => {
    repo.setSetting('k1', 'v1');
    repo.setSetting('k2', 'v2');

    const allBefore = repo.getAllSettings();
    expect(allBefore.ok && Object.keys(allBefore.value).length === 2).toBe(true);

    const deleteResult = repo.deleteSetting('k1');
    expect(deleteResult.ok && deleteResult.value === true).toBe(true);

    const allAfter = repo.getAllSettings();
    expect(allAfter.ok && allAfter.value).toEqual({ k2: 'v2' });
  });
});
