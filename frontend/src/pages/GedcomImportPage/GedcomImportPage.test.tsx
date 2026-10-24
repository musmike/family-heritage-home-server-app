import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GedcomImportPage from './GedcomImportPage';
import { gedcomImportApi } from '../../api/gedcomImportApi';
import type { ImportSessionResponseDto } from '../../types/gedcomImport';

vi.mock('../../api/gedcomImportApi', () => ({
  gedcomImportApi: {
    getActiveSession: vi.fn(),
    getImportHistory: vi.fn(),
    createSession: vi.fn(),
    cancelSession: vi.fn(),
    confirmIndividuals: vi.fn(),
    confirmFamilies: vi.fn(),
    applySession: vi.fn(),
    restoreSession: vi.fn(),
    lookupPeople: vi.fn(),
    lookupFamilies: vi.fn(),
  },
}));

describe('GedcomImportPage Component', () => {
  const mockStep1Session: ImportSessionResponseDto = {
    sessionId: 10,
    fileName: 'drzewo.ged',
    status: 'REVIEW_INDIVIDUALS',
    sourceSystem: 'MYHERITAGE',
    createdAt: '2026-10-24T10:00:00',
    updatedAt: '2026-10-24T10:00:00',
    individualMatches: [
      {
        gedcomIndividual: {
          gedRefId: '@I1@',
          gedUid: null,
          givenName: 'Jan',
          surname: 'Kowalski',
          sex: 'M',
          deathIndicated: false,
          birthDate: '1950',
          birthPlace: 'Warszawa',
          deathDate: null,
          deathPlace: null,
          causeOfDeath: null,
          burialPlace: null,
          parentGivenNames: ['Piotr'],
          spouseGivenNames: ['Anna'],
        },
        classification: 'NEEDS_REVIEW',
        selectedAction: null,
        selectedTargetPersonId: null,
        candidates: [
          {
            personId: 55,
            givenName: 'Jan',
            surname: 'Kowalski',
            sex: 'MALE',
            birthYear: 1950,
            birthDate: '1950',
            birthPlace: 'Warszawa',
            deathYear: null,
            deathDate: null,
            deathPlace: null,
            parentGivenNames: ['Piotr'],
            spouseGivenNames: ['Anna'],
            archived: false,
            confidenceScore: 75,
            matchReasons: ['Exact given name and surname match', 'Matching birth year'],
          },
        ],
      },
    ],
    familyMatches: [],
    absentPeople: [],
    summaryPreview: null,
  };

  const mockStep2Session: ImportSessionResponseDto = {
    ...mockStep1Session,
    status: 'REVIEW_FAMILIES',
    individualMatches: [
      {
        ...mockStep1Session.individualMatches[0],
        selectedAction: 'MATCH',
        selectedTargetPersonId: 55,
      },
    ],
    familyMatches: [
      {
        gedcomFamily: {
          gedRefId: '@F1@',
          gedUid: null,
          husbandGedRefId: '@I1@',
          wifeGedRefId: null,
          weddingDate: '1975',
          weddingPlace: 'Kraków',
          statusCode: 'MARRIED',
          children: [],
        },
        classification: 'AUTO_MATCH',
        selectedAction: 'MATCH',
        selectedTargetFamilyId: 100,
        candidates: [
          {
            familyId: 100,
            husbandName: 'Jan Kowalski',
            wifeName: 'Anna Nowak',
            weddingYear: 1975,
            confidenceScore: 95,
            matchReasons: ['One spouse matches existing family'],
          },
        ],
      },
    ],
  };

  const mockStep3Session: ImportSessionResponseDto = {
    ...mockStep2Session,
    status: 'REVIEW_SUMMARY',
    absentPeople: [
      {
        personId: 88,
        givenName: 'Maria',
        surname: 'Edytowana',
        birthYear: 1930,
        deathYear: 2010,
        selectedAction: 'ARCHIVE',
        canBeDeleted: false,
        deletionBlockReasons: ['Person has manually edited personal details'],
      },
    ],
    summaryPreview: {
      individualsToCreate: 0,
      individualsToUpdate: 1,
      individualsUnchanged: 0,
      familiesToCreate: 0,
      familiesToUpdate: 1,
      familiesUnchanged: 0,
      familiesToDelete: 0,
      absentPersonsCount: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow uploading a GEDCOM file when no active session exists and complete full wizard flow', async () => {
    const mockedApi = vi.mocked(gedcomImportApi);
    mockedApi.getActiveSession.mockResolvedValue(null);
    mockedApi.createSession.mockResolvedValue(mockStep1Session);
    mockedApi.confirmIndividuals.mockResolvedValue(mockStep2Session);
    mockedApi.confirmFamilies.mockResolvedValue(mockStep3Session);
    mockedApi.applySession.mockResolvedValue({
      ...mockStep3Session,
      status: 'COMPLETED',
    });

    render(
      <MemoryRouter>
        <GedcomImportPage />
      </MemoryRouter>
    );

    // 1. Upload screen is visible alongside link to import history
    await waitFor(() => {
      expect(screen.getByTestId('gedcom-file-input')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-history-nav-button')).toBeInTheDocument();

    const file = new File(['0 HEAD\n0 TRLR'], 'drzewo.ged', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('gedcom-file-input'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId('start-import-button'));

    // 2. Step 1 (Individuals): Next button is disabled until @I1@ decision is selected
    await waitFor(() => {
      expect(screen.getByTestId('confirm-individuals-button')).toBeDisabled();
    });

    // User clicks candidate match button for @I1@
    fireEvent.click(screen.getByTestId('match-candidate-@I1@-55'));
    expect(screen.getByTestId('confirm-individuals-button')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('confirm-individuals-button'));

    // 3. Step 2 (Families): User can step back to Individuals and then proceed again
    await waitFor(() => {
      expect(screen.getByTestId('back-to-individuals-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('back-to-individuals-button'));
    expect(screen.getByTestId('confirm-individuals-button')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-individuals-button'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-families-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-families-button'));

    // 4. Step 3 (Summary & Absent People): Verify protected person has DELETE disabled
    await waitFor(() => {
      expect(screen.getByTestId('apply-import-button')).toBeInTheDocument();
    });
    expect(screen.getByText(/Maria Edytowana/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Osoba posiada ręcznie edytowane dane osobowe w aplikacji/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('absent-delete-radio-88')).toBeDisabled();

    // 5. Execute import
    fireEvent.click(screen.getByTestId('apply-import-button'));

    await waitFor(() => {
      expect(mockedApi.applySession).toHaveBeenCalledWith(10, [
        { personId: 88, action: 'ARCHIVE' },
      ]);
    });
    expect(screen.getByTestId('import-success-banner')).toBeInTheDocument();
  });

  it('should allow cancelling an active session', async () => {
    const mockedApi = vi.mocked(gedcomImportApi);
    mockedApi.getActiveSession.mockResolvedValue(mockStep1Session);
    mockedApi.cancelSession.mockResolvedValue();

    render(
      <MemoryRouter>
        <GedcomImportPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cancel-session-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cancel-session-button'));
    await waitFor(() => {
      expect(mockedApi.cancelSession).toHaveBeenCalledWith(10);
    });
    expect(screen.getByTestId('gedcom-file-input')).toBeInTheDocument();
  });
});