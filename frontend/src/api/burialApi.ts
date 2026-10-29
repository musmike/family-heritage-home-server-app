import api from './axiosInstance';
import type {
  AddPersonToGraveRequestDto,
  BurialsOverviewDto,
  BurialsQueryParams,
  CemeteryGroupDto,
  GraveGroupDto,
  SaveCemeteryRequestDto,
  SaveGraveRequestDto,
} from '../types/burial';

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

  getGraveDetails: async (graveId: number): Promise<GraveGroupDto> => {
    const response = await api.get<GraveGroupDto>(`/burials/graves/${String(graveId)}`);
    return response.data;
  },

  createCemetery: async (payload: SaveCemeteryRequestDto): Promise<CemeteryGroupDto> => {
    const response = await api.post<CemeteryGroupDto>('/burials/cemeteries', payload);
    return response.data;
  },

  updateCemetery: async (
    cemeteryId: number,
    payload: SaveCemeteryRequestDto
  ): Promise<CemeteryGroupDto> => {
    const response = await api.put<CemeteryGroupDto>(
      `/burials/cemeteries/${String(cemeteryId)}`,
      payload
    );
    return response.data;
  },

  deleteCemetery: async (cemeteryId: number): Promise<void> => {
    await api.delete(`/burials/cemeteries/${String(cemeteryId)}`);
  },

  createGrave: async (payload: SaveGraveRequestDto): Promise<GraveGroupDto> => {
    const response = await api.post<GraveGroupDto>('/burials/graves', payload);
    return response.data;
  },

  updateGrave: async (
    graveId: number,
    payload: SaveGraveRequestDto
  ): Promise<GraveGroupDto> => {
    const response = await api.put<GraveGroupDto>(
      `/burials/graves/${String(graveId)}`,
      payload
    );
    return response.data;
  },

  deleteGrave: async (graveId: number): Promise<void> => {
    await api.delete(`/burials/graves/${String(graveId)}`);
  },

  addPersonToGrave: async (
    graveId: number,
    payload: AddPersonToGraveRequestDto
  ): Promise<GraveGroupDto> => {
    const response = await api.post<GraveGroupDto>(
      `/burials/graves/${String(graveId)}/people`,
      payload
    );
    return response.data;
  },

  toggleBurialCurrent: async (burialId: number): Promise<GraveGroupDto> => {
    const response = await api.put<GraveGroupDto>(
      `/burials/items/${String(burialId)}/toggle-current`
    );
    return response.data;
  },

  splitBurialToNewGrave: async (burialId: number): Promise<GraveGroupDto> => {
    const response = await api.post<GraveGroupDto>(
      `/burials/items/${String(burialId)}/split`
    );
    return response.data;
  },

  removeBurialFromGrave: async (burialId: number): Promise<void> => {
    await api.delete(`/burials/items/${String(burialId)}`);
  },
};