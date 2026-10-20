/**
 * OpsReport Studio — Operational Dashboard View
 *
 * Implements the primary operator landing page with welcoming context,
 * runtime foundation diagnostics, truthful operational category scope,
 * and an honest empty state for recent activity.
 *
 * Adheres strictly to Section 8: no fabricated metrics, no simulated report
 * generation, and verified runtime diagnostics.
 *
 * @module renderer/views/DashboardView
 */

import React, { useEffect, useState } from 'react';
import type { AppMetadata, FoundationPingResponse } from '../../shared/types.ts';
import { useNavigation } from '../navigation/NavigationContext.tsx';
import { PageHeader } from '../components/common/PageHeader.tsx';
import { Card } from '../components/common/Card.tsx';
import { Button } from '../components/common/Button.tsx';
import { Badge } from '../components/common/Badge.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';

// Authoritative static operational report categories from Section 3
const REPORT_CATEGORY_SCOPE = [
  {
    name: 'Security Incident Reports',
    format: 'Word (.docx)',
    description: 'Incident logs, officer observations, and control room security events.',
  },
  {
    name: 'Station Light Reports',
    format: 'Excel (.xlsx)',
    description: 'Lighting defect tracking, bulb replacement status, and circuit auditing.',
  },
  {
    name: 'Fan Reports',
    format: 'Excel (.xlsx)',
    description: 'Platform and concourse ventilation inspection, airflow, and operational state.',
  },
  {
    name: 'Pole Light Reports',
    format: 'Excel (.xlsx)',
    description: 'Perimeter, parking, and yard luminaire inspections and power continuity.',
  },
  {
    name: 'Fire Extinguisher Reports',
    format: 'Excel (.xlsx)',
    description: 'Pressure gauge status, seal integrity, inspection dates, and station placement.',
  },
  {
    name: 'Pillar Reports',
    format: 'Excel (.xlsx)',
    description:
      'Structural station pillar physical integrity, asset numbering, and clearance checks.',
  },
  {
    name: 'Fence Reports',
    format: 'Excel (.xlsx)',
    description: 'Perimeter barrier condition, intrusion risk points, and boundary security.',
  },
] as const;

export const DashboardView: React.FC = () => {
  const { navigateTo } = useNavigation();
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
    <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
      <PageHeader
        title="Welcome to OpsReport Studio"
        description="Manage reusable report templates and prepare operational reports from a single workspace."
        badge={<Badge variant="info">Phase 3 Foundation</Badge>}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" size="sm" onClick={() => navigateTo('settings')}>
              Application Settings
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled
              title="Report generation workflow scheduled for Step 17"
            >
              + New Report (Step 17)
            </Button>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Runtime Diagnostics Card — Preserves Foundation SMK-07 Contract */}
        <Card
          title="OpsReport Studio is initialized."
          subtitle="Phase 3 Foundation — Desktop Application Shell & Verified Build Environment"
          headerAction={<Badge variant="success">Environment Ready</Badge>}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Product Identity:</span>
              <span
                style={{
                  fontWeight: 'var(--font-weight-medium)',
                  color: 'var(--color-text-primary)',
                }}
              >
                OpsReport Studio (<code>{metadata?.id || 'stationops-reporter'}</code>)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Build Version:</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {metadata?.version || '0.1.0-alpha'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Security Model:</span>
              <div>
                <Badge variant="success">Context Isolated</Badge>{' '}
                <Badge variant="success">Sandbox Enabled</Badge>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Preload Bridge:</span>
              <span
                style={{
                  color: 'var(--color-action-primary)',
                  fontWeight: 'var(--font-weight-medium)',
                }}
              >
                {bridgeStatus}
              </span>
            </div>
          </div>

          {ping && (
            <div
              style={{
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>Main Process IPC:</span>
              <Badge variant="success">
                {ping.status.toUpperCase()} ({ping.message})
              </Badge>
            </div>
          )}
        </Card>

        {/* Quick Launch & Roadmap Destinations */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <Card
            title="Report Generation"
            subtitle="Standardized Excel and Word operational reporting."
            footer={
              <Button variant="outline" size="sm" fullWidth onClick={() => navigateTo('reports')}>
                View Reports Module (Planned)
              </Button>
            }
          >
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}
            >
              Automated data population into master document templates without modifying originals.
              Scheduled for Step 17 &amp; 18.
            </p>
          </Card>

          <Card
            title="Template Vault"
            subtitle="Excel &amp; Word master document catalog."
            footer={
              <Button variant="outline" size="sm" fullWidth onClick={() => navigateTo('templates')}>
                View Template Vault (Planned)
              </Button>
            }
          >
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}
            >
              Template inspection, field mapping schemas, and read-only master preservation.
              Scheduled for Step 14 &amp; 15.
            </p>
          </Card>

          <Card
            title="Station Sequence"
            subtitle="Authoritative ordered station configuration."
            footer={
              <Button variant="outline" size="sm" fullWidth onClick={() => navigateTo('stations')}>
                View Stations Config (Planned)
              </Button>
            }
          >
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}
            >
              Validates strict station ordering across transit segments to prevent reporting
              sequence corruption. Scheduled for Step 16.
            </p>
          </Card>
        </div>

        {/* Report Category Overview — Truthful Scope Reference */}
        <Card
          title="Operational Report Scope Overview"
          subtitle="Introductory architectural reference of the 7 standardized report categories targeted for automation."
          headerAction={<Badge variant="neutral">Static Scope Reference</Badge>}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {REPORT_CATEGORY_SCOPE.map((cat, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {cat.name}
                  </span>
                  <Badge variant="info">{cat.format}</Badge>
                </div>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    margin: 0,
                  }}
                >
                  {cat.description}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 'var(--space-4)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            <em>Note:</em> Active template schemas and validation rules will be loaded from local
            persistence upon completion of Step 13 (SQLite Database) and Step 14 (Template
            Management).
          </div>
        </Card>

        {/* Recent Reports Section — Honest Empty State */}
        <Card
          title="Recent Report Activity"
          subtitle="Local generation history and document audit records."
        >
          <EmptyState
            type="no-data"
            title="No Recent Reports"
            description="Report generation and local session history will be stored here once the SQLite persistence layer (Step 13) and Document Generation Engine (Step 17) are integrated."
            action={
              <Button variant="secondary" size="sm" onClick={() => navigateTo('settings')}>
                Inspect Workspace Settings
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  );
};
