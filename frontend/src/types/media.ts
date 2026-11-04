import type { PersonSex } from './biography';

export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO';

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
  rootEventIds?: number[];
  rootEventLabels?: string[];
  rootEventStartYears?: number[];
  subEventId?: number | null;
  subEventLabel?: string | null;
}

export interface MediaCollectionDto {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parentCollectionId?: number | null;
  parentCollectionName?: string | null;
  datedCollection?: boolean;
  dateText?: string | null;
  startYear?: number | null;
  startMonth?: number | null;
  startDay?: number | null;
  startDateType?: string | null;
  startQualifier?: string | null;
  startTimeQualifier?: string | null;
  startHour?: number | null;
  startMinute?: number | null;
  startSecond?: number | null;
  startRangeEndQualifier?: string | null;
  startRangeEndYear?: number | null;
  startRangeEndMonth?: number | null;
  startRangeEndDay?: number | null;
  startRangeEndTimeQualifier?: string | null;
  startRangeEndHour?: number | null;
  startRangeEndMinute?: number | null;
  startRangeEndSecond?: number | null;
  isRange?: boolean;
  hasEndDate?: boolean;
  endDateType?: string | null;
  endYear?: number | null;
  endMonth?: number | null;
  endDay?: number | null;
  endQualifier?: string | null;
  endTimeQualifier?: string | null;
  endHour?: number | null;
  endMinute?: number | null;
  endSecond?: number | null;
  endRangeEndQualifier?: string | null;
  endRangeEndYear?: number | null;
  endRangeEndMonth?: number | null;
  endRangeEndDay?: number | null;
  endRangeEndTimeQualifier?: string | null;
  endRangeEndHour?: number | null;
  endRangeEndMinute?: number | null;
  endRangeEndSecond?: number | null;
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
  isStartBetweenRange?: boolean;
  startYear?: number | null;
  startMonth?: number | null;
  startDay?: number | null;
  startDateType?: string | null;
  startQualifier?: string | null;
  startTimeQualifier?: string | null;
  startHour?: number | null;
  startMinute?: number | null;
  startSecond?: number | null;
  startRangeEndQualifier?: string | null;
  startRangeEndYear?: number | null;
  startRangeEndMonth?: number | null;
  startRangeEndDay?: number | null;
  startRangeEndTimeQualifier?: string | null;
  startRangeEndHour?: number | null;
  startRangeEndMinute?: number | null;
  startRangeEndSecond?: number | null;
  isRange?: boolean;
  hasEndDate?: boolean;
  isEndBetweenRange?: boolean;
  endYear?: number | null;
  endMonth?: number | null;
  endDay?: number | null;
  endQualifier?: string | null;
  endTimeQualifier?: string | null;
  endHour?: number | null;
  endMinute?: number | null;
  endSecond?: number | null;
  endRangeEndQualifier?: string | null;
  endRangeEndYear?: number | null;
  endRangeEndMonth?: number | null;
  endRangeEndDay?: number | null;
  endRangeEndTimeQualifier?: string | null;
  endRangeEndHour?: number | null;
  endRangeEndMinute?: number | null;
  endRangeEndSecond?: number | null;
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
  totalAudiosCount?: number;
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
  targetCollectionId?: number | null;
  title?: string | null;
  sourceText?: string | null;
  inscriptionText?: string | null;
  description?: string | null;
  personLinks?: SaveMediaPersonLinkRequestDto[];
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