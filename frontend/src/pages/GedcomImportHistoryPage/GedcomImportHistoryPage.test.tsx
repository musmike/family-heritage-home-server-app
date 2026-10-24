import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GedcomImportHistoryPage from './GedcomImportHistoryPage';
import { gedcomImportApi } from '../../api/gedcomImportApi';
import type { ImportSessionHistoryItemDto } from '../../types/gedcomImport';

vi.mock('../../api/gedcomImportApi', () => ({
  gedcomImportApi: {
    getActiveSession: vi.fn(),
    getImportHistory: vi.fn(),
    restoreSession: vi.fn(),
  },
}));

describe('GedcomImportHistoryPage Component', () => {
  const mockHistory: ImportSessionHistoryItemDto[] = [
    {
      sessionId: 5,
      fileName: 'stary_import.ged',
      status: 'COMPLETED',
      sourceSystem: 'MYHERITAGE',
      createdAt: '2026-10-20T12:00:00',
      updatedAt: '2026-10-20T12:05:00',
      summaryPreview: {
        individualsToCreate: 3,
        individualsToUpdate: 2,
        individualsUnchanged: 10,
        familiesToCreate: 1,
        familiesToUpdate: 1,
        familiesUnchanged: 4,
        familiesToDelete: 0,
        absentPersonsCount: 0,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display completed imports and allow restoring a session', async () => {
    const mockedApi = vi.mocked(gedcomImportApi);
    mockedApi.getActiveSession.mockResolvedValue(null);
    mockedApi.getImportHistory.mockResolvedValue(mockHistory);
    mockedApi.restoreSession.mockResolvedValue({
      sessionId: 5,
      fileName: 'stary_import.ged',
      status: 'COMPLETED',
      sourceSystem: 'MYHERITAGE',
      createdAt: '2026-10-20T12:00:00',
      updatedAt: '2026-10-20T12:05:00',
      individualMatches: [],
      familyMatches: [],
      absentPeople: [],
      summaryPreview: mockHistory[0].summaryPreview,
    });

    render(
      <MemoryRouter>
        <GedcomImportHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('stary_import.ged')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('restore-session-button-5'));

    await waitFor(() => {
      expect(mockedApi.restoreSession).toHaveBeenCalledWith(5);
    });
    expect(screen.getByTestId('restore-success-banner')).toBeInTheDocument();
  });
});