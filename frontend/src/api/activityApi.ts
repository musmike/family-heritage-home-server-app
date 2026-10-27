import api from './axiosInstance';
import type { ActivityLogPageDto, ActivityQueryParams } from '../types/activity';

export const activityApi = {
  getActivities: async (params: ActivityQueryParams): Promise<ActivityLogPageDto> => {
    const cleanParams: Record<string, string | number> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.types && params.types.length > 0) {
      cleanParams.types = params.types.join(',');
    }
    if (params.actor && params.actor !== 'ALL') {
      cleanParams.actor = params.actor;
    }
    if (params.dateFrom && params.dateFrom.trim() !== '') {
      cleanParams.dateFrom = params.dateFrom.trim();
    }
    if (params.dateTo && params.dateTo.trim() !== '') {
      cleanParams.dateTo = params.dateTo.trim();
    }
    if (params.sortOrder) {
      cleanParams.sortOrder = params.sortOrder;
    }
    if (params.page !== undefined) {
      cleanParams.page = params.page;
    }
    if (params.size !== undefined) {
      cleanParams.size = params.size;
    }

    const response = await api.get<ActivityLogPageDto>('/activities', {
      params: cleanParams,
    });
    return response.data;
  },
};