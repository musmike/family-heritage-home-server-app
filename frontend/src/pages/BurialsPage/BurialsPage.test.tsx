import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BurialsPage from './BurialsPage';
import { burialApi } from '../../api/burialApi';
import type { BurialsOverviewDto } from '../../types/burial';

vi.mock('../../api/burialApi', () => ({
  burialApi: {
    getBurialsOverview: vi.fn(),
  },
}));

describe('BurialsPage Component', () => {
  const mockOverview: BurialsOverviewDto = {
    totalBurialsCount: 3,
    totalGravesCount: 2,
    cemeteryGroups: [
      {
        cemeteryLocationId: 10,
        groupName: 'Cmentarz Rakowicki, Kraków',
        otherGroup: false,
        totalBurialsCount: 2,
        graves: [
          {
            graveId: 100,
            cemeteryLocationId: 10,
            cemeteryName: 'Cmentarz Rakowicki, Kraków',
            burials: [
              {
                burialId: 1,
                graveId: 100,
                cemeteryLocationId: 10,
                cemeteryName: 'Cmentarz Rakowicki, Kraków',
                current: true,
                burialYear: 1990,
                burialDateText: '18.02.1990',
                personId: 5,
                givenName: 'Jan',
                surname: 'Kowalski',
                sex: 'MALE',
                lifeState: 'DECEASED',
                archived: false,
                birthYear: 1920,
                birthDateText: '10.01.1920',
                birthPlace: 'Warszawa',
                deathYear: 1990,
                deathDateText: '15.02.1990',
                deathPlace: 'Kraków',
                causeOfDeath: 'Zawał serca',
                age: 70,
                ageApproximate: false,
              },
              {
                burialId: 2,
                graveId: 100,
                cemeteryLocationId: 10,
                cemeteryName: 'Cmentarz Rakowicki, Kraków',
                current: true,
                burialYear: null,
                burialDateText: null,
                personId: 6,
                givenName: 'Anna',
                surname: 'Kowalska',
                sex: 'FEMALE',
                lifeState: 'DECEASED',
                archived: false,
                birthYear: 1925,
                birthDateText: '1925',
                birthPlace: null,
                deathYear: 2005,
                deathDateText: '2005',
                deathPlace: null,
                causeOfDeath: null,
                age: 80,
                ageApproximate: false,
              },
            ],
          },
        ],
      },
      {
        cemeteryLocationId: null,
        groupName: 'Inne',
        otherGroup: true,
        totalBurialsCount: 1,
        graves: [
          {
            graveId: 101,
            cemeteryLocationId: 20,
            cemeteryName: 'Cmentarz Powązkowski, Warszawa',
            burials: [
              {
                burialId: 3,
                graveId: 101,
                cemeteryLocationId: 20,
                cemeteryName: 'Cmentarz Powązkowski, Warszawa',
                current: false,
                burialYear: null,
                burialDateText: null,
                personId: 7,
                givenName: 'Piotr',
                surname: 'Nowak',
                sex: 'MALE',
                lifeState: 'DECEASED',
                archived: false,
                birthYear: 1930,
                birthDateText: '1930',
                birthPlace: null,
                deathYear: 2010,
                deathDateText: '2010',
                deathPlace: null,
                causeOfDeath: null,
                age: 80,
                ageApproximate: false,
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render cemeteries list first, open selected cemetery graves and allow navigating back', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getBurialsOverview.mockResolvedValue(mockOverview);

    render(
      <MemoryRouter>
        <BurialsPage />
      </MemoryRouter>
    );

    // 1. Cemeteries view is displayed first
    await waitFor(() => {
      expect(
        screen.getByTestId('cemetery-card-Cmentarz Rakowicki, Kraków')
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('cemetery-card-Inne')).toBeInTheDocument();

    // 2. Click on "Cmentarz Rakowicki, Kraków" to view its graves
    fireEvent.click(screen.getByTestId('cemetery-card-Cmentarz Rakowicki, Kraków'));
    expect(screen.getByTestId('grave-card-100')).toBeInTheDocument();
    expect(screen.getByText('Kowalski Jan')).toBeInTheDocument();
    expect(screen.getByText('18.02.1990')).toBeInTheDocument();
    expect(screen.getByText('Zawał serca')).toBeInTheDocument();

    // 3. Navigate back to cemeteries list and open "Inne"
    fireEvent.click(screen.getByTestId('back-to-cemeteries-button'));
    expect(screen.getByTestId('cemetery-card-Inne')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cemetery-card-Inne'));
    expect(screen.getByTestId('grave-card-101')).toBeInTheDocument();
    expect(screen.getByText('Nieaktualne miejsce pochówku')).toBeInTheDocument();

    // 4. Toggle non-current burials filter
    fireEvent.click(screen.getByTestId('burial-noncurrent-checkbox'));
    await waitFor(() => {
      expect(mockedApi.getBurialsOverview).toHaveBeenCalledWith(
        expect.objectContaining({ includeNonCurrent: true })
      );
    });
  });
});