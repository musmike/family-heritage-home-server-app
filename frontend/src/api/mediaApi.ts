import api from './axiosInstance';
import type {
  BulkUpdateMediaRequestDto,
  EventMediaOverviewDto,
  LinkExistingMediaRequestDto,
  MediaCollectionDto,
  MediaFilenamePreviewDto,
  MediaGalleryPageDto,
  MediaGalleryQueryParams,
  MediaItemDto,
  MediaPrimaryContext,
  SaveMediaCollectionRequestDto,
  UpdateMediaItemRequestDto,
} from '../types/media';

const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, '');
  }
  return 'http://localhost:8080/api';
};

export const mediaApi = {
  getThumbnailUrl: (mediaId: number): string =>
    `${getApiBaseUrl()}/media/${String(mediaId)}/thumbnail`,

  getFileUrl: (mediaId: number): string =>
    `${getApiBaseUrl()}/media/${String(mediaId)}/file`,

  getVersionFileUrl: (mediaId: number, versionId: number): string =>
    `${getApiBaseUrl()}/media/${String(mediaId)}/versions/${String(versionId)}/file`,

  getGalleryPage: async (
    params: MediaGalleryQueryParams
  ): Promise<MediaGalleryPageDto> => {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params.search && params.search.trim() !== '') {
      cleanParams.search = params.search.trim();
    }
    if (params.mediaType && params.mediaType !== 'ALL') {
      cleanParams.mediaType = params.mediaType;
    }
    if (
      params.primaryContext &&
      params.primaryContext !== 'ALL' &&
      params.primaryContext !== 'TIMELINE' &&
      params.primaryContext !== 'PERSONS_VIEW' &&
      params.primaryContext !== 'GRAVES_VIEW' &&
      params.primaryContext !== 'COLLECTIONS_VIEW'
    ) {
      cleanParams.primaryContext = params.primaryContext;
    }
    if (params.collectionId !== undefined && params.collectionId !== null) {
      cleanParams.collectionId = params.collectionId;
    }
    if (params.personIds && params.personIds.length > 0) {
      cleanParams.personIds = params.personIds.join(',');
    }
    if (params.matchAllPersons !== undefined) {
      cleanParams.matchAllPersons = params.matchAllPersons;
    }
    if (params.datedMode && params.datedMode !== 'ALL') {
      cleanParams.datedMode = params.datedMode;
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

    const response = await api.get<MediaGalleryPageDto>('/media/gallery', {
      params: cleanParams,
    });
    return response.data;
  },

  getAllCollections: async (): Promise<MediaCollectionDto[]> => {
    const response = await api.get<MediaCollectionDto[]>('/media/collections');
    return response.data;
  },

  createCollection: async (
    payload: SaveMediaCollectionRequestDto
  ): Promise<MediaCollectionDto> => {
    const response = await api.post<MediaCollectionDto>('/media/collections', payload);
    return response.data;
  },

  deleteCollection: async (collectionId: number): Promise<void> => {
    await api.delete(`/media/collections/${String(collectionId)}`);
  },

  previewFilename: async (params: {
    primaryContext: MediaPrimaryContext;
    graveId?: number;
    personId?: number;
    eventId?: number;
    collectionId?: number;
    customYear?: number;
    customFolderName?: string;
    customFileName?: string;
    originalFilename?: string;
    mimeType?: string;
    portraitMedia?: boolean;
    unknownMedia?: boolean;
    personsCount?: number;
  }): Promise<MediaFilenamePreviewDto> => {
    const response = await api.get<MediaFilenamePreviewDto>('/media/preview-filename', {
      params,
    });
    return response.data;
  },

  uploadMedia: async (params: {
    file: File;
    primaryContext: MediaPrimaryContext;
    customFolderName?: string;
    customFileName?: string;
    title?: string;
    inscriptionText?: string;
    description?: string;
    sourceText?: string;
    graveId?: number;
    eventId?: number;
    collectionId?: number;
    portraitMedia?: boolean;
    unknownMedia?: boolean;
    isBetweenRange?: boolean;
    dateQualifier?: string;
    customYear?: number;
    customMonth?: number;
    customDay?: number;
    timeQualifier?: string;
    customHour?: number;
    customMinute?: number;
    customSecond?: number;
    rangeEndQualifier?: string;
    rangeEndYear?: number;
    rangeEndMonth?: number;
    rangeEndDay?: number;
    rangeEndTimeQualifier?: string;
    rangeEndHour?: number;
    rangeEndMinute?: number;
    rangeEndSecond?: number;
    selectedMetadataSourceTag?: string;
    clientLastModifiedMs?: number;
    personIds?: number[];
    setAsPersonAvatar?: boolean;
    setAsGravePrimary?: boolean;
  }): Promise<MediaItemDto> => {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('primaryContext', params.primaryContext);
    if (params.customFolderName && params.customFolderName.trim() !== '') {
      formData.append('customFolderName', params.customFolderName.trim());
    }
    if (params.customFileName && params.customFileName.trim() !== '') {
      formData.append('customFileName', params.customFileName.trim());
    }
    if (params.title && params.title.trim() !== '') {
      formData.append('title', params.title.trim());
    }
    if (params.inscriptionText && params.inscriptionText.trim() !== '') {
      formData.append('inscriptionText', params.inscriptionText.trim());
    }
    if (params.description && params.description.trim() !== '') {
      formData.append('description', params.description.trim());
    }
    if (params.sourceText && params.sourceText.trim() !== '') {
      formData.append('sourceText', params.sourceText.trim());
    }
    if (params.graveId !== undefined) {
      formData.append('graveId', String(params.graveId));
    }
    if (params.eventId !== undefined) {
      formData.append('eventId', String(params.eventId));
    }
    if (params.collectionId !== undefined) {
      formData.append('collectionId', String(params.collectionId));
    }
    if (params.portraitMedia !== undefined) {
      formData.append('portraitMedia', String(params.portraitMedia));
    }
    if (params.unknownMedia !== undefined) {
      formData.append('unknownMedia', String(params.unknownMedia));
    }
    if (params.isBetweenRange !== undefined) {
      formData.append('isBetweenRange', String(params.isBetweenRange));
    }
    if (params.dateQualifier) {
      formData.append('dateQualifier', params.dateQualifier);
    }
    if (params.customYear !== undefined) {
      formData.append('customYear', String(params.customYear));
    }
    if (params.customMonth !== undefined) {
      formData.append('customMonth', String(params.customMonth));
    }
    if (params.customDay !== undefined) {
      formData.append('customDay', String(params.customDay));
    }
    if (params.timeQualifier) {
      formData.append('timeQualifier', params.timeQualifier);
    }
    if (params.customHour !== undefined) {
      formData.append('customHour', String(params.customHour));
    }
    if (params.customMinute !== undefined) {
      formData.append('customMinute', String(params.customMinute));
    }
    if (params.customSecond !== undefined) {
      formData.append('customSecond', String(params.customSecond));
    }
    if (params.rangeEndQualifier) {
      formData.append('rangeEndQualifier', params.rangeEndQualifier);
    }
    if (params.rangeEndYear !== undefined) {
      formData.append('rangeEndYear', String(params.rangeEndYear));
    }
    if (params.rangeEndMonth !== undefined) {
      formData.append('rangeEndMonth', String(params.rangeEndMonth));
    }
    if (params.rangeEndDay !== undefined) {
      formData.append('rangeEndDay', String(params.rangeEndDay));
    }
    if (params.rangeEndTimeQualifier) {
      formData.append('rangeEndTimeQualifier', params.rangeEndTimeQualifier);
    }
    if (params.rangeEndHour !== undefined) {
      formData.append('rangeEndHour', String(params.rangeEndHour));
    }
    if (params.rangeEndMinute !== undefined) {
      formData.append('rangeEndMinute', String(params.rangeEndMinute));
    }
    if (params.rangeEndSecond !== undefined) {
      formData.append('rangeEndSecond', String(params.rangeEndSecond));
    }
    if (params.selectedMetadataSourceTag) {
      formData.append('selectedMetadataSourceTag', params.selectedMetadataSourceTag);
    }
    if (params.clientLastModifiedMs !== undefined) {
      formData.append('clientLastModifiedMs', String(params.clientLastModifiedMs));
    }
    if (params.personIds && params.personIds.length > 0) {
      formData.append('personIds', params.personIds.join(','));
    }
    if (params.setAsPersonAvatar !== undefined) {
      formData.append('setAsPersonAvatar', String(params.setAsPersonAvatar));
    }
    if (params.setAsGravePrimary !== undefined) {
      formData.append('setAsGravePrimary', String(params.setAsGravePrimary));
    }

    const response = await api.post<MediaItemDto>('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadBatchMedia: async (params: {
    files: File[];
    primaryContext: MediaPrimaryContext;
    customFolderName?: string;
    customFileNames: string[];
    titles: string[];
    customYears: (number | null)[];
    customMonths?: (number | null)[];
    customDays?: (number | null)[];
    customHours?: (number | null)[];
    customMinutes?: (number | null)[];
    customSeconds?: (number | null)[];
    selectedMetadataSourceTags?: (string | null)[];
    clientLastModifiedList?: (number | null)[];
    graveId?: number;
    eventId?: number;
    collectionId?: number;
    portraitMedia?: boolean;
    unknownMedia?: boolean;
    defaultYear?: number | null;
    personIds?: number[];
  }): Promise<MediaItemDto[]> => {
    const formData = new FormData();
    for (const file of params.files) {
      formData.append('files', file);
    }
    formData.append('primaryContext', params.primaryContext);
    if (params.customFolderName && params.customFolderName.trim() !== '') {
      formData.append('customFolderName', params.customFolderName.trim());
    }
    for (const name of params.customFileNames) {
      formData.append('customFileNames', name);
    }
    for (const t of params.titles) {
      formData.append('titles', t);
    }
    for (const y of params.customYears) {
      formData.append('customYears', y !== null ? String(y) : '');
    }
    if (params.customMonths) {
      for (const m of params.customMonths) {
        formData.append('customMonths', m !== null ? String(m) : '');
      }
    }
    if (params.customDays) {
      for (const d of params.customDays) {
        formData.append('customDays', d !== null ? String(d) : '');
      }
    }
    if (params.customHours) {
      for (const h of params.customHours) {
        formData.append('customHours', h !== null ? String(h) : '');
      }
    }
    if (params.customMinutes) {
      for (const min of params.customMinutes) {
        formData.append('customMinutes', min !== null ? String(min) : '');
      }
    }
    if (params.customSeconds) {
      for (const sec of params.customSeconds) {
        formData.append('customSeconds', sec !== null ? String(sec) : '');
      }
    }
    if (params.selectedMetadataSourceTags) {
      for (const tag of params.selectedMetadataSourceTags) {
        formData.append('selectedMetadataSourceTags', tag ?? '');
      }
    }
    if (params.clientLastModifiedList) {
      for (const lm of params.clientLastModifiedList) {
        formData.append('clientLastModifiedList', lm !== null ? String(lm) : '');
      }
    }
    if (params.graveId !== undefined) {
      formData.append('graveId', String(params.graveId));
    }
    if (params.eventId !== undefined) {
      formData.append('eventId', String(params.eventId));
    }
    if (params.collectionId !== undefined) {
      formData.append('collectionId', String(params.collectionId));
    }
    if (params.portraitMedia !== undefined) {
      formData.append('portraitMedia', String(params.portraitMedia));
    }
    if (params.unknownMedia !== undefined) {
      formData.append('unknownMedia', String(params.unknownMedia));
    }
    if (params.defaultYear !== undefined && params.defaultYear !== null) {
      formData.append('defaultYear', String(params.defaultYear));
    }
    if (params.personIds && params.personIds.length > 0) {
      formData.append('personIds', params.personIds.join(','));
    }

    const response = await api.post<MediaItemDto[]>('/media/upload-batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateMedia: async (
    mediaId: number,
    payload: UpdateMediaItemRequestDto
  ): Promise<MediaItemDto> => {
    const response = await api.put<MediaItemDto>(
      `/media/${String(mediaId)}`,
      payload
    );
    return response.data;
  },

  uploadMediaVersion: async (params: {
    mediaId: number;
    file: File;
    versionType: string;
    versionLabel?: string;
    setAsMain?: boolean;
  }): Promise<MediaItemDto> => {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('versionType', params.versionType);
    if (params.versionLabel && params.versionLabel.trim() !== '') {
      formData.append('versionLabel', params.versionLabel.trim());
    }
    if (params.setAsMain !== undefined) {
      formData.append('setAsMain', String(params.setAsMain));
    }
    const response = await api.post<MediaItemDto>(
      `/media/${String(params.mediaId)}/versions`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  setMainMediaVersion: async (
    mediaId: number,
    versionId: number
  ): Promise<MediaItemDto> => {
    const response = await api.put<MediaItemDto>(
      `/media/${String(mediaId)}/versions/${String(versionId)}/set-main`
    );
    return response.data;
  },

  deleteMediaVersion: async (
    mediaId: number,
    versionId: number
  ): Promise<MediaItemDto> => {
    const response = await api.delete<MediaItemDto>(
      `/media/${String(mediaId)}/versions/${String(versionId)}`
    );
    return response.data;
  },

  bulkUpdateMedia: async (
    payload: BulkUpdateMediaRequestDto
  ): Promise<MediaItemDto[]> => {
    const response = await api.put<MediaItemDto[]>('/media/bulk-update', payload);
    return response.data;
  },

  linkExistingMedia: async (
    payload: LinkExistingMediaRequestDto
  ): Promise<MediaItemDto[]> => {
    const response = await api.post<MediaItemDto[]>('/media/link-existing', payload);
    return response.data;
  },

  unlinkMediaFromContext: async (
    mediaId: number,
    params: { graveId?: number; personId?: number; eventId?: number }
  ): Promise<void> => {
    await api.delete(`/media/${String(mediaId)}/unlink`, { params });
  },

  deleteMedia: async (mediaId: number): Promise<void> => {
    await api.delete(`/media/${String(mediaId)}`);
  },

  getMediaByGrave: async (graveId: number): Promise<MediaItemDto[]> => {
    const response = await api.get<MediaItemDto[]>(
      `/media/by-grave/${String(graveId)}`
    );
    return response.data;
  },

  getMediaByPerson: async (personId: number): Promise<MediaItemDto[]> => {
    const response = await api.get<MediaItemDto[]>(
      `/media/by-person/${String(personId)}`
    );
    return response.data;
  },

  getMediaByEvent: async (eventId: number): Promise<EventMediaOverviewDto> => {
    const response = await api.get<EventMediaOverviewDto>(
      `/media/by-event/${String(eventId)}`
    );
    return response.data;
  },
};