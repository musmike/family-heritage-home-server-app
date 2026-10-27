import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthContext } from '../../context/AuthContext';
import { activityApi } from '../../api/activityApi';

vi.mock('../../api/activityApi', () => ({
  activityApi: {
    getActivities: vi.fn(),
  },
}));

describe('HomePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(activityApi).getActivities.mockResolvedValue({
      content: [
        {
          id: 1,
          actionType: 'PERSON_CREATED',
          actionLabel: 'Dodanie osoby',
          actorUsername: 'michal',
          actorDisplayName: 'Muzyka Michał (michal)',
          description: 'Dodano osobę: Kowalski Jan',
          targetType: 'PERSON',
          targetId: 10,
          ipAddress: null,
          adminOnly: false,
          createdAt: '2026-10-27T12:00:00',
        },
      ],
      page: 0,
      size: 8,
      totalElements: 1,
      totalPages: 1,
      availableTypes: [],
      availableActors: ['michal'],
    });
  });

  it('should render username in greeting and recent activities with Show More button for ADMIN user', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Dodano osobę: Kowalski Jan')).toBeInTheDocument();
    });
    expect(screen.getByText(/Muzyka Michał \(michal\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('show-more-activities-button')).toBeInTheDocument();
  });

  it('should omit username in greeting for GUEST user', async () => {
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

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /^Witaj! Jesteś zalogowany jako gość\.$/i,
        })
      ).toBeInTheDocument();
    });
  });
});