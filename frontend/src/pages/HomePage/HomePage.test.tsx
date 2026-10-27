import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { AuthContext } from '../../context/AuthContext';
import { activityApi } from '../../api/activityApi';
import { dashboardApi } from '../../api/dashboardApi';

vi.mock('../../api/activityApi', () => ({
  activityApi: {
    getActivities: vi.fn(),
  },
}));

vi.mock('../../api/dashboardApi', () => ({
  dashboardApi: {
    getStats: vi.fn(),
    getAnniversaries: vi.fn(),
  },
}));

describe('HomePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(dashboardApi).getStats.mockResolvedValue({
      peopleCount: 42,
      familiesCount: 15,
      generationsCount: 5,
      eventsCount: 98,
      gravesCount: 12,
      documentsCount: 0,
      mediaCount: 0,
      memoriesCount: 0,
      heirloomsCount: 0,
      placesCount: 0,
    });

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
      size: 5,
      totalElements: 1,
      totalPages: 1,
      availableTypes: [],
      availableActors: ['michal'],
    });

    vi.mocked(dashboardApi).getAnniversaries.mockResolvedValue({
      content: [
        {
          id: 'WEDDING-5',
          type: 'WEDDING',
          typeLabel: 'Rocznica ślubu',
          month: 6,
          day: 25,
          originalYear: 1975,
          dateText: '25.06.1975',
          annualDateText: '25 czerwca',
          nextOccurrenceDate: '2027-06-25',
          daysUntil: 15,
          yearsCount: 52,
          locationName: 'Warszawa',
          targetType: 'EVENT',
          targetId: 50,
          eventId: 50,
          participants: [
            {
              personId: 1,
              givenName: 'Jan',
              surname: 'Kowalski',
              sex: 'MALE',
              lifeState: 'LIVING',
              archived: false,
            },
            {
              personId: 2,
              givenName: 'Anna',
              surname: 'Kowalska',
              sex: 'FEMALE',
              lifeState: 'LIVING',
              archived: false,
            },
          ],
        },
      ],
      page: 0,
      size: 5,
      totalElements: 1,
      totalPages: 1,
    });
  });

  it('should greet ADMIN with first given name of assigned person and render actions, stats, activities and anniversaries', async () => {
    const adminContext = {
      user: {
        username: 'michal_login',
        roles: ['ROLE_ADMIN'],
        personId: 10,
        personGivenName: 'Michał Aleksander',
        personSurname: 'Muzyka',
      },
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

    // Greeting uses only the first given name ("Michał"), stripping middle name ("Aleksander")
    expect(
      screen.getByRole('heading', {
        name: /Witaj, Michał! Jesteś zalogowany jako administrator\./i,
      })
    ).toBeInTheDocument();

    // Quick actions (including admin-only Dziennik)
    expect(screen.getByText('Przeglądaj biografie osób')).toBeInTheDocument();
    expect(screen.getByText('Odkrywaj drzewo genealogiczne')).toBeInTheDocument();
    expect(screen.getByText('Otwórz dziennik badacza')).toBeInTheDocument();

    // Stats tiles
    await waitFor(() => {
      expect(screen.getByTestId('stat-people-count')).toHaveTextContent('42');
    });
    expect(screen.getByTestId('stat-families-count')).toHaveTextContent('15');
    expect(screen.getByTestId('stat-generations-count')).toHaveTextContent('5');
    expect(screen.getByTestId('stat-events-count')).toHaveTextContent('98');
    expect(screen.getByTestId('stat-graves-count')).toHaveTextContent('12');

    // Recent activities & Upcoming anniversaries
    expect(screen.getByText('Dodano osobę: Kowalski Jan')).toBeInTheDocument();
    expect(screen.getByText('Kowalski Jan & Kowalska Anna')).toBeInTheDocument();
    expect(screen.getByText('52. rocznica ślubu')).toBeInTheDocument();
    expect(screen.getByTestId('show-more-activities-button')).toBeInTheDocument();
    expect(screen.getByTestId('show-more-anniversaries-button')).toBeInTheDocument();
  });

  it('should fall back to username when personGivenName is not assigned and omit name for GUEST', async () => {
    const unlinkedPrivGuest = {
      user: {
        username: 'ciocia_ela',
        roles: ['ROLE_PRIVILEGED_GUEST'],
        personId: null,
        personGivenName: null,
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    };

    const { unmount } = render(
      <MemoryRouter>
        <AuthContext value={unlinkedPrivGuest}>
          <HomePage />
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Witaj, ciocia_ela! Jesteś zalogowany jako uprzywilejowany gość\./i,
        })
      ).toBeInTheDocument();
    });
    // Non-admin does not see Dziennik tile
    expect(screen.queryByText('Otwórz dziennik badacza')).not.toBeInTheDocument();

    unmount();

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