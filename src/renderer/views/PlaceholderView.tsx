/**
 * OpsReport Studio — Honest Placeholder View for Deferred Destinations
 *
 * Rendered when operators navigate to roadmap destinations scheduled for upcoming
 * implementation steps (e.g. Reports, Templates, Stations, History).
 *
 * Adheres strictly to Section 6.5 and Section 14: no fabricated data, no simulated
 * document generation, and clear roadmap attribution.
 *
 * @module renderer/views/PlaceholderView
 */

import React from 'react';
import type { NavItemConfig } from '../navigation/types.ts';
import { useNavigation } from '../navigation/NavigationContext.tsx';
import { PageHeader } from '../components/common/PageHeader.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { Button } from '../components/common/Button.tsx';
import { Badge } from '../components/common/Badge.tsx';

export interface PlaceholderViewProps {
  item: NavItemConfig;
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({ item }) => {
  const { navigateTo } = useNavigation();

  return (
    <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
      <PageHeader
        title={item.label}
        description={item.description}
        badge={
          <Badge variant="info">
            {item.plannedStep ? `Scheduled for ${item.plannedStep}` : 'Planned Module'}
          </Badge>
        }
        breadcrumbs={[
          { label: 'Dashboard', onClick: () => navigateTo('dashboard') },
          { label: item.label },
        ]}
      />

      <EmptyState
        type="planned"
        title={`${item.label} Module Planned`}
        description={`The ${item.label} workflow is scheduled for implementation in ${item.plannedStep || 'a subsequent roadmap step'}. The production application shell has reserved this destination so future features can integrate seamlessly without restructuring navigation or layouts.`}
        action={
          <Button variant="primary" onClick={() => navigateTo('dashboard')}>
            Return to Dashboard
          </Button>
        }
      />
    </div>
  );
};
