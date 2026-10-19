import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('OpsReport Studio — Foundation Smoke Tests', () => {
  it('SMK-01: Verifies package.json project identity and required scripts', () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.name).toBe('opsreport-studio');
    expect(pkg.version).toBe('0.1.0-alpha');
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts['test:smoke']).toBeDefined();
  });

  it('SMK-02: Verifies core application entry files exist', () => {
    expect(fs.existsSync(path.join(projectRoot, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/main/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/preload/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/main.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/App.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/shared/types.ts'))).toBe(true);
  });

  it('SMK-03: Verifies strict Content Security Policy in index.html', () => {
    const htmlContent = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
    expect(htmlContent).toContain('http-equiv="Content-Security-Policy"');
    expect(htmlContent).toContain("default-src 'self'");
    expect(htmlContent).not.toContain("'unsafe-eval'");
  });

  it('SMK-04: Verifies hardened Electron window configuration in main process', () => {
    const mainContent = fs.readFileSync(path.join(projectRoot, 'src/main/index.ts'), 'utf8');
    expect(mainContent).toContain('contextIsolation: true');
    expect(mainContent).toContain('nodeIntegration: false');
    expect(mainContent).toContain('sandbox: true');
    expect(mainContent).toContain('webSecurity: true');
    expect(mainContent).toContain('will-navigate');
  });

  it('SMK-05: Verifies TypeScript configurations and solution references', () => {
    const rootTsConfig = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8')
    );
    expect(rootTsConfig.references).toHaveLength(2);
    expect(fs.existsSync(path.join(projectRoot, 'tsconfig.node.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'tsconfig.web.json'))).toBe(true);
  });

  it('SMK-06: Verifies .gitignore protects operational reports, DBs, and temporary data', () => {
    const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('dist/');
    expect(gitignore).toContain('scratch/');
    expect(gitignore).toContain('*.db');
    expect(gitignore).toContain('*.xlsx');
    expect(gitignore).toContain('*.docx');
  });

  it('SMK-07: Verifies startup surface displays neutral initialization and product identity', () => {
    const appContent = fs.readFileSync(path.join(projectRoot, 'src/renderer/App.tsx'), 'utf8');
    expect(appContent).toContain('OpsReport Studio');
    expect(appContent).toContain('OpsReport Studio is initialized.');
    expect(appContent).toContain('Phase 3 Foundation');
  });
});
