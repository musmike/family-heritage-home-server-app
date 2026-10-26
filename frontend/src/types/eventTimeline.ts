import type { LifeState, PersonSex } from './biography';

export interface EventTypeOptionDto {
  code: string;
  label: string;
  system: boolean;
}

export interface EventParticipantItemDto {
  personId: number | null;
  givenName: string | null;
  surname: string | null;
  sex: PersonSex | null;
  lifeState: LifeState | null;
  archived: boolean;
  privateRecord: boolean;
  roleCode: string;
  ageAtEvent: number | null;
  ageApproximate: boolean;
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
  year: number | null;
  dateText: string | null;
  locationName: string | null;
  participants: EventParticipantItemDto[];
  attributes: EventAttributeItemDto[];
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