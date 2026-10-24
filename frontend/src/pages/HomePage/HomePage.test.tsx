import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthContext } from '../../context/AuthContext';

describe('HomePage Component', () => {
  it('should render GEDCOM import button in top right corner for ADMIN user', () => {
    const adminContext = {
      user: { username: 'admin', roles: ['ROLE_ADMIN'] },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    };

    render(
      <MemoryRouter>
        <AuthContext value={adminContext}>
          <HomePage />
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.getByTestId('gedcom-import-nav-button')).toBeInTheDocument();
  });

  it('should not render GEDCOM import button for non-admin user', () => {
    const guestContext = {
      user: { username: 'guest', roles: ['ROLE_GUEST'] },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    };

    render(
      <MemoryRouter>
        <AuthContext value={guestContext}>
          <HomePage />
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('gedcom-import-nav-button')).not.toBeInTheDocument();
  });
});