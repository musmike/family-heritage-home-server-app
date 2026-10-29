import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BurialsPage from './BurialsPage';
import GraveDetailsPage from './GraveDetailsPage';
import { AuthContext } from '../../context/AuthContext';
import { burialApi } from '../../api/burialApi';
import type { BurialsOverviewDto, GraveGroupDto } from '../../types/burial';

vi.mock('../../api/burialApi', () => ({
  burialApi: {
    getBurialsOverview: vi.fn(),
    getGraveDetails: vi.fn(),
    createCemetery: vi.fn(),
    updateCemetery: vi.fn(),
    deleteCemetery: vi.fn(),
    updateGrave: vi.fn(),
    deleteGrave: vi.fn(),
    addPersonToGrave: vi.fn(),
    toggleBurialCurrent: vi.fn(),
    splitBurialToNewGrave: vi.fn(),
  },
}));

describe('BurialsPage and GraveDetailsPage Components', () => {
  const adminContext = {
    user: { username: 'admin', roles: ['ROLE_ADMIN'] },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const mockGraveAssigned: GraveGroupDto = {
    graveId: 100,
    cemeteryId: 10,
    cemeteryName: 'Cmentarz Rakowicki',
    section: 'XII',
    sector: 'B',
    rowNumber: '4',
    graveNumber: '18',
    graveType: 'FAMILY',
    graveTypeLabel: 'Rodzinny',
    description: 'Przy głównej alei pod starym dębem',
    epitaph: 'Pokój ich duszom',
    burials: [
      {
        burialId: 1,
        graveId: 100,
        cemeteryId: 10,
        cemeteryName: 'Cmentarz Rakowicki',
        current: true,
        placeDescription: 'Cmentarz Rakowicki, kw. XII, Kraków',
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
    ],
  };

  const mockOverview: BurialsOverviewDto = {
    totalBurialsCount: 2,
    totalGravesCount: 2,
    cemeteryGroups: [
      {
        cemeteryId: 10,
        groupName: 'Cmentarz Rakowicki',
        managementType: 'MUNICIPAL',
        managementTypeLabel: 'Komunalny',
        denomination: 'ROMAN_CATHOLIC',
        denominationLabel: 'Rzymskokatolickie',
        locationName: 'Kraków',
        description: 'Najstarszy cmentarz komunalny w Krakowie.',
        otherGroup: false,
        totalBurialsCount: 1,
        graves: [mockGraveAssigned],
      },
      {
        cemeteryId: null,
        groupName: 'Inne',
        otherGroup: true,
        totalBurialsCount: 1,
        graves: [
          {
            graveId: 101,
            cemeteryId: null,
            cemeteryName: 'Inne',
            section: null,
            sector: null,
            rowNumber: null,
            graveNumber: null,
            graveType: null,
            graveTypeLabel: null,
            description: null,
            epitaph: null,
            burials: [
              {
                burialId: 2,
                graveId: 101,
                cemeteryId: null,
                cemeteryName: 'Inne',
                current: true,
                placeDescription: 'Cmentarz Powązkowski, Warszawa',
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

  it('should render cemeteries, show cemetery description and compact person tiles on cemetery view, and display GEDCOM place only in Inne', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getBurialsOverview.mockResolvedValue(mockOverview);

    render(
      <MemoryRouter initialEntries={['/burials']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/burials" element={<BurialsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cemetery-card-Cmentarz Rakowicki')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cemetery-card-Inne')).toBeInTheDocument();

    // Open "Cmentarz Rakowicki" -> shows description banner at top, compact person tile without GEDCOM description
    fireEvent.click(screen.getByTestId('cemetery-card-Cmentarz Rakowicki'));
    expect(screen.getByTestId('cemetery-description-banner')).toHaveTextContent(
      'Najstarszy cmentarz komunalny w Krakowie.'
    );
    expect(screen.getByTestId('grave-card-100')).toBeInTheDocument();
    expect(screen.getByText('Kowalski Jan')).toBeInTheDocument();
    expect(
      screen.queryByText(/GEDCOM: Cmentarz Rakowicki, kw\. XII, Kraków/i)
    ).not.toBeInTheDocument();

    // Go back and open "Inne" -> GEDCOM placeDescription IS displayed on the compact tile
    fireEvent.click(screen.getByTestId('back-to-cemeteries-button'));
    fireEvent.click(screen.getByTestId('cemetery-card-Inne'));
    expect(screen.getByTestId('grave-card-101')).toBeInTheDocument();
    expect(
      screen.getByText(/GEDCOM: Cmentarz Powązkowski, Warszawa/i)
    ).toBeInTheDocument();
  });

  it('should render GraveDetailsPage with epitaph, grave coordinates and allow admin to toggle GEDCOM place preview', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getGraveDetails.mockResolvedValue(mockGraveAssigned);
    mockedApi.getBurialsOverview.mockResolvedValue(mockOverview);

    render(
      <MemoryRouter initialEntries={['/burials/graves/100']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/burials/graves/:graveId" element={<GraveDetailsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('grave-epitaph-box')).toHaveTextContent('Pokój ich duszom');
    });
    expect(screen.getByText('XII')).toBeInTheDocument();
    expect(screen.getByText('Rodzinny')).toBeInTheDocument();

    // Because grave #100 is assigned to Cmentarz Rakowicki, GEDCOM placeDescription is hidden by default
    expect(
      screen.queryByText('Cmentarz Rakowicki, kw. XII, Kraków')
    ).not.toBeInTheDocument();

    // Admin clicks toggle button to inspect GEDCOM placeDescription
    fireEvent.click(screen.getByTestId('toggle-admin-gedcom-place-button'));
    expect(
      screen.getByText('Cmentarz Rakowicki, kw. XII, Kraków')
    ).toBeInTheDocument();
  });
});