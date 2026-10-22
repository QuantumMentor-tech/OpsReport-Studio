# OpsReport Studio — Development Environment Specification

**Document Identifier:** DEV-ENV-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 9 of 45 (Repository Initialization, Development Environment & Build Configuration)  
**Status:** Authoritative Development Environment Guide  
**Last Updated:** 2026-10-19

---

## 1. Supported Development Platforms & Certified Tiers

OpsReport Studio is a desktop application engineered for enterprise control room environments.

| Environment Tier               | Operating System                           | Architecture    | Certification Status                             |
| :----------------------------- | :----------------------------------------- | :-------------- | :----------------------------------------------- |
| **Tier 1 (Certified Primary)** | Windows 10 / Windows 11 (22H2+)            | `x64` (64-bit)  | Certified Production Baseline (`NFR-COMP-01`)    |
| **Tier 2 (Compatible Dev)**    | macOS (Sonoma 14+) / Linux (Ubuntu 22.04+) | `x64` / `arm64` | Development Compatible (Cross-Platform Electron) |

---

## 2. Required Toolchain & Verified Versions

The foundation has been empirically validated against the following host toolchain versions:

| Tool           | Minimum Version | Verified Version on Host | Role                                         | Verification Command          |
| :------------- | :-------------- | :----------------------- | :------------------------------------------- | :---------------------------- |
| **Node.js**    | v20.16+ LTS     | **v26.8.1**              | JavaScript/TypeScript desktop runtime        | `node -v`                     |
| **npm**        | v10.0+          | **v11.19.0**             | Package manager & dependency resolver        | `npm -v`                      |
| **Git**        | v2.30+          | **v2.55.0**              | Distributed source version control           | `git --version`               |
| **TypeScript** | v5.5+           | **v5.5.4**               | Static type checker & solution compiler      | `npx tsc -v`                  |
| **Electron**   | v32.0+ LTS      | **v32.1.2**              | Desktop runtime container & window shell     | Installed via devDependencies |
| **Vite**       | v5.4+           | **v5.4.6**               | Dual frontend & Electron compilation bundler | `npx vite -v`                 |
| **Vitest**     | v2.0+           | **v2.1.1**               | Native ESM unit and smoke test runner        | `npx vitest -v`               |

---

## 3. Fresh Machine Setup Guide

### Step 1: Clone Repository

```bash
git clone <repository-url> "OpsReport Studio (working)"
cd "OpsReport Studio (working)"
```

### Step 2: Install Node.js

Ensure Node.js (v20+ LTS recommended) is installed. Verify with:

```bash
node -v
npm -v
```

### Step 3: Install Dependencies

```bash
# Clean, deterministic installation respecting package-lock.json
npm install
```

### Step 4: Validate Foundation Setup

```bash
# Verify static typing
npm run typecheck

# Run smoke tests
npm run test:smoke

# Launch development desktop window
npm run dev
```

---

## 4. Common Setup Issues & Troubleshooting

| Issue Description                   | Likely Root Cause                                                    | Remediation Procedure                                                                                             |
| :---------------------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `Electron failed to install`        | Corporate proxy or network timeout during binary download.           | Set environment variable: `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` and re-run `npm install`. |
| `tsc: Cannot find type definition`  | Missing `@types/node` or missing `@types/react`.                     | Verify `package.json` contains `@types/node` and run `npm install`.                                               |
| `ContextBridge undefined in window` | Preload script failed to compile or path misconfigured.              | Verify `dist-electron/preload/index.mjs` was emitted by Vite.                                                     |
| `EACCES: permission denied on .tmp` | Antivirus holding lock on `%LOCALAPPDATA%\OpsReportStudio\Scratch\`. | Whitelist application data directory in corporate antivirus or execute as standard local user.                    |

---

## 5. Security & Isolation Boundaries

1. **Local Data Isolation:** Runtime database (`opsreport.db`), scratch files, and template vaults reside in `%LOCALAPPDATA%\OpsReportStudio\`, completely separate from the git-tracked source tree.
2. **Zero External Network Dependencies:** The application builds and runs 100% offline once npm dependencies are installed (`NFR-SEC-01`).
