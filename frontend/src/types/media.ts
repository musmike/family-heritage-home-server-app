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
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  description: string | null;
  year?: number | null;
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
  title?: string | null;
  description?: string | null;
  personIds?: number[];
  setAsAvatarForPersonId?: number | null;
  avatarCropX?: number | null;
  avatarCropY?: number | null;
  avatarCropZoom?: number | null;
  setAsPrimaryForGraveId?: number | null;
}