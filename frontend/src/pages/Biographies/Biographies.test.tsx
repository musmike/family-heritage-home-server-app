import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BiographiesListPage from './BiographiesListPage';
import PersonBiographyPage from './PersonBiographyPage';
import { AuthContext } from '../../context/AuthContext';
import { biographyApi } from '../../api/biographyApi';
import type { BiographyPageDto, PersonBiographyDto } from '../../types/biography';

vi.mock('../../api/biographyApi', () => ({
  biographyApi: {
    listPeople: vi.fn(),
    getBiography: vi.fn(),
    updateBiographyContent: vi.fn(),
    getAncestorTree: vi.fn(),
  },
}));

describe('Biographies Module (List and Biography Page)', () => {
  const mockAuthAdmin = {
    user: { username: 'admin', roles: ['ROLE_ADMIN'] },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const mockPageData: BiographyPageDto = {
    content: [
      {
        id: 1,
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
        age: 70,
        ageApproximate: false,
      },
    ],
    page: 0,
    size: 24,
    totalElements: 1,
    totalPages: 1,
  };

  const sampleWikiText = [
    '## Wnioski o kasację wyroku',
    '### Wnioski PSL',
    'W 2005 r. ożenił się z [Anną Nowak](person:3) i mieszkał w **Warszawie**.',
    '> W stanie faktycznym sprawy, ustalonym przez sąd I instancji...',
    '## *Dzieła Wybrane* Witosa',
    '- Tom I: *Moje wspomnienia*, Warszawa 1988.',
  ].join('\n');

  const mockBiography: PersonBiographyDto = {
    id: 1,
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
    burialPlace: 'Cmentarz Rakowicki, Kraków',
    burialGraveId: 100,
    age: 70,
    ageApproximate: false,
    biographyContent: sampleWikiText,
    names: [
      {
        id: 10,
        type: 'BIRTH',
        givenName: 'Jan',
        surname: 'Kowalski',
        current: true,
      },
    ],
    originFamilies: [
      {
        familyId: 5,
        father: {
          id: 2,
          givenName: 'Stanisław',
          surname: 'Kowalski',
          sex: 'MALE',
          lifeState: 'DECEASED',
          birthYear: 1890,
          deathYear: 1960,
          archived: false,
          privateRecord: false,
        },
        fatherRelationshipType: 'BIOLOGICAL',
        mother: {
          id: 9,
          givenName: 'Helena',
          surname: 'Przybrana',
          sex: 'FEMALE',
          lifeState: 'DECEASED',
          birthYear: 1895,
          deathYear: 1970,
          archived: false,
          privateRecord: false,
        },
        motherRelationshipType: 'ADOPTED',
        siblings: [],
      },
    ],
    spouseFamilies: [
      {
        familyId: 6,
        spouse: {
          id: 3,
          givenName: 'Anna',
          surname: 'Nowak',
          sex: 'FEMALE',
          lifeState: 'DECEASED',
          birthYear: 1925,
          deathYear: 2005,
          archived: false,
          privateRecord: false,
        },
        statusCode: 'MARRIED',
        weddingDateText: '10.06.1948',
        weddingPlace: 'Warszawa',
        children: [
          {
            person: {
              id: null,
              givenName: '<Prywatne>',
              surname: 'Kowalski',
              sex: 'MALE',
              lifeState: 'LIVING',
              birthYear: null,
              deathYear: null,
              archived: false,
              privateRecord: true,
            },
            fatherRelationshipType: 'BIOLOGICAL',
            motherRelationshipType: 'BIOLOGICAL',
          },
          {
            person: {
              id: 40,
              givenName: 'Tomek',
              surname: 'Kowalski',
              sex: 'MALE',
              lifeState: 'DECEASED',
              birthYear: 1952,
              deathYear: 2020,
              archived: false,
              privateRecord: false,
            },
            fatherRelationshipType: 'ADOPTED',
            motherRelationshipType: 'BIOLOGICAL',
          },
        ],
      },
    ],
    rawGedcomData: {
      gedRefId: '@I1@',
      gedUid: 'uid-jan-1',
      rawGivenName: 'Jan',
      rawSurname: 'Kowalski',
      rawSex: 'M',
      rawDeathIndicated: true,
      rawBirthDate: '10 JAN 1920',
      rawBirthPlace: 'Warszawa',
      rawDeathDate: '15 FEB 1990',
      rawDeathPlace: 'Kraków',
      rawCauseOfDeath: 'Zawał serca',
      rawBurialPlace: 'Cmentarz Rakowicki, Kraków',
      lastImportedAt: '2026-10-25T12:00:00',
      externalIds: [{ sourceSystem: 'MYHERITAGE', uidValue: 'uid-jan-1' }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(biographyApi).getAncestorTree.mockResolvedValue({
      id: 1,
      givenName: 'Jan',
      surname: 'Kowalski',
      sex: 'MALE',
      lifeState: 'DECEASED',
      archived: false,
      privateRecord: false,
      birthYear: 1920,
      birthDateText: '10.01.1920',
      birthPlace: 'Warszawa',
      deathYear: 1990,
      deathDateText: '15.02.1990',
      deathPlace: 'Kraków',
      causeOfDeath: 'Zawał serca',
      burialPlace: 'Cmentarz Rakowicki, Kraków',
      weddingDateText: null,
      weddingPlace: null,
      age: 70,
      ageApproximate: false,
      father: null,
      mother: null,
    });
  });

  it('should render people cards, filter by archived and search query', async () => {
    const mockedApi = vi.mocked(biographyApi);
    mockedApi.listPeople.mockResolvedValue(mockPageData);

    render(
      <MemoryRouter initialEntries={['/biographies']}>
        <AuthContext value={mockAuthAdmin}>
          <BiographiesListPage />
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('person-card-1')).toBeInTheDocument();
    });
    expect(screen.getByText(/1920 – 1990 \(70 lat\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bio-include-archived-checkbox'));
    await waitFor(() => {
      expect(mockedApi.listPeople).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true })
      );
    });
  });

  it('should render Wikipedia-style biography with sections, quote box, bullet list, internal person links and section editing', async () => {
    const mockedApi = vi.mocked(biographyApi);
    mockedApi.getBiography.mockResolvedValue(mockBiography);
    mockedApi.updateBiographyContent.mockResolvedValue({
      ...mockBiography,
      biographyContent: '## Nowa sekcja\nZaktualizowana treść.',
    });

    render(
      <MemoryRouter initialEntries={['/biographies/1']}>
        <AuthContext value={mockAuthAdmin}>
          <Routes>
            <Route path="/biographies/:personId" element={<PersonBiographyPage />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Wnioski o kasację wyroku')).toBeInTheDocument();
    });

    // Subheading, quote box, internal blue link, and bulleted list with italics
    expect(screen.getByText('Wnioski PSL')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-quote-box')).toHaveTextContent(
      'W stanie faktycznym sprawy, ustalonym przez sąd I instancji...'
    );
    expect(screen.getByRole('link', { name: 'Anną Nowak' })).toHaveAttribute(
      'href',
      '/biographies/3'
    );
    expect(screen.getByText('Moje wspomnienia')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('edit-section-btn-1'));
    expect(screen.getByTestId('wiki-biography-editor')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('wiki-biography-textarea'), {
      target: { value: '### Wnioski PSL\nZmieniona treść sekcji.' },
    });
    fireEvent.click(screen.getByTestId('save-wiki-biography-button'));

    await waitFor(() => {
      expect(mockedApi.updateBiographyContent).toHaveBeenCalled();
    });
  });
});