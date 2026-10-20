import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemplatesView } from '../../src/renderer/views/TemplatesView.tsx';
import { setCategoryClient } from '../../src/renderer/services/category-client.ts';
import { setTemplateClient } from '../../src/renderer/services/template-client.ts';

describe('OpsReport Studio — TemplatesView Component Unit Tests', () => {
  beforeEach(() => {
    setCategoryClient(null);
    setTemplateClient(null);
  });

  afterEach(() => {
    setCategoryClient(null);
    setTemplateClient(null);
  });

  it('TPL-VW-01: Renders page header, subtitle, and tabs for categories and templates', () => {
    const markup = renderToStaticMarkup(<TemplatesView />);

    expect(markup).toContain('Category Registry &amp; Template Metadata');
    expect(markup).toContain('Report Categories');
    expect(markup).toContain('Template Metadata');
    expect(markup).toContain('+ Add Category');
  });

  it('TPL-VW-02: Renders category tab with standard 7 categories advisory notice', () => {
    const markup = renderToStaticMarkup(<TemplatesView initialTab="categories" />);

    expect(markup).toContain('Standard Category Registry');
    expect(markup).toContain('Search categories by name, ID, or description...');
    expect(markup).toContain('Active only');
  });

  it('TPL-VW-03: Renders template metadata tab with Master Template Vault Storage card', () => {
    const markup = renderToStaticMarkup(<TemplatesView initialTab="templates" />);

    expect(markup).toContain('Master Template Vault Storage');
    expect(markup).toContain('Physical Master Files');
    expect(markup).toContain('Scratch Sandbox');
    expect(markup).toContain('Import Template File');
    expect(markup).toContain('+ Add Descriptor');
    expect(markup).toContain('Search templates by name, filename, ID...');
  });

  it('TPL-VW-04: Renders tabs with proper ARIA attributes', () => {
    const markup = renderToStaticMarkup(<TemplatesView initialTab="categories" />);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-selected="true"');
  });
});
