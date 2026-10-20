import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryVaultClient,
  ElectronVaultClient,
  getVaultClient,
  setVaultClient,
} from '../../src/renderer/services/vault-client.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Vault Client (InMemory & Bridge Fallback)', () => {
  let inMemoryClient: InMemoryVaultClient;

  beforeEach(() => {
    inMemoryClient = new InMemoryVaultClient(['TPL-INCIDENT-STANDARD']);
    setVaultClient(inMemoryClient);
  });

  afterEach(() => {
    setVaultClient(null);
  });

  it('VCL-01: Retrieves storage status with template file counts in InMemory mode', async () => {
    const res = await inMemoryClient.getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isReady).toBe(true);
      expect(res.value.totalTemplatesInVault).toBe(1);
      expect(res.value.templatesDir.exists).toBe(true);
      expect(res.value.templatesDir.isWritable).toBe(true);
      expect(res.value.statusMessage).toContain('1 master template file(s)');
    }
  });

  it('VCL-02: Reports not ready when InMemory client is configured as unready', async () => {
    inMemoryClient.setReady(false);
    const res = await inMemoryClient.getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isReady).toBe(false);
      expect(res.value.templatesDir.exists).toBe(false);
      expect(res.value.statusMessage).toContain('require initialization');
    }
  });

  it('VCL-03: Checks template file existence and reflects mutations', async () => {
    const check1 = await inMemoryClient.checkTemplateExists('TPL-INCIDENT-STANDARD');
    expect(check1.ok).toBe(true);
    if (check1.ok) {
      expect(check1.value).toBe(true);
    }

    const check2 = await inMemoryClient.checkTemplateExists('TPL-NON-EXISTENT');
    expect(check2.ok).toBe(true);
    if (check2.ok) {
      expect(check2.value).toBe(false);
    }

    inMemoryClient.addTemplateFile('TPL-NEW-ONE');
    const check3 = await inMemoryClient.checkTemplateExists('TPL-NEW-ONE');
    expect(check3.ok && check3.value).toBe(true);

    inMemoryClient.removeTemplateFile('TPL-INCIDENT-STANDARD');
    const check4 = await inMemoryClient.checkTemplateExists('TPL-INCIDENT-STANDARD');
    expect(check4.ok && check4.value).toBe(false);
  });

  it('VCL-04: ElectronVaultClient returns operational error if bridge is not available', async () => {
    const electronClient = new ElectronVaultClient();

    // Since we are running in Node/Vitest without Electron preload bridge:
    const statusRes = await electronClient.getStatus();
    expect(statusRes.ok).toBe(false);
    if (!statusRes.ok) {
      expect(statusRes.error.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
      expect(statusRes.error.userMessage).toContain('bridge not connected');
    }

    const initRes = await electronClient.initialize();
    expect(initRes.ok).toBe(false);

    const existsRes = await electronClient.checkTemplateExists('TPL-123');
    expect(existsRes.ok).toBe(false);
  });

  it('VCL-05: getVaultClient returns singleton or fallback correctly', () => {
    const current = getVaultClient();
    expect(current).toBe(inMemoryClient);

    setVaultClient(null);
    const fallback = getVaultClient();
    expect(fallback).toBeDefined();
  });
});
