import type { PersonSex } from './biography';

export type MediaType = 'IMAGE' | 'VIDEO';

export type MediaPrimaryContext =
  | 'GRAVE'
  | 'PERSON'
  | 'EVENT'
  | 'COLLECTION'
  | 'HEIRLOOM'
  | 'LOCATION'
  | 'OTHER';

export interface MetadataDateOptionDto {
  sourceTag: string;
  dateText: string;
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
}

export interface MediaPersonLinkDto {
  linkId?: number | null;
  personId: number | null;
  personText?: string | null;
  displayName: string;
  sex: PersonSex | null;
  linkType: 'DEPICTED' | 'RELATED' | 'AUTHOR';
}

export interface SaveMediaPersonLinkRequestDto {
  personId?: number | null;
  personText?: string | null;
  personSex?: PersonSex | null;
  linkType: 'DEPICTED' | 'RELATED' | 'AUTHOR';
}

export interface MediaVersionDto {
  id: number;
  mediaId: number;
  versionType: 'ORIGINAL' | 'RESTORED' | 'COLORIZED' | 'ENHANCED' | 'REVERSE' | 'OTHER';
  versionLabel: string;
  relativePath?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  main: boolean;
  reverseSide: boolean;
  createdAt: string;
}

export interface MediaItemDto {
  id: number;
  mediaType: MediaType;
  primaryContext: MediaPrimaryContext;
  portrait?: boolean;
  unknownMedia?: boolean;
  relativePath: string | null;
  directoryPath?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  inscriptionText?: string | null;
  description: string | null;
  sourceText?: string | null;

  dateType?: string | null;
  betweenRange?: boolean;
  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;

  rangeEndQualifier?: string | null;
  rangeEndYear?: number | null;
  rangeEndMonth?: number | null;
  rangeEndDay?: number | null;
  rangeEndTimeQualifier?: string | null;
  rangeEndHour?: number | null;
  rangeEndMinute?: number | null;
  rangeEndSecond?: number | null;

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
  availableMetadataDates?: MetadataDateOptionDto[];

  collectionId?: number | null;
  collectionName?: string | null;
  datedCollectionItem?: boolean;
  collectionStartYear?: number | null;
  createdAt: string;
  personIds: number[];
  personNames?: string[];
  depictedPersons?: MediaPersonLinkDto[];
  relatedPersons?: MediaPersonLinkDto[];
  authors?: MediaPersonLinkDto[];
  versions?: MediaVersionDto[];
  graveIds: number[];
  cemeteryNames?: string[];
  graveCemeteryIds?: number[];
  graveLabels?: string[];
  eventIds?: number[];
  eventLabels?: string[];
  eventStartYears?: number[];
}

export interface MediaCollectionDto {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parentCollectionId?: number | null;
  parentCollectionName?: string | null;
  datedCollection?: boolean;
  startYear?: number | null;
  endYear?: number | null;
  founderPersonId: number | null;
  founderPersonName: string | null;
  previewMediaId?: number | null;
  mediaCount: number;
  createdAt: string;
}

export interface SaveMediaCollectionRequestDto {
  name: string;
  customSlug?: string | null;
  description?: string | null;
  parentCollectionId?: number | null;
  datedCollection?: boolean;
  startYear?: number | null;
  endYear?: number | null;
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
  inscriptionText?: string | null;
  description?: string | null;
  sourceText?: string | null;
  portrait?: boolean | null;
  unknownMedia?: boolean | null;
  collectionId?: number | null;
  dateSourceMode?: 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED' | null;
  selectedMetadataSourceTag?: string | null;
  contextEventId?: number | null;
  isBetweenRange?: boolean;
  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
  rangeEndQualifier?: string | null;
  rangeEndYear?: number | null;
  rangeEndMonth?: number | null;
  rangeEndDay?: number | null;
  rangeEndTimeQualifier?: string | null;
  rangeEndHour?: number | null;
  rangeEndMinute?: number | null;
  rangeEndSecond?: number | null;
  personIds?: number[];
  personLinks?: SaveMediaPersonLinkRequestDto[];
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
  selectedMetadataSourceTag?: string | null;
  isBetweenRange?: boolean;
  dateQualifier?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  timeQualifier?: string | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
  rangeEndQualifier?: string | null;
  rangeEndYear?: number | null;
  rangeEndMonth?: number | null;
  rangeEndDay?: number | null;
  rangeEndTimeQualifier?: string | null;
  rangeEndHour?: number | null;
  rangeEndMinute?: number | null;
  rangeEndSecond?: number | null;
}

export interface LinkExistingMediaRequestDto {
  mediaIds: number[];
  graveId?: number | null;
  personId?: number | null;
  eventId?: number | null;
  collectionId?: number | null;
}