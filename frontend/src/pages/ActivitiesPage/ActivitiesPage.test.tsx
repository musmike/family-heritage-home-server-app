import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ActivitiesPage from './ActivitiesPage';
import { activityApi } from '../../api/activityApi';
import type { ActivityLogPageDto } from '../../types/activity';

vi.mock('../../api/activityApi', () => ({
  activityApi: {
    getActivities: vi.fn(),
  },
}));

describe('ActivitiesPage Component', () => {
  const mockPage: ActivityLogPageDto = {
    content: [
      {
        id: 1,
        actionType: 'USER_LOGIN',
        actionLabel: 'Logowanie użytkownika',
        actorUsername: 'admin',
        actorDisplayName: 'Kowalski Jan (admin)',
        description: 'Zalogowano do aplikacji (IP: 192.168.100.55)',
        targetType: 'USER',
        targetId: null,
        ipAddress: '192.168.100.55',
        adminOnly: true,
        createdAt: '2026-10-27T14:30:00',
      },
      {
        id: 2,
        actionType: 'PERSON_CREATED',
        actionLabel: 'Dodanie osoby',
        actorUsername: 'admin',
        actorDisplayName: 'Kowalski Jan (admin)',
        description: 'Dodano osobę: Nowak Anna',
        targetType: 'PERSON',
        targetId: 25,
        ipAddress: null,
        adminOnly: false,
        createdAt: '2026-10-27T14:25:00',
      },
    ],
    page: 0,
    size: 30,
    totalElements: 2,
    totalPages: 1,
    availableTypes: [
      { code: 'USER_LOGIN', label: 'Logowanie użytkownika', adminOnly: true },
      { code: 'PERSON_CREATED', label: 'Dodanie osoby', adminOnly: false },
    ],
    availableActors: ['admin'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render activities with IP, actor display name and filter by activity type', async () => {
    const mockedApi = vi.mocked(activityApi);
    mockedApi.getActivities.mockResolvedValue(mockPage);

    render(
      <MemoryRouter>
        <ActivitiesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-1')).toBeInTheDocument();
    });

    expect(screen.getByText(/192\.168\.100\.55/i)).toBeInTheDocument();
    expect(screen.getByText('Dodano osobę: Nowak Anna')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('act-types-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('act-type-checkbox-PERSON_CREATED'));

    await waitFor(() => {
      expect(mockedApi.getActivities).toHaveBeenCalledWith(
        expect.objectContaining({ types: ['PERSON_CREATED'] })
      );
    });
  });
});