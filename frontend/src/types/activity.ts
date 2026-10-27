export interface ActivityTypeOptionDto {
  code: string;
  label: string;
  adminOnly: boolean;
}

export interface ActivityLogItemDto {
  id: number;
  actionType: string;
  actionLabel: string;
  actorUsername: string;
  actorDisplayName: string;
  description: string;
  targetType: string | null;
  targetId: number | null;
  ipAddress: string | null;
  adminOnly: boolean;
  createdAt: string;
}

export interface ActivityLogPageDto {
  content: ActivityLogItemDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  availableTypes: ActivityTypeOptionDto[];
  availableActors: string[];
}

export interface ActivityQueryParams {
  search?: string;
  types?: string[];
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: string;
  page?: number;
  size?: number;
}