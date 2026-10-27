import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { AuthContext } from './context/AuthContext';
import { SidebarProvider } from './context/SidebarContext'; // Import SidebarProvider

vi.mock('./components/Footer/Footer', () => ({
  default: () => <footer>Footer Mock</footer>,
}));

describe('App Routing and Layout', () => {
  it('should render the login page when user is not authenticated and not loading', () => {
    const mockAuthContext = { 
      user: null, 
      isLoading: false, 
      login: vi.fn(), 
      logout: vi.fn() 
    };
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext value={mockAuthContext}>
          <SidebarProvider>
            <App />
          </SidebarProvider>
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-page-container')).toBeInTheDocument();
  });

  it('should render the main layout when user is authenticated', () => {
    const mockAuthContext = {
      user: { username: 'testuser', roles: ['ADMIN'] },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext value={mockAuthContext}>
           <SidebarProvider>
            <App />
          </SidebarProvider>
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-menu-button')).toBeInTheDocument();
  });
});