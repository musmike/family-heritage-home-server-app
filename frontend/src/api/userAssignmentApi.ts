import api from './axiosInstance';

export interface UserPersonAssignmentDto {
  userId: number;
  username: string;
  role: 'ADMIN' | 'PRIVILEGED_GUEST' | 'GUEST';
  personId: number | null;
  personGivenName: string | null;
  personSurname: string | null;
}

export interface SaveUserRequestDto {
  username: string;
  password?: string;
  role: 'ADMIN' | 'PRIVILEGED_GUEST' | 'GUEST';
  personId: number | null;
}

export const userAssignmentApi = {
  getAllUsers: async (): Promise<UserPersonAssignmentDto[]> => {
    const response = await api.get<UserPersonAssignmentDto[]>('/users');
    return response.data;
  },

  createUser: async (payload: SaveUserRequestDto): Promise<UserPersonAssignmentDto> => {
    const response = await api.post<UserPersonAssignmentDto>('/users', payload);
    return response.data;
  },

  updateUser: async (
    userId: number,
    payload: SaveUserRequestDto
  ): Promise<UserPersonAssignmentDto> => {
    const response = await api.put<UserPersonAssignmentDto>(
      `/users/${String(userId)}`,
      payload
    );
    return response.data;
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/users/${String(userId)}`);
  },
};