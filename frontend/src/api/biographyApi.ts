import api from './axiosInstance';
import type {
  BiographyListQueryParams,
  BiographyPageDto,
  PersonBiographyDto,
} from '../types/biography';

export const biographyApi = {
  listPeople: async (params: BiographyListQueryParams): Promise<BiographyPageDto> => {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.sex && params.sex !== 'ALL') {
      cleanParams.sex = params.sex;
    }
    if (params.lifeState && params.lifeState !== 'ALL') {
      cleanParams.lifeState = params.lifeState;
    }
    if (params.includeArchived !== undefined) {
      cleanParams.includeArchived = params.includeArchived;
    }
    if (params.sortBy) {
      cleanParams.sortBy = params.sortBy;
    }
    if (params.page !== undefined) {
      cleanParams.page = params.page;
    }
    if (params.size !== undefined) {
      cleanParams.size = params.size;
    }

    const response = await api.get<BiographyPageDto>('/biographies', {
      params: cleanParams,
    });
    return response.data;
  },

  getBiography: async (personId: number): Promise<PersonBiographyDto> => {
    const response = await api.get<PersonBiographyDto>(`/biographies/${String(personId)}`);
    return response.data;
  },
};