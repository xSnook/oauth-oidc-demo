import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArchitecturePage } from './ArchitecturePage';

describe('ArchitecturePage', () => {
  it('describes the demo architecture and technology stack', () => {
    render(<ArchitecturePage />);

    expect(
      screen.getByRole('heading', { name: 'How the demo is put together' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Google OIDC sign-in')).toBeInTheDocument();
    expect(screen.getByText('Owner, admin, and user roles')).toBeInTheDocument();
    expect(screen.getByText('Docker-first delivery')).toBeInTheDocument();

    const frontendStack = screen.getByLabelText('Frontend technologies');
    expect(within(frontendStack).getByText('React')).toBeInTheDocument();
    expect(within(frontendStack).getByText('Vitest')).toBeInTheDocument();

    const backendStack = screen.getByLabelText('Backend technologies');
    expect(within(backendStack).getByText('FastAPI')).toBeInTheDocument();
    expect(within(backendStack).getByText('Redis rate limiting')).toBeInTheDocument();

    const infrastructureStack = screen.getByLabelText('Infrastructure technologies');
    expect(within(infrastructureStack).getByText('GitHub Actions')).toBeInTheDocument();
    expect(within(infrastructureStack).getByText('Route 53')).toBeInTheDocument();
  });

  it('explains auth flow and security boundaries', () => {
    render(<ArchitecturePage />);

    expect(screen.getByText('Google issues an OIDC ID token in the browser.')).toBeInTheDocument();
    expect(
      screen.getByText('Production secrets live in AWS SSM Parameter Store instead of GitHub Actions.'),
    ).toBeInTheDocument();
  });
});
