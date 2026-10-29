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
    assignGravesToCemetery: vi.fn(),
    createGrave: vi.fn(),
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
        denominationLabel: 'Rzymskokatolicki',
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

  it('should render cemeteries with description snippet, show full coordinate pills, and allow bulk assigning graves', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getBurialsOverview.mockResolvedValue(mockOverview);
    mockedApi.assignGravesToCemetery.mockResolvedValue();

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
    expect(screen.getByTestId('cemetery-card-desc-Cmentarz Rakowicki')).toHaveTextContent(
      'Najstarszy cmentarz komunalny w Krakowie.'
    );
    expect(screen.getByText('Rzymskokatolicki')).toBeInTheDocument();

    // Open "Cmentarz Rakowicki" -> shows full coordinate pills ("Kwatera: XII", "Sektor: B", "Rząd: 4", "Numer grobu: 18")
    fireEvent.click(screen.getByTestId('cemetery-card-Cmentarz Rakowicki'));
    expect(screen.getByText('Kwatera: XII')).toBeInTheDocument();
    expect(screen.getByText('Sektor: B')).toBeInTheDocument();
    expect(screen.getByText('Rząd: 4')).toBeInTheDocument();
    expect(screen.getByText('Numer grobu: 18')).toBeInTheDocument();
    expect(screen.getByText('Jan Kowalski')).toBeInTheDocument();

    // Open bulk assign panel inside Cmentarz Rakowicki and assign grave #101 from "Inne"
    fireEvent.click(screen.getByTestId('open-bulk-assign-panel-button'));
    expect(
      screen.getByText(/Pochowano w: Cmentarz Powązkowski, Warszawa/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bulk-checkbox-grave-101'));
    fireEvent.click(screen.getByTestId('confirm-bulk-assign-button'));

    await waitFor(() => {
      expect(mockedApi.assignGravesToCemetery).toHaveBeenCalledWith(10, [101]);
    });
  });

  it('should hide Zaznacz do przypisania checkbox in Inne when no custom cemetery exists', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getBurialsOverview.mockResolvedValue({
      totalBurialsCount: 1,
      totalGravesCount: 1,
      cemeteryGroups: [mockOverview.cemeteryGroups[1]],
    });

    render(
      <MemoryRouter initialEntries={['/burials?cemetery=OTHER']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/burials" element={<BurialsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Piotr Nowak')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('other-grave-checkbox-101')).not.toBeInTheDocument();
  });

  it('should allow admin to open and submit the create new grave form', async () => {
    const mockedApi = vi.mocked(burialApi);
    mockedApi.getBurialsOverview.mockResolvedValue(mockOverview);
    mockedApi.createGrave.mockResolvedValue(mockGraveAssigned);
    mockedApi.getGraveDetails.mockResolvedValue(mockGraveAssigned);

    render(
      <MemoryRouter initialEntries={['/burials']}>
        <AuthContext value={adminContext}>
          <Routes>
            <Route path="/burials" element={<BurialsPage />} />
            <Route path="/burials/graves/:graveId" element={<GraveDetailsPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('open-create-grave-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('open-create-grave-button'));
    expect(screen.getByTestId('create-grave-form-section')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('new-grave-section-input'), {
      target: { value: 'IV' },
    });
    fireEvent.click(screen.getByTestId('submit-create-grave-button'));

    await waitFor(() => {
      expect(mockedApi.createGrave).toHaveBeenCalledWith(
        expect.objectContaining({ section: 'IV' })
      );
    });
  });

  it('should render GraveDetailsPage with person-based title (no DB ID), epitaph, and allow admin to toggle GEDCOM place preview', async () => {
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
      expect(
        screen.getByRole('heading', {
          name: /Grób: Jan Kowalski \(Cmentarz Rakowicki\)/i,
        })
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('grave-epitaph-box')).toHaveTextContent('Pokój ich duszom');

    // Hidden by default when assigned to a cemetery
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