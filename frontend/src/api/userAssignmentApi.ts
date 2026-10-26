import api from './axiosInstance';

export interface UserPersonAssignmentDto {
  userId: number;
  username: string;
  role: string;
  personId: number | null;
  personGivenName: string | null;
  personSurname: string | null;
}

export const userAssignmentApi = {
  getAssignableUsers: async (): Promise<UserPersonAssignmentDto[]> => {
    const response = await api.get<UserPersonAssignmentDto[]>('/users/assignable');
    return response.data;
  },

  assignPersonToUser: async (
    userId: number,
    personId: number | null
  ): Promise<UserPersonAssignmentDto> => {
    const response = await api.put<UserPersonAssignmentDto>(
      `/users/${String(userId)}/person`,
      { personId }
    );
    return response.data;
  },
};