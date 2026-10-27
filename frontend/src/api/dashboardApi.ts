import api from './axiosInstance';
import type {
  AnniversariesPageDto,
  AnniversariesQueryParams,
  DashboardStatsDto,
} from '../types/dashboard';

export const dashboardApi = {
  getStats: async (): Promise<DashboardStatsDto> => {
    const response = await api.get<DashboardStatsDto>('/dashboard/stats');
    return response.data;
  },

  getAnniversaries: async (
    params: AnniversariesQueryParams
  ): Promise<AnniversariesPageDto> => {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.types && params.types.length > 0) {
      cleanParams.types = params.types.join(',');
    }
    if (params.month !== undefined && params.month !== 'ALL') {
      cleanParams.month = params.month;
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

    const response = await api.get<AnniversariesPageDto>('/anniversaries', {
      params: cleanParams,
    });
    return response.data;
  },
};