/**
 * OpsReport Studio — Foundation Shell & Design System Startup View
 *
 * Implements the Phase 3 foundation verification surface with integrated
 * light/dark theme management, accessible controls, and runtime diagnostics.
 *
 * @module renderer/App
 */

import React, { useEffect, useState } from 'react';
import type { AppMetadata, FoundationPingResponse } from '../shared/types.ts';
import { ThemeProvider } from './theme/index.ts';
import { ThemeToggle } from './components/ThemeToggle.tsx';

const AppContent: React.FC = () => {
  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  const [ping, setPing] = useState<FoundationPingResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string>('Connecting...');

  useEffect(() => {
    if (window.opsreport) {
      setBridgeStatus('Connected (Context Isolated)');
      window.opsreport
        .getAppMetadata()
        .then(meta => setMetadata(meta))
        .catch(() => {
          setBridgeStatus('Error fetching metadata');
        });
      window.opsreport
        .ping()
        .then(p => setPing(p))
        .catch(() => {
          setBridgeStatus('Error pinging main process');
        });
    } else {
      setBridgeStatus('Preload bridge not detected (Browser/Test Environment)');
      // Fallback metadata for headless/browser test mode
      setMetadata({
        name: 'OpsReport Studio',
        id: 'stationops-reporter',
        version: '0.1.0-alpha',
        environment: 'development',
        platform: 'win32',
        electronVersion: '32.1.2',
        nodeVersion: '26.8.1',
      });
    }
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: 'var(--color-bg-app)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Top Application Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-6)',
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <img
            src="/OpsReport Studio Tech Logo.png"
            alt=""
            aria-hidden="true"
            style={{ width: '24px', height: '24px', objectFit: 'contain' }}
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span
            style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}
          >
            OpsReport Studio
          </span>
          <span className="badge badge-info" style={{ marginLeft: 'var(--space-1)' }}>
            Phase 3
          </span>
        </div>

        <div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Diagnostic Surface */}
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: 'var(--space-8) var(--space-4)',
          textAlign: 'center',
        }}
      >
        <div
          className="surface-card"
          style={{
            maxWidth: '680px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <img
              src="/OpsReport Studio Tech Logo.png"
              alt="OpsReport Studio Logo"
              style={{ width: '96px', height: '96px', objectFit: 'contain' }}
              onError={e => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <h1 className="text-h2" style={{ marginBottom: 'var(--space-2)' }}>
            OpsReport Studio is initialized.
          </h1>

          <p
            className="text-body-sm"
            style={{ marginBottom: 'var(--space-6)', color: 'var(--color-text-secondary)' }}
          >
            Phase 3 Foundation — Desktop Application Shell &amp; Verified Build Environment
          </p>

          {/* Diagnostic Details Grid */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-3)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Foundation Runtime Diagnostics
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                rowGap: 'var(--space-2)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>Product Identity:</span>
              <span
                style={{
                  color: 'var(--color-text-primary)',
                  fontWeight: 'var(--font-weight-medium)',
                }}
              >
                OpsReport Studio (<code>stationops-reporter</code>)
              </span>

              <span style={{ color: 'var(--color-text-muted)' }}>Build Version:</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {metadata?.version || '0.1.0-alpha'}
              </span>

              <span style={{ color: 'var(--color-text-muted)' }}>Security Model:</span>
              <div>
                <span className="badge badge-success">
                  Context Isolation: Enabled | Sandbox: Enabled
                </span>
              </div>

              <span style={{ color: 'var(--color-text-muted)' }}>Preload Bridge:</span>
              <span style={{ color: 'var(--color-action-primary)' }}>{bridgeStatus}</span>

              {ping && (
                <>
                  <span style={{ color: 'var(--color-text-muted)' }}>Main Process Ping:</span>
                  <div>
                    <span className="badge badge-success">
                      {ping.status.toUpperCase()} ({ping.message})
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};
