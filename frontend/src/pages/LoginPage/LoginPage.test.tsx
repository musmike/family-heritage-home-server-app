import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest'; 
import LoginPage from './LoginPage';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import { BrowserRouter } from 'react-router-dom';

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';

vi.mock('../../assets/logo-light-mode.png', () => ({
  default: 'mock-logo.png',
}));

vi.mock('../../api/axiosInstance');

describe('LoginPage Component', () => {
  const mockLogin = vi.fn();
  const mockAuthContext = {
    user: null,
    isLoading: false,
    login: () => { mockLogin(); return Promise.resolve(); },
    logout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the core interactive elements of the login form', () => {
    render(
      <BrowserRouter>
        <AuthContext value={mockAuthContext}>
          <LoginPage />
        </AuthContext>
      </BrowserRouter>
    );

    expect(screen.getByTestId('login-username-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeInTheDocument();
  });

  it('should call api and context login function on successful form submission', async () => {
    const mockedApi = vi.mocked(api);
    (mockedApi.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(
      <BrowserRouter>
        <AuthContext value={mockAuthContext}>
          <LoginPage />
        </AuthContext>
      </BrowserRouter>
    );

    const usernameInput = screen.getByTestId('login-username-input');
    const passwordInput = screen.getByTestId('login-password-input');
    const submitButton = screen.getByTestId('login-submit-button');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/auth/login',
        { username: 'testuser', password: 'password' }
      );
    });
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it('should display an error message on failed login', async () => { 
    // GIVEN
    const apiError = new AxiosError(
      'Request failed with status code 401',
      'ERR_BAD_REQUEST',
      {} as InternalAxiosRequestConfig,
      null,
      {
        data: {
          errorCode: 'BAD_CREDENTIALS',
          message: 'Invalid username or password.',
        },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      }
    );

    const mockedApi = vi.mocked(api);
    (mockedApi.post as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);
    
    render(
      <BrowserRouter>
        <AuthContext value={mockAuthContext}>
          <LoginPage />
        </AuthContext>
      </BrowserRouter>
    );

    const usernameInput = screen.getByTestId('login-username-input');
    const passwordInput = screen.getByTestId('login-password-input');
    const submitButton = screen.getByTestId('login-submit-button');

    // WHEN
    fireEvent.change(usernameInput, { target: { value: 'user' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitButton);

    // THEN
    await waitFor(() => {
      expect(screen.getByText('Nieprawidłowa nazwa użytkownika lub hasło.')).toBeInTheDocument();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });
});