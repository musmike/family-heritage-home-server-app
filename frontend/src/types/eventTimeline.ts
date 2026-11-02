import type { LifeState, PersonSex } from './biography';

export interface EventTypeOptionDto {
  code: string;
  label: string;
  system: boolean;
  allowedRoleCodes?: string[];
}

export interface EventParticipantItemDto {
  participantId?: number | null;
  personId: number | null;
  participantText?: string | null;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
  privateRecord: boolean;
  roleCode: string;
  roleLabel?: string | null;
  ageAtEvent: number | null;
  ageApproximate: boolean;
  avatarMediaId?: number | null;
  avatarMediaType?: 'IMAGE' | 'VIDEO' | null;
  avatarCropX?: number | null;
  avatarCropY?: number | null;
  avatarCropZoom?: number | null;
  parentNames: string[];
}

export interface EventAttributeItemDto {
  definitionCode: string;
  value: string;
}

export interface TimelineEventDto {
  eventId: number;
  typeCode: string;
  typeLabel: string;
  systemType: boolean;
  assignedTypeCodes?: string[];
  assignedTypeLabels?: string[];
  title?: string | null;
  description?: string | null;
  parentEventId?: number | null;
  parentEventLabel?: string | null;
  year: number | null;
  dateText: string | null;
  locationName: string | null;

  startDateType?: string | null;
  startQualifier?: string | null;
  startYear?: number | null;
  startMonth?: number | null;
  startDay?: number | null;
  startTimeQualifier?: string | null;
  startHour?: number | null;
  startMinute?: number | null;

  endYear?: number | null;
  endMonth?: number | null;
  endDay?: number | null;
  endTimeQualifier?: string | null;
  endHour?: number | null;
  endMinute?: number | null;

  participants: EventParticipantItemDto[];
  attributes: EventAttributeItemDto[];
  subEvents?: TimelineEventDto[];
}

export interface SaveEventParticipantRequestDto {
  personId?: number | null;
  participantText?: string | null;
  participantSex?: PersonSex | null;
  roleCode: string;
}

export interface SaveEventRequestDto {
  typeCodes: string[];
  title?: string | null;
  description?: string | null;
  parentEventId?: number | null;
  locationName?: string | null;
  startQualifier?: string | null;
  startYear?: number | null;
  startMonth?: number | null;
  startDay?: number | null;
  startTimeQualifier?: string | null;
  startHour?: number | null;
  startMinute?: number | null;
  isRange?: boolean;
  endYear?: number | null;
  endMonth?: number | null;
  endDay?: number | null;
  endTimeQualifier?: string | null;
  endHour?: number | null;
  endMinute?: number | null;
  participants: SaveEventParticipantRequestDto[];
}

export interface UpdateEventDetailsRequestDto {
  title?: string | null;
  description?: string | null;
  parentEventId?: number | null;
}

export interface TimelineYearGroupDto {
  year: number;
  events: TimelineEventDto[];
}

export interface TimelineDecadeGroupDto {
  decadeStart: number;
  decadeLabel: string;
  eventsCount: number;
  years: TimelineYearGroupDto[];
}

export interface EventsTimelinePageDto {
  page: number;
  size: number;
  totalEvents: number;
  totalPages: number;
  minAvailableYear?: number | null;
  maxAvailableYear?: number | null;
  availableTypes: EventTypeOptionDto[];
  decades: TimelineDecadeGroupDto[];
  undatedEvents: TimelineEventDto[];
}

export interface EventsTimelineQueryParams {
  search?: string;
  types?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  includeUndated?: boolean;
  includeArchived?: boolean;
  sortOrder?: string;
  page?: number;
  size?: number;
}