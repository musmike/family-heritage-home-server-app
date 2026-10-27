import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthContext } from '../../context/AuthContext';

describe('HomePage Component', () => {
  it('should render username in greeting for ADMIN user', () => {
    const adminContext = {
      user: { username: 'michal', roles: ['ROLE_ADMIN'] },
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

    expect(
      screen.getByRole('heading', {
        name: /Witaj, michal! Jesteś zalogowany jako administrator\./i,
      })
    ).toBeInTheDocument();
  });

  it('should omit username in greeting for GUEST user', () => {
    const guestContext = {
      user: { username: 'guest_account', roles: ['ROLE_GUEST'] },
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

    expect(
      screen.getByRole('heading', {
        name: /^Witaj! Jesteś zalogowany jako gość\.$/i,
      })
    ).toBeInTheDocument();
  });
});