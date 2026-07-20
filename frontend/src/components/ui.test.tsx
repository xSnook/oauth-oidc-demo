import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DetailList, LinkPanel, MetricCard, PageHero, Panel, SectionHeading, SummaryCard } from './ui';

describe('ui primitives', () => {
  it('renders page and section headings', () => {
    render(
      <>
        <PageHero action={<span>action</span>} eyebrow="Area" title="Main title">
          Supporting text
        </PageHero>
        <PageHero eyebrow="Plain" title="No supporting text" />
        <SectionHeading eyebrow="Group" id="section-title" title="Section title" />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'Main title' })).toBeInTheDocument();
    expect(screen.getByText('Supporting text')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No supporting text' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Section title' })).toHaveAttribute(
      'id',
      'section-title',
    );
    expect(screen.getByText('action')).toBeInTheDocument();
  });

  it('renders cards, panels, links, and details', () => {
    render(
      <MemoryRouter>
        <MetricCard caption="Ready for traffic" icon={<svg />} label="Status" value="Live" />
        <Panel eyebrow="Profile" id="profile-panel" title="Account">
          <DetailList items={[{ label: 'Email', value: 'user@example.com' }]} />
        </Panel>
        <LinkPanel eyebrow="Admin" title="Manage users" to="/admin/users">
          Review access.
        </LinkPanel>
        <SummaryCard label="Active" value={2} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account' })).toHaveAttribute(
      'id',
      'profile-panel',
    );
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AdminManage users/ })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
