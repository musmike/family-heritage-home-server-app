import api from './axiosInstance';
import type {
  AbsentPersonDecisionDto,
  FamilyDecisionDto,
  FamilyMatchCandidateDto,
  ImportSessionHistoryItemDto,
  ImportSessionResponseDto,
  IndividualDecisionDto,
  PersonMatchCandidateDto,
} from '../types/gedcomImport';

const BASE_PATH = '/gedcom/import/sessions';

export const gedcomImportApi = {
  getActiveSession: async (): Promise<ImportSessionResponseDto | null> => {
    const response = await api.get<ImportSessionResponseDto | ''>(`${BASE_PATH}/active`);
    if (response.status === 204 || !response.data) {
      return null;
    }
    return response.data;
  },

  getImportHistory: async (): Promise<ImportSessionHistoryItemDto[]> => {
    const response = await api.get<ImportSessionHistoryItemDto[]>(BASE_PATH);
    return response.data;
  },

  createSession: async (file: File): Promise<ImportSessionResponseDto> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ImportSessionResponseDto>(BASE_PATH, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  cancelSession: async (sessionId: number): Promise<void> => {
    await api.delete(`${BASE_PATH}/${String(sessionId)}`);
  },

  confirmIndividuals: async (
    sessionId: number,
    decisions: IndividualDecisionDto[]
  ): Promise<ImportSessionResponseDto> => {
    const response = await api.post<ImportSessionResponseDto>(
      `${BASE_PATH}/${String(sessionId)}/individuals`,
      decisions
    );
    return response.data;
  },

  confirmFamilies: async (
    sessionId: number,
    decisions: FamilyDecisionDto[]
  ): Promise<ImportSessionResponseDto> => {
    const response = await api.post<ImportSessionResponseDto>(
      `${BASE_PATH}/${String(sessionId)}/families`,
      decisions
    );
    return response.data;
  },

  applySession: async (
    sessionId: number,
    absentDecisions: AbsentPersonDecisionDto[]
  ): Promise<ImportSessionResponseDto> => {
    const response = await api.post<ImportSessionResponseDto>(
      `${BASE_PATH}/${String(sessionId)}/apply`,
      absentDecisions
    );
    return response.data;
  },

  restoreSession: async (sessionId: number): Promise<ImportSessionResponseDto> => {
    const response = await api.post<ImportSessionResponseDto>(
      `${BASE_PATH}/${String(sessionId)}/restore`
    );
    return response.data;
  },

  lookupPeople: async (query: string): Promise<PersonMatchCandidateDto[]> => {
    const response = await api.get<PersonMatchCandidateDto[]>(`${BASE_PATH}/lookup/people`, {
      params: { query },
    });
    return response.data;
  },

  lookupFamilies: async (query: string): Promise<FamilyMatchCandidateDto[]> => {
    const response = await api.get<FamilyMatchCandidateDto[]>(`${BASE_PATH}/lookup/families`, {
      params: { query },
    });
    return response.data;
  },

  resetTreeData: async (): Promise<void> => {
    await api.delete(`${BASE_PATH}/reset-tree`);
  },
};