import type { LifeState, PersonSex } from './biography';

export interface DashboardStatsDto {
  peopleCount: number;
  familiesCount: number;
  generationsCount: number;
  eventsCount: number;
  gravesCount: number;
  documentsCount: number;
  mediaCount: number;
  memoriesCount: number;
  heirloomsCount: number;
  placesCount: number;
}

export interface AnniversaryParticipantDto {
  personId: number;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
}

export interface AnniversaryItemDto {
  id: string;
  type: 'BIRTH' | 'WEDDING' | 'DEATH';
  typeLabel: string;
  month: number;
  day: number;
  originalYear: number | null;
  dateText: string;
  annualDateText: string;
  nextOccurrenceDate: string;
  daysUntil: number;
  yearsCount: number | null;
  locationName: string | null;
  targetType: 'PERSON' | 'EVENT';
  targetId: number;
  eventId: number;
  participants: AnniversaryParticipantDto[];
}

export interface AnniversariesPageDto {
  content: AnniversaryItemDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AnniversariesQueryParams {
  search?: string;
  types?: string[];
  month?: number | 'ALL';
  includeArchived?: boolean;
  sortBy?: string;
  page?: number;
  size?: number;
}