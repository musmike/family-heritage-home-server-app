import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { SidebarProvider } from '../../context/SidebarContext';
import { AuthContext } from '../../context/AuthContext';

describe('Sidebar Component', () => {
  const renderSidebarWithRole = (roles: string[]) => {
    render(
      <BrowserRouter>
        <AuthContext
          value={{
            user: { username: 'test', roles },
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
          }}
        >
          <SidebarProvider>
            <Sidebar />
          </SidebarProvider>
        </AuthContext>
      </BrowserRouter>
    );
  };

  it('should render all navigation links including Dziennik for ADMIN', () => {
    renderSidebarWithRole(['ROLE_ADMIN']);

    // Enabled links
    expect(screen.getByRole('link', { name: /Panel główny/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Biografie/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Wydarzenia/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Drzewo genealogiczne/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: /Nagrobki/i })).not.toHaveAttribute('aria-disabled');

    // Disabled upcoming links (including admin-only Dziennik)
    expect(screen.getByRole('link', { name: /Wspomnienia i powiedzenia/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Dziennik/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Statystyki/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Galeria/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Dokumenty/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Miejsca/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Pamiątki/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('should hide Dziennik for non-admin roles', () => {
    renderSidebarWithRole(['ROLE_GUEST']);
    expect(screen.queryByRole('link', { name: /Dziennik/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(3);
  });
});