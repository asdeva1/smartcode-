'use client';
import * as React from 'react';
import { PageHeader, EmptyState, Breadcrumb } from '@smartcode/ui';

/**
 * Phase 1 foundation-stage page: real shell, real routing, no fake
 * data - see brief Section 13 "pages can be foundation/placeholder
 * states ... Do NOT create fake statistics." The business workflow
 * for each of these screens is built in Phases 3-7 per
 * docs/10-IMPLEMENTATION-ROADMAP.md.
 */
export function PlaceholderPage({
  title,
  description,
  breadcrumbItems,
}: {
  title: string;
  description: string;
  breadcrumbItems: { label: string; href?: string }[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} breadcrumb={<Breadcrumb items={breadcrumbItems} />} />
      <EmptyState
        title="Not yet implemented"
        description="This module's business workflow is built in a later implementation phase per the approved roadmap (docs/10-IMPLEMENTATION-ROADMAP.md)."
      />
    </>
  );
}
