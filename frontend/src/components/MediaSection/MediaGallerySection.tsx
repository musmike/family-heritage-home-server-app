import { useState, useEffect, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import {
  extractAllClientFileMetadata,
  type ClientExtractedMetadata,
} from '../../utils/clientMetadataExtractor';
import GalleryBrowserModal from './GalleryBrowserModal';
import MediaItemLightboxModal from './MediaItemLightboxModal';
import styles from './MediaGallerySection.module.css';
import type {
  MediaCollectionDto,
  MediaItemDto,
  MediaPrimaryContext,
  MediaType,
  SaveMediaPersonLinkRequestDto,
  SubEventMediaGroupDto,
} from '../../types/media';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

export interface MediaGallerySectionProps {
  context: MediaPrimaryContext;
  graveId?: number;
  personId?: number;
  eventId?: number;
  collectionId?: number | null;
  defaultEventYear?: number | null;
  defaultPersonIds?: number[];
  primaryMediaId?: number | null;
  isAdmin: boolean;
  sectionTitle: string;
  hideSectionChrome?: boolean;
  externalOpenUpload?: boolean;
  onExternalCloseUpload?: () => void;
  externalOpenBulkEdit?: boolean;
  onExternalCloseBulkEdit?: () => void;
  externalItems?: MediaItemDto[];
  onMediaChanged?: () => void;
}

interface StagedUploadFile {
  file: File;
  previewUrl: string;
  mediaType: MediaType;
  selectedForBulk: boolean;
  customFileName: string;
  title: string;
  sourceText?: string;
  inscriptionText?: string;
  description?: string;
  personLinks?: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[];
  showDetails?: boolean;
  isBetweenRange: boolean;
  dateQualifier: string;
  year: string;
  month: string;
  day: string;
  timeQualifier: string;
  hour: string;
  minute: string;
  second: string;
  rangeEndQualifier: string;
  rangeEndYear: string;
  rangeEndMonth: string;
  rangeEndDay: string;
  rangeEndTimeQualifier: string;
  rangeEndHour: string;
  rangeEndMinute: string;
  rangeEndSecond: string;
  metadataOptions: ClientExtractedMetadata[];
  selectedMetadataTag: string;
}

interface BulkEditDraftItem {
  id: number;
  mediaType: MediaType;
  selected: boolean;
  fileName: string;
  title: string;
  sourceText: string;
  inscriptionText: string;
  description: string;
  personLinks: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[];
  showDetails: boolean;
  isBetweenRange: boolean;
  dateQualifier: string;
  year: string;
  month: string;
  day: string;
  timeQualifier: string;
  hour: string;
  minute: string;
  second: string;
  rangeEndQualifier: string;
  rangeEndYear: string;
  rangeEndMonth: string;
  rangeEndDay: string;
  rangeEndTimeQualifier: string;
  rangeEndHour: string;
  rangeEndMinute: string;
  rangeEndSecond: string;
}

type DateSourceMode = 'EVENT_OR_MANUAL' | 'FILE_METADATA' | 'UNDATED';
type SectionMediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO';
type SectionSortMode = 'DATE_ASC' | 'DATE_DESC' | 'NAME_ASC' | 'NEWEST_ADDED';

const getPolishWeekdayLabel = (y: string, m: string, d: string): string | null => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) {
    return null;
  }
  const date = new Date(Date.UTC(yNum, mNum - 1, dNum, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long' }).format(date);
};

const toIsoDateInputValue = (y: string, m: string, d: string): string => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) {
    return '';
  }
  return `${String(yNum).padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
};

const QUALIFIER_OPTIONS = [
  { value: 'EXACT', label: 'Dokładnie' },
  { value: 'ABOUT', label: 'Około (ok.)' },
  { value: 'ESTIMATED', label: 'Szacunkowo' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
];

const PERSON_LINK_TYPE_LABELS: Record<'DEPICTED' | 'RELATED' | 'AUTHOR', string> = {
  DEPICTED: '👁️ Na zdjęciu/filmie',
  RELATED: '🔗 Powiązana',
  AUTHOR: '📷 Autor',
};

const parseOptInt = (val: string): number | null => {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
};

const optTrim = (val: string | null | undefined): string | undefined => {
  if (val === undefined || val === null) return undefined;
  const trimmed = val.trim();
  return trimmed !== '' ? trimmed : undefined;
};

const numToStr = (val: number | null | undefined): string =>
  val !== undefined && val !== null ? String(val) : '';

const detectFileMediaType = (file: File): MediaType => {
  const t = file.type.toLowerCase();
  if (t.startsWith('video/')) return 'VIDEO';
  if (
    t.startsWith('audio/') ||
    /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)
  ) {
    return 'AUDIO';
  }
  return 'IMAGE';
};

export default function MediaGallerySection({
  context,
  graveId,
  personId,
  eventId,
  collectionId,
  defaultEventYear,
  defaultPersonIds,
  primaryMediaId,
  isAdmin,
  sectionTitle,
  hideSectionChrome = false,
  externalOpenUpload,
  onExternalCloseUpload,
  externalOpenBulkEdit,
  onExternalCloseBulkEdit,
  externalItems,
  onMediaChanged,
}: MediaGallerySectionProps) {
  const fileInputId = useId();
  const [items, setItems] = useState<MediaItemDto[]>([]);
  const [subEventGroups, setSubEventGroups] = useState<SubEventMediaGroupDto[]>([]);
  const [availableCollections, setAvailableCollections] = useState<MediaCollectionDto[]>([]);

  const [internalShowUpload, setInternalShowUpload] = useState<boolean>(false);
  const [internalBulkEditMode, setInternalBulkEditMode] = useState<boolean>(false);

  const showUpload = externalOpenUpload ?? internalShowUpload;
  const isBulkEditMode = externalOpenBulkEdit ?? internalBulkEditMode;

  const closeUploadModal = () => {
    setInternalShowUpload(false);
    onExternalCloseUpload?.();
  };

  const closeBulkEditModal = () => {
    setInternalBulkEditMode(false);
    onExternalCloseBulkEdit?.();
  };

  // Filtering & Sorting
  const [typeFilter, setTypeFilter] = useState<SectionMediaTypeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SectionSortMode>('DATE_ASC');

  // Batch & Single Upload Staging state
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [customFolderName, setCustomFolderName] = useState<string>('');
  const [uploadCollectionId, setUploadCollectionId] = useState<string>(
    collectionId ? String(collectionId) : ''
  );
  const [uploadIsPortrait, setUploadIsPortrait] = useState<boolean>(context === 'PERSON');
  const [uploadPortraitType, setUploadPortraitType] = useState<'SINGLE' | 'GROUP'>('SINGLE');
  const [uploadIsUnknown, setUploadIsUnknown] = useState<boolean>(false);

  const [dateSourceMode, setDateSourceMode] = useState<DateSourceMode>(
    defaultEventYear ? 'EVENT_OR_MANUAL' : 'FILE_METADATA'
  );
  const [manualBulkQual, setManualBulkQual] = useState<string>('EXACT');
  const [manualBulkYear, setManualBulkYear] = useState<string>(
    defaultEventYear ? String(defaultEventYear) : ''
  );
  const [manualBulkMonth, setManualBulkMonth] = useState<string>('');
  const [manualBulkDay, setManualBulkDay] = useState<string>('');
  const [manualBulkTimeQual, setManualBulkTimeQual] = useState<string>('EXACT');
  const [manualBulkHour, setManualBulkHour] = useState<string>('');
  const [manualBulkMinute, setManualBulkMinute] = useState<string>('');
  const [manualBulkSecond, setManualBulkSecond] = useState<string>('');
  const [uploadIsRange, setUploadIsRange] = useState<boolean>(false);
  const [manualBulkRangeEndQual, setManualBulkRangeEndQual] = useState<string>('EXACT');
  const [manualBulkRangeEndYear, setManualBulkRangeEndYear] = useState<string>('');
  const [manualBulkRangeEndMonth, setManualBulkRangeEndMonth] = useState<string>('');
  const [manualBulkRangeEndDay, setManualBulkRangeEndDay] = useState<string>('');
  const [manualBulkRangeEndTimeQual, setManualBulkRangeEndTimeQual] = useState<string>('EXACT');
  const [manualBulkRangeEndHour, setManualBulkRangeEndHour] = useState<string>('');
  const [manualBulkRangeEndMinute, setManualBulkRangeEndMinute] = useState<string>('');
  const [manualBulkRangeEndSecond, setManualBulkRangeEndSecond] = useState<string>('');

  const [bulkBaseName, setBulkBaseName] = useState<string>('');
  const [directoryPreview, setDirectoryPreview] = useState<string>('');
  const [setAsPrimary, setSetAsPrimary] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Staged Upload Bulk Details State
  const [showBulkDetails, setShowBulkDetails] = useState<boolean>(false);
  const [bulkTitle, setBulkTitle] = useState<string>('');
  const [bulkSourceText, setBulkSourceText] = useState<string>('');
  const [bulkInscriptionText, setBulkInscriptionText] = useState<string>('');
  const [bulkDescription, setBulkDescription] = useState<string>('');
  const [bulkPersonLinks, setBulkPersonLinks] = useState<
    (SaveMediaPersonLinkRequestDto & { displayLabel: string })[]
  >([]);
  const [bulkLinkRoleType, setBulkLinkRoleType] = useState<'DEPICTED' | 'RELATED' | 'AUTHOR'>(
    'DEPICTED'
  );
  const [bulkLinkPersonQuery, setBulkLinkPersonQuery] = useState<string>('');
  const [bulkLinkPersonResults, setBulkLinkPersonResults] = useState<PersonListItemDto[]>([]);
  const [bulkLinkTextInput, setBulkLinkTextInput] = useState<string>('');
  const [bulkLinkTextSex, setBulkLinkTextSex] = useState<PersonSex>('UNKNOWN');

  // Per-Staged-Item Person Linking State
  const [activeStagedSearchIdx, setActiveStagedSearchIdx] = useState<number | null>(null);
  const [stagedPersonQuery, setStagedPersonQuery] = useState<string>('');
  const [stagedPersonResults, setStagedPersonResults] = useState<PersonListItemDto[]>([]);
  const [stagedLinkRoleType, setStagedLinkRoleType] = useState<'DEPICTED' | 'RELATED' | 'AUTHOR'>(
    'DEPICTED'
  );
  const [stagedTextPersonInput, setStagedTextPersonInput] = useState<string>('');
  const [stagedTextPersonSex, setStagedTextPersonSex] = useState<PersonSex>('UNKNOWN');

  // Preview Modal for Staged or Bulk-Edited File (Point 1 & Point 6)
  const [previewModalItem, setPreviewModalItem] = useState<{
    url: string;
    mediaType: MediaType;
    title: string;
  } | null>(null);

  // Post-Upload Bulk Edit Modal State (Points 6 & 33)
  const [bulkDraftItems, setBulkDraftItems] = useState<BulkEditDraftItem[]>([]);
  const [bulkEditFolder, setBulkEditFolder] = useState<string>('');
  const [bulkEditStem, setBulkEditStem] = useState<string>('');
  const [bulkEditTargetCollectionId, setBulkEditTargetCollectionId] = useState<string>('');
  const [bulkEditDateMode, setBulkEditDateMode] = useState<
    'NO_CHANGE' | 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'
  >('NO_CHANGE');
  const [bulkEditMetadataTag, setBulkEditMetadataTag] = useState<string>('');
  const [bulkEditIsBetween, setBulkEditIsBetween] = useState<boolean>(false);
  const [bulkEditDateQual, setBulkEditDateQual] = useState<string>('EXACT');
  const [bulkEditYear, setBulkEditYear] = useState<string>('');
  const [bulkEditMonth, setBulkEditMonth] = useState<string>('');
  const [bulkEditDay, setBulkEditDay] = useState<string>('');
  const [bulkEditTimeQual, setBulkEditTimeQual] = useState<string>('EXACT');
  const [bulkEditHour, setBulkEditHour] = useState<string>('');
  const [bulkEditMinute, setBulkEditMinute] = useState<string>('');
  const [bulkEditSecond, setBulkEditSecond] = useState<string>('');
  const [bulkEditRangeEndQual, setBulkEditRangeEndQual] = useState<string>('EXACT');
  const [bulkEditRangeEndYear, setBulkEditRangeEndYear] = useState<string>('');
  const [bulkEditRangeEndMonth, setBulkEditRangeEndMonth] = useState<string>('');
  const [bulkEditRangeEndDay, setBulkEditRangeEndDay] = useState<string>('');
  const [bulkEditRangeEndTimeQual, setBulkEditRangeEndTimeQual] = useState<string>('EXACT');
  const [bulkEditRangeEndHour, setBulkEditRangeEndHour] = useState<string>('');
  const [bulkEditRangeEndMinute, setBulkEditRangeEndMinute] = useState<string>('');
  const [bulkEditRangeEndSecond, setBulkEditRangeEndSecond] = useState<string>('');

  // Link Existing Media from Gallery Modal state (Point 3)
  const [showLinkExistingModal, setShowLinkExistingModal] = useState<boolean>(false);

  // Fullscreen Lightbox state
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const effectiveItems = externalItems ?? items;

  const filterAndSortList = (list: MediaItemDto[]): MediaItemDto[] => {
    const filtered = list.filter(item => {
      if (typeFilter === 'IMAGE') return item.mediaType === 'IMAGE';
      if (typeFilter === 'VIDEO') return item.mediaType === 'VIDEO';
      if (typeFilter === 'AUDIO') return item.mediaType === 'AUDIO';
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'NAME_ASC') {
        const nameA = (a.title ?? a.fileName).toLowerCase();
        const nameB = (b.title ?? b.fileName).toLowerCase();
        return nameA.localeCompare(nameB, 'pl');
      }
      if (sortMode === 'NEWEST_ADDED') {
        return b.id - a.id;
      }
      const dtA = a.sortDateTime ?? (a.year ? `${String(a.year)}-01-01T00:00:00` : null);
      const dtB = b.sortDateTime ?? (b.year ? `${String(b.year)}-01-01T00:00:00` : null);
      if (dtA === null && dtB === null) return a.id - b.id;
      if (dtA === null) return 1;
      if (dtB === null) return -1;
      const cmp = dtA.localeCompare(dtB);
      if (cmp !== 0) {
        return sortMode === 'DATE_DESC' ? -cmp : cmp;
      }
      return a.id - b.id;
    });
  };

  const displayedDirectItems = useMemo(
    () => filterAndSortList(effectiveItems),
    [effectiveItems, typeFilter, sortMode]
  );

  const displayedSubGroups = useMemo(
    () =>
      subEventGroups
        .map(g => ({
          ...g,
          media: filterAndSortList(g.media),
        }))
        .filter(g => g.media.length > 0),
    [subEventGroups, typeFilter, sortMode]
  );

  const allViewableItems = useMemo(
    () => [...displayedDirectItems, ...displayedSubGroups.flatMap(g => g.media)],
    [displayedDirectItems, displayedSubGroups]
  );

  const totalRawItemsCount =
    effectiveItems.length + subEventGroups.reduce((acc, g) => acc + g.media.length, 0);
  const totalImagesCount =
    effectiveItems.filter(i => i.mediaType === 'IMAGE').length +
    subEventGroups.reduce(
      (acc, g) => acc + g.media.filter(i => i.mediaType === 'IMAGE').length,
      0
    );
  const totalVideosCount =
    effectiveItems.filter(i => i.mediaType === 'VIDEO').length +
    subEventGroups.reduce(
      (acc, g) => acc + g.media.filter(i => i.mediaType === 'VIDEO').length,
      0
    );
  const totalAudiosCount =
    effectiveItems.filter(i => i.mediaType === 'AUDIO').length +
    subEventGroups.reduce(
      (acc, g) => acc + g.media.filter(i => i.mediaType === 'AUDIO').length,
      0
    );

  const loadMedia = async () => {
    if (externalItems !== undefined) return;
    try {
      if (graveId !== undefined) {
        const data = await mediaApi.getMediaByGrave(graveId);
        setItems(data);
        setSubEventGroups([]);
      } else if (personId !== undefined) {
        const data = await mediaApi.getMediaByPerson(personId);
        setItems(data);
        setSubEventGroups([]);
      } else if (eventId !== undefined) {
        const overview = await mediaApi.getMediaByEvent(eventId);
        setItems(overview.directMedia);
        setSubEventGroups(overview.subEventGroups);
      }
    } catch {
      setErrorMessage('Nie udało się załadować zdjęć i filmów.');
    }
  };

  useEffect(() => {
    void loadMedia();
  }, [graveId, personId, eventId]);

  useEffect(() => {
    if (!showUpload && !isBulkEditMode) return;
    const fetchCols = async () => {
      try {
        const cols = await mediaApi.getAllCollections();
        setAvailableCollections(cols);
        if (collectionId) {
          setUploadCollectionId(String(collectionId));
        } else if (cols.length > 0 && uploadCollectionId === '') {
          const firstCol = cols.at(0);
          if (firstCol) {
            setUploadCollectionId(String(firstCol.id));
          }
        }
      } catch {
        setAvailableCollections([]);
      }
    };
    void fetchCols();
  }, [showUpload, isBulkEditMode, collectionId]);

  // Revoke object URLs on unmount or stagedFiles clear
  useEffect(() => {
    return () => {
      for (const st of stagedFiles) {
        if (st.previewUrl) {
          URL.revokeObjectURL(st.previewUrl);
        }
      }
    };
  }, [stagedFiles]);

  // Initialize bulk edit draft list whenever bulk edit mode opens
  useEffect(() => {
    if (!isBulkEditMode) return;
    setBulkDraftItems(
      effectiveItems.map(item => {
        const combinedLinks: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[] = [];
        for (const d of item.depictedPersons ?? []) {
          combinedLinks.push({
            personId: d.personId,
            personText: d.personText,
            personSex: d.sex,
            linkType: 'DEPICTED',
            displayLabel: `${PERSON_LINK_TYPE_LABELS.DEPICTED}: ${d.displayName}`,
          });
        }
        for (const r of item.relatedPersons ?? []) {
          combinedLinks.push({
            personId: r.personId,
            personText: r.personText,
            personSex: r.sex,
            linkType: 'RELATED',
            displayLabel: `${PERSON_LINK_TYPE_LABELS.RELATED}: ${r.displayName}`,
          });
        }
        for (const a of item.authors ?? []) {
          combinedLinks.push({
            personId: a.personId,
            personText: a.personText,
            personSex: a.sex,
            linkType: 'AUTHOR',
            displayLabel: `${PERSON_LINK_TYPE_LABELS.AUTHOR}: ${a.displayName}`,
          });
        }
        return {
          id: item.id,
          mediaType: item.mediaType,
          selected: true,
          fileName: item.fileName,
          title: item.title ?? '',
          sourceText: item.sourceText ?? '',
          inscriptionText: item.inscriptionText ?? '',
          description: item.description ?? '',
          personLinks: combinedLinks,
          showDetails: false,
          isBetweenRange: item.betweenRange === true,
          dateQualifier: item.dateQualifier ?? 'EXACT',
          year: numToStr(item.year),
          month: numToStr(item.month),
          day: numToStr(item.day),
          timeQualifier: item.timeQualifier ?? 'EXACT',
          hour: numToStr(item.hour),
          minute: numToStr(item.minute),
          second: numToStr(item.second),
          rangeEndQualifier: item.rangeEndQualifier ?? 'EXACT',
          rangeEndYear: numToStr(item.rangeEndYear),
          rangeEndMonth: numToStr(item.rangeEndMonth),
          rangeEndDay: numToStr(item.rangeEndDay),
          rangeEndTimeQualifier: item.rangeEndTimeQualifier ?? 'EXACT',
          rangeEndHour: numToStr(item.rangeEndHour),
          rangeEndMinute: numToStr(item.rangeEndMinute),
          rangeEndSecond: numToStr(item.rangeEndSecond),
        };
      })
    );
  }, [isBulkEditMode, effectiveItems]);

  // Keep directory preview updated with untouchable event date prefix (Point 12)
  const refreshDirectoryPreview = async (
    firstFile: File | undefined,
    folderNameOverride: string,
    colIdStr: string
  ) => {
    if (!firstFile) {
      setDirectoryPreview('');
      return 'family_media';
    }
    try {
      const parsedManualYear =
        manualBulkYear.trim() !== '' ? Number(manualBulkYear) : undefined;
      const preview = await mediaApi.previewFilename({
        primaryContext: uploadIsPortrait ? 'PERSON' : context,
        graveId,
        personId,
        eventId,
        collectionId: colIdStr !== '' ? Number(colIdStr) : undefined,
        customYear: dateSourceMode === 'EVENT_OR_MANUAL' ? parsedManualYear : undefined,
        customFolderName: folderNameOverride.trim() || undefined,
        originalFilename: firstFile.name,
        mimeType: firstFile.type,
        portraitMedia: uploadIsPortrait,
        unknownMedia: uploadIsUnknown,
        personsCount: uploadPortraitType === 'GROUP' ? 2 : 1,
      });
      setDirectoryPreview(preview.directoryPath);
      return preview.suggestedFileName.replace(/\.[^.]+$/, '').replace(/_\d+$/, '');
    } catch {
      return 'family_media';
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    for (const old of stagedFiles) {
      if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
    }
    if (!fileList || fileList.length === 0) {
      setStagedFiles([]);
      setDirectoryPreview('');
      return;
    }
    const filesArray = Array.from(fileList);
    const firstFile = filesArray[0];

    const baseStem = await refreshDirectoryPreview(
      firstFile,
      customFolderName,
      uploadCollectionId
    );
    setBulkBaseName(baseStem);

    const extractedLists = await Promise.all(
      filesArray.map(f => extractAllClientFileMetadata(f))
    );

    const staged: StagedUploadFile[] = filesArray.map((f, idx) => {
      const ext = f.name.includes('.')
        ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
        : 'jpg';
      const metaList = extractedLists.at(idx) ?? [];
      const primaryMeta = metaList.at(0);

      let y = '';
      let m = '';
      let d = '';
      let h = '';
      let min = '';
      let sec = '';
      if (dateSourceMode === 'FILE_METADATA' && primaryMeta) {
        y = String(primaryMeta.year);
        m = String(primaryMeta.month);
        d = String(primaryMeta.day);
        h = String(primaryMeta.hour);
        min = String(primaryMeta.minute);
        sec = String(primaryMeta.second);
      } else if (dateSourceMode === 'EVENT_OR_MANUAL') {
        y = manualBulkYear;
        m = manualBulkMonth;
        d = manualBulkDay;
        h = manualBulkHour;
        min = manualBulkMinute;
        sec = manualBulkSecond;
      }

      const suffix = String(idx + 1).padStart(2, '0');
      const previewUrl =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '';

      return {
        file: f,
        previewUrl,
        mediaType: detectFileMediaType(f),
        selectedForBulk: true,
        customFileName: `${baseStem}_${suffix}.${ext}`,
        title: bulkTitle.trim() || '',
        sourceText: bulkSourceText.trim() || undefined,
        inscriptionText: bulkInscriptionText.trim() || undefined,
        description: bulkDescription.trim() || undefined,
        personLinks: bulkPersonLinks.length > 0 ? [...bulkPersonLinks] : [],
        showDetails: false,
        isBetweenRange: dateSourceMode === 'EVENT_OR_MANUAL' ? uploadIsRange : false,
        dateQualifier: dateSourceMode === 'FILE_METADATA' ? 'EXACT' : manualBulkQual,
        year: y,
        month: m,
        day: d,
        timeQualifier: dateSourceMode === 'FILE_METADATA' ? 'EXACT' : manualBulkTimeQual,
        hour: h,
        minute: min,
        second: sec,
        rangeEndQualifier: manualBulkRangeEndQual,
        rangeEndYear: manualBulkRangeEndYear,
        rangeEndMonth: manualBulkRangeEndMonth,
        rangeEndDay: manualBulkRangeEndDay,
        rangeEndTimeQualifier: manualBulkRangeEndTimeQual,
        rangeEndHour: manualBulkRangeEndHour,
        rangeEndMinute: manualBulkRangeEndMinute,
        rangeEndSecond: manualBulkRangeEndSecond,
        metadataOptions: metaList,
        selectedMetadataTag: primaryMeta ? primaryMeta.sourceTag : '',
      };
    });

    setStagedFiles(staged);
  };

  const handleApplyBulkDetailsToSelectedStaged = () => {
    setStagedFiles(prev =>
      prev.map(item =>
        !item.selectedForBulk
          ? item
          : {
              ...item,
              title: bulkTitle.trim() || item.title,
              sourceText: bulkSourceText.trim() || item.sourceText,
              inscriptionText: bulkInscriptionText.trim() || item.inscriptionText,
              description: bulkDescription.trim() || item.description,
              personLinks:
                bulkPersonLinks.length > 0 ? [...bulkPersonLinks] : item.personLinks,
            }
      )
    );
  };

  const handleSearchPersonForBulk = async () => {
    if (bulkLinkPersonQuery.trim() === '') return;
    try {
      const res = await biographyApi.listPeople({
        search: bulkLinkPersonQuery.trim(),
        page: 0,
        size: 8,
      });
      setBulkLinkPersonResults(res.content);
    } catch {
      setBulkLinkPersonResults([]);
    }
  };

  const handleAddDbPersonToBulk = (p: PersonListItemDto) => {
    const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    setBulkPersonLinks(prev => [
      ...prev,
      {
        personId: p.id,
        linkType: bulkLinkRoleType,
        displayLabel: `${PERSON_LINK_TYPE_LABELS[bulkLinkRoleType]}: ${fullName}`,
      },
    ]);
    setBulkLinkPersonResults([]);
    setBulkLinkPersonQuery('');
  };

  const handleAddTextPersonToBulk = () => {
    const txt = bulkLinkTextInput.trim();
    if (txt === '') return;
    setBulkPersonLinks(prev => [
      ...prev,
      {
        personText: txt,
        personSex: bulkLinkTextSex,
        linkType: bulkLinkRoleType,
        displayLabel: `${PERSON_LINK_TYPE_LABELS[bulkLinkRoleType]}: ${txt} [spoza bazy]`,
      },
    ]);
    setBulkLinkTextInput('');
  };

  const handleSearchPersonForStaged = async (idx: number) => {
    if (stagedPersonQuery.trim() === '') return;
    try {
      const res = await biographyApi.listPeople({
        search: stagedPersonQuery.trim(),
        page: 0,
        size: 8,
      });
      setActiveStagedSearchIdx(idx);
      setStagedPersonResults(res.content);
    } catch {
      setStagedPersonResults([]);
    }
  };

  const handleAddDbPersonToStaged = (idx: number, p: PersonListItemDto) => {
    const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    setStagedFiles(prev =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              personLinks: [
                ...(item.personLinks ?? []),
                {
                  personId: p.id,
                  linkType: stagedLinkRoleType,
                  displayLabel: `${PERSON_LINK_TYPE_LABELS[stagedLinkRoleType]}: ${fullName}`,
                },
              ],
            }
          : item
      )
    );
    setStagedPersonResults([]);
    setStagedPersonQuery('');
  };

  const handleAddTextPersonToStaged = (idx: number) => {
    const txt = stagedTextPersonInput.trim();
    if (txt === '') return;
    setStagedFiles(prev =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              personLinks: [
                ...(item.personLinks ?? []),
                {
                  personText: txt,
                  personSex: stagedTextPersonSex,
                  linkType: stagedLinkRoleType,
                  displayLabel: `${PERSON_LINK_TYPE_LABELS[stagedLinkRoleType]}: ${txt} [spoza bazy]`,
                },
              ],
            }
          : item
      )
    );
    setStagedTextPersonInput('');
  };

  const handleRemovePersonFromStaged = (idx: number, linkIdx: number) => {
    setStagedFiles(prev =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              personLinks: (item.personLinks ?? []).filter((_, pi) => pi !== linkIdx),
            }
          : item
      )
    );
  };

  const applyBulkSettingsToStaged = (
    nextMode: DateSourceMode,
    nextY: string,
    nextM: string,
    nextD: string,
    nextH: string,
    nextMin: string,
    nextSec: string,
    nextBaseStem: string,
    nextIsRange = uploadIsRange,
    nextQual = manualBulkQual,
    nextTimeQual = manualBulkTimeQual,
    nextREndQual = manualBulkRangeEndQual,
    nextREndY = manualBulkRangeEndYear,
    nextREndM = manualBulkRangeEndMonth,
    nextREndD = manualBulkRangeEndDay,
    nextREndTQual = manualBulkRangeEndTimeQual,
    nextREndH = manualBulkRangeEndHour,
    nextREndMin = manualBulkRangeEndMinute,
    nextREndSec = manualBulkRangeEndSecond
  ) => {
    const cleanStem =
      nextBaseStem
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'media';

    setStagedFiles(prev =>
      prev.map((item, idx) => {
        if (!item.selectedForBulk) return item;
        const ext = item.file.name.includes('.')
          ? item.file.name.slice(item.file.name.lastIndexOf('.') + 1).toLowerCase()
          : 'jpg';
        const suffix = String(idx + 1).padStart(2, '0');

        let y = '';
        let m = '';
        let d = '';
        let h = '';
        let min = '';
        let sec = '';
        const chosenMeta =
          item.metadataOptions.find(o => o.sourceTag === item.selectedMetadataTag) ??
          item.metadataOptions.at(0);

        if (nextMode === 'FILE_METADATA' && chosenMeta) {
          y = String(chosenMeta.year);
          m = String(chosenMeta.month);
          d = String(chosenMeta.day);
          h = String(chosenMeta.hour);
          min = String(chosenMeta.minute);
          sec = String(chosenMeta.second);
        } else if (nextMode === 'EVENT_OR_MANUAL') {
          y = nextY;
          m = nextM;
          d = nextD;
          h = nextH;
          min = nextMin;
          sec = nextSec;
        }

        return {
          ...item,
          customFileName: `${cleanStem}_${suffix}.${ext}`,
          isBetweenRange: nextMode === 'EVENT_OR_MANUAL' ? nextIsRange : false,
          dateQualifier: nextMode === 'FILE_METADATA' ? 'EXACT' : nextQual,
          year: y,
          month: m,
          day: d,
          timeQualifier: nextMode === 'FILE_METADATA' ? 'EXACT' : nextTimeQual,
          hour: h,
          minute: min,
          second: sec,
          rangeEndQualifier: nextREndQual,
          rangeEndYear: nextREndY,
          rangeEndMonth: nextREndM,
          rangeEndDay: nextREndD,
          rangeEndTimeQualifier: nextREndTQual,
          rangeEndHour: nextREndH,
          rangeEndMinute: nextREndMin,
          rangeEndSecond: nextREndSec,
        };
      })
    );
  };

  const needsCollectionForUpload =
    context === 'COLLECTION' ||
    (context === 'EVENT' && !defaultEventYear) ||
    (context === 'PERSON' && stagedFiles.some(s => s.year.trim() === ''));

  const handleUploadSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stagedFiles.length === 0) return;

    const resolvedColId =
      uploadCollectionId.trim() !== '' ? Number(uploadCollectionId) : undefined;
    if (needsCollectionForUpload && resolvedColId === undefined && context !== 'GRAVE') {
      const anyUndated = stagedFiles.some(s => s.year.trim() === '') || (context === 'EVENT' && !defaultEventYear);
      if (anyUndated) {
        setErrorMessage('Wybierz kolekcję docelową dla wgrywanych plików bez ustalonej daty.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetPersonIds =
      personId !== undefined ? [personId] : (defaultPersonIds ?? []);
    const effectiveContext: MediaPrimaryContext =
      uploadIsPortrait && context === 'COLLECTION' ? 'PERSON' : context;

    try {
      if (stagedFiles.length === 1) {
        const single = stagedFiles[0];
        const created = await mediaApi.uploadMedia({
          file: single.file,
          primaryContext: effectiveContext,
          customFolderName: optTrim(customFolderName),
          customFileName: single.customFileName,
          title: optTrim(single.title),
          sourceText: optTrim(single.sourceText),
          inscriptionText: optTrim(single.inscriptionText),
          description: optTrim(single.description),
          graveId,
          eventId,
          collectionId: resolvedColId,
          isBetweenRange: single.isBetweenRange,
          dateQualifier: single.dateQualifier,
          customYear: parseOptInt(single.year) ?? undefined,
          customMonth: parseOptInt(single.month) ?? undefined,
          customDay: parseOptInt(single.day) ?? undefined,
          timeQualifier: single.timeQualifier,
          customHour: parseOptInt(single.hour) ?? undefined,
          customMinute: parseOptInt(single.minute) ?? undefined,
          customSecond: parseOptInt(single.second) ?? undefined,
          rangeEndQualifier: single.isBetweenRange ? single.rangeEndQualifier : undefined,
          rangeEndYear: single.isBetweenRange
            ? (parseOptInt(single.rangeEndYear) ?? undefined)
            : undefined,
          rangeEndMonth: single.isBetweenRange
            ? (parseOptInt(single.rangeEndMonth) ?? undefined)
            : undefined,
          rangeEndDay: single.isBetweenRange
            ? (parseOptInt(single.rangeEndDay) ?? undefined)
            : undefined,
          rangeEndTimeQualifier: single.isBetweenRange
            ? single.rangeEndTimeQualifier
            : undefined,
          rangeEndHour: single.isBetweenRange
            ? (parseOptInt(single.rangeEndHour) ?? undefined)
            : undefined,
          rangeEndMinute: single.isBetweenRange
            ? (parseOptInt(single.rangeEndMinute) ?? undefined)
            : undefined,
          rangeEndSecond: single.isBetweenRange
            ? (parseOptInt(single.rangeEndSecond) ?? undefined)
            : undefined,
          selectedMetadataSourceTag: optTrim(single.selectedMetadataTag),
          clientLastModifiedMs:
            single.file.lastModified > 0 ? single.file.lastModified : undefined,
          personIds:
            uploadPortraitType === 'GROUP' && targetPersonIds.length <= 1
              ? [...targetPersonIds, -1].filter(id => id > 0)
              : targetPersonIds,
          portraitMedia:
            effectiveContext === 'PERSON' ? uploadPortraitType === 'SINGLE' : uploadIsPortrait,
          unknownMedia: uploadIsUnknown,
          setAsPersonAvatar: context === 'PERSON' && setAsPrimary,
          setAsGravePrimary: context === 'GRAVE' && setAsPrimary,
        });

        if (single.personLinks && single.personLinks.length > 0) {
          await mediaApi.updateMedia(created.id, {
            title: optTrim(single.title) ?? created.title,
            sourceText: optTrim(single.sourceText) ?? created.sourceText,
            inscriptionText: optTrim(single.inscriptionText) ?? created.inscriptionText,
            description: optTrim(single.description) ?? created.description,
            personLinks: single.personLinks.map(l => ({
              personId: l.personId,
              personText: l.personText,
              personSex: l.personSex,
              linkType: l.linkType,
            })),
          });
        }
      } else {
        const createdBatch = await mediaApi.uploadBatchMedia({
          files: stagedFiles.map(s => s.file),
          primaryContext: effectiveContext,
          customFolderName: optTrim(customFolderName),
          customFileNames: stagedFiles.map(s => s.customFileName),
          titles: stagedFiles.map(s => s.title),
          customYears: stagedFiles.map(s => parseOptInt(s.year)),
          customMonths: stagedFiles.map(s => parseOptInt(s.month)),
          customDays: stagedFiles.map(s => parseOptInt(s.day)),
          customHours: stagedFiles.map(s => parseOptInt(s.hour)),
          customMinutes: stagedFiles.map(s => parseOptInt(s.minute)),
          customSeconds: stagedFiles.map(s => parseOptInt(s.second)),
          selectedMetadataSourceTags: stagedFiles.map(
            s => optTrim(s.selectedMetadataTag) ?? null
          ),
          clientLastModifiedList: stagedFiles.map(s =>
            s.file.lastModified > 0 ? s.file.lastModified : null
          ),
          graveId,
          eventId,
          collectionId: resolvedColId,
          defaultYear:
            dateSourceMode === 'EVENT_OR_MANUAL' ? parseOptInt(manualBulkYear) : null,
          personIds: targetPersonIds,
          portraitMedia:
            effectiveContext === 'PERSON' ? uploadPortraitType === 'SINGLE' : uploadIsPortrait,
          unknownMedia: uploadIsUnknown,
        });

        for (let i = 0; i < createdBatch.length; i++) {
          const st = stagedFiles[i];
          const createdItem = createdBatch[i];
          const hasExtraDetails =
            st.isBetweenRange ||
            st.dateQualifier !== 'EXACT' ||
            st.timeQualifier !== 'EXACT' ||
            Boolean(optTrim(st.sourceText)) ||
            Boolean(optTrim(st.inscriptionText)) ||
            Boolean(optTrim(st.description)) ||
            (st.personLinks !== undefined && st.personLinks.length > 0);

          if (hasExtraDetails) {
            await mediaApi.updateMedia(createdItem.id, {
              title: optTrim(st.title) ?? createdItem.title,
              sourceText: optTrim(st.sourceText) ?? createdItem.sourceText,
              inscriptionText: optTrim(st.inscriptionText) ?? createdItem.inscriptionText,
              description: optTrim(st.description) ?? createdItem.description,
              dateSourceMode: 'MANUAL',
              isBetweenRange: st.isBetweenRange,
              dateQualifier: st.dateQualifier,
              year: parseOptInt(st.year),
              month: parseOptInt(st.month),
              day: parseOptInt(st.day),
              timeQualifier: st.timeQualifier,
              hour: parseOptInt(st.hour),
              minute: parseOptInt(st.minute),
              second: parseOptInt(st.second),
              rangeEndQualifier: st.isBetweenRange ? st.rangeEndQualifier : null,
              rangeEndYear: st.isBetweenRange ? parseOptInt(st.rangeEndYear) : null,
              rangeEndMonth: st.isBetweenRange ? parseOptInt(st.rangeEndMonth) : null,
              rangeEndDay: st.isBetweenRange ? parseOptInt(st.rangeEndDay) : null,
              rangeEndTimeQualifier: st.isBetweenRange ? st.rangeEndTimeQualifier : null,
              rangeEndHour: st.isBetweenRange ? parseOptInt(st.rangeEndHour) : null,
              rangeEndMinute: st.isBetweenRange ? parseOptInt(st.rangeEndMinute) : null,
              rangeEndSecond: st.isBetweenRange ? parseOptInt(st.rangeEndSecond) : null,
              personLinks: st.personLinks?.map(l => ({
                personId: l.personId,
                personText: l.personText,
                personSex: l.personSex,
                linkType: l.linkType,
              })),
            });
          }
        }
      }

      closeUploadModal();
      setStagedFiles([]);
      setCustomFolderName('');
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się wgrać plików.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmLinkExisting = async (selectedIds: number[]) => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await mediaApi.linkExistingMedia({
        mediaIds: selectedIds,
        graveId: graveId ?? null,
        personId: personId ?? null,
        eventId: eventId ?? null,
        collectionId: collectionId ?? null,
      });
      setShowLinkExistingModal(false);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się przypisać wybranych plików z galerii.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyBulkToDraftList = () => {
    const cleanStem =
      bulkEditStem
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || '';

    let counter = 1;
    setBulkDraftItems(prev =>
      prev.map(d => {
        if (!d.selected) return d;
        const ext = d.fileName.includes('.')
          ? d.fileName.slice(d.fileName.lastIndexOf('.') + 1).toLowerCase()
          : 'jpg';
        const nextFileName = cleanStem
          ? `${cleanStem}_${String(counter++).padStart(2, '0')}.${ext}`
          : d.fileName;

        return {
          ...d,
          fileName: nextFileName,
          title: bulkTitle.trim() || d.title,
          sourceText: bulkSourceText.trim() || d.sourceText,
          inscriptionText: bulkInscriptionText.trim() || d.inscriptionText,
          description: bulkDescription.trim() || d.description,
          personLinks: bulkPersonLinks.length > 0 ? [...bulkPersonLinks] : d.personLinks,
          isBetweenRange:
            bulkEditDateMode === 'MANUAL' ? bulkEditIsBetween : d.isBetweenRange,
          dateQualifier:
            bulkEditDateMode === 'MANUAL' ? bulkEditDateQual : d.dateQualifier,
          year: bulkEditDateMode === 'MANUAL' ? bulkEditYear : d.year,
          month: bulkEditDateMode === 'MANUAL' ? bulkEditMonth : d.month,
          day: bulkEditDateMode === 'MANUAL' ? bulkEditDay : d.day,
          timeQualifier:
            bulkEditDateMode === 'MANUAL' ? bulkEditTimeQual : d.timeQualifier,
          hour: bulkEditDateMode === 'MANUAL' ? bulkEditHour : d.hour,
          minute: bulkEditDateMode === 'MANUAL' ? bulkEditMinute : d.minute,
          second: bulkEditDateMode === 'MANUAL' ? bulkEditSecond : d.second,
          rangeEndQualifier:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndQual : d.rangeEndQualifier,
          rangeEndYear:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndYear : d.rangeEndYear,
          rangeEndMonth:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndMonth : d.rangeEndMonth,
          rangeEndDay:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndDay : d.rangeEndDay,
          rangeEndTimeQualifier:
            bulkEditDateMode === 'MANUAL'
              ? bulkEditRangeEndTimeQual
              : d.rangeEndTimeQualifier,
          rangeEndHour:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndHour : d.rangeEndHour,
          rangeEndMinute:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndMinute : d.rangeEndMinute,
          rangeEndSecond:
            bulkEditDateMode === 'MANUAL' ? bulkEditRangeEndSecond : d.rangeEndSecond,
        };
      })
    );
  };

  const handleApplyBulkEdit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectedDrafts = bulkDraftItems.filter(d => d.selected);
    if (selectedDrafts.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await mediaApi.bulkUpdateMedia({
        mediaIds: selectedDrafts.map(d => d.id),
        baseFileNameStem: bulkEditStem.trim() || null,
        customFolderName: bulkEditFolder.trim() || null,
        contextEventId: eventId ?? null,
        targetCollectionId:
          bulkEditTargetCollectionId !== '' ? Number(bulkEditTargetCollectionId) : null,
        title: bulkTitle.trim() || null,
        sourceText: bulkSourceText.trim() || null,
        inscriptionText: bulkInscriptionText.trim() || null,
        description: bulkDescription.trim() || null,
        personLinks:
          bulkPersonLinks.length > 0
            ? bulkPersonLinks.map(l => ({
                personId: l.personId,
                personText: l.personText,
                personSex: l.personSex,
                linkType: l.linkType,
              }))
            : undefined,
        dateSourceMode: bulkEditDateMode,
        selectedMetadataSourceTag: bulkEditMetadataTag || null,
        isBetweenRange: bulkEditIsBetween,
        dateQualifier: bulkEditDateQual,
        year: parseOptInt(bulkEditYear),
        month: parseOptInt(bulkEditMonth),
        day: parseOptInt(bulkEditDay),
        timeQualifier: bulkEditTimeQual,
        hour: parseOptInt(bulkEditHour),
        minute: parseOptInt(bulkEditMinute),
        second: parseOptInt(bulkEditSecond),
        rangeEndQualifier: bulkEditRangeEndQual,
        rangeEndYear: parseOptInt(bulkEditRangeEndYear),
        rangeEndMonth: parseOptInt(bulkEditRangeEndMonth),
        rangeEndDay: parseOptInt(bulkEditRangeEndDay),
        rangeEndTimeQualifier: bulkEditRangeEndTimeQual,
        rangeEndHour: parseOptInt(bulkEditRangeEndHour),
        rangeEndMinute: parseOptInt(bulkEditRangeEndMinute),
        rangeEndSecond: parseOptInt(bulkEditRangeEndSecond),
      });

      // Also persist any per-item edits made directly on the draft rows
      if (bulkEditStem.trim() === '' && bulkEditDateMode === 'NO_CHANGE') {
        for (const d of selectedDrafts) {
          const orig = effectiveItems.find(m => m.id === d.id);
          if (!orig) continue;
          const fileNameChanged = d.fileName.trim() !== '' && d.fileName !== orig.fileName;
          const titleChanged = d.title !== (orig.title ?? '');
          const descChanged = d.description !== (orig.description ?? '');
          const inscrChanged = d.inscriptionText !== (orig.inscriptionText ?? '');
          const srcChanged = d.sourceText !== (orig.sourceText ?? '');
          const yearChanged = d.year !== numToStr(orig.year);
          const betweenChanged = d.isBetweenRange !== (orig.betweenRange === true);

          if (
            fileNameChanged ||
            titleChanged ||
            descChanged ||
            inscrChanged ||
            srcChanged ||
            yearChanged ||
            betweenChanged ||
            d.showDetails
          ) {
            await mediaApi.updateMedia(d.id, {
              fileName: d.fileName,
              title: d.title,
              sourceText: d.sourceText,
              inscriptionText: d.inscriptionText,
              description: d.description,
              dateSourceMode: 'MANUAL',
              isBetweenRange: d.isBetweenRange,
              dateQualifier: d.dateQualifier,
              year: parseOptInt(d.year),
              month: parseOptInt(d.month),
              day: parseOptInt(d.day),
              timeQualifier: d.timeQualifier,
              hour: parseOptInt(d.hour),
              minute: parseOptInt(d.minute),
              second: parseOptInt(d.second),
              rangeEndQualifier: d.isBetweenRange ? d.rangeEndQualifier : null,
              rangeEndYear: d.isBetweenRange ? parseOptInt(d.rangeEndYear) : null,
              rangeEndMonth: d.isBetweenRange ? parseOptInt(d.rangeEndMonth) : null,
              rangeEndDay: d.isBetweenRange ? parseOptInt(d.rangeEndDay) : null,
              rangeEndTimeQualifier: d.isBetweenRange ? d.rangeEndTimeQualifier : null,
              rangeEndHour: d.isBetweenRange ? parseOptInt(d.rangeEndHour) : null,
              rangeEndMinute: d.isBetweenRange ? parseOptInt(d.rangeEndMinute) : null,
              rangeEndSecond: d.isBetweenRange ? parseOptInt(d.rangeEndSecond) : null,
              personLinks: d.personLinks.map(l => ({
                personId: l.personId,
                personText: l.personText,
                personSex: l.personSex,
                linkType: l.linkType,
              })),
            });
          }
        }
      }

      closeBulkEditModal();
      setBulkEditFolder('');
      setBulkEditStem('');
      setBulkEditTargetCollectionId('');
      setBulkEditDateMode('NO_CHANGE');
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się zapisać zmian zbiorowych.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenLightbox = (item: MediaItemDto) => {
    const idx = allViewableItems.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
  };

  const renderMediaGrid = (mediaList: MediaItemDto[]) => (
    <div className={styles.mediaGrid}>
      {mediaList.map(item => {
        const isPrimary = primaryMediaId === item.id;
        return (
          <div key={item.id} className={styles.mediaTileWrapper}>
            <button
              type="button"
              data-testid={`media-tile-${String(item.id)}`}
              onClick={() => {
                handleOpenLightbox(item);
              }}
              className={`${styles.mediaTile} ${isPrimary ? styles.mediaTilePrimary : ''}`}
            >
              <div className={styles.thumbWrapper}>
                {item.mediaType === 'IMAGE' ? (
                  <img
                    src={mediaApi.getThumbnailUrl(item.id)}
                    alt={item.title ?? ''}
                    className={styles.thumbImage}
                  />
                ) : item.mediaType === 'VIDEO' ? (
                  <>
                    <video
                      src={`${mediaApi.getFileUrl(item.id)}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className={styles.thumbImage}
                    />
                    <span className={styles.videoPlayOverlay}>▶</span>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
                      color: '#ffffff',
                    }}
                  >
                    <span style={{ fontSize: '2.5rem' }}>🎵</span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Audio
                    </span>
                  </div>
                )}
                {isPrimary && (context !== 'GRAVE' || isAdmin) && (
                  <span className={styles.primaryBadge}>
                    ⭐ {context === 'GRAVE' ? 'Zdjęcie główne' : 'Portret główny'}
                  </span>
                )}
                {(item.dateText ?? item.year) && (
                  <span className={styles.dateCornerBadge}>
                    {item.dateText ?? item.year}
                  </span>
                )}
              </div>
              {item.title && (
                <div className={styles.tileBody}>
                  <div className={styles.tileTitle}>{item.title}</div>
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );

  const selectedStagedCount = stagedFiles.filter(s => s.selectedForBulk).length;
  const selectedBulkDraftCount = bulkDraftItems.filter(d => d.selected).length;
  const bulkUploadStartWeekday = getPolishWeekdayLabel(
    manualBulkYear,
    manualBulkMonth,
    manualBulkDay
  );
  const bulkUploadEndWeekday = getPolishWeekdayLabel(
    manualBulkRangeEndYear,
    manualBulkRangeEndMonth,
    manualBulkRangeEndDay
  );
  const bulkEditStartWeekday = getPolishWeekdayLabel(
    bulkEditYear,
    bulkEditMonth,
    bulkEditDay
  );
  const bulkEditEndWeekday = getPolishWeekdayLabel(
    bulkEditRangeEndYear,
    bulkEditRangeEndMonth,
    bulkEditRangeEndDay
  );

  return (
    <section
      className={hideSectionChrome ? undefined : styles.sectionCard}
      data-testid="media-gallery-section"
    >
      {!hideSectionChrome && (
        <>
          <div className={styles.headerRow}>
            <h2 className={styles.sectionTitle}>
              {sectionTitle} ({effectiveItems.length})
            </h2>
            {isAdmin && (
              <div className={styles.headerActions}>
                <button
                  type="button"
                  data-testid="toggle-upload-media-button"
                  onClick={() => {
                    setInternalShowUpload(true);
                    setInternalBulkEditMode(false);
                  }}
                  className={styles.btnPrimary}
                >
                  + Wgraj nowe z dysku
                </button>
                <button
                  type="button"
                  data-testid="open-link-existing-media-button"
                  onClick={() => {
                    setShowLinkExistingModal(true);
                  }}
                  className={styles.btnSecondary}
                >
                  🔗 Wybierz istniejące z galerii
                </button>
                {effectiveItems.length > 0 && (
                  <button
                    type="button"
                    data-testid="toggle-bulk-edit-media-button"
                    onClick={() => {
                      setInternalBulkEditMode(true);
                      setInternalShowUpload(false);
                    }}
                    className={styles.btnSecondary}
                  >
                    ☑️ Edycja zbiorowa
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filter & Sort Toolbar */}
          {totalRawItemsCount > 0 && (
            <div className={styles.toolbarBar} data-testid="media-section-filter-sort-bar">
              <div className={styles.filterPillsGroup}>
                <button
                  type="button"
                  data-testid="media-filter-all"
                  onClick={() => {
                    setTypeFilter('ALL');
                  }}
                  className={`${styles.filterPillBtn} ${
                    typeFilter === 'ALL' ? styles.filterPillBtnActive : ''
                  }`}
                >
                  Wszystkie ({String(totalRawItemsCount)})
                </button>
                <button
                  type="button"
                  data-testid="media-filter-image"
                  onClick={() => {
                    setTypeFilter('IMAGE');
                  }}
                  className={`${styles.filterPillBtn} ${
                    typeFilter === 'IMAGE' ? styles.filterPillBtnActive : ''
                  }`}
                >
                  📷 Tylko zdjęcia ({String(totalImagesCount)})
                </button>
                <button
                  type="button"
                  data-testid="media-filter-video"
                  onClick={() => {
                    setTypeFilter('VIDEO');
                  }}
                  className={`${styles.filterPillBtn} ${
                    typeFilter === 'VIDEO' ? styles.filterPillBtnActive : ''
                  }`}
                >
                  🎬 Tylko filmy ({String(totalVideosCount)})
                </button>
                <button
                  type="button"
                  data-testid="media-filter-audio"
                  onClick={() => {
                    setTypeFilter('AUDIO');
                  }}
                  className={`${styles.filterPillBtn} ${
                    typeFilter === 'AUDIO' ? styles.filterPillBtnActive : ''
                  }`}
                >
                  🎵 Tylko nagrania audio ({String(totalAudiosCount)})
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="section-media-sort-select" className={styles.label}>
                  Sortuj:
                </label>
                <select
                  id="section-media-sort-select"
                  data-testid="section-media-sort-select"
                  value={sortMode}
                  onChange={e => {
                    setSortMode(e.target.value as SectionSortMode);
                  }}
                  className={styles.input}
                  style={{ width: 'auto', minWidth: '220px' }}
                >
                  <option value="DATE_ASC">
                    Chronologicznie – od najstarszych (wg daty i czasu)
                  </option>
                  <option value="DATE_DESC">
                    Chronologicznie – od najnowszych (wg daty i czasu)
                  </option>
                  <option value="NAME_ASC">Alfabetycznie (wg nazwy / tytułu A–Z)</option>
                  <option value="NEWEST_ADDED">Od ostatnio dodanych</option>
                </select>
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              style={{ color: '#dc2626', fontSize: '0.86rem', fontWeight: 600 }}
            >
              {errorMessage}
            </div>
          )}

          {/* Direct Media Grid & Sub-Events Media Grids */}
          {displayedDirectItems.length === 0 && displayedSubGroups.length === 0 ? (
            <p className={styles.emptyText}>Brak przypisanych zdjęć i filmów.</p>
          ) : (
            <>
              {displayedDirectItems.length > 0 && renderMediaGrid(displayedDirectItems)}

              {displayedSubGroups.map(group => (
                <div
                  key={group.subEventId}
                  className={styles.subEventGroupBox}
                  data-testid={`subevent-media-group-${String(group.subEventId)}`}
                >
                  <div className={styles.subEventHeader}>
                    <span className={styles.subEventTitle}>
                      ↳ Zdjęcia i filmy z podwydarzenia: {group.subEventLabel}{' '}
                      {group.dateText ? `(${group.dateText})` : ''}
                    </span>
                    <Link
                      to={`/events/${String(group.subEventId)}`}
                      className={styles.btnSecondary}
                      style={{ textDecoration: 'none' }}
                    >
                      Przejdź do podwydarzenia →
                    </Link>
                  </div>
                  {renderMediaGrid(group.media)}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* =====================================================================
          LARGE MODAL 1: UPLOAD MEDIA (Points 1, 7, 12, 18, 23, 24)
          ===================================================================== */}
      {isAdmin && showUpload && (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            closeUploadModal();
          }}
        >
          <div
            className={styles.modalDialog}
            style={{ maxWidth: '1080px' }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className={styles.modalHeader}>
              <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                📤 Wgraj nowe zdjęcia, filmy lub nagrania audio z dysku
              </strong>
              <button
                type="button"
                onClick={() => {
                  closeUploadModal();
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>

            <form
              onSubmit={e => {
                void handleUploadSubmit(e);
              }}
              className={styles.modalBody}
              data-testid="media-upload-form"
            >
              {errorMessage && (
                <div
                  role="alert"
                  style={{ color: '#dc2626', fontSize: '0.86rem', fontWeight: 600 }}
                >
                  {errorMessage}
                </div>
              )}

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <span className={styles.label}>Wybierz jeden lub wiele plików *</span>
                  <div className={styles.filePickerRow}>
                    <label htmlFor={fileInputId} className={styles.filePickerLabel}>
                      📂 Wybierz pliki z dysku
                    </label>
                    <input
                      id={fileInputId}
                      data-testid="media-file-input"
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*"
                      onChange={e => {
                        void handleFilesSelected(e.target.files);
                      }}
                      className={styles.hiddenFileInput}
                    />
                    <span className={styles.selectedFilesBadge}>
                      {stagedFiles.length === 0
                        ? 'Nie wybrano plików'
                        : `Wybrano plików: ${String(stagedFiles.length)}`}
                    </span>
                  </div>
                </div>

                {/* Point 23 & 24: Target Collection Selector for Gallery or Undated Events */}
                {(context === 'COLLECTION' ||
                  context === 'PERSON' ||
                  (context === 'EVENT' && !defaultEventYear) ||
                  dateSourceMode === 'UNDATED') && (
                  <div className={styles.formField}>
                    <label htmlFor="media-upload-collection-select" className={styles.label}>
                      Kolekcja / Album docelowy{' '}
                      {needsCollectionForUpload ? '* (wymagane dla plików bez daty)' : '(opcjonalnie)'}
                    </label>
                    <select
                      id="media-upload-collection-select"
                      data-testid="media-upload-collection-select"
                      value={uploadCollectionId}
                      onChange={e => {
                        const nextCol = e.target.value;
                        setUploadCollectionId(nextCol);
                        void refreshDirectoryPreview(
                          stagedFiles.at(0)?.file,
                          customFolderName,
                          nextCol
                        );
                      }}
                      className={styles.input}
                    >
                      <option value="">— Wybierz kolekcję lub album datowany —</option>
                      {availableCollections.map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {c.datedCollection
                            ? `📅 [Album ${String(c.startYear ?? '')}] `
                            : '📦 '}
                          {c.parentCollectionName ? `${c.parentCollectionName} › ` : ''}
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.formField}>
                  <label htmlFor="media-custom-folder-input" className={styles.label}>
                    Własna nazwa folderu docelowego (snake_case, opcjonalnie)
                  </label>
                  <input
                    id="media-custom-folder-input"
                    type="text"
                    placeholder="Zostaw puste, aby użyć proponowanej nazwy..."
                    value={customFolderName}
                    onChange={e => {
                      const nextFolder = e.target.value;
                      setCustomFolderName(nextFolder);
                      void refreshDirectoryPreview(
                        stagedFiles.at(0)?.file,
                        nextFolder,
                        uploadCollectionId
                      );
                    }}
                    className={styles.input}
                  />
                </div>

                {context !== 'GRAVE' && (
                  <div className={styles.formField}>
                    <label htmlFor="media-date-mode-select" className={styles.label}>
                      Zbiorcze ustawienie daty i czasu dla zaznaczonych
                    </label>
                    <select
                      id="media-date-mode-select"
                      value={dateSourceMode}
                      onChange={e => {
                        const nextMode = e.target.value as DateSourceMode;
                        setDateSourceMode(nextMode);
                        applyBulkSettingsToStaged(
                          nextMode,
                          manualBulkYear,
                          manualBulkMonth,
                          manualBulkDay,
                          manualBulkHour,
                          manualBulkMinute,
                          manualBulkSecond,
                          bulkBaseName
                        );
                      }}
                      className={styles.input}
                    >
                      <option value="FILE_METADATA">
                        Pobierz pełną datę i czas z metadanych każdego pliku (EXIF / MP4 / plik)
                      </option>
                      <option value="EVENT_OR_MANUAL">
                        Użyj daty wydarzenia / wspólnej daty i czasu ręcznego
                      </option>
                      <option value="UNDATED">
                        Bez daty – zapisz jako niedatowane (undated)
                      </option>
                    </select>
                  </div>
                )}

                {stagedFiles.length > 1 && (
                  <div className={styles.formField}>
                    <label htmlFor="media-bulk-stem-input" className={styles.label}>
                      Wspólny trzon nazwy dla zaznaczonych (snake_case)
                    </label>
                    <input
                      id="media-bulk-stem-input"
                      type="text"
                      value={bulkBaseName}
                      onChange={e => {
                        const nextStem = e.target.value;
                        setBulkBaseName(nextStem);
                        applyBulkSettingsToStaged(
                          dateSourceMode,
                          manualBulkYear,
                          manualBulkMonth,
                          manualBulkDay,
                          manualBulkHour,
                          manualBulkMinute,
                          manualBulkSecond,
                          nextStem
                        );
                      }}
                      className={styles.input}
                    />
                  </div>
                )}
              </div>

              {/* Portrait & Unknown options */}
              {(context === 'PERSON' || context === 'COLLECTION') && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1.25rem',
                    alignItems: 'center',
                    padding: '0.65rem 0.9rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  {context === 'COLLECTION' && (
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={uploadIsPortrait}
                        onChange={e => {
                          setUploadIsPortrait(e.target.checked);
                          if (e.target.checked) setUploadIsUnknown(false);
                        }}
                      />
                      <span>Portret (zdjęcie portretowe osoby)</span>
                    </label>
                  )}

                  {(context === 'PERSON' || uploadIsPortrait) && (
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.83rem',
                          fontWeight: 600,
                        }}
                      >
                        <input
                          type="radio"
                          name="personPortraitType"
                          checked={uploadPortraitType === 'SINGLE'}
                          onChange={() => {
                            setUploadPortraitType('SINGLE');
                          }}
                        />
                        <span>👤 Portret pojedynczy (jednoosobowy – portraits/single)</span>
                      </label>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.83rem',
                          fontWeight: 600,
                        }}
                      >
                        <input
                          type="radio"
                          name="personPortraitType"
                          checked={uploadPortraitType === 'GROUP'}
                          onChange={() => {
                            setUploadPortraitType('GROUP');
                          }}
                        />
                        <span>👥 Portret grupowy (wieloosobowy – portraits/group)</span>
                      </label>
                    </div>
                  )}

                  {context === 'COLLECTION' && (
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={uploadIsUnknown}
                        onChange={e => {
                          setUploadIsUnknown(e.target.checked);
                          if (e.target.checked) setUploadIsPortrait(false);
                        }}
                      />
                      <span>Oznacz jako nieznane (trafi do podfolderu unknown)</span>
                    </label>
                  )}
                </div>
              )}

              {/* Point 7: Bulk Manual Date with "Przedział niepewności „między … a …”" & Aligned Calendar */}
              {context !== 'GRAVE' && dateSourceMode === 'EVENT_OR_MANUAL' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    background: '#f8fafc',
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <span className={styles.label} style={{ margin: 0 }}>
                      {uploadIsRange
                        ? '📅 Pierwsza granica daty („między…”):'
                        : '📅 Data i czas wykonania dla zaznaczonych:'}
                    </span>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={uploadIsRange}
                        onChange={e => {
                          const nextR = e.target.checked;
                          setUploadIsRange(nextR);
                          applyBulkSettingsToStaged(
                            dateSourceMode,
                            manualBulkYear,
                            manualBulkMonth,
                            manualBulkDay,
                            manualBulkHour,
                            manualBulkMinute,
                            manualBulkSecond,
                            bulkBaseName,
                            nextR
                          );
                        }}
                      />
                      <span>Przedział niepewności „między … a …”</span>
                    </label>
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <span className={styles.label}>Kwalifikator daty</span>
                      <select
                        value={manualBulkQual}
                        onChange={e => {
                          const v = e.target.value;
                          setManualBulkQual(v);
                          applyBulkSettingsToStaged(
                            dateSourceMode,
                            manualBulkYear,
                            manualBulkMonth,
                            manualBulkDay,
                            manualBulkHour,
                            manualBulkMinute,
                            manualBulkSecond,
                            bulkBaseName,
                            uploadIsRange,
                            v
                          );
                        }}
                        className={styles.input}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>
                        Wybór z kalendarza{' '}
                        {bulkUploadStartWeekday ? `(📅 ${bulkUploadStartWeekday})` : ''}
                      </span>
                      <input
                        type="date"
                        value={toIsoDateInputValue(
                          manualBulkYear,
                          manualBulkMonth,
                          manualBulkDay
                        )}
                        onChange={e => {
                          if (e.target.value) {
                            const p = e.target.value.split('-');
                            if (p.length === 3) {
                              const y = String(Number(p[0]));
                              const m = String(Number(p[1]));
                              const d = String(Number(p[2]));
                              setManualBulkYear(y);
                              setManualBulkMonth(m);
                              setManualBulkDay(d);
                              applyBulkSettingsToStaged(
                                dateSourceMode,
                                y,
                                m,
                                d,
                                manualBulkHour,
                                manualBulkMinute,
                                manualBulkSecond,
                                bulkBaseName
                              );
                            }
                          }
                        }}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>Rok / Miesiąc / Dzień</span>
                      <div className={styles.compactDateTimeInputs}>
                        <input
                          type="number"
                          placeholder="RRRR"
                          value={manualBulkYear}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkYear(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              v,
                              manualBulkMonth,
                              manualBulkDay,
                              manualBulkHour,
                              manualBulkMinute,
                              manualBulkSecond,
                              bulkBaseName
                            );
                          }}
                          className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                        />
                        <input
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={manualBulkMonth}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkMonth(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              manualBulkYear,
                              v,
                              manualBulkDay,
                              manualBulkHour,
                              manualBulkMinute,
                              manualBulkSecond,
                              bulkBaseName
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                        <input
                          type="number"
                          min={1}
                          max={31}
                          placeholder="DD"
                          value={manualBulkDay}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkDay(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              manualBulkYear,
                              manualBulkMonth,
                              v,
                              manualBulkHour,
                              manualBulkMinute,
                              manualBulkSecond,
                              bulkBaseName
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>Kwalifikator i czas (GG:MM:SS)</span>
                      <div className={styles.compactDateTimeInputs}>
                        <select
                          value={manualBulkTimeQual}
                          onChange={e => {
                            setManualBulkTimeQual(e.target.value);
                          }}
                          className={styles.input}
                          style={{ width: '125px', height: '34px' }}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={manualBulkHour}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkHour(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              manualBulkYear,
                              manualBulkMonth,
                              manualBulkDay,
                              v,
                              manualBulkMinute,
                              manualBulkSecond,
                              bulkBaseName
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="MM"
                          value={manualBulkMinute}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkMinute(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              manualBulkYear,
                              manualBulkMonth,
                              manualBulkDay,
                              manualBulkHour,
                              v,
                              manualBulkSecond,
                              bulkBaseName
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="SS"
                          value={manualBulkSecond}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkSecond(v);
                            applyBulkSettingsToStaged(
                              dateSourceMode,
                              manualBulkYear,
                              manualBulkMonth,
                              manualBulkDay,
                              manualBulkHour,
                              manualBulkMinute,
                              v,
                              bulkBaseName
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>
                  </div>

                  {uploadIsRange && (
                    <div
                      style={{
                        borderTop: '1px solid #cbd5e1',
                        paddingTop: '0.65rem',
                        marginTop: '0.35rem',
                      }}
                    >
                      <span
                        className={styles.label}
                        style={{ marginBottom: '0.4rem', display: 'block' }}
                      >
                        📅 Druga granica przedziału („… a …”):
                      </span>
                      <div className={styles.formGrid}>
                        <div className={styles.formField}>
                          <span className={styles.label}>Kwalifikator drugiej granicy</span>
                          <select
                            value={manualBulkRangeEndQual}
                            onChange={e => {
                              setManualBulkRangeEndQual(e.target.value);
                            }}
                            className={styles.input}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>
                            Wybór z kalendarza{' '}
                            {bulkUploadEndWeekday ? `(📅 ${bulkUploadEndWeekday})` : ''}
                          </span>
                          <input
                            type="date"
                            value={toIsoDateInputValue(
                              manualBulkRangeEndYear,
                              manualBulkRangeEndMonth,
                              manualBulkRangeEndDay
                            )}
                            onChange={e => {
                              if (e.target.value) {
                                const p = e.target.value.split('-');
                                if (p.length === 3) {
                                  setManualBulkRangeEndYear(String(Number(p[0])));
                                  setManualBulkRangeEndMonth(String(Number(p[1])));
                                  setManualBulkRangeEndDay(String(Number(p[2])));
                                }
                              }
                            }}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Rok / Miesiąc / Dzień</span>
                          <div className={styles.compactDateTimeInputs}>
                            <input
                              type="number"
                              placeholder="RRRR"
                              value={manualBulkRangeEndYear}
                              onChange={e => {
                                setManualBulkRangeEndYear(e.target.value);
                              }}
                              className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                            />
                            <input
                              type="number"
                              min={1}
                              max={12}
                              placeholder="MM"
                              value={manualBulkRangeEndMonth}
                              onChange={e => {
                                setManualBulkRangeEndMonth(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <input
                              type="number"
                              min={1}
                              max={31}
                              placeholder="DD"
                              value={manualBulkRangeEndDay}
                              onChange={e => {
                                setManualBulkRangeEndDay(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                          </div>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Czas drugiej granicy (GG:MM:SS)</span>
                          <div className={styles.compactDateTimeInputs}>
                            <select
                              value={manualBulkRangeEndTimeQual}
                              onChange={e => {
                                setManualBulkRangeEndTimeQual(e.target.value);
                              }}
                              className={styles.input}
                              style={{ width: '125px', height: '34px' }}
                            >
                              {QUALIFIER_OPTIONS.map(q => (
                                <option key={q.value} value={q.value}>
                                  {q.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={23}
                              placeholder="GG"
                              value={manualBulkRangeEndHour}
                              onChange={e => {
                                setManualBulkRangeEndHour(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <span>:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="MM"
                              value={manualBulkRangeEndMinute}
                              onChange={e => {
                                setManualBulkRangeEndMinute(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <span>:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="SS"
                              value={manualBulkRangeEndSecond}
                              onChange={e => {
                                setManualBulkRangeEndSecond(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Point 12: Path preview always preserves untouchable event date prefix from backend */}
              {directoryPreview && (
                <div className={styles.pathPreviewBanner} data-testid="media-path-preview">
                  📁 Docelowy katalog na dysku: <strong>{directoryPreview}/</strong>
                </div>
              )}

              {/* Bulk Details Panel for Selected Staged Files */}
              {stagedFiles.length > 1 && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                      ⚙️ Zbiorcze szczegóły dla zaznaczonych plików ({String(selectedStagedCount)}{' '}
                      z {String(stagedFiles.length)})
                    </strong>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setStagedFiles(prev =>
                            prev.map(s => ({ ...s, selectedForBulk: true }))
                          );
                        }}
                        className={styles.btnSecondary}
                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                      >
                        Zaznacz wszystkie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStagedFiles(prev =>
                            prev.map(s => ({ ...s, selectedForBulk: false }))
                          );
                        }}
                        className={styles.btnSecondary}
                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                      >
                        Odznacz wszystkie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkDetails(prev => !prev);
                        }}
                        className={styles.btnSecondary}
                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                      >
                        {showBulkDetails
                          ? '▲ Zwiń zbiorcze szczegóły'
                          : '▼ Rozwiń zbiorcze szczegóły'}
                      </button>
                    </div>
                  </div>

                  {showBulkDetails && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      <div className={styles.stagedDetailsRow}>
                        <div className={styles.formField}>
                          <span className={styles.label}>Wspólny tytuł</span>
                          <input
                            type="text"
                            placeholder="Wspólny tytuł dla zaznaczonych plików..."
                            value={bulkTitle}
                            onChange={e => {
                              setBulkTitle(e.target.value);
                            }}
                            className={styles.input}
                          />
                        </div>
                        <div className={styles.formField}>
                          <span className={styles.label}>Wspólne źródło zdjęcia/filmu</span>
                          <input
                            type="text"
                            placeholder="np. Zbiór z archiwum rodzinnego"
                            value={bulkSourceText}
                            onChange={e => {
                              setBulkSourceText(e.target.value);
                            }}
                            className={styles.input}
                          />
                        </div>
                        <div className={styles.formField}>
                          <span className={styles.label}>Wspólny podpis z odwrotu</span>
                          <input
                            type="text"
                            placeholder="np. Pamiątka z wakacji"
                            value={bulkInscriptionText}
                            onChange={e => {
                              setBulkInscriptionText(e.target.value);
                            }}
                            className={styles.input}
                          />
                        </div>
                      </div>

                      <div className={styles.formField} style={{ width: '100%' }}>
                        <span className={styles.label}>Wspólny opis tekstowy</span>
                        <textarea
                          rows={3}
                          placeholder="Wspólny opis dla zaznaczonych plików..."
                          value={bulkDescription}
                          onChange={e => {
                            setBulkDescription(e.target.value);
                          }}
                          className={styles.textarea}
                        />
                      </div>

                      <div
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.55rem',
                        }}
                      >
                        <span className={styles.label}>
                          Wspólne osoby na zdjęciu, osoby powiązane oraz autorzy:
                        </span>
                        <div className={styles.personLinksGrid}>
                          <div className={styles.formField}>
                            <span className={styles.label}>Rodzaj powiązania</span>
                            <select
                              value={bulkLinkRoleType}
                              onChange={e => {
                                setBulkLinkRoleType(
                                  e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR'
                                );
                              }}
                              className={styles.input}
                            >
                              <option value="DEPICTED">
                                👁️ Osoba widoczna na zdjęciu/filmie
                              </option>
                              <option value="RELATED">
                                🔗 Osoba powiązana ze zdjęciem/filmem
                              </option>
                              <option value="AUTHOR">
                                📷 Autor zdjęcia/nagrania (kto wykonał)
                              </option>
                            </select>
                          </div>
                          <div className={styles.formField}>
                            <span className={styles.label}>Dodaj osobę z drzewa</span>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input
                                type="text"
                                placeholder="Szukaj w drzewie..."
                                value={bulkLinkPersonQuery}
                                onChange={e => {
                                  setBulkLinkPersonQuery(e.target.value);
                                }}
                                className={styles.input}
                              />
                              <button
                                type="button"
                                onClick={() => void handleSearchPersonForBulk()}
                                className={styles.btnSecondary}
                              >
                                Szukaj
                              </button>
                            </div>
                          </div>
                          <div className={styles.formField}>
                            <span className={styles.label}>Lub wpisz osobę tekstowo</span>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input
                                type="text"
                                placeholder="np. Fotograf z Lublina"
                                value={bulkLinkTextInput}
                                onChange={e => {
                                  setBulkLinkTextInput(e.target.value);
                                }}
                                className={styles.input}
                              />
                              <select
                                value={bulkLinkTextSex}
                                onChange={e => {
                                  setBulkLinkTextSex(e.target.value as PersonSex);
                                }}
                                className={styles.input}
                                style={{ width: '75px' }}
                              >
                                <option value="MALE">M</option>
                                <option value="FEMALE">K</option>
                                <option value="UNKNOWN">?</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleAddTextPersonToBulk}
                                className={styles.btnSecondary}
                              >
                                + Dodaj
                              </button>
                            </div>
                          </div>
                        </div>

                        {bulkLinkPersonResults.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {bulkLinkPersonResults.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  handleAddDbPersonToBulk(p);
                                }}
                                className={styles.btnSecondary}
                              >
                                + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                              </button>
                            ))}
                          </div>
                        )}

                        {bulkPersonLinks.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {bulkPersonLinks.map((pl, bIdx) => (
                              <span
                                key={`${pl.displayLabel}-${String(bIdx)}`}
                                className={styles.selectedFilesBadge}
                              >
                                {pl.displayLabel}{' '}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBulkPersonLinks(prev =>
                                      prev.filter((_, i) => i !== bIdx)
                                    );
                                  }}
                                  className={styles.pillRemoveBtn}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginTop: '0.4rem',
                        }}
                      >
                        <button
                          type="button"
                          onClick={handleApplyBulkDetailsToSelectedStaged}
                          className={styles.btnPrimary}
                          style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}
                        >
                          ✓ Zastosuj te szczegóły do zaznaczonych plików ({String(selectedStagedCount)})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Staged Files List with Thumbnail, Preview & Individual Between Date (Points 1 & 7) */}
              {stagedFiles.length > 0 && (
                <div className={styles.stagedList}>
                  {stagedFiles.map((st, idx) => {
                    const chosenMeta =
                      st.metadataOptions.find(
                        o => o.sourceTag === st.selectedMetadataTag
                      ) ?? st.metadataOptions.at(0);

                    return (
                      <div
                        key={`${st.file.name}-${String(idx)}`}
                        className={styles.stagedCard}
                      >
                        <div className={styles.stagedTopRow}>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              cursor: 'pointer',
                            }}
                          >
                            {stagedFiles.length > 1 && (
                              <input
                                type="checkbox"
                                checked={st.selectedForBulk}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setStagedFiles(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, selectedForBulk: checked } : item
                                    )
                                  );
                                }}
                              />
                            )}
                            <span className={styles.breakableCode}>📄 {st.file.name}</span>
                          </label>

                          {chosenMeta ? (
                            <div className={styles.metadataBadge}>
                              <span>📷 Metadane:</span>
                              {st.metadataOptions.length > 1 ? (
                                <select
                                  value={st.selectedMetadataTag}
                                  onChange={e => {
                                    const tag = e.target.value;
                                    const opt = st.metadataOptions.find(
                                      o => o.sourceTag === tag
                                    );
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              selectedMetadataTag: tag,
                                              year: opt ? String(opt.year) : item.year,
                                              month: opt ? String(opt.month) : item.month,
                                              day: opt ? String(opt.day) : item.day,
                                              hour: opt ? String(opt.hour) : item.hour,
                                              minute: opt ? String(opt.minute) : item.minute,
                                              second: opt ? String(opt.second) : item.second,
                                            }
                                          : item
                                      )
                                    );
                                  }}
                                  className={styles.input}
                                  style={{
                                    height: '26px',
                                    fontSize: '0.73rem',
                                    width: 'auto',
                                    padding: '0 0.4rem',
                                  }}
                                >
                                  {st.metadataOptions.map(opt => (
                                    <option key={opt.sourceTag} value={opt.sourceTag}>
                                      {opt.sourceTag} — {opt.formattedText}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span>
                                  {chosenMeta.sourceTag.includes('lastModified')
                                    ? 'data modyfikacji pliku'
                                    : chosenMeta.sourceTag.replace(/[()]/g, '')}{' '}
                                  — <strong>{chosenMeta.formattedText}</strong>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setStagedFiles(prev =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            isBetweenRange: false,
                                            dateQualifier: 'EXACT',
                                            timeQualifier: 'EXACT',
                                            year: String(chosenMeta.year),
                                            month: String(chosenMeta.month),
                                            day: String(chosenMeta.day),
                                            hour: String(chosenMeta.hour),
                                            minute: String(chosenMeta.minute),
                                            second: String(chosenMeta.second),
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className={styles.btnSecondary}
                                style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                              >
                                Użyj tej daty z metadanych
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Brak daty w metadanych pliku
                            </span>
                          )}
                        </div>

                        <div className={styles.stagedMainRow}>
                          {/* Point 1: Small Thumbnail & Click to Preview */}
                          <button
                            type="button"
                            title="Kliknij, aby powiększyć i przeanalizować plik"
                            onClick={() => {
                              if (st.previewUrl) {
                                setPreviewModalItem({
                                  url: st.previewUrl,
                                  mediaType: st.mediaType,
                                  title: st.title || st.file.name,
                                });
                              }
                            }}
                            className={styles.stagedThumbButton}
                          >
                            {st.mediaType === 'IMAGE' && st.previewUrl ? (
                              <img
                                src={st.previewUrl}
                                alt={st.file.name}
                                className={styles.stagedThumbImg}
                              />
                            ) : st.mediaType === 'VIDEO' && st.previewUrl ? (
                              <video
                                src={st.previewUrl}
                                muted
                                playsInline
                                className={styles.stagedThumbImg}
                              />
                            ) : (
                              <span style={{ fontSize: '1.6rem', color: '#ffffff' }}>🎵</span>
                            )}
                            <span className={styles.stagedPreviewHint}>🔍 Podgląd</span>
                          </button>

                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className={styles.stagedInputsGrid}>
                              <div>
                                <span className={styles.label}>Nazwa pliku na dysku</span>
                                <input
                                  type="text"
                                  aria-label="Nazwa pliku na dysku"
                                  data-testid={
                                    idx === 0
                                      ? 'media-filename-input'
                                      : `media-filename-input-${String(idx)}`
                                  }
                                  value={st.customFileName}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, customFileName: val } : item
                                      )
                                    );
                                  }}
                                  placeholder="Nazwa snake_case.jpg"
                                  className={styles.input}
                                />
                              </div>

                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                  }}
                                >
                                  <span className={styles.label}>
                                    Data i czas (RRRR-MM-DD GG:MM:SS)
                                  </span>
                                  <label
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.3rem',
                                      fontSize: '0.73rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={st.isBetweenRange}
                                      onChange={e => {
                                        const checked = e.target.checked;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? { ...item, isBetweenRange: checked }
                                              : item
                                          )
                                        );
                                      }}
                                    />
                                    <span>Przedział „między … a …”</span>
                                  </label>
                                </div>

                                <div className={styles.compactDateTimeInputs}>
                                  <select
                                    value={st.dateQualifier}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, dateQualifier: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.input}
                                    style={{ width: '105px', height: '34px', fontSize: '0.76rem' }}
                                  >
                                    {QUALIFIER_OPTIONS.map(q => (
                                      <option key={q.value} value={q.value}>
                                        {q.label}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    aria-label="Rok zdjęcia"
                                    placeholder="RRRR"
                                    value={st.year}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, year: val } : item
                                        )
                                      );
                                    }}
                                    className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    max={12}
                                    placeholder="MM"
                                    value={st.month}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, month: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.miniDateInput}
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    max={31}
                                    placeholder="DD"
                                    value={st.day}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, day: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.miniDateInput}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    placeholder="GG"
                                    value={st.hour}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, hour: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.miniDateInput}
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    placeholder="MM"
                                    value={st.minute}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, minute: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.miniDateInput}
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    placeholder="SS"
                                    value={st.second}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setStagedFiles(prev =>
                                        prev.map((item, i) =>
                                          i === idx ? { ...item, second: val } : item
                                        )
                                      );
                                    }}
                                    className={styles.miniDateInput}
                                  />
                                </div>

                                {st.isBetweenRange && (
                                  <div
                                    className={styles.compactDateTimeInputs}
                                    style={{ marginTop: '0.35rem' }}
                                  >
                                    <span className={styles.label}>… a:</span>
                                    <select
                                      value={st.rangeEndQualifier}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? { ...item, rangeEndQualifier: val }
                                              : item
                                          )
                                        );
                                      }}
                                      className={styles.input}
                                      style={{ width: '105px', height: '34px', fontSize: '0.76rem' }}
                                    >
                                      {QUALIFIER_OPTIONS.map(q => (
                                        <option key={q.value} value={q.value}>
                                          {q.label}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="number"
                                      placeholder={st.year || 'RRRR'}
                                      value={st.rangeEndYear}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndYear: val } : item
                                          )
                                        );
                                      }}
                                      className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={12}
                                      placeholder="MM"
                                      value={st.rangeEndMonth}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndMonth: val } : item
                                          )
                                        );
                                      }}
                                      className={styles.miniDateInput}
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={31}
                                      placeholder="DD"
                                      value={st.rangeEndDay}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndDay: val } : item
                                          )
                                        );
                                      }}
                                      className={styles.miniDateInput}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={23}
                                      placeholder="GG"
                                      value={st.rangeEndHour}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndHour: val } : item
                                          )
                                        );
                                      }}
                                      className={styles.miniDateInput}
                                    />
                                    <span>:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={59}
                                      placeholder="MM"
                                      value={st.rangeEndMinute}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndMinute: val } : item
                                          )
                                        );
                                      }}
                                      className={styles.miniDateInput}
                                    />
                                    <span>:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={59}
                                      placeholder="SS"
                                      value={st.rangeEndSecond}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setStagedFiles(prev =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, rangeEndSecond: val } : item
                                          )
                                        );
                                      }}
                                      className={styles.miniDateInput}
                                    />
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? { ...item, showDetails: !item.showDetails }
                                          : item
                                      )
                                    );
                                  }}
                                  className={styles.btnSecondary}
                                  style={{ height: '36px', whiteSpace: 'nowrap' }}
                                >
                                  {st.showDetails ? '▲ Zwiń szczegóły' : '🔍 Szczegóły pliku ▼'}
                                  {(Boolean(st.title) ||
                                    Boolean(st.sourceText) ||
                                    Boolean(st.inscriptionText) ||
                                    Boolean(st.description) ||
                                    Boolean(
                                      st.personLinks && st.personLinks.length > 0
                                    )) && (
                                    <span
                                      style={{
                                        marginLeft: '0.4rem',
                                        color: '#16a34a',
                                        fontWeight: 800,
                                      }}
                                    >
                                      ●
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {st.showDetails && (
                          <div className={styles.stagedDetailsPanel}>
                            <div className={styles.stagedDetailsRow}>
                              <div className={styles.formField}>
                                <span className={styles.label}>Tytuł</span>
                                <input
                                  type="text"
                                  aria-label="Tytuł zdjęcia"
                                  placeholder="Krótki tytuł zdjęcia lub filmu..."
                                  value={st.title}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, title: val } : item
                                      )
                                    );
                                  }}
                                  className={styles.input}
                                />
                              </div>
                              <div className={styles.formField}>
                                <span className={styles.label}>
                                  Źródło zdjęcia/filmu (tekstowo)
                                </span>
                                <input
                                  type="text"
                                  placeholder="np. Z albumu babci Katarzyny"
                                  value={st.sourceText ?? ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, sourceText: val } : item
                                      )
                                    );
                                  }}
                                  className={styles.input}
                                />
                              </div>
                              <div className={styles.formField}>
                                <span className={styles.label}>
                                  Podpis z odwrotu zdjęcia / oryginalna dedykacja
                                </span>
                                <input
                                  type="text"
                                  placeholder="np. Na pamiątkę z Krynicy, 1938 r."
                                  value={st.inscriptionText ?? ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFiles(prev =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, inscriptionText: val } : item
                                      )
                                    );
                                  }}
                                  className={styles.input}
                                />
                              </div>
                            </div>

                            <div className={styles.formField} style={{ width: '100%' }}>
                              <span className={styles.label}>
                                Opis tekstowy (zwykły tekst)
                              </span>
                              <textarea
                                rows={3}
                                placeholder="Dodatkowe informacje o zdjęciu/nagraniu..."
                                value={st.description ?? ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setStagedFiles(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, description: val } : item
                                    )
                                  );
                                }}
                                className={styles.textarea}
                              />
                            </div>

                            <div
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '0.75rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.55rem',
                              }}
                            >
                              <span className={styles.label}>
                                Osoby na zdjęciu, osoby powiązane oraz autorzy (z bazy lub
                                tekstowo):
                              </span>
                              <div className={styles.personLinksGrid}>
                                <div className={styles.formField}>
                                  <span className={styles.label}>Rodzaj powiązania</span>
                                  <select
                                    value={stagedLinkRoleType}
                                    onChange={e => {
                                      setStagedLinkRoleType(
                                        e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR'
                                      );
                                    }}
                                    className={styles.input}
                                  >
                                    <option value="DEPICTED">
                                      👁️ Osoba widoczna na zdjęciu/filmie
                                    </option>
                                    <option value="RELATED">
                                      🔗 Osoba powiązana ze zdjęciem/filmem
                                    </option>
                                    <option value="AUTHOR">
                                      📷 Autor zdjęcia/nagrania (kto wykonał)
                                    </option>
                                  </select>
                                </div>
                                <div className={styles.formField}>
                                  <span className={styles.label}>Dodaj osobę z drzewa</span>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <input
                                      type="text"
                                      placeholder="Szukaj w drzewie..."
                                      value={
                                        activeStagedSearchIdx === idx ? stagedPersonQuery : ''
                                      }
                                      onChange={e => {
                                        setActiveStagedSearchIdx(idx);
                                        setStagedPersonQuery(e.target.value);
                                      }}
                                      className={styles.input}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleSearchPersonForStaged(idx);
                                      }}
                                      className={styles.btnSecondary}
                                    >
                                      Szukaj
                                    </button>
                                  </div>
                                </div>
                                <div className={styles.formField}>
                                  <span className={styles.label}>
                                    Lub wpisz osobę tekstowo
                                  </span>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <input
                                      type="text"
                                      placeholder="np. Fotograf z Lublina"
                                      value={
                                        activeStagedSearchIdx === idx
                                          ? stagedTextPersonInput
                                          : ''
                                      }
                                      onChange={e => {
                                        setActiveStagedSearchIdx(idx);
                                        setStagedTextPersonInput(e.target.value);
                                      }}
                                      className={styles.input}
                                    />
                                    <select
                                      value={stagedTextPersonSex}
                                      onChange={e => {
                                        setStagedTextPersonSex(e.target.value as PersonSex);
                                      }}
                                      className={styles.input}
                                      style={{ width: '75px' }}
                                    >
                                      <option value="MALE">M</option>
                                      <option value="FEMALE">K</option>
                                      <option value="UNKNOWN">?</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleAddTextPersonToStaged(idx);
                                      }}
                                      className={styles.btnSecondary}
                                    >
                                      + Dodaj
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {activeStagedSearchIdx === idx &&
                                stagedPersonResults.length > 0 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: '0.4rem',
                                    }}
                                  >
{stagedPersonResults.map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                          handleAddDbPersonToStaged(idx, p);
                                        }}
                                        className={styles.btnSecondary}
                                      >
                                        + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                                      </button>
                                    ))}
                                  </div>
                                )}

                              {st.personLinks && st.personLinks.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  {st.personLinks.map((pl, pIdx) => (
                                    <span
                                      key={`${pl.displayLabel}-${String(pIdx)}`}
                                      className={styles.selectedFilesBadge}
                                    >
                                      {pl.displayLabel}{' '}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleRemovePersonFromStaged(idx, pIdx);
                                        }}
                                        className={styles.pillRemoveBtn}
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {stagedFiles.length === 1 && (context === 'GRAVE' || context === 'PERSON') && (
                <div className={styles.checkboxRow}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={setAsPrimary}
                      onChange={e => {
                        setSetAsPrimary(e.target.checked);
                      }}
                    />
                    <span>
                      {context === 'GRAVE'
                        ? 'Ustaw jako główne zdjęcie tego nagrobka'
                        : 'Ustaw jako główny portret (awatar) tej osoby'}
                    </span>
                  </label>
                </div>
              )}

              <div className={styles.modalFooter}>
                <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                  Plików do wgrania: <strong>{String(stagedFiles.length)}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      closeUploadModal();
                      setStagedFiles([]);
                    }}
                    className={styles.btnSecondary}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-upload-media-button"
                    disabled={stagedFiles.length === 0 || isSubmitting}
                    className={styles.btnPrimary}
                  >
                    {isSubmitting
                      ? 'Wgrywanie...'
                      : `Wgraj i zapisz (${String(stagedFiles.length)})`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          LARGE MODAL 2: BULK EDIT MEDIA WITH THUMBNAILS & PREVIEW (Points 6, 18, 33)
          ===================================================================== */}
      {isAdmin && isBulkEditMode && effectiveItems.length > 0 && (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            closeBulkEditModal();
          }}
        >
          <div
            className={styles.modalDialog}
            style={{ maxWidth: '1080px' }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className={styles.modalHeader}>
              <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                ☑️ Edycja zbiorowa plików multimedialnych (zaznaczono:{' '}
                {String(selectedBulkDraftCount)} z {String(bulkDraftItems.length)})
              </strong>
              <button
                type="button"
                onClick={() => {
                  closeBulkEditModal();
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>

            <form
              onSubmit={e => {
                void handleApplyBulkEdit(e);
              }}
              className={styles.modalBody}
              data-testid="media-bulk-edit-panel"
            >
              {errorMessage && (
                <div
                  role="alert"
                  style={{ color: '#dc2626', fontSize: '0.86rem', fontWeight: 600 }}
                >
                  {errorMessage}
                </div>
              )}

              {/* Top Bulk Settings Bar */}
              <div className={styles.bulkEditPanel}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                    ⚙️ Parametry zbiorcze dla zaznaczonych plików ({String(selectedBulkDraftCount)})
                  </strong>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkDraftItems(prev => prev.map(d => ({ ...d, selected: true })));
                      }}
                      className={styles.btnSecondary}
                    >
                      Zaznacz wszystkie
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkDraftItems(prev => prev.map(d => ({ ...d, selected: false })));
                      }}
                      className={styles.btnSecondary}
                    >
                      Odznacz wszystkie
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBulkDetails(prev => !prev);
                      }}
                      className={styles.btnSecondary}
                    >
                      {showBulkDetails ? '▲ Ukryj zbiorcze szczegóły' : '▼ Zbiorcze szczegóły i opis'}
                    </button>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label htmlFor="bulk-edit-folder" className={styles.label}>
                      Zmień nazwę folderu docelowego
                    </label>
                    <input
                      id="bulk-edit-folder"
                      type="text"
                      placeholder={
                        effectiveItems.at(0)?.directoryPath ?? 'np. nowy_folder_wydarzenia'
                      }
                      value={bulkEditFolder}
                      onChange={e => {
                        setBulkEditFolder(e.target.value);
                      }}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="bulk-edit-stem" className={styles.label}>
                      Wspólny trzon nazwy plików (ponumeruje _01, _02...)
                    </label>
                    <input
                      id="bulk-edit-stem"
                      type="text"
                      placeholder="np. wakacje_kolobrzeg"
                      value={bulkEditStem}
                      onChange={e => {
                        setBulkEditStem(e.target.value);
                      }}
                      className={styles.input}
                    />
                  </div>

                  {/* Point 33: Move selected media items to another collection */}
                  {availableCollections.length > 0 && (
                    <div className={styles.formField}>
                      <label htmlFor="bulk-edit-target-col" className={styles.label}>
                        Przenieś zaznaczone do innej kolekcji / albumu
                      </label>
                      <select
                        id="bulk-edit-target-col"
                        data-testid="bulk-edit-target-collection-select"
                        value={bulkEditTargetCollectionId}
                        onChange={e => {
                          setBulkEditTargetCollectionId(e.target.value);
                        }}
                        className={styles.input}
                      >
                        <option value="">— Pozostaw w obecnej kolekcji —</option>
                        {availableCollections.map(col => (
                          <option key={col.id} value={String(col.id)}>
                            {col.datedCollection
                              ? `📅 [Album ${String(col.startYear ?? '')}] ${col.name}`
                              : `📦 [Kolekcja] ${col.name}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={styles.formField}>
                    <label htmlFor="bulk-edit-date-mode" className={styles.label}>
                      Zbiorcza zmiana daty i czasu zdjęć/filmów
                    </label>
                    <select
                      id="bulk-edit-date-mode"
                      data-testid="bulk-edit-date-mode-select"
                      value={bulkEditDateMode}
                      onChange={e => {
                        setBulkEditDateMode(
                          e.target.value as
                            | 'NO_CHANGE'
                            | 'MANUAL'
                            | 'METADATA'
                            | 'EVENT'
                            | 'UNDATED'
                        );
                      }}
                      className={styles.input}
                    >
                      <option value="NO_CHANGE">— Pozostaw daty bez zmian —</option>
                      <option value="METADATA">
                        Przywróć datę i czas z metadanych każdego pliku (zawsze Dokładnie)
                      </option>
                      {eventId !== undefined && (
                        <option value="EVENT">
                          Ustaw datę i czas z bieżącego wydarzenia
                        </option>
                      )}
                      <option value="MANUAL">
                        Ustaw wspólną datę i czas ręcznie (lub przedział „między … a …”)
                      </option>
                      <option value="UNDATED">Wyczyść datę (undated)</option>
                    </select>
                  </div>

                  {bulkEditDateMode === 'METADATA' && (
                    <div className={styles.formField}>
                      <label htmlFor="bulk-edit-meta-tag" className={styles.label}>
                        Preferowane pole metadanych
                      </label>
                      <select
                        id="bulk-edit-meta-tag"
                        value={bulkEditMetadataTag}
                        onChange={e => {
                          setBulkEditMetadataTag(e.target.value);
                        }}
                        className={styles.input}
                      >
                        <option value="">
                          Automatycznie (Original Date Time -&gt; Image Date Time -&gt; plik)
                        </option>
                        <option value="Original Date Time">
                          EXIF: Original Date Time (data wykonania)
                        </option>
                        <option value="Digitized Date Time">
                          EXIF: Digitized Date Time (data digitalizacji)
                        </option>
                        <option value="Image Date Time">
                          EXIF: Image Date Time (data obrazu)
                        </option>
                        <option value="creation_time">MP4/QuickTime: creation_time</option>
                        <option value="lastModified">
                          Data modyfikacji pliku (lastModified)
                        </option>
                      </select>
                    </div>
                  )}
                </div>

                {bulkEditDateMode === 'MANUAL' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bulkEditIsBetween}
                        onChange={e => {
                          setBulkEditIsBetween(e.target.checked);
                        }}
                      />
                      <span>Przedział niepewności „między … a …” dla daty wykonania</span>
                    </label>

                    <div className={styles.formGrid}>
                      <div className={styles.formField}>
                        <span className={styles.label}>Kwalifikator daty</span>
                        <select
                          value={bulkEditDateQual}
                          onChange={e => {
                            setBulkEditDateQual(e.target.value);
                          }}
                          className={styles.input}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.label}>
                          Wybór z kalendarza{' '}
                          {bulkEditStartWeekday ? `(📅 ${bulkEditStartWeekday})` : ''}
                        </span>
                        <input
                          type="date"
                          value={toIsoDateInputValue(
                            bulkEditYear,
                            bulkEditMonth,
                            bulkEditDay
                          )}
                          onChange={e => {
                            if (e.target.value) {
                              const p = e.target.value.split('-');
                              if (p.length === 3) {
                                setBulkEditYear(String(Number(p[0])));
                                setBulkEditMonth(String(Number(p[1])));
                                setBulkEditDay(String(Number(p[2])));
                              }
                            }
                          }}
                          className={styles.input}
                        />
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.label}>Rok / Miesiąc / Dzień</span>
                        <div className={styles.compactDateTimeInputs}>
                          <input
                            type="number"
                            placeholder="RRRR"
                            value={bulkEditYear}
                            onChange={e => {
                              setBulkEditYear(e.target.value);
                            }}
                            className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                          />
                          <input
                            type="number"
                            min={1}
                            max={12}
                            placeholder="MM"
                            value={bulkEditMonth}
                            onChange={e => {
                              setBulkEditMonth(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <input
                            type="number"
                            min={1}
                            max={31}
                            placeholder="DD"
                            value={bulkEditDay}
                            onChange={e => {
                              setBulkEditDay(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                        </div>
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.label}>Kwalifikator i czas (GG:MM:SS)</span>
                        <div className={styles.compactDateTimeInputs}>
                          <select
                            value={bulkEditTimeQual}
                            onChange={e => {
                              setBulkEditTimeQual(e.target.value);
                            }}
                            className={styles.input}
                            style={{ width: '125px', height: '34px' }}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            placeholder="GG"
                            value={bulkEditHour}
                            onChange={e => {
                              setBulkEditHour(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="MM"
                            value={bulkEditMinute}
                            onChange={e => {
                              setBulkEditMinute(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="SS"
                            value={bulkEditSecond}
                            onChange={e => {
                              setBulkEditSecond(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                        </div>
                      </div>
                    </div>

                    {bulkEditIsBetween && (
                      <div className={styles.formGrid}>
                        <div className={styles.formField}>
                          <span className={styles.label}>Druga granica („… a …”)</span>
                          <select
                            value={bulkEditRangeEndQual}
                            onChange={e => {
                              setBulkEditRangeEndQual(e.target.value);
                            }}
                            className={styles.input}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>
                            Wybór z kalendarza{' '}
                            {bulkEditEndWeekday ? `(📅 ${bulkEditEndWeekday})` : ''}
                          </span>
                          <input
                            type="date"
                            value={toIsoDateInputValue(
                              bulkEditRangeEndYear,
                              bulkEditRangeEndMonth,
                              bulkEditRangeEndDay
                            )}
                            onChange={e => {
                              if (e.target.value) {
                                const p = e.target.value.split('-');
                                if (p.length === 3) {
                                  setBulkEditRangeEndYear(String(Number(p[0])));
                                  setBulkEditRangeEndMonth(String(Number(p[1])));
                                  setBulkEditRangeEndDay(String(Number(p[2])));
                                }
                              }
                            }}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Rok / Miesiąc / Dzień</span>
                          <div className={styles.compactDateTimeInputs}>
                            <input
                              type="number"
                              placeholder={bulkEditYear || 'RRRR'}
                              value={bulkEditRangeEndYear}
                              onChange={e => {
                                setBulkEditRangeEndYear(e.target.value);
                              }}
                              className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                            />
                            <input
                              type="number"
                              min={1}
                              max={12}
                              placeholder="MM"
                              value={bulkEditRangeEndMonth}
                              onChange={e => {
                                setBulkEditRangeEndMonth(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <input
                              type="number"
                              min={1}
                              max={31}
                              placeholder="DD"
                              value={bulkEditRangeEndDay}
                              onChange={e => {
                                setBulkEditRangeEndDay(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                          </div>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Czas drugiej granicy (GG:MM:SS)</span>
                          <div className={styles.compactDateTimeInputs}>
                            <select
                              value={bulkEditRangeEndTimeQual}
                              onChange={e => {
                                setBulkEditRangeEndTimeQual(e.target.value);
                              }}
                              className={styles.input}
                              style={{ width: '125px', height: '34px' }}
                            >
                              {QUALIFIER_OPTIONS.map(q => (
                                <option key={q.value} value={q.value}>
                                  {q.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={23}
                              placeholder="GG"
                              value={bulkEditRangeEndHour}
                              onChange={e => {
                                setBulkEditRangeEndHour(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <span>:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="MM"
                              value={bulkEditRangeEndMinute}
                              onChange={e => {
                                setBulkEditRangeEndMinute(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <span>:</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="SS"
                              value={bulkEditRangeEndSecond}
                              onChange={e => {
                                setBulkEditRangeEndSecond(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showBulkDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div className={styles.stagedDetailsRow}>
                      <div className={styles.formField}>
                        <span className={styles.label}>Wspólny tytuł</span>
                        <input
                          type="text"
                          placeholder="Wspólny tytuł..."
                          value={bulkTitle}
                          onChange={e => {
                            setBulkTitle(e.target.value);
                          }}
                          className={styles.input}
                        />
                      </div>
                      <div className={styles.formField}>
                        <span className={styles.label}>Wspólne źródło</span>
                        <input
                          type="text"
                          placeholder="np. Z albumu babci"
                          value={bulkSourceText}
                          onChange={e => {
                            setBulkSourceText(e.target.value);
                          }}
                          className={styles.input}
                        />
                      </div>
                      <div className={styles.formField}>
                        <span className={styles.label}>Wspólny podpis z odwrotu</span>
                        <input
                          type="text"
                          placeholder="np. Na pamiątkę..."
                          value={bulkInscriptionText}
                          onChange={e => {
                            setBulkInscriptionText(e.target.value);
                          }}
                          className={styles.input}
                        />
                      </div>
                    </div>
                    <div className={styles.formField}>
                      <span className={styles.label}>Wspólny opis tekstowy</span>
                      <textarea
                        rows={2}
                        value={bulkDescription}
                        onChange={e => {
                          setBulkDescription(e.target.value);
                        }}
                        className={styles.textarea}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={handleApplyBulkToDraftList}
                        className={styles.btnSecondary}
                      >
                        ↓ Nanieś powyższe ustawienia na zaznaczone wiersze na liście
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Point 6: Individual List of Media Items in Bulk Edit Modal with Thumbnails & Preview */}
              <div className={styles.stagedList}>
                {bulkDraftItems.map((draft, idx) => (
                  <div key={draft.id} className={styles.stagedCard}>
                    <div className={styles.stagedTopRow}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          data-testid={`bulk-media-checkbox-${String(draft.id)}`}
                          checked={draft.selected}
                          onChange={e => {
                            const checked = e.target.checked;
                            setBulkDraftItems(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, selected: checked } : item
                              )
                            );
                          }}
                        />
                        <span className={styles.breakableCode}>📄 {draft.fileName}</span>
                      </label>
                    </div>

                    <div className={styles.stagedMainRow}>
                      <button
                        type="button"
                        title="Kliknij, aby otworzyć pełny podgląd pliku"
                        onClick={() => {
                          setPreviewModalItem({
                            url: mediaApi.getFileUrl(draft.id),
                            mediaType: draft.mediaType,
                            title: draft.title || draft.fileName,
                          });
                        }}
                        className={styles.stagedThumbButton}
                      >
                        {draft.mediaType === 'IMAGE' ? (
                          <img
                            src={mediaApi.getThumbnailUrl(draft.id)}
                            alt={draft.title}
                            className={styles.stagedThumbImg}
                          />
                        ) : draft.mediaType === 'VIDEO' ? (
                          <video
                            src={`${mediaApi.getFileUrl(draft.id)}#t=0.5`}
                            preload="metadata"
                            muted
                            playsInline
                            className={styles.stagedThumbImg}
                          />
                        ) : (
                          <span style={{ fontSize: '1.6rem', color: '#ffffff' }}>🎵</span>
                        )}
                        <span className={styles.stagedPreviewHint}>🔍 Podgląd</span>
                      </button>

                      <div style={{ flex: 1 }}>
                        <div className={styles.stagedInputsGrid}>
                          <div>
                            <span className={styles.label}>Nazwa pliku na dysku</span>
                            <input
                              type="text"
                              value={draft.fileName}
                              onChange={e => {
                                const val = e.target.value;
                                setBulkDraftItems(prev =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, fileName: val } : item
                                  )
                                );
                              }}
                              className={styles.input}
                            />
                          </div>

                          <div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span className={styles.label}>Data i czas (RRRR-MM-DD)</span>
                              <label
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  fontSize: '0.73rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.isBetweenRange}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setBulkDraftItems(prev =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, isBetweenRange: checked } : item
                                      )
                                    );
                                  }}
                                />
                                <span>Przedział „między … a …”</span>
                              </label>
                            </div>
                            <div className={styles.compactDateTimeInputs}>
                              <input
                                type="number"
                                placeholder="RRRR"
                                value={draft.year}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBulkDraftItems(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, year: val } : item
                                    )
                                  );
                                }}
                                className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                              />
                              <input
                                type="number"
                                min={1}
                                max={12}
                                placeholder="MM"
                                value={draft.month}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBulkDraftItems(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, month: val } : item
                                    )
                                  );
                                }}
                                className={styles.miniDateInput}
                              />
                              <input
                                type="number"
                                min={1}
                                max={31}
                                placeholder="DD"
                                value={draft.day}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBulkDraftItems(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, day: val } : item
                                    )
                                  );
                                }}
                                className={styles.miniDateInput}
                              />
                              <input
                                type="number"
                                min={0}
                                max={23}
                                placeholder="GG"
                                value={draft.hour}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBulkDraftItems(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, hour: val } : item
                                    )
                                  );
                                }}
                                className={styles.miniDateInput}
                              />
                              <span>:</span>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                placeholder="MM"
                                value={draft.minute}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBulkDraftItems(prev =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, minute: val } : item
                                    )
                                  );
                                }}
                                className={styles.miniDateInput}
                              />
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setBulkDraftItems(prev =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, showDetails: !item.showDetails }
                                      : item
                                  )
                                );
                              }}
                              className={styles.btnSecondary}
                              style={{ height: '36px', whiteSpace: 'nowrap' }}
                            >
                              {draft.showDetails ? '▲ Zwiń szczegóły' : '🔍 Szczegóły pliku ▼'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {draft.showDetails && (
                      <div className={styles.stagedDetailsPanel}>
                        <div className={styles.stagedDetailsRow}>
                          <div className={styles.formField}>
                            <span className={styles.label}>Tytuł</span>
                            <input
                              type="text"
                              value={draft.title}
                              onChange={e => {
                                const val = e.target.value;
                                setBulkDraftItems(prev =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, title: val } : item
                                  )
                                );
                              }}
                              className={styles.input}
                            />
                          </div>
                          <div className={styles.formField}>
                            <span className={styles.label}>Źródło</span>
                            <input
                              type="text"
                              value={draft.sourceText}
                              onChange={e => {
                                const val = e.target.value;
                                setBulkDraftItems(prev =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, sourceText: val } : item
                                  )
                                );
                              }}
                              className={styles.input}
                            />
                          </div>
                          <div className={styles.formField}>
                            <span className={styles.label}>Podpis z odwrotu</span>
                            <input
                              type="text"
                              value={draft.inscriptionText}
                              onChange={e => {
                                const val = e.target.value;
                                setBulkDraftItems(prev =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, inscriptionText: val } : item
                                  )
                                );
                              }}
                              className={styles.input}
                            />
                          </div>
                        </div>
                        <div className={styles.formField}>
                          <span className={styles.label}>Opis tekstowy</span>
                          <textarea
                            rows={2}
                            value={draft.description}
                            onChange={e => {
                              const val = e.target.value;
                              setBulkDraftItems(prev =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, description: val } : item
                                )
                              );
                            }}
                            className={styles.textarea}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.modalFooter}>
                <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                  Zaznaczono do zapisu: <strong>{String(selectedBulkDraftCount)}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      closeBulkEditModal();
                    }}
                    className={styles.btnSecondary}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-bulk-edit-media-button"
                    disabled={selectedBulkDraftCount === 0 || isSubmitting}
                    className={styles.btnPrimary}
                  >
                    ✓ Zastosuj zmiany dla zaznaczonych ({String(selectedBulkDraftCount)})
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: PREVIEW FOR STAGED / BULK-EDITED FILE (Point 1 & Point 6)
          ===================================================================== */}
      {previewModalItem && (
        <div
          className={styles.fullscreenOverlay}
          style={{ zIndex: 1500 }}
          onClick={() => {
            setPreviewModalItem(null);
          }}
        >
          <div
            className={styles.fullscreenTopBar}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <strong style={{ fontSize: '0.95rem' }}>
              🔍 Podgląd pliku: {previewModalItem.title}
            </strong>
            <button
              type="button"
              onClick={() => {
                setPreviewModalItem(null);
              }}
              className={styles.btnSecondary}
            >
              ✕ Zamknij podgląd
            </button>
          </div>
          <div
            className={styles.viewerStage}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            {previewModalItem.mediaType === 'VIDEO' ? (
              <video
                src={previewModalItem.url}
                controls
                autoPlay
                style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain' }}
              />
            ) : previewModalItem.mediaType === 'AUDIO' ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '2rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  borderRadius: '14px',
                  width: '420px',
                  maxWidth: '90vw',
                }}
              >
                <span style={{ fontSize: '4rem' }}>🎵</span>
                <strong style={{ color: '#ffffff' }}>{previewModalItem.title}</strong>
                <audio src={previewModalItem.url} controls style={{ width: '100%' }} />
              </div>
            ) : (
              <img
                src={previewModalItem.url}
                alt={previewModalItem.title}
                style={{ maxWidth: '92vw', maxHeight: '84vh', objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: LINK EXISTING MEDIA FROM GALLERY (Point 3)
          ===================================================================== */}
      <GalleryBrowserModal
        isOpen={showLinkExistingModal}
        mode="multiple"
        excludeMediaIds={effectiveItems.map(i => i.id)}
        isSubmitting={isSubmitting}
        onClose={() => {
          setShowLinkExistingModal(false);
        }}
        onConfirmSelection={ids => {
          void handleConfirmLinkExisting(ids);
        }}
      />

      {/* =====================================================================
          MODAL 5: FULLSCREEN LIGHTBOX WITH DETAILS, VERSIONS & CONFIRMATIONS
          ===================================================================== */}
      <MediaItemLightboxModal
        items={allViewableItems}
        activeIndex={activeIndex}
        context={context}
        graveId={graveId}
        personId={personId}
        eventId={eventId}
        primaryMediaId={primaryMediaId}
        isAdmin={isAdmin}
        onClose={() => {
          setActiveIndex(null);
        }}
        onNavigateIndex={nextIdx => {
          setActiveIndex(nextIdx);
        }}
        onMediaUpdated={async () => {
          await loadMedia();
          onMediaChanged?.();
        }}
      />
    </section>
  );
}
                                          