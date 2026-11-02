export type MediaType = 'IMAGE' | 'VIDEO';

export type MediaPrimaryContext =
  | 'GRAVE'
  | 'PERSON'
  | 'EVENT'
  | 'COLLECTION'
  | 'HEIRLOOM'
  | 'LOCATION'
  | 'OTHER';

export interface MediaItemDto {
  id: number;
  mediaType: MediaType;
  primaryContext: MediaPrimaryContext;
  relativePath: string | null;
  directoryPath?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  description: string | null;

  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
  dateText?: string | null;
  sortDateTime?: string | null;

  metadataYear?: number | null;
  metadataMonth?: number | null;
  metadataDay?: number | null;
  metadataHour?: number | null;
  metadataMinute?: number | null;
  metadataSecond?: number | null;
  metadataDateText?: string | null;
  metadataDateSource?: string | null;

  collectionId?: number | null;
  collectionName?: string | null;
  createdAt: string;
  personIds: number[];
  personNames?: string[];
  graveIds: number[];
  cemeteryNames?: string[];
  eventIds?: number[];
  eventLabels?: string[];
}

export interface MediaCollectionDto {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  founderPersonId: number | null;
  founderPersonName: string | null;
  mediaCount: number;
  createdAt: string;
}

export interface SaveMediaCollectionRequestDto {
  name: string;
  customSlug?: string | null;
  description?: string | null;
  founderPersonId?: number | null;
}

export interface MediaGalleryPageDto {
  content: MediaItemDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  totalImagesCount: number;
  totalVideosCount: number;
  collections: MediaCollectionDto[];
}

export interface MediaGalleryQueryParams {
  search?: string;
  mediaType?: string;
  primaryContext?: string;
  collectionId?: number | null;
  personIds?: number[];
  matchAllPersons?: boolean;
  datedMode?: string;
  sortBy?: string;
  page?: number;
  size?: number;
}

export interface SubEventMediaGroupDto {
  subEventId: number;
  subEventLabel: string;
  dateText: string | null;
  media: MediaItemDto[];
}

export interface EventMediaOverviewDto {
  directMedia: MediaItemDto[];
  subEventGroups: SubEventMediaGroupDto[];
}

export interface MediaFilenamePreviewDto {
  directoryPath: string;
  suggestedFileName: string;
  fullRelativePath: string;
}

export interface UpdateMediaItemRequestDto {
  fileName?: string | null;
  customFolderName?: string | null;
  title?: string | null;
  description?: string | null;
  dateSourceMode?: 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED' | null;
  contextEventId?: number | null;
  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
  personIds?: number[];
  setAsAvatarForPersonId?: number | null;
  avatarCropX?: number | null;
  avatarCropY?: number | null;
  avatarCropZoom?: number | null;
  setAsPrimaryForGraveId?: number | null;
}

export interface BulkUpdateMediaRequestDto {
  mediaIds: number[];
  baseFileNameStem?: string | null;
  customFolderName?: string | null;
  contextEventId?: number | null;
  dateSourceMode?: 'NO_CHANGE' | 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED' | null;
  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
}

export interface LinkExistingMediaRequestDto {
  mediaIds: number[];
  graveId?: number | null;
  personId?: number | null;
  eventId?: number | null;
  collectionId?: number | null;
}