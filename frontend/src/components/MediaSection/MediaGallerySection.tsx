import { useState, useEffect, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { extractAllClientFileMetadata } from '../../utils/clientMetadataExtractor';
import GalleryBrowserModal from './GalleryBrowserModal';
import MediaItemLightboxModal, { getMediaPersonLabels } from './MediaItemLightboxModal';
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

type CategoryModeOption = 'REGULAR' | 'PORTRAIT_SINGLE' | 'PORTRAIT_GROUP' | 'UNKNOWN';

interface DraftMetadataOption {
  sourceTag: string;
  formattedText: string;
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
}

interface FileDraftRow {
  existingId?: number;
  file?: File;
  displaySourceName: string;
  previewUrl: string;
  thumbUrl: string;
  mediaType: MediaType;
  selected: boolean;
  customFileName: string;
  categoryMode: CategoryModeOption;
  collectionIds: number[];
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
  metadataOptions: DraftMetadataOption[];
  selectedMetadataTag: string;
}

type DateSourceMode = 'EVENT_OR_MANUAL' | 'FILE_METADATA' | 'UNDATED';
type SectionMediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO';
type SectionSortMode = 'DATE_ASC' | 'DATE_DESC' | 'NAME_ASC' | 'NEWEST_ADDED';

const getPolishWeekdayLabel = (y: string, m: string, d: string): string | null => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;
  const date = new Date(Date.UTC(yNum, mNum - 1, dNum, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long' }).format(date);
};

const toIsoDateInputValue = (y: string, m: string, d: string): string => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return '';
  return `${String(yNum).padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
};

const QUALIFIER_OPTIONS = [
  { value: 'EXACT', label: 'Dokładnie' },
  { value: 'ABOUT', label: 'Około (ok.)' },
  { value: 'ESTIMATED', label: 'Szacunkowo' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
];

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
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
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

  const [typeFilter, setTypeFilter] = useState<SectionMediaTypeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SectionSortMode>('DATE_ASC');

  const [stagedRows, setStagedRows] = useState<FileDraftRow[]>([]);
  const [bulkDraftRows, setBulkDraftRows] = useState<FileDraftRow[]>([]);

  const [customFolderName, setCustomFolderName] = useState<string>('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<number[]>([]);
  const [addColPickerId, setAddColPickerId] = useState<string>('');
  const [bulkCategoryMode, setBulkCategoryMode] = useState<'NO_CHANGE' | CategoryModeOption>(
    context === 'PERSON' ? 'PORTRAIT_SINGLE' : 'REGULAR'
  );

  const [dateSourceMode, setDateSourceMode] = useState<DateSourceMode>(
    defaultEventYear ? 'EVENT_OR_MANUAL' : 'FILE_METADATA'
  );
  const [bulkEditDateMode, setBulkEditDateMode] = useState<
    'NO_CHANGE' | 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'
  >('NO_CHANGE');
  const [bulkEditMetadataTag, setBulkEditMetadataTag] = useState<string>('');

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

  const [activeRowSearchIdx, setActiveRowSearchIdx] = useState<number | null>(null);
  const [rowPersonQuery, setRowPersonQuery] = useState<string>('');
  const [rowPersonResults, setRowPersonResults] = useState<PersonListItemDto[]>([]);
  const [rowLinkRoleType, setRowLinkRoleType] = useState<'DEPICTED' | 'RELATED' | 'AUTHOR'>(
    'DEPICTED'
  );
  const [rowTextPersonInput, setRowTextPersonInput] = useState<string>('');
  const [rowTextPersonSex, setRowTextPersonSex] = useState<PersonSex>('UNKNOWN');

  const [previewModalItem, setPreviewModalItem] = useState<{
    url: string;
    mediaType: MediaType;
    title: string;
  } | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [showBulkUnlinkConfirm, setShowBulkUnlinkConfirm] = useState<boolean>(false);
  const [bulkUnlinkTargetColId, setBulkUnlinkTargetColId] = useState<string>('');
  const [rowColPickerId, setRowColPickerId] = useState<Record<number, string | undefined>>({});

  const [showLinkExistingModal, setShowLinkExistingModal] = useState<boolean>(false);
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
      } catch {
        setAvailableCollections([]);
      }
    };
    void fetchCols();

    if (collectionId) {
      setSelectedCollectionIds([collectionId]);
    } else {
      setSelectedCollectionIds([]);
    }
  }, [showUpload, isBulkEditMode, collectionId]);

  useEffect(() => {
    return () => {
      for (const st of stagedRows) {
        if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
      }
    };
  }, [stagedRows]);

  useEffect(() => {
    if (!isBulkEditMode) return;
    setBulkCategoryMode('NO_CHANGE');
    setBulkEditDateMode('NO_CHANGE');
    setBulkEditFolder('');
    setBulkBaseName('');
    setBulkTitle('');
    setBulkSourceText('');
    setBulkInscriptionText('');
    setBulkDescription('');
    setBulkPersonLinks([]);

    setBulkDraftRows(
      effectiveItems.map(item => {
        const pLabels = getMediaPersonLabels(item.mediaType);
        const combinedLinks: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[] = [];
        for (const d of item.depictedPersons ?? []) {
          combinedLinks.push({
            personId: d.personId,
            personText: d.personText,
            personSex: d.sex,
            linkType: 'DEPICTED',
            displayLabel: `${pLabels.depictedBadge}: ${d.displayName}`,
          });
        }
        for (const r of item.relatedPersons ?? []) {
          combinedLinks.push({
            personId: r.personId,
            personText: r.personText,
            personSex: r.sex,
            linkType: 'RELATED',
            displayLabel: `${pLabels.relatedBadge}: ${r.displayName}`,
          });
        }
        for (const a of item.authors ?? []) {
          combinedLinks.push({
            personId: a.personId,
            personText: a.personText,
            personSex: a.sex,
            linkType: 'AUTHOR',
            displayLabel: `${pLabels.authorBadge}: ${a.displayName}`,
          });
        }

        const metaOpts: DraftMetadataOption[] = (item.availableMetadataDates ?? []).map(m => ({
          sourceTag: m.sourceTag,
          formattedText: m.dateText,
          year: m.year,
          month: m.month,
          day: m.day,
          hour: m.hour,
          minute: m.minute,
          second: m.second,
        }));
        if (metaOpts.length === 0 && item.metadataYear && item.metadataDateText) {
          metaOpts.push({
            sourceTag: item.metadataDateSource ?? 'Metadane pliku',
            formattedText: item.metadataDateText,
            year: item.metadataYear,
            month: item.metadataMonth ?? null,
            day: item.metadataDay ?? null,
            hour: item.metadataHour ?? null,
            minute: item.metadataMinute ?? null,
            second: item.metadataSecond ?? null,
          });
        }

        const catMode: CategoryModeOption = item.portrait
          ? item.groupPortrait
            ? 'PORTRAIT_GROUP'
            : 'PORTRAIT_SINGLE'
          : item.unknownMedia
            ? 'UNKNOWN'
            : 'REGULAR';

        return {
          existingId: item.id,
          displaySourceName: item.fileName,
          previewUrl: mediaApi.getFileUrl(item.id),
          thumbUrl: mediaApi.getThumbnailUrl(item.id),
          mediaType: item.mediaType,
          selected: true,
          customFileName: item.fileName,
          categoryMode: catMode,
          collectionIds:
            item.collectionIds && item.collectionIds.length > 0
              ? [...item.collectionIds]
              : item.collectionId
                ? [item.collectionId]
                : [],
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
          metadataOptions: metaOpts,
          selectedMetadataTag: metaOpts.at(0)?.sourceTag ?? '',
        };
      })
    );
  }, [isBulkEditMode, effectiveItems]);

  const setBulkEditFolder = (val: string) => {
    setCustomFolderName(val);
  };

  const refreshDirectoryPreview = async (
    firstFile: File | undefined,
    folderNameOverride: string,
    primaryColId: number | undefined,
    catMode: CategoryModeOption | 'NO_CHANGE'
  ) => {
    if (!firstFile) {
      setDirectoryPreview('');
      return 'family_media';
    }
    try {
      const parsedManualYear =
        manualBulkYear.trim() !== '' ? Number(manualBulkYear) : undefined;
      const isPort = catMode === 'PORTRAIT_SINGLE' || catMode === 'PORTRAIT_GROUP';
      const isUnk = catMode === 'UNKNOWN';
      const preview = await mediaApi.previewFilename({
        primaryContext: isPort ? 'PERSON' : context,
        graveId,
        personId,
        eventId,
        collectionId: primaryColId,
        customYear: dateSourceMode === 'EVENT_OR_MANUAL' ? parsedManualYear : undefined,
        customFolderName: folderNameOverride.trim() || undefined,
        originalFilename: firstFile.name,
        mimeType: firstFile.type,
        portraitMedia: isPort,
        unknownMedia: isUnk,
        personsCount: catMode === 'PORTRAIT_GROUP' ? 2 : 1,
      });
      setDirectoryPreview(preview.directoryPath);
      return preview.suggestedFileName.replace(/\.[^.]+$/, '').replace(/_\d+$/, '');
    } catch {
      return 'family_media';
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    for (const old of stagedRows) {
      if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
    }
    if (!fileList || fileList.length === 0) {
      setStagedRows([]);
      setDirectoryPreview('');
      return;
    }
    const filesArray = Array.from(fileList);
    const firstFile = filesArray[0];

    const baseStem = await refreshDirectoryPreview(
      firstFile,
      customFolderName,
      selectedCollectionIds.at(0),
      bulkCategoryMode
    );
    setBulkBaseName(baseStem);

    const extractedLists = await Promise.all(
      filesArray.map(f => extractAllClientFileMetadata(f))
    );

    const defaultCat: CategoryModeOption =
      bulkCategoryMode !== 'NO_CHANGE'
        ? bulkCategoryMode
        : context === 'PERSON'
          ? 'PORTRAIT_SINGLE'
          : 'REGULAR';

    const staged: FileDraftRow[] = filesArray.map((f, idx) => {
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
      const objUrl =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '';

      return {
        file: f,
        displaySourceName: f.name,
        previewUrl: objUrl,
        thumbUrl: objUrl,
        mediaType: detectFileMediaType(f),
        selected: true,
        customFileName: `${baseStem}_${suffix}.${ext}`,
        categoryMode: defaultCat,
        collectionIds: [...selectedCollectionIds],
        title: bulkTitle.trim() || '',
        sourceText: bulkSourceText.trim() || '',
        inscriptionText: bulkInscriptionText.trim() || '',
        description: bulkDescription.trim() || '',
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

    setStagedRows(staged);
  };
    const syncBulkParamsToRows = (
    targetSetter: React.Dispatch<React.SetStateAction<FileDraftRow[]>>,
    params: {
      mode: 'FILE_METADATA' | 'EVENT_OR_MANUAL' | 'UNDATED' | 'NO_CHANGE';
      y?: string;
      m?: string;
      d?: string;
      h?: string;
      min?: string;
      sec?: string;
      stem?: string;
      isRange?: boolean;
      qual?: string;
      tQual?: string;
      rEndQual?: string;
      rEndY?: string;
      rEndM?: string;
      rEndD?: string;
      rEndTQual?: string;
      rEndH?: string;
      rEndMin?: string;
      rEndSec?: string;
      catMode?: 'NO_CHANGE' | CategoryModeOption;
      colIds?: number[];
    }
  ) => {
    const rawStem = params.stem ?? bulkBaseName;
    const cleanStem = rawStem
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    let counter = 1;
    targetSetter(prev =>
      prev.map(row => {
        if (!row.selected) return row;
        const ext = row.displaySourceName.includes('.')
          ? row.displaySourceName
              .slice(row.displaySourceName.lastIndexOf('.') + 1)
              .toLowerCase()
          : 'jpg';
        const suffix = String(counter++).padStart(2, '0');
        const nextFileName = cleanStem ? `${cleanStem}_${suffix}.${ext}` : row.customFileName;

        let nextY = row.year;
        let nextM = row.month;
        let nextD = row.day;
        let nextH = row.hour;
        let nextMin = row.minute;
        let nextSec = row.second;
        let nextIsBetween = row.isBetweenRange;
        let nextQual = row.dateQualifier;
        let nextTQual = row.timeQualifier;

        const chosenMeta =
          row.metadataOptions.find(o => o.sourceTag === row.selectedMetadataTag) ??
          row.metadataOptions.at(0);

        if (params.mode === 'FILE_METADATA') {
          nextIsBetween = false;
          nextQual = 'EXACT';
          nextTQual = 'EXACT';
          if (chosenMeta) {
            nextY = String(chosenMeta.year);
            nextM = chosenMeta.month !== null ? String(chosenMeta.month) : '';
            nextD = chosenMeta.day !== null ? String(chosenMeta.day) : '';
            nextH = chosenMeta.hour !== null ? String(chosenMeta.hour) : '';
            nextMin = chosenMeta.minute !== null ? String(chosenMeta.minute) : '';
            nextSec = chosenMeta.second !== null ? String(chosenMeta.second) : '';
          }
        } else if (params.mode === 'UNDATED') {
          nextIsBetween = false;
          nextY = '';
          nextM = '';
          nextD = '';
          nextH = '';
          nextMin = '';
          nextSec = '';
        } else if (params.mode === 'EVENT_OR_MANUAL') {
          nextY = params.y ?? manualBulkYear;
          nextM = params.m ?? manualBulkMonth;
          nextD = params.d ?? manualBulkDay;
          nextH = params.h ?? manualBulkHour;
          nextMin = params.min ?? manualBulkMinute;
          nextSec = params.sec ?? manualBulkSecond;
          nextIsBetween = params.isRange ?? uploadIsRange;
          nextQual = params.qual ?? manualBulkQual;
          nextTQual = params.tQual ?? manualBulkTimeQual;
        }

        const nextCat =
          params.catMode && params.catMode !== 'NO_CHANGE'
            ? params.catMode
            : row.categoryMode;
        const nextCols =
          params.colIds !== undefined ? [...params.colIds] : row.collectionIds;

        return {
          ...row,
          customFileName: nextFileName,
          categoryMode: nextCat,
          collectionIds: nextCols,
          isBetweenRange: nextIsBetween,
          dateQualifier: nextQual,
          year: nextY,
          month: nextM,
          day: nextD,
          timeQualifier: nextTQual,
          hour: nextH,
          minute: nextMin,
          second: nextSec,
          rangeEndQualifier: params.rEndQual ?? manualBulkRangeEndQual,
          rangeEndYear: params.rEndY ?? manualBulkRangeEndYear,
          rangeEndMonth: params.rEndM ?? manualBulkRangeEndMonth,
          rangeEndDay: params.rEndD ?? manualBulkRangeEndDay,
          rangeEndTimeQualifier: params.rEndTQual ?? manualBulkRangeEndTimeQual,
          rangeEndHour: params.rEndH ?? manualBulkRangeEndHour,
          rangeEndMinute: params.rEndMin ?? manualBulkRangeEndMinute,
          rangeEndSecond: params.rEndSec ?? manualBulkRangeEndSecond,
        };
      })
    );
  };

  const handleApplyBulkDetailsToChecked = (
    targetSetter: React.Dispatch<React.SetStateAction<FileDraftRow[]>>
  ) => {
    targetSetter(prev =>
      prev.map(item =>
        !item.selected
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

  const handleSearchPersonForRow = async (idx: number) => {
    if (rowPersonQuery.trim() === '') return;
    try {
      const res = await biographyApi.listPeople({
        search: rowPersonQuery.trim(),
        page: 0,
        size: 8,
      });
      setActiveRowSearchIdx(idx);
      setRowPersonResults(res.content);
    } catch {
      setRowPersonResults([]);
    }
  };

  const handleMoveColOrder = (
    idx: number,
    dir: -1 | 1,
    rowSetter: React.Dispatch<React.SetStateAction<FileDraftRow[]>>
  ) => {
    setSelectedCollectionIds(prev => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = tmp;
      syncBulkParamsToRows(rowSetter, { mode: 'NO_CHANGE', colIds: copy });
      return copy;
    });
  };

  const requiresCollectionOnUpload =
    context !== 'GRAVE' &&
    !(context === 'EVENT' && Boolean(defaultEventYear)) &&
    stagedRows.some(
      r =>
        r.collectionIds.length === 0 &&
        selectedCollectionIds.length === 0 &&
        (r.year.trim() === '' ||
          (context === 'EVENT' && !defaultEventYear) ||
          r.categoryMode === 'PORTRAIT_SINGLE' ||
          r.categoryMode === 'PORTRAIT_GROUP' ||
          r.categoryMode === 'UNKNOWN')
    );

  const handleUploadSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stagedRows.length === 0) return;

    if (requiresCollectionOnUpload) {
      setErrorMessage(
        'Wybierz kolekcję docelową dla plików bez daty, portretów lub wydarzenia bez daty.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetPersonIds =
      personId !== undefined ? [personId] : (defaultPersonIds ?? []);

    try {
      for (const st of stagedRows) {
        if (!st.file) continue;

        const rowCols =
          st.collectionIds.length > 0 ? st.collectionIds : selectedCollectionIds;
        const isPort =
          st.categoryMode === 'PORTRAIT_SINGLE' ||
          st.categoryMode === 'PORTRAIT_GROUP';
        const isUnk = st.categoryMode === 'UNKNOWN';
        const effCtx: MediaPrimaryContext =
          isPort && context === 'COLLECTION' ? 'PERSON' : context;
        const isSinglePrimary = stagedRows.length === 1 && setAsPrimary;

        const created = await mediaApi.uploadMedia({
          file: st.file,
          primaryContext: effCtx,
          customFolderName: optTrim(customFolderName),
          customFileName: st.customFileName,
          title: optTrim(st.title),
          sourceText: optTrim(st.sourceText),
          inscriptionText: optTrim(st.inscriptionText),
          description: optTrim(st.description),
          graveId,
          eventId,
          collectionId: rowCols.at(0),
          collectionIds: rowCols.length > 0 ? rowCols : undefined,
          isBetweenRange: st.isBetweenRange,
          dateQualifier: st.dateQualifier,
          customYear: parseOptInt(st.year) ?? undefined,
          customMonth: parseOptInt(st.month) ?? undefined,
          customDay: parseOptInt(st.day) ?? undefined,
          timeQualifier: st.timeQualifier,
          customHour: parseOptInt(st.hour) ?? undefined,
          customMinute: parseOptInt(st.minute) ?? undefined,
          customSecond: parseOptInt(st.second) ?? undefined,
          rangeEndQualifier: st.isBetweenRange ? st.rangeEndQualifier : undefined,
          rangeEndYear: st.isBetweenRange
            ? (parseOptInt(st.rangeEndYear) ?? undefined)
            : undefined,
          rangeEndMonth: st.isBetweenRange
            ? (parseOptInt(st.rangeEndMonth) ?? undefined)
            : undefined,
          rangeEndDay: st.isBetweenRange
            ? (parseOptInt(st.rangeEndDay) ?? undefined)
            : undefined,
          rangeEndTimeQualifier: st.isBetweenRange
            ? st.rangeEndTimeQualifier
            : undefined,
          rangeEndHour: st.isBetweenRange
            ? (parseOptInt(st.rangeEndHour) ?? undefined)
            : undefined,
          rangeEndMinute: st.isBetweenRange
            ? (parseOptInt(st.rangeEndMinute) ?? undefined)
            : undefined,
          rangeEndSecond: st.isBetweenRange
            ? (parseOptInt(st.rangeEndSecond) ?? undefined)
            : undefined,
          selectedMetadataSourceTag: optTrim(st.selectedMetadataTag),
          clientLastModifiedMs:
            st.file.lastModified > 0 ? st.file.lastModified : undefined,
          personIds: targetPersonIds,
          portraitMedia: isPort,
          unknownMedia: isUnk,
          setAsPersonAvatar: context === 'PERSON' && isSinglePrimary,
          setAsGravePrimary: context === 'GRAVE' && isSinglePrimary,
        });

        if (
          st.personLinks.length > 0 ||
          st.categoryMode === 'PORTRAIT_GROUP' ||
          rowCols.length > 1
        ) {
          await mediaApi.updateMedia(created.id, {
            title: optTrim(st.title) ?? created.title,
            sourceText: optTrim(st.sourceText) ?? created.sourceText,
            inscriptionText: optTrim(st.inscriptionText) ?? created.inscriptionText,
            description: optTrim(st.description) ?? created.description,
            portrait: isPort,
            groupPortrait: st.categoryMode === 'PORTRAIT_GROUP',
            unknownMedia: isUnk,
            collectionIds: rowCols,
            personLinks: st.personLinks.map(l => ({
              personId: l.personId,
              personText: l.personText,
              personSex: l.personSex,
              linkType: l.linkType,
            })),
          });
        }
      }

      closeUploadModal();
      setStagedRows([]);
      setCustomFolderName('');
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się wgrać plików.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyBulkEdit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectedDrafts = bulkDraftRows.filter(
      d => d.selected && d.existingId !== undefined
    );
    if (selectedDrafts.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await mediaApi.bulkUpdateMedia({
        mediaIds: selectedDrafts.map(d => d.existingId ?? 0),
        baseFileNameStem: bulkBaseName.trim() || null,
        customFolderName: customFolderName.trim() || null,
        contextEventId: eventId ?? null,
        targetCollectionIds:
          selectedCollectionIds.length > 0 ? selectedCollectionIds : undefined,
        categoryMode: bulkCategoryMode,
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
        isBetweenRange: uploadIsRange,
        dateQualifier: manualBulkQual,
        year: parseOptInt(manualBulkYear),
        month: parseOptInt(manualBulkMonth),
        day: parseOptInt(manualBulkDay),
        timeQualifier: manualBulkTimeQual,
        hour: parseOptInt(manualBulkHour),
        minute: parseOptInt(manualBulkMinute),
        second: parseOptInt(manualBulkSecond),
        rangeEndQualifier: manualBulkRangeEndQual,
        rangeEndYear: parseOptInt(manualBulkRangeEndYear),
        rangeEndMonth: parseOptInt(manualBulkRangeEndMonth),
        rangeEndDay: parseOptInt(manualBulkRangeEndDay),
        rangeEndTimeQualifier: manualBulkRangeEndTimeQual,
        rangeEndHour: parseOptInt(manualBulkRangeEndHour),
        rangeEndMinute: parseOptInt(manualBulkRangeEndMinute),
        rangeEndSecond: parseOptInt(manualBulkRangeEndSecond),
      });

      for (const d of selectedDrafts) {
        if (d.existingId === undefined) continue;
        const isPort =
          d.categoryMode === 'PORTRAIT_SINGLE' || d.categoryMode === 'PORTRAIT_GROUP';
        const isUnk = d.categoryMode === 'UNKNOWN';
        await mediaApi.updateMedia(d.existingId, {
          fileName: d.customFileName,
          title: d.title,
          sourceText: d.sourceText,
          inscriptionText: d.inscriptionText,
          description: d.description,
          portrait: isPort,
          groupPortrait: d.categoryMode === 'PORTRAIT_GROUP',
          unknownMedia: isUnk,
          collectionIds: d.collectionIds,
          dateSourceMode:
            bulkEditDateMode === 'METADATA' || bulkEditDateMode === 'EVENT'
              ? null
              : d.year.trim() === ''
                ? 'UNDATED'
                : 'MANUAL',
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

      closeBulkEditModal();
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się zapisać zmian zbiorowych.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    const idsToDelete = bulkDraftRows
      .filter(d => d.selected && d.existingId !== undefined)
      .map(d => d.existingId ?? 0);
    if (idsToDelete.length === 0) return;

    setIsSubmitting(true);
    try {
      await mediaApi.bulkDeleteMedia(idsToDelete);
      setShowBulkDeleteConfirm(false);
      closeBulkEditModal();
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się usunąć zaznaczonych plików.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const doesBulkUnlinkRequireTargetCollection = (): boolean => {
    const selectedIds = new Set(
      bulkDraftRows
        .filter(d => d.selected && d.existingId !== undefined)
        .map(d => d.existingId)
    );
    for (const item of effectiveItems) {
      if (!selectedIds.has(item.id)) continue;
      const remEvents = (item.eventIds ?? []).filter(id => id !== eventId);
      const remGraves = item.graveIds.filter(id => id !== graveId);
      const remPersons = item.personIds.filter(id => id !== personId);
      const curCols =
        item.collectionIds && item.collectionIds.length > 0
          ? item.collectionIds
          : item.collectionId
            ? [item.collectionId]
            : [];
      const remCols = curCols.filter(id => id !== collectionId);

      const losingEvtFolder =
        eventId !== undefined &&
        remEvents.length === 0 &&
        item.primaryContext === 'EVENT';
      const losingGrvFolder =
        graveId !== undefined &&
        remGraves.length === 0 &&
        item.primaryContext === 'GRAVE';
      const losingAll =
        remEvents.length === 0 &&
        remGraves.length === 0 &&
        remPersons.length === 0 &&
        remCols.length === 0;

      if (
        losingAll ||
        ((losingEvtFolder || losingGrvFolder) &&
          remCols.length === 0 &&
          remEvents.length === 0 &&
          remGraves.length === 0)
      ) {
        return true;
      }
    }
    return false;
  };

  const handleConfirmBulkUnlink = async () => {
    const idsToUnlink = bulkDraftRows
      .filter(d => d.selected && d.existingId !== undefined)
      .map(d => d.existingId ?? 0);
    if (idsToUnlink.length === 0) return;

    const needsTargetCol = doesBulkUnlinkRequireTargetCollection();
    if (needsTargetCol && bulkUnlinkTargetColId === '') {
      setErrorMessage('Wybierz kolekcję docelową dla odpinanych plików.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await mediaApi.bulkUnlinkMedia({
        mediaIds: idsToUnlink,
        graveId: graveId ?? null,
        personId: personId ?? null,
        eventId: eventId ?? null,
        collectionId: collectionId ?? null,
        targetCollectionId:
          bulkUnlinkTargetColId !== '' ? Number(bulkUnlinkTargetColId) : null,
      });
      setShowBulkUnlinkConfirm(false);
      closeBulkEditModal();
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się odpiąć zaznaczonych plików.');
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
    const renderDraftFileCard = (
    st: FileDraftRow,
    idx: number,
    listSetter: React.Dispatch<React.SetStateAction<FileDraftRow[]>>,
    isBulkEdit: boolean
  ) => {
    const chosenMeta =
      st.metadataOptions.find(o => o.sourceTag === st.selectedMetadataTag) ??
      st.metadataOptions.at(0);
    const rowStartWeekday = getPolishWeekdayLabel(st.year, st.month, st.day);
    const rowEndWeekday = getPolishWeekdayLabel(
      st.rangeEndYear,
      st.rangeEndMonth,
      st.rangeEndDay
    );
    const pLabels = getMediaPersonLabels(st.mediaType);
    const roleBadge = (r: 'DEPICTED' | 'RELATED' | 'AUTHOR') =>
      r === 'DEPICTED'
        ? pLabels.depictedBadge
        : r === 'RELATED'
          ? pLabels.relatedBadge
          : pLabels.authorBadge;

    return (
      <div
        key={`${st.displaySourceName}-${String(st.existingId ?? idx)}`}
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
            <input
              type="checkbox"
              data-testid={
                isBulkEdit && st.existingId !== undefined
                  ? `bulk-media-checkbox-${String(st.existingId)}`
                  : undefined
              }
              checked={st.selected}
              onChange={e => {
                const checked = e.target.checked;
                listSetter(prev =>
                  prev.map((item, i) => (i === idx ? { ...item, selected: checked } : item))
                );
              }}
            />
            <span className={styles.breakableCode}>📄 {st.displaySourceName}</span>
          </label>

          {chosenMeta ? (
            <div className={styles.metadataBadge}>
              <span>📷 Data z metadanych —</span>
              {st.metadataOptions.length > 1 ? (
                <select
                  value={st.selectedMetadataTag}
                  onChange={e => {
                    const tag = e.target.value;
                    const opt = st.metadataOptions.find(o => o.sourceTag === tag);
                    listSetter(prev =>
                      prev.map((item, i) =>
                        i === idx
                          ? {
                              ...item,
                              selectedMetadataTag: tag,
                              year: opt ? String(opt.year) : item.year,
                              month: opt?.month !== null && opt?.month !== undefined ? String(opt.month) : item.month,
                              day: opt?.day !== null && opt?.day !== undefined ? String(opt.day) : item.day,
                              hour: opt?.hour !== null && opt?.hour !== undefined ? String(opt.hour) : item.hour,
                              minute: opt?.minute !== null && opt?.minute !== undefined ? String(opt.minute) : item.minute,
                              second: opt?.second !== null && opt?.second !== undefined ? String(opt.second) : item.second,
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
                      {opt.sourceTag}: {opt.formattedText}
                    </option>
                  ))}
                </select>
              ) : (
                <span>
                  {chosenMeta.sourceTag}: <strong>{chosenMeta.formattedText}</strong>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  listSetter(prev =>
                    prev.map((item, i) =>
                      i === idx
                        ? {
                            ...item,
                            isBetweenRange: false,
                            dateQualifier: 'EXACT',
                            timeQualifier: 'EXACT',
                            year: String(chosenMeta.year),
                            month: chosenMeta.month !== null ? String(chosenMeta.month) : '',
                            day: chosenMeta.day !== null ? String(chosenMeta.day) : '',
                            hour: chosenMeta.hour !== null ? String(chosenMeta.hour) : '',
                            minute: chosenMeta.minute !== null ? String(chosenMeta.minute) : '',
                            second: chosenMeta.second !== null ? String(chosenMeta.second) : '',
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
          <button
            type="button"
            title="Kliknij, aby powiększyć i przeanalizować plik"
            onClick={() => {
              if (st.previewUrl) {
                setPreviewModalItem({
                  url: st.previewUrl,
                  mediaType: st.mediaType,
                  title: st.title || st.displaySourceName,
                });
              }
            }}
            className={styles.stagedThumbButton}
          >
            {st.mediaType === 'IMAGE' && st.thumbUrl ? (
              <img
                src={st.thumbUrl}
                alt={st.displaySourceName}
                className={styles.stagedThumbImg}
              />
            ) : st.mediaType === 'VIDEO' && st.previewUrl ? (
              <video
                src={`${st.previewUrl}#t=0.5`}
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

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className={styles.stagedInputsGrid}>
              <div>
                <span className={styles.label}>Nazwa pliku na dysku</span>
                <input
                  type="text"
                  aria-label="Nazwa pliku na dysku"
                  data-testid={
                    !isBulkEdit
                      ? idx === 0
                        ? 'media-filename-input'
                        : `media-filename-input-${String(idx)}`
                      : undefined
                  }
                  value={st.customFileName}
                  onChange={e => {
                    const val = e.target.value;
                    listSetter(prev =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, customFileName: val } : item
                      )
                    );
                  }}
                  placeholder="Nazwa snake_case.jpg"
                  className={styles.input}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <span className={styles.label}>
                    Data i czas {rowStartWeekday ? `(📅 ${rowStartWeekday})` : ''}
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
                        listSetter(prev =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, isBetweenRange: checked } : item
                          )
                        );
                      }}
                    />
                    <span>Przedział „między … a …”</span>
                  </label>
                </div>

                {/* Row 1: Date only (Qualifier + Calendar + YYYY + MM + DD) */}
                <div className={styles.compactDateTimeInputs}>
                  <select
                    value={st.dateQualifier}
                    onChange={e => {
                      const val = e.target.value;
                      listSetter(prev =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, dateQualifier: val } : item
                        )
                      );
                    }}
                    className={styles.input}
                    style={{ width: '115px', height: '34px', fontSize: '0.76rem' }}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    aria-label="Wybór daty z kalendarza"
                    value={toIsoDateInputValue(st.year, st.month, st.day)}
                    onChange={e => {
                      if (e.target.value) {
                        const p = e.target.value.split('-');
                        if (p.length === 3) {
                          listSetter(prev =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    year: String(Number(p[0])),
                                    month: String(Number(p[1])),
                                    day: String(Number(p[2])),
                                  }
                                : item
                            )
                          );
                        }
                      }
                    }}
                    className={styles.input}
                    style={{ width: '136px', height: '34px', fontSize: '0.76rem' }}
                  />

                  <div className={styles.timeHmsGroup}>
                    <input
                      type="number"
                      aria-label="Rok zdjęcia"
                      placeholder="RRRR"
                      value={st.year}
                      onChange={e => {
                        const val = e.target.value;
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, year: val } : item))
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
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, month: val } : item))
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
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, day: val } : item))
                        );
                      }}
                      className={styles.miniDateInput}
                    />
                  </div>
                </div>

                {/* Row 2: Time only (Time Qualifier + HH : MM : SS) */}
                <div className={styles.compactDateTimeInputs}>
                  <select
                    aria-label="Kwalifikator czasu"
                    value={st.timeQualifier}
                    onChange={e => {
                      const val = e.target.value;
                      listSetter(prev =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, timeQualifier: val } : item
                        )
                      );
                    }}
                    className={styles.input}
                    style={{ width: 'auto', minWidth: '165px', height: '34px', fontSize: '0.76rem' }}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>
                        Czas: {q.label}
                      </option>
                    ))}
                  </select>

                  <div className={styles.timeHmsGroup}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      placeholder="GG"
                      value={st.hour}
                      onChange={e => {
                        const val = e.target.value;
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, hour: val } : item))
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
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, minute: val } : item))
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
                        listSetter(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, second: val } : item))
                        );
                      }}
                      className={styles.miniDateInput}
                    />
                  </div>
                </div>

                {st.isBetweenRange && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      marginTop: '0.25rem',
                      paddingTop: '0.4rem',
                      borderTop: '1px dashed #cbd5e1',
                    }}
                  >
                    <span className={styles.label}>
                      Druga granica („… a …”) {rowEndWeekday ? `(📅 ${rowEndWeekday})` : ''}:
                    </span>

                    {/* Range End Row 1: Date */}
                    <div className={styles.compactDateTimeInputs}>
                      <select
                        value={st.rangeEndQualifier}
                        onChange={e => {
                          const val = e.target.value;
                          listSetter(prev =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, rangeEndQualifier: val } : item
                            )
                          );
                        }}
                        className={styles.input}
                        style={{ width: '115px', height: '34px', fontSize: '0.76rem' }}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="date"
                        value={toIsoDateInputValue(
                          st.rangeEndYear,
                          st.rangeEndMonth,
                          st.rangeEndDay
                        )}
                        onChange={e => {
                          if (e.target.value) {
                            const p = e.target.value.split('-');
                            if (p.length === 3) {
                              listSetter(prev =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        rangeEndYear: String(Number(p[0])),
                                        rangeEndMonth: String(Number(p[1])),
                                        rangeEndDay: String(Number(p[2])),
                                      }
                                    : item
                                )
                              );
                            }
                          }
                        }}
                        className={styles.input}
                        style={{ width: '136px', height: '34px', fontSize: '0.76rem' }}
                      />

                      <div className={styles.timeHmsGroup}>
                        <input
                          type="number"
                          placeholder={st.year || 'RRRR'}
                          value={st.rangeEndYear}
                          onChange={e => {
                            const val = e.target.value;
                            listSetter(prev =>
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
                            listSetter(prev =>
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
                            listSetter(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, rangeEndDay: val } : item
                              )
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>

                    {/* Range End Row 2: Time */}
                    <div className={styles.compactDateTimeInputs}>
                      <select
                        value={st.rangeEndTimeQualifier}
                        onChange={e => {
                          const val = e.target.value;
                          listSetter(prev =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, rangeEndTimeQualifier: val } : item
                            )
                          );
                        }}
                        className={styles.input}
                        style={{
                          width: 'auto',
                          minWidth: '165px',
                          height: '34px',
                          fontSize: '0.76rem',
                        }}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            Czas: {q.label}
                          </option>
                        ))}
                      </select>

                      <div className={styles.timeHmsGroup}>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={st.rangeEndHour}
                          onChange={e => {
                            const val = e.target.value;
                            listSetter(prev =>
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
                            const v = e.target.value;
                            listSetter(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, rangeEndMinute: v } : item
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
                            const v = e.target.value;
                            listSetter(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, rangeEndSecond: v } : item
                              )
                            );
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>
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
                    listSetter(prev =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, showDetails: !item.showDetails } : item
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
                    st.personLinks.length > 0) && (
                    <span style={{ marginLeft: '0.4rem', color: '#16a34a', fontWeight: 800 }}>
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
                <span className={styles.label}>Kategoria w kolekcji</span>
                <select
                  value={st.categoryMode}
                  onChange={e => {
                    const val = e.target.value as CategoryModeOption;
                    listSetter(prev =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, categoryMode: val } : item
                      )
                    );
                  }}
                  className={styles.input}
                >
                  <option value="REGULAR">📄 Zwykły plik (główny folder)</option>
                  <option value="PORTRAIT_SINGLE">👤 Portret jednoosobowy</option>
                  <option value="PORTRAIT_GROUP">👥 Portret grupowy</option>
                  <option value="UNKNOWN">❓ Nieznane (do identyfikacji)</option>
                </select>
              </div>
              <div className={styles.formField}>
                <span className={styles.label}>Tytuł</span>
                <input
                  type="text"
                  aria-label="Tytuł zdjęcia"
                  placeholder="Krótki tytuł pliku..."
                  value={st.title}
                  onChange={e => {
                    const val = e.target.value;
                    listSetter(prev =>
                      prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                    );
                  }}
                  className={styles.input}
                />
              </div>
              <div className={styles.formField}>
                <span className={styles.label}>Źródło pliku (tekstowo)</span>
                <input
                  type="text"
                  placeholder="np. Z albumu babci Katarzyny"
                  value={st.sourceText}
                  onChange={e => {
                    const val = e.target.value;
                    listSetter(prev =>
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
                  Podpis z odwrotu / oryginalna dedykacja
                </span>
                <input
                  type="text"
                  placeholder="np. Na pamiątkę z Krynicy, 1938 r."
                  value={st.inscriptionText}
                  onChange={e => {
                    const val = e.target.value;
                    listSetter(prev =>
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
              <span className={styles.label}>Opis tekstowy (zwykły tekst)</span>
              <textarea
                rows={3}
                placeholder="Dodatkowe informacje o zdjęciu/nagraniu..."
                value={st.description}
                onChange={e => {
                  const val = e.target.value;
                  listSetter(prev =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, description: val } : item
                    )
                  );
                }}
                className={styles.textarea}
              />
            </div>

            {availableCollections.length > 0 && (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.65rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                <span className={styles.label}>
                  Przypisane kolekcje dla tego pliku (pierwsza określa folder na dysku):
                </span>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <select
                    value={rowColPickerId[idx] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      setRowColPickerId(prev => ({ ...prev, [idx]: val }));
                      if (val !== '') {
                        const cId = Number(val);
                        listSetter(prev =>
                          prev.map((item, i) =>
                            i === idx && !item.collectionIds.includes(cId)
                              ? { ...item, collectionIds: [...item.collectionIds, cId] }
                              : item
                          )
                        );
                        setRowColPickerId(prev => ({ ...prev, [idx]: '' }));
                      }
                    }}
                    className={styles.input}
                    style={{ maxWidth: '340px' }}
                  >
                    <option value="">— Dodaj ten plik do kolekcji / albumu —</option>
                    {availableCollections
                      .filter(c => !st.collectionIds.includes(c.id))
                      .map(col => (
                        <option key={col.id} value={String(col.id)}>
                          {col.datedCollection
                            ? `📅 [Album] ${col.name}`
                            : `📦 [Kolekcja] ${col.name}`}
                        </option>
                      ))}
                  </select>
                </div>

                {st.collectionIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {st.collectionIds.map((cId, cIdx) => {
                      const colObj = availableCollections.find(c => c.id === cId);
                      return (
                        <span
                          key={cId}
                          className={styles.selectedFilesBadge}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <span>
                            {cIdx === 0 ? '📁 [Główna] ' : '📦 '}
                            {colObj?.name ?? 'Kolekcja'}
                          </span>
                          <button
                            type="button"
                            disabled={cIdx === 0}
                            onClick={() => {
                              listSetter(prev =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const copy = [...item.collectionIds];
                                  const tmp = copy[cIdx];
                                  copy[cIdx] = copy[cIdx - 1];
                                  copy[cIdx - 1] = tmp;
                                  return { ...item, collectionIds: copy };
                                })
                              );
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={cIdx === st.collectionIds.length - 1}
                            onClick={() => {
                              listSetter(prev =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const copy = [...item.collectionIds];
                                  const tmp = copy[cIdx];
                                  copy[cIdx] = copy[cIdx + 1];
                                  copy[cIdx + 1] = tmp;
                                  return { ...item, collectionIds: copy };
                                })
                              );
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              listSetter(prev =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        collectionIds: item.collectionIds.filter(
                                          id => id !== cId
                                        ),
                                      }
                                    : item
                                )
                              );
                            }}
                            className={styles.pillRemoveBtn}
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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
              <span className={styles.label}>{pLabels.sectionTitle}</span>
              <div className={styles.personLinksGrid}>
                <div className={styles.formField}>
                  <span className={styles.label}>Rodzaj powiązania</span>
                  <select
                    value={rowLinkRoleType}
                    onChange={e => {
                      setRowLinkRoleType(
                        e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR'
                      );
                    }}
                    className={styles.input}
                  >
                    <option value="DEPICTED">{pLabels.depictedOption}</option>
                    <option value="RELATED">{pLabels.relatedOption}</option>
                    <option value="AUTHOR">{pLabels.authorOption}</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <span className={styles.label}>Dodaj osobę z drzewa</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="Szukaj w drzewie..."
                      value={activeRowSearchIdx === idx ? rowPersonQuery : ''}
                      onChange={e => {
                        setActiveRowSearchIdx(idx);
                        setRowPersonQuery(e.target.value);
                      }}
                      className={styles.input}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleSearchPersonForRow(idx);
                      }}
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
                      value={activeRowSearchIdx === idx ? rowTextPersonInput : ''}
                      onChange={e => {
                        setActiveRowSearchIdx(idx);
                        setRowTextPersonInput(e.target.value);
                      }}
                      className={styles.input}
                    />
                    <select
                      value={rowTextPersonSex}
                      onChange={e => {
                        setRowTextPersonSex(e.target.value as PersonSex);
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
                        const txt = rowTextPersonInput.trim();
                        if (txt === '') return;
                        listSetter(prev =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  personLinks: [
                                    ...item.personLinks,
                                    {
                                      personText: txt,
                                      personSex: rowTextPersonSex,
                                      linkType: rowLinkRoleType,
                                      displayLabel: `${roleBadge(rowLinkRoleType)}: ${txt} [spoza bazy]`,
                                    },
                                  ],
                                }
                              : item
                          )
                        );
                        setRowTextPersonInput('');
                      }}
                      className={styles.btnSecondary}
                    >
                      + Dodaj
                    </button>
                  </div>
                </div>
              </div>

              {activeRowSearchIdx === idx && rowPersonResults.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {rowPersonResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
                        listSetter(prev =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  personLinks: [
                                    ...item.personLinks,
                                    {
                                      personId: p.id,
                                      linkType: rowLinkRoleType,
                                      displayLabel: `${roleBadge(rowLinkRoleType)}: ${fullName}`,
                                    },
                                  ],
                                }
                              : item
                          )
                        );
                        setRowPersonResults([]);
                        setRowPersonQuery('');
                      }}
                      className={styles.btnSecondary}
                    >
                      + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                    </button>
                  ))}
                </div>
              )}

              {st.personLinks.length > 0 && (
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
                          listSetter(prev =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    personLinks: item.personLinks.filter(
                                      (_, pi) => pi !== pIdx
                                    ),
                                  }
                                : item
                            )
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
          </div>
        )}
      </div>
    );
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
                const idx = allViewableItems.findIndex(m => m.id === item.id);
                setActiveIndex(idx >= 0 ? idx : 0);
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
    const renderSharedBulkTopPanel = (
    isBulkEdit: boolean,
    activeRows: FileDraftRow[],
    rowSetter: React.Dispatch<React.SetStateAction<FileDraftRow[]>>
  ) => {
    const selectedCount = activeRows.filter(r => r.selected).length;
    const bulkStartWeekday = getPolishWeekdayLabel(
      manualBulkYear,
      manualBulkMonth,
      manualBulkDay
    );
    const bulkEndWeekday = getPolishWeekdayLabel(
      manualBulkRangeEndYear,
      manualBulkRangeEndMonth,
      manualBulkRangeEndDay
    );

    const isManualDateActive = isBulkEdit
      ? bulkEditDateMode === 'MANUAL'
      : dateSourceMode === 'EVENT_OR_MANUAL';

    return (
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
            ⚙️ Ustawienia zbiorcze dla zaznaczonych plików ({String(selectedCount)} z{' '}
            {String(activeRows.length)})
          </strong>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                rowSetter(prev => prev.map(r => ({ ...r, selected: true })));
              }}
              className={styles.btnSecondary}
            >
              Zaznacz wszystkie
            </button>
            <button
              type="button"
              onClick={() => {
                rowSetter(prev => prev.map(r => ({ ...r, selected: false })));
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
              {showBulkDetails
                ? '▲ Zwiń zbiorcze szczegóły i osoby'
                : '▼ Rozwiń zbiorcze szczegóły i osoby'}
            </button>
          </div>
        </div>

        <div className={styles.formGrid}>
          {!isBulkEdit && (
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
                  {activeRows.length === 0
                    ? 'Nie wybrano plików'
                    : `Wybrano plików: ${String(activeRows.length)}`}
                </span>
              </div>
            </div>
          )}

          <div className={styles.formField}>
            <label htmlFor="bulk-folder-input" className={styles.label}>
              {isBulkEdit
                ? 'Zmień nazwę całego folderu docelowego'
                : 'Własna nazwa folderu docelowego (opcjonalnie)'}
            </label>
            <input
              id="bulk-folder-input"
              type="text"
              placeholder={
                effectiveItems.at(0)?.directoryPath ?? 'Zostaw puste dla domyślnej nazwy...'
              }
              value={customFolderName}
              onChange={e => {
                const nextFolder = e.target.value;
                setBulkEditFolder(nextFolder);
                if (!isBulkEdit) {
                  void refreshDirectoryPreview(
                    stagedRows.at(0)?.file,
                    nextFolder,
                    selectedCollectionIds.at(0),
                    bulkCategoryMode
                  );
                }
              }}
              className={styles.input}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="bulk-stem-input" className={styles.label}>
              Wspólny trzon nazwy plików (ponumeruje _01, _02...)
            </label>
            <input
              id="bulk-stem-input"
              type="text"
              placeholder="np. wakacje_kolobrzeg"
              value={bulkBaseName}
              onChange={e => {
                const nextStem = e.target.value;
                setBulkBaseName(nextStem);
                syncBulkParamsToRows(rowSetter, {
                  mode: isBulkEdit
                    ? bulkEditDateMode === 'MANUAL'
                      ? 'EVENT_OR_MANUAL'
                      : 'NO_CHANGE'
                    : dateSourceMode,
                  stem: nextStem,
                });
              }}
              className={styles.input}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="bulk-category-select" className={styles.label}>
              Kategoria plików w kolekcji (Portret / Nieznane)
            </label>
            <select
              id="bulk-category-select"
              value={bulkCategoryMode}
              onChange={e => {
                const nextCat = e.target.value as 'NO_CHANGE' | CategoryModeOption;
                setBulkCategoryMode(nextCat);
                syncBulkParamsToRows(rowSetter, {
                  mode: 'NO_CHANGE',
                  catMode: nextCat,
                });
                if (!isBulkEdit) {
                  void refreshDirectoryPreview(
                    stagedRows.at(0)?.file,
                    customFolderName,
                    selectedCollectionIds.at(0),
                    nextCat
                  );
                }
              }}
              className={styles.input}
            >
              {isBulkEdit && <option value="NO_CHANGE">— Pozostaw kategorię bez zmian —</option>}
              <option value="REGULAR">📄 Zwykły plik (główny folder kolekcji)</option>
              <option value="PORTRAIT_SINGLE">
                👤 Portret pojedynczy (portraits/single)
              </option>
              <option value="PORTRAIT_GROUP">👥 Portret grupowy (portraits/group)</option>
              <option value="UNKNOWN">
                ❓ Nieznane – do identyfikacji (podfolder unknown)
              </option>
            </select>
          </div>

          {context !== 'GRAVE' && (
            <div className={styles.formField}>
              <label htmlFor="bulk-date-mode-select" className={styles.label}>
                Zbiorcze ustawienie daty i czasu dla zaznaczonych
              </label>
              {isBulkEdit ? (
                <select
                  id="bulk-date-mode-select"
                  data-testid="bulk-edit-date-mode-select"
                  value={bulkEditDateMode}
                  onChange={e => {
                    const nextM = e.target.value as
                      | 'NO_CHANGE'
                      | 'MANUAL'
                      | 'METADATA'
                      | 'EVENT'
                      | 'UNDATED';
                    setBulkEditDateMode(nextM);
                    if (nextM === 'METADATA') {
                      syncBulkParamsToRows(rowSetter, { mode: 'FILE_METADATA' });
                    } else if (nextM === 'UNDATED') {
                      syncBulkParamsToRows(rowSetter, { mode: 'UNDATED' });
                    } else if (nextM === 'MANUAL') {
                      syncBulkParamsToRows(rowSetter, { mode: 'EVENT_OR_MANUAL' });
                    }
                  }}
                  className={styles.input}
                >
                  <option value="NO_CHANGE">— Pozostaw daty bez zmian —</option>
                  <option value="METADATA">
                    Przywróć datę i czas z metadanych każdego pliku (zawsze Dokładnie)
                  </option>
                  {eventId !== undefined && (
                    <option value="EVENT">Ustaw datę i czas z bieżącego wydarzenia</option>
                  )}
                  <option value="MANUAL">
                    Ustaw wspólną datę i czas ręcznie (lub przedział „między … a …”)
                  </option>
                  <option value="UNDATED">Wyczyść datę (undated)</option>
                </select>
              ) : (
                <select
                  id="bulk-date-mode-select"
                  value={dateSourceMode}
                  onChange={e => {
                    const nextM = e.target.value as DateSourceMode;
                    setDateSourceMode(nextM);
                    syncBulkParamsToRows(rowSetter, { mode: nextM });
                  }}
                  className={styles.input}
                >
                  <option value="FILE_METADATA">
                    Pobierz pełną datę i czas z metadanych każdego pliku (EXIF / MP4 / plik)
                  </option>
                  <option value="EVENT_OR_MANUAL">
                    Użyj daty wydarzenia / wspólnej daty i czasu ręcznego
                  </option>
                  <option value="UNDATED">Bez daty – zapisz jako niedatowane (undated)</option>
                </select>
              )}
            </div>
          )}

          {isBulkEdit && bulkEditDateMode === 'METADATA' && (
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
                <option value="Original Date Time">EXIF: Original Date Time</option>
                <option value="Digitized Date Time">EXIF: Digitized Date Time</option>
                <option value="Image Date Time">EXIF: Image Date Time</option>
                <option value="creation_time">MP4/QuickTime: creation_time</option>
                <option value="lastModified">Data modyfikacji pliku (lastModified)</option>
              </select>
            </div>
          )}
        </div>

        {availableCollections.length > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <span className={styles.label}>
              {isBulkEdit
                ? 'Przypisz / przenieś zaznaczone pliki do kolekcji (pierwsza określa folder na dysku):'
                : `Kolekcje docelowe ${requiresCollectionOnUpload ? '* (wymagane dla plików/wydarzeń bez daty)' : '(opcjonalnie)'} – pierwsza określa folder na dysku:`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                data-testid={
                  isBulkEdit
                    ? 'bulk-edit-target-collection-select'
                    : 'media-upload-collection-select'
                }
                value={addColPickerId}
                onChange={e => {
                  const val = e.target.value;
                  setAddColPickerId(val);
                  if (val !== '') {
                    const cId = Number(val);
                    if (!selectedCollectionIds.includes(cId)) {
                      const nextList = [...selectedCollectionIds, cId];
                      setSelectedCollectionIds(nextList);
                      syncBulkParamsToRows(rowSetter, {
                        mode: 'NO_CHANGE',
                        colIds: nextList,
                      });
                      if (!isBulkEdit) {
                        void refreshDirectoryPreview(
                          stagedRows.at(0)?.file,
                          customFolderName,
                          nextList.at(0),
                          bulkCategoryMode
                        );
                      }
                    }
                    setAddColPickerId('');
                  }
                }}
                className={styles.input}
                style={{ maxWidth: '380px' }}
              >
                <option value="">— Wybierz kolekcję lub album datowany —</option>
                {availableCollections
                  .filter(c => !selectedCollectionIds.includes(c.id))
                  .map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.datedCollection ? `📅 [Album ${String(c.startYear ?? '')}] ` : '📦 '}
                      {c.parentCollectionName ? `${c.parentCollectionName} › ` : ''}
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedCollectionIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {selectedCollectionIds.map((cId, cIdx) => {
                  const colObj = availableCollections.find(c => c.id === cId);
                  return (
                    <span
                      key={cId}
                      className={styles.selectedFilesBadge}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <span>
                        {cIdx === 0 ? '📁 [Główna na dysku] ' : '📦 '}
                        {colObj?.name ?? 'Kolekcja'}
                      </span>
                      <button
                        type="button"
                        disabled={cIdx === 0}
                        onClick={() => {
                          handleMoveColOrder(cIdx, -1, rowSetter);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={cIdx === selectedCollectionIds.length - 1}
                        onClick={() => {
                          handleMoveColOrder(cIdx, 1, rowSetter);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextList = selectedCollectionIds.filter(id => id !== cId);
                          setSelectedCollectionIds(nextList);
                          syncBulkParamsToRows(rowSetter, {
                            mode: 'NO_CHANGE',
                            colIds: nextList,
                          });
                        }}
                        className={styles.pillRemoveBtn}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {context !== 'GRAVE' && isManualDateActive && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              background: '#ffffff',
              padding: '0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
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
                  : '📅 Wspólna data i czas wykonania dla zaznaczonych:'}
              </span>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={uploadIsRange}
                  onChange={e => {
                    const nextR = e.target.checked;
                    setUploadIsRange(nextR);
                    syncBulkParamsToRows(rowSetter, {
                      mode: 'EVENT_OR_MANUAL',
                      isRange: nextR,
                    });
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
                    syncBulkParamsToRows(rowSetter, {
                      mode: 'EVENT_OR_MANUAL',
                      qual: v,
                    });
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
                  Wybór z kalendarza {bulkStartWeekday ? `(📅 ${bulkStartWeekday})` : ''}
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
                        syncBulkParamsToRows(rowSetter, {
                          mode: 'EVENT_OR_MANUAL',
                          y,
                          m,
                          d,
                        });
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
                      syncBulkParamsToRows(rowSetter, {
                        mode: 'EVENT_OR_MANUAL',
                        y: v,
                      });
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
                      syncBulkParamsToRows(rowSetter, {
                        mode: 'EVENT_OR_MANUAL',
                        m: v,
                      });
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
                      syncBulkParamsToRows(rowSetter, {
                        mode: 'EVENT_OR_MANUAL',
                        d: v,
                      });
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
                      const v = e.target.value;
                      setManualBulkTimeQual(v);
                      syncBulkParamsToRows(rowSetter, {
                        mode: 'EVENT_OR_MANUAL',
                        tQual: v,
                      });
                    }}
                    className={styles.input}
                    style={{ width: '120px', height: '34px' }}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                  <div className={styles.timeHmsGroup}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      placeholder="GG"
                      value={manualBulkHour}
                      onChange={e => {
                        const v = e.target.value;
                        setManualBulkHour(v);
                        syncBulkParamsToRows(rowSetter, {
                          mode: 'EVENT_OR_MANUAL',
                          h: v,
                        });
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
                        syncBulkParamsToRows(rowSetter, {
                          mode: 'EVENT_OR_MANUAL',
                          min: v,
                        });
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
                        syncBulkParamsToRows(rowSetter, {
                          mode: 'EVENT_OR_MANUAL',
                          sec: v,
                        });
                      }}
                      className={styles.miniDateInput}
                    />
                  </div>
                </div>
              </div>
            </div>

            {uploadIsRange && (
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.65rem' }}>
                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <span className={styles.label}>Druga granica („… a …”)</span>
                    <select
                      value={manualBulkRangeEndQual}
                      onChange={e => {
                        const v = e.target.value;
                        setManualBulkRangeEndQual(v);
                        syncBulkParamsToRows(rowSetter, {
                          mode: 'EVENT_OR_MANUAL',
                          rEndQual: v,
                        });
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
                      Wybór z kalendarza {bulkEndWeekday ? `(📅 ${bulkEndWeekday})` : ''}
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
                            const rY = String(Number(p[0]));
                            const rM = String(Number(p[1]));
                            const rD = String(Number(p[2]));
                            setManualBulkRangeEndYear(rY);
                            setManualBulkRangeEndMonth(rM);
                            setManualBulkRangeEndDay(rD);
                            syncBulkParamsToRows(rowSetter, {
                              mode: 'EVENT_OR_MANUAL',
                              rEndY: rY,
                              rEndM: rM,
                              rEndD: rD,
                            });
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
                          const v = e.target.value;
                          setManualBulkRangeEndYear(v);
                          syncBulkParamsToRows(rowSetter, {
                            mode: 'EVENT_OR_MANUAL',
                            rEndY: v,
                          });
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
                          const v = e.target.value;
                          setManualBulkRangeEndMonth(v);
                          syncBulkParamsToRows(rowSetter, {
                            mode: 'EVENT_OR_MANUAL',
                            rEndM: v,
                          });
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
                          const v = e.target.value;
                          setManualBulkRangeEndDay(v);
                          syncBulkParamsToRows(rowSetter, {
                            mode: 'EVENT_OR_MANUAL',
                            rEndD: v,
                          });
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
                          const v = e.target.value;
                          setManualBulkRangeEndTimeQual(v);
                          syncBulkParamsToRows(rowSetter, {
                            mode: 'EVENT_OR_MANUAL',
                            rEndTQual: v,
                          });
                        }}
                        className={styles.input}
                        style={{ width: '120px', height: '34px' }}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                      <div className={styles.timeHmsGroup}>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={manualBulkRangeEndHour}
                          onChange={e => {
                            const v = e.target.value;
                            setManualBulkRangeEndHour(v);
                            syncBulkParamsToRows(rowSetter, {
                              mode: 'EVENT_OR_MANUAL',
                              rEndH: v,
                            });
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
                            const v = e.target.value;
                            setManualBulkRangeEndMinute(v);
                            syncBulkParamsToRows(rowSetter, {
                              mode: 'EVENT_OR_MANUAL',
                              rEndMin: v,
                            });
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
                            const v = e.target.value;
                            setManualBulkRangeEndSecond(v);
                            syncBulkParamsToRows(rowSetter, {
                              mode: 'EVENT_OR_MANUAL',
                              rEndSec: v,
                            });
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isBulkEdit && directoryPreview && (
          <div className={styles.pathPreviewBanner} data-testid="media-path-preview">
            📁 Docelowy katalog na dysku: <strong>{directoryPreview}/</strong>
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
                Wspólne osoby widoczne, powiązane oraz autorzy:
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
                    <option value="DEPICTED">👁️ Osoba widoczna / słyszalna</option>
                    <option value="RELATED">🔗 Osoba powiązana</option>
                    <option value="AUTHOR">📷 Autor (kto wykonał)</option>
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
                      onClick={() => {
                        const txt = bulkLinkTextInput.trim();
                        if (txt === '') return;
                        setBulkPersonLinks(prev => [
                          ...prev,
                          {
                            personText: txt,
                            personSex: bulkLinkTextSex,
                            linkType: bulkLinkRoleType,
                            displayLabel: `${bulkLinkRoleType}: ${txt} [spoza bazy]`,
                          },
                        ]);
                        setBulkLinkTextInput('');
                      }}
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
                        const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
                        setBulkPersonLinks(prev => [
                          ...prev,
                          {
                            personId: p.id,
                            linkType: bulkLinkRoleType,
                            displayLabel: `${bulkLinkRoleType}: ${fullName}`,
                          },
                        ]);
                        setBulkLinkPersonResults([]);
                        setBulkLinkPersonQuery('');
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
                          setBulkPersonLinks(prev => prev.filter((_, i) => i !== bIdx));
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

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  handleApplyBulkDetailsToChecked(rowSetter);
                }}
                className={styles.btnPrimary}
                style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}
              >
                ✓ Zastosuj powyższe szczegóły do zaznaczonych plików ({String(selectedCount)})
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedBulkDraftCount = bulkDraftRows.filter(d => d.selected).length;

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

              <div className={styles.sortControlGroup}>
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
                  className={styles.sortSelect}
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

              {renderSharedBulkTopPanel(false, stagedRows, setStagedRows)}

              {stagedRows.length > 0 && (
                <div className={styles.stagedList}>
                  {stagedRows.map((st, idx) =>
                    renderDraftFileCard(st, idx, setStagedRows, false)
                  )}
                </div>
              )}

              {stagedRows.length === 1 && (context === 'GRAVE' || context === 'PERSON') && (
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
                  Plików do wgrania: <strong>{String(stagedRows.length)}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      closeUploadModal();
                      setStagedRows([]);
                    }}
                    className={styles.btnSecondary}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-upload-media-button"
                    disabled={stagedRows.length === 0 || isSubmitting}
                    className={styles.btnPrimary}
                  >
                    {isSubmitting
                      ? 'Wgrywanie...'
                      : `Wgraj i zapisz (${String(stagedRows.length)})`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
                {String(selectedBulkDraftCount)} z {String(bulkDraftRows.length)})
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

              {renderSharedBulkTopPanel(true, bulkDraftRows, setBulkDraftRows)}

              <div className={styles.stagedList}>
                {bulkDraftRows.map((draft, idx) =>
                  renderDraftFileCard(draft, idx, setBulkDraftRows, true)
                )}
              </div>

              <div className={styles.modalFooter}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                    Zaznaczono plików: <strong>{String(selectedBulkDraftCount)}</strong>
                  </span>
                  <button
                    type="button"
                    data-testid="bulk-delete-selected-media-button"
                    disabled={selectedBulkDraftCount === 0 || isSubmitting}
                    onClick={() => {
                      setShowBulkDeleteConfirm(true);
                    }}
                    className={styles.btnDanger}
                  >
                    🗑️ Usuń zaznaczone ({String(selectedBulkDraftCount)})
                  </button>
                  {(graveId !== undefined ||
                    personId !== undefined ||
                    eventId !== undefined ||
                    (collectionId !== undefined && collectionId !== null)) && (
                    <button
                      type="button"
                      data-testid="bulk-unlink-selected-media-button"
                      disabled={selectedBulkDraftCount === 0 || isSubmitting}
                      onClick={() => {
                        setShowBulkUnlinkConfirm(true);
                      }}
                      className={styles.btnSecondary}
                    >
                      🔗 Odepnij zaznaczone ({String(selectedBulkDraftCount)})
                    </button>
                  )}
                </div>

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

      {isAdmin && showBulkDeleteConfirm && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1550 }}
          onClick={() => {
            setShowBulkDeleteConfirm(false);
          }}
        >
          <div
            className={styles.smallConfirmModal}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              🗑️ Usunąć zaznaczone pliki ({String(selectedBulkDraftCount)})?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              Czy na pewno chcesz bezpowrotnie usunąć zaznaczone pliki multimedialne (
              <strong>{String(selectedBulkDraftCount)}</strong>) ze wszystkich sekcji?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteConfirm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                data-testid="confirm-bulk-delete-media-button"
                disabled={isSubmitting}
                onClick={() => {
                  void handleConfirmBulkDelete();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń zaznaczone ({String(selectedBulkDraftCount)})
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && showBulkUnlinkConfirm && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1550 }}
          onClick={() => {
            setShowBulkUnlinkConfirm(false);
          }}
        >
          <div
            className={styles.smallConfirmModal}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              🔗 Odpiąć zaznaczone pliki ({String(selectedBulkDraftCount)}) z tego miejsca?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              Czy na pewno chcesz odpiąć zaznaczone pliki multimedialne (
              <strong>{String(selectedBulkDraftCount)}</strong>) z tej sekcji?
            </p>
            {doesBulkUnlinkRequireTargetCollection() && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                <span className={styles.label}>
                  Niektóre pliki tracą ostatnie powiązanie – wskaż kolekcję docelową, do której
                  mają zostać przeniesione fizycznie na dysku *
                </span>
                <select
                  value={bulkUnlinkTargetColId}
                  onChange={e => {
                    setBulkUnlinkTargetColId(e.target.value);
                  }}
                  className={styles.input}
                >
                  <option value="">— Wybierz kolekcję docelową —</option>
                  {availableCollections.map(col => (
                    <option key={col.id} value={String(col.id)}>
                      {col.datedCollection
                        ? `📅 [Album datowany] ${col.name}`
                        : `📦 [Kolekcja] ${col.name}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowBulkUnlinkConfirm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                data-testid="confirm-bulk-unlink-media-button"
                disabled={
                  isSubmitting ||
                  (doesBulkUnlinkRequireTargetCollection() && bulkUnlinkTargetColId === '')
                }
                onClick={() => {
                  void handleConfirmBulkUnlink();
                }}
                className={styles.btnPrimary}
              >
                Tak, odepnij zaznaczone ({String(selectedBulkDraftCount)})
              </button>
            </div>
          </div>
        </div>
      )}

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

      <MediaItemLightboxModal
        items={allViewableItems}
        activeIndex={activeIndex}
        context={context}
        graveId={graveId}
        personId={personId}
        eventId={eventId}
        collectionId={collectionId}
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