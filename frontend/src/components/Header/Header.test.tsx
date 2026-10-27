import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import { AuthContext } from '../../context/AuthContext';
import { SidebarProvider } from '../../context/SidebarContext';

describe('Header Component', () => {
  it('should open user menu, show admin links and call logout when clicked', () => {
    const mockLogout = vi.fn();
    const mockAuthContext = {
      user: { username: 'testuser', roles: ['ADMIN'] },
      isLoading: false,
      login: vi.fn(),
      logout: mockLogout,
    };

    render(
      <MemoryRouter>
        <AuthContext value={mockAuthContext}>
          <SidebarProvider>
            <Header />
          </SidebarProvider>
        </AuthContext>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('user-menu-button'));
    expect(screen.getByTestId('menu-gedcom-import-link')).toBeInTheDocument();
    expect(screen.getByTestId('menu-users-management-link')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('logout-button'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('should not render user menu button when user is not authenticated', () => {
    const mockAuthContext = {
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    };

    render(
      <MemoryRouter>
        <AuthContext value={mockAuthContext}>
          <SidebarProvider>
            <Header />
          </SidebarProvider>
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('user-menu-button')).not.toBeInTheDocument();
  });
});