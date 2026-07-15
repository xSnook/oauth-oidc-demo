import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProviderBadge } from './ProviderBadge';
import { RoleBadge } from './RoleBadge';

describe('badges', () => {
  it('renders provider badges with provider classes', () => {
    render(<ProviderBadge provider="microsoft" />);

    expect(screen.getByText('microsoft')).toHaveClass('badge', 'provider-microsoft');
  });

  it('renders role badges with role classes', () => {
    render(<RoleBadge role="admin" />);

    expect(screen.getByText('admin')).toHaveClass('badge', 'role-admin');
  });
});
