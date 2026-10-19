# OpsReport Studio — Security & Operational Architecture

**Document Identifier:** SEC-ARCH-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** Authoritative Security Architecture  
**Last Updated:** 2026-10-19  

---

## 1. Security Architecture Principles & Threat Model

OpsReport Studio processes security incident records, physical infrastructure vulnerabilities, and facility inspection audits for control room operations. The application's architecture is engineered around the principle of **Defense-in-Depth**, strictly enforcing isolation across process boundaries, filesystem targets, and untrusted Open XML file structures.

```
┌────────────────────────────────────────────────────────────────────────┐
│ UNTRUSTED ZONE: Renderer Process (UI / Forms / Views)                  │
│ • Sandboxed Chromium Environment (sandbox: true)                       │
│ • Zero Node.js Access (nodeIntegration: false)                         │
│ • Content Security Policy: default-src 'self'; script-src 'self';     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       Strictly Validated IPC API
                       (contextBridge: window.opsreport)
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ TRUSTED ZONE: Main Process & Background Worker (Node.js)               │
│ • Parameter Sanitization & Type Guards                                 │
│ • Read-Only Template Vault Access                                      │
│ • Ephemeral Scratch Sandbox Processing                                 │
│ • Atomic Destination Export with Path Traversal Protection             │
│ • Isolated SQLite Database Access (No Direct SQL from Renderer)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Process Isolation & IPC Security

### 2.1 Hardened Electron Window Configuration:
```typescript
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 850,
  webPreferences: {
    contextIsolation: true,          // Strictly separate JS execution contexts
    nodeIntegration: false,           // Prohibit Node primitives in renderer
    sandbox: true,                    // Enforce OS-level process sandboxing
    webSecurity: true,                // Enforce same-origin policy
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 2.2 Content Security Policy (CSP):
The application injects a rigid CSP preventing unauthorized script injection, inline execution, and network exfiltration:
```http
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
```

### 2.3 IPC Schema Validation:
The `contextBridge` layer does not expose arbitrary message buses or dynamic method invocation. Every IPC channel is mapped to a dedicated, strongly-typed handler in `preload.ts` that validates payloads against strict JSON schemas before invoking backend services.

---

## 3. Filesystem Security & Master Template Protection

### 3.1 Copy-First Immutability Pipeline (`REQ-006`):
1. **Source File Immutability:** Master templates residing in `%LOCALAPPDATA%\OpsReportStudio\Templates\` are opened with OS read-only sharing flags (`FileShare.Read`).
2. **Path Equivalence Guard:** Before opening any file write stream, the system evaluates:
   ```typescript
   if (path.resolve(destinationPath) === path.resolve(masterTemplatePath)) {
     throw new SecurityError("Destination path cannot resolve to master template file.");
   }
   ```
3. **Scratch Sandbox Isolation:** Dynamic data injection occurs strictly within temporary working files located in `%LOCALAPPDATA%\OpsReportStudio\Scratch\`. Failed generation jobs immediately unlink scratch files, leaving master templates 100% unaltered.

### 3.2 Directory Traversal Protection:
User-selected export destinations and imported template paths are canonicalized using `path.resolve()` and checked against blacklisted operating system roots to prevent writing into system-critical directories (e.g., `C:\Windows\System32\`).

---

## 4. Untrusted Open XML Ingestion Safeguards

External `.xlsx` and `.docx` templates represent compressed ZIP archives that could harbor malicious payloads. The ingestion pipeline enforces the following automated security filters:

1. **MIME & Magic Byte Verification:** Verifies standard ZIP header signature (`0x50 0x4B 0x03 0x04` / `PK\x03\x04`) at byte offset 0. Files masquerading with `.xlsx` extensions are rejected immediately.
2. **Zip Bomb Mitigation:** 
   * Decompression expansion ratio capped at **15:1**.
   * Hard ceiling of **100 MB total uncompressed memory size**.
3. **Zip Slip Traversal Guard:** Archive extractors reject any inner file entry containing `..` or leading directory separators (`/` or `\`).
4. **Macro Quarantine (`DEC-005`):** Archives are actively inspected for `vbaProject.bin`. Any macro-enabled workbook (`.xlsm`) or document (`.docm`) is quarantined and blocked from report generation.
5. **XML External Entity (XXE) Prevention:** All Open XML DOM parsers are explicitly configured to disable external DTD resolution and entity expansion.

---

## 5. Privacy, Confidentiality & Audit Log Sanitization

1. **Zero External Telemetry:** OpsReport Studio operates 100% offline (`NFR-SEC-01`). No crash reports, usage metrics, or operational logs are transmitted to external cloud endpoints.
2. **Log Sanitization:** Application debug logs recorded in `%LOCALAPPDATA%\OpsReportStudio\Logs\` strictly filter out:
   * Security incident narratives (`FLD-INC-NARRATIVE`).
   * Officer names and employee badge numbers (`FLD-COM-INSPECTOR`, `FLD-COM-BADGE`).
   * Detailed witness statements (`FLD-INC-WITNESS`).
3. **Database Access Encapsulation:** SQLite database operations execute exclusively within the Node.js main process. The renderer has zero direct SQL query capability, completely eliminating SQL injection vectors.
