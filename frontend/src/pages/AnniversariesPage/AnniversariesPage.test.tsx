import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AnniversariesPage from './AnniversariesPage';
import { dashboardApi } from '../../api/dashboardApi';
import type { AnniversariesPageDto } from '../../types/dashboard';

vi.mock('../../api/dashboardApi', () => ({
  dashboardApi: {
    getStats: vi.fn(),
    getAnniversaries: vi.fn(),
  },
}));

describe('AnniversariesPage Component', () => {
  const mockPage: AnniversariesPageDto = {
    content: [
      {
        id: 'BIRTH-10',
        type: 'BIRTH',
        typeLabel: 'Rocznica urodzin',
        month: 3,
        day: 15,
        originalYear: 1980,
        dateText: '15.03.1980',
        annualDateText: '15 marca',
        nextOccurrenceDate: '2027-03-15',
        daysUntil: 0,
        yearsCount: 47,
        locationName: 'Warszawa',
        targetType: 'PERSON',
        targetId: 10,
        eventId: 101,
        participants: [
          {
            personId: 10,
            givenName: 'Jan',
            surname: 'Kowalski',
            sex: 'MALE',
            lifeState: 'LIVING',
            archived: false,
          },
        ],
      },
      {
        id: 'DEATH-20',
        type: 'DEATH',
        typeLabel: 'Rocznica śmierci',
        month: 11,
        day: 2,
        originalYear: 1995,
        dateText: '02.11.1995',
        annualDateText: '2 listopada',
        nextOccurrenceDate: '2026-11-02',
        daysUntil: 6,
        yearsCount: 31,
        locationName: 'Kraków',
        targetType: 'PERSON',
        targetId: 20,
        eventId: 102,
        participants: [
          {
            personId: 20,
            givenName: 'Stanisław',
            surname: 'Kowalski',
            sex: 'MALE',
            lifeState: 'DECEASED',
            archived: false,
          },
        ],
      },
    ],
    page: 0,
    size: 30,
    totalElements: 2,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render anniversaries list and allow filtering by type, month and search query', async () => {
    const mockedApi = vi.mocked(dashboardApi);
    mockedApi.getAnniversaries.mockResolvedValue(mockPage);

    render(
      <MemoryRouter>
        <AnniversariesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('anniversary-row-BIRTH-10')).toBeInTheDocument();
    });

    expect(screen.getByText('47. rocznica urodzin')).toBeInTheDocument();
    expect(screen.getByText('Dzisiaj!')).toBeInTheDocument();
    expect(screen.getByText('31. rocznica śmierci')).toBeInTheDocument();

    // Filter by type = DEATH
    fireEvent.click(screen.getByTestId('ann-types-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('ann-type-checkbox-DEATH'));

    await waitFor(() => {
      expect(mockedApi.getAnniversaries).toHaveBeenCalledWith(
        expect.objectContaining({ types: ['DEATH'] })
      );
    });

    // Filter by month = 3
    fireEvent.change(screen.getByTestId('ann-month-select'), {
      target: { value: '3' },
    });

    await waitFor(() => {
      expect(mockedApi.getAnniversaries).toHaveBeenCalledWith(
        expect.objectContaining({ month: 3 })
      );
    });
  });
});