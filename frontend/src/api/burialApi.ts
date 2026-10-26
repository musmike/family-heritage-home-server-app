import api from './axiosInstance';
import type { BurialsOverviewDto, BurialsQueryParams } from '../types/burial';

export const burialApi = {
  getBurialsOverview: async (params: BurialsQueryParams): Promise<BurialsOverviewDto> => {
    const cleanParams: Record<string, string | boolean> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.sex && params.sex !== 'ALL') {
      cleanParams.sex = params.sex;
    }
    if (params.includeNonCurrent !== undefined) {
      cleanParams.includeNonCurrent = params.includeNonCurrent;
    }
    if (params.includeArchived !== undefined) {
      cleanParams.includeArchived = params.includeArchived;
    }
    if (params.sortBy) {
      cleanParams.sortBy = params.sortBy;
    }

    const response = await api.get<BurialsOverviewDto>('/burials', {
      params: cleanParams,
    });
    return response.data;
  },
};