import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../../src/renderer/components/common/Button.tsx';
import { Card } from '../../src/renderer/components/common/Card.tsx';
import { Badge } from '../../src/renderer/components/common/Badge.tsx';
import { EmptyState } from '../../src/renderer/components/common/EmptyState.tsx';
import { PageHeader } from '../../src/renderer/components/common/PageHeader.tsx';

describe('OpsReport Studio — Shared UI Components', () => {
  it('CMP-01: Button renders variants, disabled state, and loading attributes', () => {
    const defaultBtn = renderToStaticMarkup(<Button>Click Me</Button>);
    expect(defaultBtn).toContain('btn');
    expect(defaultBtn).toContain('Click Me');
    expect(defaultBtn).toContain('type="button"');

    const primaryBtn = renderToStaticMarkup(<Button variant="primary">Submit</Button>);
    expect(primaryBtn).toContain('Submit');

    const disabledBtn = renderToStaticMarkup(<Button disabled>Disabled Action</Button>);
    expect(disabledBtn).toContain('disabled=""');

    const loadingBtn = renderToStaticMarkup(<Button loading>Processing</Button>);
    expect(loadingBtn).toContain('disabled=""');
    expect(loadingBtn).toContain('aria-busy="true"');
  });

  it('CMP-02: Card renders title, subtitle, headerAction, body, and footer', () => {
    const markup = renderToStaticMarkup(
      <Card
        title="Card Title"
        subtitle="Card Subtitle"
        headerAction={<button type="button">Action</button>}
        footer={<span>Card Footer</span>}
      >
        <p>Card Body Content</p>
      </Card>
    );

    expect(markup).toContain('Card Title');
    expect(markup).toContain('Card Subtitle');
    expect(markup).toContain('Action');
    expect(markup).toContain('Card Body Content');
    expect(markup).toContain('Card Footer');
  });

  it('CMP-03: Badge renders semantic status variants with accessible tokens', () => {
    const successBadge = renderToStaticMarkup(<Badge variant="success">Completed</Badge>);
    expect(successBadge).toContain('badge');
    expect(successBadge).toContain('badge-success');
    expect(successBadge).toContain('Completed');

    const warningBadge = renderToStaticMarkup(<Badge variant="warning">Attention</Badge>);
    expect(warningBadge).toContain('badge-warning');

    const errorBadge = renderToStaticMarkup(<Badge variant="error">Failed</Badge>);
    expect(errorBadge).toContain('badge-error');

    const infoBadge = renderToStaticMarkup(<Badge variant="info">Phase 3</Badge>);
    expect(infoBadge).toContain('badge-info');
  });

  it('CMP-04: EmptyState renders distinct states for no-data, planned, error, and config-missing', () => {
    const noData = renderToStaticMarkup(
      <EmptyState
        type="no-data"
        title="No Reports"
        description="No reports have been generated yet."
      />
    );
    expect(noData).toContain('empty-state-no-data');
    expect(noData).toContain('No Reports');
    expect(noData).toContain('role="region"');

    const planned = renderToStaticMarkup(
      <EmptyState type="planned" title="Module Planned" description="Scheduled for Step 17." />
    );
    expect(planned).toContain('empty-state-planned');
    expect(planned).toContain('Module Planned');

    const errorState = renderToStaticMarkup(
      <EmptyState type="error" title="Load Failed" description="Subsystem failed to load." />
    );
    expect(errorState).toContain('empty-state-error');
    expect(errorState).toContain('Load Failed');

    const configMissing = renderToStaticMarkup(
      <EmptyState
        type="config-missing"
        title="Config Missing"
        description="Please select a station list."
      />
    );
    expect(configMissing).toContain('empty-state-config-missing');
    expect(configMissing).toContain('Config Missing');
  });

  it('CMP-05: PageHeader renders title, description, badge, and breadcrumbs', () => {
    const headerMarkup = renderToStaticMarkup(
      <PageHeader
        title="Dashboard"
        description="Operational overview and runtime diagnostics."
        badge={<Badge variant="info">Active</Badge>}
        breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}
        actions={<Button variant="primary">Launch</Button>}
      />
    );

    expect(headerMarkup).toContain('Dashboard');
    expect(headerMarkup).toContain('Operational overview and runtime diagnostics.');
    expect(headerMarkup).toContain('badge-info');
    expect(headerMarkup).toContain('Home');
    expect(headerMarkup).toContain('aria-label="Breadcrumb"');
    expect(headerMarkup).toContain('Launch');
  });
});
