import api from './axiosInstance';
import type {
  EventsTimelinePageDto,
  EventsTimelineQueryParams,
  TimelineEventDto,
} from '../types/eventTimeline';

export const eventTimelineApi = {
  getEventsTimeline: async (
    params: EventsTimelineQueryParams
  ): Promise<EventsTimelinePageDto> => {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.types && params.types.length > 0) {
      cleanParams.types = params.types.join(',');
    }
    if (params.yearFrom !== undefined && params.yearFrom !== null) {
      cleanParams.yearFrom = params.yearFrom;
    }
    if (params.yearTo !== undefined && params.yearTo !== null) {
      cleanParams.yearTo = params.yearTo;
    }
    if (params.includeUndated !== undefined) {
      cleanParams.includeUndated = params.includeUndated;
    }
    if (params.includeArchived !== undefined) {
      cleanParams.includeArchived = params.includeArchived;
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

    const response = await api.get<EventsTimelinePageDto>('/events', {
      params: cleanParams,
    });
    return response.data;
  },
  
  getEventById: async (eventId: number): Promise<TimelineEventDto> => {
    const response = await api.get<TimelineEventDto>(`/events/${String(eventId)}`);
    return response.data;
  },
};