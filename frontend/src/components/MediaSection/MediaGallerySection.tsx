import { useState, useEffect, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import {
  extractAllClientFileMetadata,
  type ClientExtractedMetadata,
} from '../../utils/clientMetadataExtractor';
import InteractiveAvatarCropper from '../PersonAvatar/InteractiveAvatarCropper';
import styles from './MediaGallerySection.module.css';
import type {
  MediaItemDto,
  MediaPrimaryContext,
  SaveMediaPersonLinkRequestDto,
  SubEventMediaGroupDto,
} from '../../types/media';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

interface MediaGallerySectionProps {
  context: MediaPrimaryContext;
  graveId?: number;
  personId?: number;
  eventId?: number;
  defaultEventYear?: number | null;
  defaultPersonIds?: number[];
  primaryMediaId?: number | null;
  isAdmin: boolean;
  sectionTitle: string;
  onMediaChanged?: () => void;
}

interface StagedUploadFile {
  file: File;
  customFileName: string;
  title: string;
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  metadataOptions: ClientExtractedMetadata[];
  selectedMetadataTag: string;
}

type DateSourceMode = 'EVENT_OR_MANUAL' | 'FILE_METADATA' | 'UNDATED';
type SectionMediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO';
type SectionSortMode = 'DATE_ASC' | 'DATE_DESC' | 'NAME_ASC' | 'NEWEST_ADDED';

const QUALIFIER_OPTIONS = [
  { value: 'EXACT', label: 'Dokładnie' },
  { value: 'ABOUT', label: 'Około (ok.)' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
  { value: 'ESTIMATED', label: 'Szacunkowo' },
];

const PERSON_LINK_TYPE_LABELS: Record<
  'DEPICTED' | 'RELATED' | 'AUTHOR',
  string
> = {
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

const numToStr = (val: number | null | undefined): string =>
  val !== undefined && val !== null ? String(val) : '';

export default function MediaGallerySection({
  context,
  graveId,
  personId,
  eventId,
  defaultEventYear,
  defaultPersonIds,
  primaryMediaId,
  isAdmin,
  sectionTitle,
  onMediaChanged,
}: MediaGallerySectionProps) {
  const fileInputId = useId();
  const versionFileInputId = useId();

  const [items, setItems] = useState<MediaItemDto[]>([]);
  const [subEventGroups, setSubEventGroups] = useState<SubEventMediaGroupDto[]>([]);
  const [showUpload, setShowUpload] = useState<boolean>(false);

  // Filtering (All / Images / Videos) & Sorting
  const [typeFilter, setTypeFilter] = useState<SectionMediaTypeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SectionSortMode>('DATE_ASC');

  // Batch & Single Upload Staging state
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [customFolderName, setCustomFolderName] = useState<string>('');
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
  const [bulkBaseName, setBulkBaseName] = useState<string>('');
  const [directoryPreview, setDirectoryPreview] = useState<string>('');
  const [setAsPrimary, setSetAsPrimary] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Post-Upload Bulk Edit Mode state
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<number[]>([]);
  const [bulkEditFolder, setBulkEditFolder] = useState<string>('');
  const [bulkEditStem, setBulkEditStem] = useState<string>('');
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

  // Link Existing Media from Gallery Modal state
  const [showLinkExistingModal, setShowLinkExistingModal] = useState<boolean>(false);
  const [gallerySearchQuery, setGallerySearchQuery] = useState<string>('');
  const [galleryTypeFilter, setGalleryTypeFilter] = useState<string>('ALL');
  const [galleryCandidates, setGalleryCandidates] = useState<MediaItemDto[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<number[]>([]);

  // Fullscreen Lightbox state & Version Switcher (Points 15 & 17)
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);

  // Add Version / Reverse Side Form inside Lightbox
  const [showVersionUpload, setShowVersionUpload] = useState<boolean>(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionTypeInput, setVersionTypeInput] = useState<string>('RESTORED');
  const [versionLabelInput, setVersionLabelInput] = useState<string>('');
  const [versionSetAsMain, setVersionSetAsMain] = useState<boolean>(true);

  // Single Item Edit inside Lightbox (Points 13, 14, 15)
  const [isEditingItem, setIsEditingItem] = useState<boolean>(false);
  const [editFileName, setEditFileName] = useState<string>('');
  const [editFolderName, setEditFolderName] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editInscription, setEditInscription] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editSourceText, setEditSourceText] = useState<string>('');
  const [editDateMode, setEditDateMode] = useState<
    'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'
  >('MANUAL');
  const [editSelectedMetadataTag, setEditSelectedMetadataTag] = useState<string>('');
  const [editIsBetween, setEditIsBetween] = useState<boolean>(false);
  const [editDateQual, setEditDateQual] = useState<string>('EXACT');
  const [editYear, setEditYear] = useState<string>('');
  const [editMonth, setEditMonth] = useState<string>('');
  const [editDay, setEditDay] = useState<string>('');
  const [editTimeQual, setEditTimeQual] = useState<string>('EXACT');
  const [editHour, setEditHour] = useState<string>('');
  const [editMinute, setEditMinute] = useState<string>('');
  const [editSecond, setEditSecond] = useState<string>('');

  const [editRangeEndQual, setEditRangeEndQual] = useState<string>('EXACT');
  const [editRangeEndYear, setEditRangeEndYear] = useState<string>('');
  const [editRangeEndMonth, setEditRangeEndMonth] = useState<string>('');
  const [editRangeEndDay, setEditRangeEndDay] = useState<string>('');
  const [editRangeEndTimeQual, setEditRangeEndTimeQual] = useState<string>('EXACT');
  const [editRangeEndHour, setEditRangeEndHour] = useState<string>('');
  const [editRangeEndMinute, setEditRangeEndMinute] = useState<string>('');
  const [editRangeEndSecond, setEditRangeEndSecond] = useState<string>('');

  // Person Links in Edit Form (DEPICTED, RELATED, AUTHOR - DB or Text)
  const [editPersonLinks, setEditPersonLinks] = useState<
    (SaveMediaPersonLinkRequestDto & { displayLabel: string })[]
  >([]);
  const [linkRoleType, setLinkRoleType] = useState<'DEPICTED' | 'RELATED' | 'AUTHOR'>(
    'DEPICTED'
  );
  const [linkPersonQuery, setLinkPersonQuery] = useState<string>('');
  const [linkPersonResults, setLinkPersonResults] = useState<PersonListItemDto[]>([]);
  const [linkTextInput, setLinkTextInput] = useState<string>('');
  const [linkTextSex, setLinkTextSex] = useState<PersonSex>('UNKNOWN');

  // Interactive Avatar Cropper state (Point 12)
  const [showCropper, setShowCropper] = useState<boolean>(false);

  const filterAndSortList = (list: MediaItemDto[]): MediaItemDto[] => {
    const filtered = list.filter(item => {
      if (typeFilter === 'IMAGE') return item.mediaType === 'IMAGE';
      if (typeFilter === 'VIDEO') return item.mediaType === 'VIDEO';
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
    () => filterAndSortList(items),
    [items, typeFilter, sortMode]
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
    () => [
      ...displayedDirectItems,
      ...displayedSubGroups.flatMap(g => g.media),
    ],
    [displayedDirectItems, displayedSubGroups]
  );

  const totalRawItemsCount =
    items.length + subEventGroups.reduce((acc, g) => acc + g.media.length, 0);
  const totalImagesCount =
    items.filter(i => i.mediaType === 'IMAGE').length +
    subEventGroups.reduce(
      (acc, g) => acc + g.media.filter(i => i.mediaType === 'IMAGE').length,
      0
    );
  const totalVideosCount = totalRawItemsCount - totalImagesCount;

  const activeItem =
    activeIndex !== null && activeIndex >= 0 && activeIndex < allViewableItems.length
      ? allViewableItems[activeIndex]
      : null;

  const loadMedia = async () => {
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
    if (activeIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveIndex(null);
      } else if (e.key === 'ArrowLeft' && allViewableItems.length > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setSelectedVersionId(null);
        setActiveIndex(prev =>
          prev !== null
            ? (prev - 1 + allViewableItems.length) % allViewableItems.length
            : null
        );
      } else if (e.key === 'ArrowRight' && allViewableItems.length > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setSelectedVersionId(null);
        setActiveIndex(prev =>
          prev !== null ? (prev + 1) % allViewableItems.length : null
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, allViewableItems.length]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      setStagedFiles([]);
      setDirectoryPreview('');
      return;
    }

    const filesArray = Array.from(fileList);
    const firstFile = filesArray[0];

    let baseStem = 'family_media';
    try {
      const parsedManualYear =
        manualBulkYear.trim() !== '' ? Number(manualBulkYear) : undefined;
      const preview = await mediaApi.previewFilename({
        primaryContext: context,
        graveId,
        personId,
        eventId,
        customYear:
          dateSourceMode === 'EVENT_OR_MANUAL' ? parsedManualYear : undefined,
        customFolderName: customFolderName.trim() || undefined,
        originalFilename: firstFile.name,
        mimeType: firstFile.type,
      });
      setDirectoryPreview(preview.directoryPath);
      baseStem = preview.suggestedFileName
        .replace(/\.[^.]+$/, '')
        .replace(/_\d+$/, '');
      setBulkBaseName(baseStem);
    } catch {
      setBulkBaseName(baseStem);
    }

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
      return {
        file: f,
        customFileName: `${baseStem}_${suffix}.${ext}`,
        title: '',
        year: y,
        month: m,
        day: d,
        hour: h,
        minute: min,
        second: sec,
        metadataOptions: metaList,
        selectedMetadataTag: primaryMeta ? primaryMeta.sourceTag : '',
      };
    });

    setStagedFiles(staged);
  };

  const applyBulkSettingsToStaged = (
    nextMode: DateSourceMode,
    nextY: string,
    nextM: string,
    nextD: string,
    nextH: string,
    nextMin: string,
    nextSec: string,
    nextBaseStem: string
  ) => {
    const cleanStem =
      nextBaseStem
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'media';

    setStagedFiles(prev =>
      prev.map((item, idx) => {
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
          year: y,
          month: m,
          day: d,
          hour: h,
          minute: min,
          second: sec,
        };
      })
    );
  };

  const handleUploadSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stagedFiles.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const targetPersonIds =
      personId !== undefined ? [personId] : (defaultPersonIds ?? []);

    try {
      if (stagedFiles.length === 1) {
        const single = stagedFiles[0];
        await mediaApi.uploadMedia({
          file: single.file,
          primaryContext: context,
          customFolderName: customFolderName.trim() || undefined,
          customFileName: single.customFileName,
          title: single.title,
          graveId,
          eventId,
          dateQualifier: dateSourceMode === 'FILE_METADATA' ? 'EXACT' : manualBulkQual,
          customYear: parseOptInt(single.year) ?? undefined,
          customMonth: parseOptInt(single.month) ?? undefined,
          customDay: parseOptInt(single.day) ?? undefined,
          timeQualifier: dateSourceMode === 'FILE_METADATA' ? 'EXACT' : manualBulkTimeQual,
          customHour: parseOptInt(single.hour) ?? undefined,
          customMinute: parseOptInt(single.minute) ?? undefined,
          customSecond: parseOptInt(single.second) ?? undefined,
          selectedMetadataSourceTag: single.selectedMetadataTag || undefined,
          clientLastModifiedMs: single.file.lastModified || undefined,
          personIds: targetPersonIds,
          setAsPersonAvatar: context === 'PERSON' && setAsPrimary,
          setAsGravePrimary: context === 'GRAVE' && setAsPrimary,
        });
      } else {
        await mediaApi.uploadBatchMedia({
          files: stagedFiles.map(s => s.file),
          primaryContext: context,
          customFolderName: customFolderName.trim() || undefined,
          customFileNames: stagedFiles.map(s => s.customFileName),
          titles: stagedFiles.map(s => s.title),
          customYears: stagedFiles.map(s => parseOptInt(s.year)),
          customMonths: stagedFiles.map(s => parseOptInt(s.month)),
          customDays: stagedFiles.map(s => parseOptInt(s.day)),
          customHours: stagedFiles.map(s => parseOptInt(s.hour)),
          customMinutes: stagedFiles.map(s => parseOptInt(s.minute)),
          customSeconds: stagedFiles.map(s => parseOptInt(s.second)),
          selectedMetadataSourceTags: stagedFiles.map(
            s => s.selectedMetadataTag || null
          ),
          clientLastModifiedList: stagedFiles.map(s => s.file.lastModified || null),
          graveId,
          eventId,
          defaultYear:
            dateSourceMode === 'EVENT_OR_MANUAL' ? parseOptInt(manualBulkYear) : null,
          personIds: targetPersonIds,
        });
      }

      setShowUpload(false);
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

  const fetchGalleryCandidates = async (queryStr: string, mType: string) => {
    try {
      const page = await mediaApi.getGalleryPage({
        search: queryStr,
        mediaType: mType,
        page: 0,
        size: 60,
      });
      const existingIds = new Set(items.map(i => i.id));
      setGalleryCandidates(page.content.filter(c => !existingIds.has(c.id)));
    } catch {
      setErrorMessage('Nie udało się pobrać zdjęć z galerii.');
    }
  };

  const handleOpenLinkExistingModal = () => {
    setSelectedExistingIds([]);
    setGallerySearchQuery('');
    setGalleryTypeFilter('ALL');
    setShowLinkExistingModal(true);
    void fetchGalleryCandidates('', 'ALL');
  };

  const handleConfirmLinkExisting = async () => {
    if (selectedExistingIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await mediaApi.linkExistingMedia({
        mediaIds: selectedExistingIds,
        graveId: graveId ?? null,
        personId: personId ?? null,
        eventId: eventId ?? null,
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

  const handleApplyBulkEdit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedBulkIds.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await mediaApi.bulkUpdateMedia({
        mediaIds: selectedBulkIds,
        baseFileNameStem: bulkEditStem.trim() || null,
        customFolderName: bulkEditFolder.trim() || null,
        contextEventId: eventId ?? null,
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
      setIsBulkEditMode(false);
      setSelectedBulkIds([]);
      setBulkEditFolder('');
      setBulkEditStem('');
      setBulkEditDateMode('NO_CHANGE');
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się zapisać zmian zbiorowych.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncSingleEditFields = (item: MediaItemDto) => {
    setEditFileName(item.fileName);
    setEditFolderName('');
    setEditTitle(item.title ?? '');
    setEditInscription(item.inscriptionText ?? '');
    setEditDescription(item.description ?? '');
    setEditSourceText(item.sourceText ?? '');
    setEditDateMode('MANUAL');
    setEditSelectedMetadataTag(
      item.metadataDateSource ?? item.availableMetadataDates?.[0]?.sourceTag ?? ''
    );
    setEditIsBetween(item.betweenRange === true);
    setEditDateQual(item.dateQualifier ?? 'EXACT');
    setEditYear(numToStr(item.year));
    setEditMonth(numToStr(item.month));
    setEditDay(numToStr(item.day));
    setEditTimeQual(item.timeQualifier ?? 'EXACT');
    setEditHour(numToStr(item.hour));
    setEditMinute(numToStr(item.minute));
    setEditSecond(numToStr(item.second));

    setEditRangeEndQual(item.rangeEndQualifier ?? 'EXACT');
    setEditRangeEndYear(numToStr(item.rangeEndYear));
    setEditRangeEndMonth(numToStr(item.rangeEndMonth));
    setEditRangeEndDay(numToStr(item.rangeEndDay));
    setEditRangeEndTimeQual(item.rangeEndTimeQualifier ?? 'EXACT');
    setEditRangeEndHour(numToStr(item.rangeEndHour));
    setEditRangeEndMinute(numToStr(item.rangeEndMinute));
    setEditRangeEndSecond(numToStr(item.rangeEndSecond));

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
    setEditPersonLinks(combinedLinks);
  };

  const handleOpenLightbox = (item: MediaItemDto) => {
    const idx = allViewableItems.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
    setSelectedVersionId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowDetailsDrawer(false);
    setShowCropper(false);
    setShowVersionUpload(false);
    setIsEditingItem(false);
    syncSingleEditFields(item);
  };

  const handleNavigateMedia = (direction: -1 | 1) => {
    if (allViewableItems.length <= 1 || activeIndex === null) return;
    const nextIdx =
      (activeIndex + direction + allViewableItems.length) % allViewableItems.length;
    const nextItem = allViewableItems[nextIdx];
    setActiveIndex(nextIdx);
    setSelectedVersionId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsEditingItem(false);
    setShowCropper(false);
    setShowVersionUpload(false);
    syncSingleEditFields(nextItem);
  };

  const handleSearchPersonForLink = async () => {
    try {
      const page = await biographyApi.listPeople({
        search: linkPersonQuery,
        includeArchived: true,
        page: 0,
        size: 6,
      });
      setLinkPersonResults(page.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleSaveItemEdit = async () => {
    if (!activeItem) return;
    setIsSubmitting(true);
    try {
      await mediaApi.updateMedia(activeItem.id, {
        fileName: editFileName,
        customFolderName: editFolderName.trim() || null,
        title: editTitle,
        inscriptionText: editInscription,
        description: editDescription,
        sourceText: editSourceText,
        dateSourceMode: editDateMode,
        selectedMetadataSourceTag: editSelectedMetadataTag || null,
        contextEventId: eventId ?? null,
        isBetweenRange: editIsBetween,
        dateQualifier: editDateQual,
        year: parseOptInt(editYear),
        month: parseOptInt(editMonth),
        day: parseOptInt(editDay),
        timeQualifier: editTimeQual,
        hour: parseOptInt(editHour),
        minute: parseOptInt(editMinute),
        second: parseOptInt(editSecond),
        rangeEndQualifier: editRangeEndQual,
        rangeEndYear: parseOptInt(editRangeEndYear),
        rangeEndMonth: parseOptInt(editRangeEndMonth),
        rangeEndDay: parseOptInt(editRangeEndDay),
        rangeEndTimeQualifier: editRangeEndTimeQual,
        rangeEndHour: parseOptInt(editRangeEndHour),
        rangeEndMinute: parseOptInt(editRangeEndMinute),
        rangeEndSecond: parseOptInt(editRangeEndSecond),
        personLinks: editPersonLinks.map(l => ({
          personId: l.personId,
          personText: l.personText,
          personSex: l.personSex,
          linkType: l.linkType,
        })),
      });
      setIsEditingItem(false);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się zaktualizować danych pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadVersionSubmit = async () => {
    if (!activeItem || !versionFile) return;
    setIsSubmitting(true);
    try {
      await mediaApi.uploadMediaVersion({
        mediaId: activeItem.id,
        file: versionFile,
        versionType: versionTypeInput,
        versionLabel: versionLabelInput.trim() || undefined,
        setAsMain: versionTypeInput !== 'REVERSE' && versionSetAsMain,
      });
      setShowVersionUpload(false);
      setVersionFile(null);
      setVersionLabelInput('');
      setSelectedVersionId(null);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się wgrać nowej wersji pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetVersionAsMain = async (versionId: number) => {
    if (!activeItem) return;
    try {
      await mediaApi.setMainMediaVersion(activeItem.id, versionId);
      setSelectedVersionId(null);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się ustawić wybranej wersji jako głównej.');
    }
  };

  const handleDeleteVersion = async (versionId: number) => {
    if (!activeItem) return;
    try {
      await mediaApi.deleteMediaVersion(activeItem.id, versionId);
      setSelectedVersionId(null);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie można usunąć tej wersji pliku.');
    }
  };

  const handleSavePrimaryOrAvatarCrop = async (
    item: MediaItemDto,
    cx?: number,
    cy?: number,
    cz?: number
  ) => {
    try {
      await mediaApi.updateMedia(item.id, {
        setAsAvatarForPersonId: personId ?? null,
        avatarCropX: personId !== undefined ? (cx ?? 50) : null,
        avatarCropY: personId !== undefined ? (cy ?? 50) : null,
        avatarCropZoom: personId !== undefined ? (cz ?? 1.0) : null,
        setAsPrimaryForGraveId: graveId ?? null,
      });
      setShowCropper(false);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się ustawić zdjęcia/filmu jako głównego.');
    }
  };

  const handleUnlinkItemFromHere = async (mediaId: number) => {
    try {
      await mediaApi.unlinkMediaFromContext(mediaId, {
        graveId,
        personId,
        eventId,
      });
      setActiveIndex(null);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się odpiąć pliku z tego miejsca.');
    }
  };

  const handleDeleteItem = async (mediaId: number) => {
    try {
      await mediaApi.deleteMedia(mediaId);
      setActiveIndex(null);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się usunąć pliku.');
    }
  };

  const renderMediaGrid = (mediaList: MediaItemDto[], allowBulkCheckboxes: boolean) => (
    <div className={styles.mediaGrid}>
      {mediaList.map(item => {
        const isPrimary = primaryMediaId === item.id;
        const isBulkSelected = selectedBulkIds.includes(item.id);

        return (
          <div key={item.id} className={styles.mediaTileWrapper}>
            {isAdmin && isBulkEditMode && allowBulkCheckboxes && (
              <label className={styles.bulkSelectCheckboxOverlay}>
                <input
                  type="checkbox"
                  data-testid={`bulk-media-checkbox-${String(item.id)}`}
                  checked={isBulkSelected}
                  onChange={() => {
                    setSelectedBulkIds(prev =>
                      prev.includes(item.id)
                        ? prev.filter(id => id !== item.id)
                        : [...prev, item.id]
                    );
                  }}
                />
                <span>Zaznacz</span>
              </label>
            )}

            <button
              type="button"
              data-testid={`media-tile-${String(item.id)}`}
              onClick={() => {
                if (isBulkEditMode && allowBulkCheckboxes) {
                  setSelectedBulkIds(prev =>
                    prev.includes(item.id)
                      ? prev.filter(id => id !== item.id)
                      : [...prev, item.id]
                  );
                } else {
                  handleOpenLightbox(item);
                }
              }}
              className={`${styles.mediaTile} ${
                isPrimary ? styles.mediaTilePrimary : ''
              } ${isBulkSelected ? styles.mediaTileSelected : ''}`}
            >
              <div className={styles.thumbWrapper}>
                {item.mediaType === 'IMAGE' ? (
                  <img
                    src={mediaApi.getThumbnailUrl(item.id)}
                    alt={item.title ?? ''}
                    className={styles.thumbImage}
                  />
                ) : (
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
                )}
                {isPrimary && (
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

  const activeVersions = activeItem?.versions ?? [];
  const activeSelectedVersion =
    selectedVersionId !== null
      ? activeVersions.find(v => v.id === selectedVersionId) ?? null
      : null;

  const activeStageUrl = activeItem
    ? activeSelectedVersion
      ? mediaApi.getVersionFileUrl(activeItem.id, activeSelectedVersion.id)
      : mediaApi.getFileUrl(activeItem.id)
    : '';

  return (
    <section className={styles.sectionCard} data-testid="media-gallery-section">
      <div className={styles.headerRow}>
        <h2 className={styles.sectionTitle}>
          {sectionTitle} ({items.length})
        </h2>

        {isAdmin && (
          <div className={styles.headerActions}>
            <button
              type="button"
              data-testid="toggle-upload-media-button"
              onClick={() => {
                setShowUpload(prev => !prev);
                setIsBulkEditMode(false);
              }}
              className={styles.btnPrimary}
            >
              {showUpload ? 'Zamknij formularz' : '+ Wgraj nowe z dysku'}
            </button>

            <button
              type="button"
              data-testid="open-link-existing-media-button"
              onClick={handleOpenLinkExistingModal}
              className={styles.btnSecondary}
            >
              🔗 Wybierz istniejące z galerii
            </button>

            {items.length > 0 && (
              <button
                type="button"
                data-testid="toggle-bulk-edit-media-button"
                onClick={() => {
                  setIsBulkEditMode(prev => !prev);
                  setShowUpload(false);
                  setSelectedBulkIds(items.map(i => i.id));
                }}
                className={styles.btnSecondary}
              >
                {isBulkEditMode ? 'Zamknij edycję zbiorową' : '☑️ Edycja zbiorowa'}
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
        <div role="alert" style={{ color: '#dc2626', fontSize: '0.86rem', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* Post-Upload Bulk Edit Panel */}
      {isAdmin && isBulkEditMode && items.length > 0 && (
        <form
          onSubmit={e => {
            void handleApplyBulkEdit(e);
          }}
          className={styles.bulkEditPanel}
          data-testid="media-bulk-edit-panel"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
              Edycja zbiorowa zaznaczonych plików (zaznaczono: {String(selectedBulkIds.length)} z {String(items.length)})
            </strong>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedBulkIds(items.map(i => i.id));
                }}
                className={styles.btnSecondary}
              >
                Zaznacz wszystkie
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedBulkIds([]);
                }}
                className={styles.btnSecondary}
              >
                Odznacz wszystkie
              </button>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="bulk-edit-folder" className={styles.label}>
                Zmień nazwę folderu docelowego (przeniesie wszystkie pliki)
              </label>
              <input
                id="bulk-edit-folder"
                type="text"
                placeholder={items[0]?.directoryPath ?? 'np. nowy_folder_wydarzenia'}
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
                  <option value="EVENT">Ustaw datę i czas z bieżącego wydarzenia</option>
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
                  <option value="">Automatycznie (Original Date Time -&gt; Image Date Time -&gt; plik)</option>
                  <option value="Original Date Time">EXIF: Original Date Time (data wykonania)</option>
                  <option value="Digitized Date Time">EXIF: Digitized Date Time (data digitalizacji)</option>
                  <option value="Image Date Time">EXIF: Image Date Time (data obrazu)</option>
                  <option value="creation_time">MP4 / QuickTime: creation_time</option>
                  <option value="lastModified">Plik: Data modyfikacji (lastModified)</option>
                </select>
              </div>
            )}
          </div>

          {bulkEditDateMode === 'MANUAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={bulkEditIsBetween}
                  onChange={e => {
                    setBulkEditIsBetween(e.target.checked);
                  }}
                />
                <span>Przedział niepewności „między … a …” dla daty wykonania</span>
              </label>

              <div className={styles.compactDateTimeInputs}>
                <select
                  value={bulkEditDateQual}
                  onChange={e => {
                    setBulkEditDateQual(e.target.value);
                  }}
                  className={styles.input}
                  style={{ width: '140px', height: '34px' }}
                >
                  {QUALIFIER_OPTIONS.map(q => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
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
                <select
                  value={bulkEditTimeQual}
                  onChange={e => {
                    setBulkEditTimeQual(e.target.value);
                  }}
                  className={styles.input}
                  style={{ width: '130px', height: '34px' }}
                >
                  {QUALIFIER_OPTIONS.map(q => (
                    <option key={q.value} value={q.value}>
                      Czas: {q.label}
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

              {bulkEditIsBetween && (
                <div className={styles.compactDateTimeInputs}>
                  <span className={styles.label}>… a:</span>
                  <select
                    value={bulkEditRangeEndQual}
                    onChange={e => {
                      setBulkEditRangeEndQual(e.target.value);
                    }}
                    className={styles.input}
                    style={{ width: '140px', height: '34px' }}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
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
                  <select
                    value={bulkEditRangeEndTimeQual}
                    onChange={e => {
                      setBulkEditRangeEndTimeQual(e.target.value);
                    }}
                    className={styles.input}
                    style={{ width: '130px', height: '34px' }}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>
                        Czas: {q.label}
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
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsBulkEditMode(false);
              }}
              className={styles.btnSecondary}
            >
              Anuluj
            </button>
            <button
              type="submit"
              data-testid="submit-bulk-edit-media-button"
              disabled={selectedBulkIds.length === 0 || isSubmitting}
              className={styles.btnPrimary}
            >
              ✓ Zastosuj zmiany dla zaznaczonych ({String(selectedBulkIds.length)})
            </button>
          </div>
        </form>
      )}

      {/* Batch & Single Upload Staging Form */}
      {isAdmin && showUpload && (
        <form
          onSubmit={e => {
            void handleUploadSubmit(e);
          }}
          className={styles.uploadPanel}
          data-testid="media-upload-form"
        >
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
                  accept="image/*,video/*"
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
                  setCustomFolderName(e.target.value);
                }}
                className={styles.input}
              />
            </div>

            {context !== 'GRAVE' && (
              <div className={styles.formField}>
                <label htmlFor="media-date-mode-select" className={styles.label}>
                  Zbiorcze ustawienie daty i czasu dla paczki
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
                  Wspólny trzon nazwy dla wszystkich (snake_case)
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

          {context !== 'GRAVE' && dateSourceMode === 'EVENT_OR_MANUAL' && (
            <div className={styles.compactDateTimeInputs}>
              <span className={styles.label}>
                Wspólna data i czas paczki (RRRR-MM-DD GG:MM:SS):
              </span>
              <select
                value={manualBulkQual}
                onChange={e => {
                  setManualBulkQual(e.target.value);
                }}
                className={styles.input}
                style={{ width: '135px', height: '34px' }}
              >
                {QUALIFIER_OPTIONS.map(q => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
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
              <select
                value={manualBulkTimeQual}
                onChange={e => {
                  setManualBulkTimeQual(e.target.value);
                }}
                className={styles.input}
                style={{ width: '130px', height: '34px' }}
              >
                {QUALIFIER_OPTIONS.map(q => (
                  <option key={q.value} value={q.value}>
                    Czas: {q.label}
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
          )}

          {directoryPreview && (
            <div className={styles.pathPreviewBanner} data-testid="media-path-preview">
              📁 Docelowy katalog na dysku:{' '}
              <strong>
                {customFolderName.trim() !== ''
                  ? `${directoryPreview.slice(0, directoryPreview.lastIndexOf('/') + 1)}${customFolderName.trim()}`
                  : directoryPreview}
                /
              </strong>
            </div>
          )}

          {stagedFiles.length > 0 && (
            <div className={styles.stagedList}>
              {stagedFiles.map((st, idx) => {
                const chosenMeta =
                  st.metadataOptions.find(o => o.sourceTag === st.selectedMetadataTag) ??
                  st.metadataOptions.at(0);

                return (
                  <div key={`${st.file.name}-${String(idx)}`} className={styles.stagedCard}>
                    <div className={styles.stagedTopRow}>
                      <span className={styles.breakableCode}>📄 {st.file.name}</span>

                      {chosenMeta ? (
                        <div className={styles.metadataBadge}>
                          <span>📷 Metadane:</span>
                          {st.metadataOptions.length > 1 ? (
                            <select
                              value={st.selectedMetadataTag}
                              onChange={e => {
                                const tag = e.target.value;
                                const opt = st.metadataOptions.find(o => o.sourceTag === tag);
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
                              style={{ height: '26px', fontSize: '0.73rem', width: 'auto', padding: '0 0.4rem' }}
                            >
                              {st.metadataOptions.map(opt => (
                                <option key={opt.sourceTag} value={opt.sourceTag}>
                                  {opt.sourceTag} — {opt.formattedText}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>
                              ({chosenMeta.sourceTag}): <strong>{chosenMeta.formattedText}</strong>
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
                        <span className={styles.label}>Tytuł / podpis</span>
                        <input
                          type="text"
                          aria-label="Tytuł lub podpis"
                          value={st.title}
                          onChange={e => {
                            const val = e.target.value;
                            setStagedFiles(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, title: val } : item
                              )
                            );
                          }}
                          placeholder="Podpis (opcjonalnie)..."
                          className={styles.input}
                        />
                      </div>

                      <div>
                        <span className={styles.label}>
                          Data i czas zdjęcia/filmu (RRRR-MM-DD GG:MM:SS)
                        </span>
                        <div className={styles.compactDateTimeInputs}>
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {stagedFiles.length === 1 && (context === 'GRAVE' || context === 'PERSON') && (
            <div className={styles.checkboxRow}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setShowUpload(false);
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
        </form>
      )}

      {/* Direct Media Grid & Sub-Events Media Grids */}
      {displayedDirectItems.length === 0 && displayedSubGroups.length === 0 ? (
        <p className={styles.emptyText}>Brak przypisanych zdjęć i filmów.</p>
      ) : (
        <>
          {displayedDirectItems.length > 0 && renderMediaGrid(displayedDirectItems, true)}

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
              {renderMediaGrid(group.media, false)}
            </div>
          ))}
        </>
      )}

      {/* Modal for Linking Existing Media from Gallery */}
      {showLinkExistingModal && (
        <div
          className={styles.modalBackdrop}
          data-testid="link-existing-media-modal"
          onClick={() => {
            setShowLinkExistingModal(false);
          }}
        >
          <div
            className={styles.modalDialog}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className={styles.modalHeader}>
              <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                🔗 Wybierz istniejące zdjęcia lub filmy z galerii
              </strong>
              <button
                type="button"
                onClick={() => {
                  setShowLinkExistingModal(false);
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Szukaj po podpisie, nazwie pliku, osobie lub cmentarzu..."
                  value={gallerySearchQuery}
                  onChange={e => {
                    const q = e.target.value;
                    setGallerySearchQuery(q);
                    void fetchGalleryCandidates(q, galleryTypeFilter);
                  }}
                  className={styles.input}
                  style={{ flex: 1, minWidth: '220px' }}
                />
                <select
                  value={galleryTypeFilter}
                  onChange={e => {
                    const t = e.target.value;
                    setGalleryTypeFilter(t);
                    void fetchGalleryCandidates(gallerySearchQuery, t);
                  }}
                  className={styles.input}
                  style={{ width: '170px' }}
                >
                  <option value="ALL">Zdjęcia i filmy</option>
                  <option value="IMAGE">Tylko zdjęcia</option>
                  <option value="VIDEO">Tylko filmy</option>
                </select>
              </div>

              {galleryCandidates.length === 0 ? (
                <p className={styles.emptyText}>
                  Brak dostępnych plików w galerii spełniających kryteria wyszukiwania.
                </p>
              ) : (
                <div className={styles.mediaGrid}>
                  {galleryCandidates.map(cand => {
                    const isChecked = selectedExistingIds.includes(cand.id);
                    return (
                      <div key={cand.id} className={styles.mediaTileWrapper}>
                        <button
                          type="button"
                          data-testid={`existing-gallery-candidate-${String(cand.id)}`}
                          onClick={() => {
                            setSelectedExistingIds(prev =>
                              prev.includes(cand.id)
                                ? prev.filter(id => id !== cand.id)
                                : [...prev, cand.id]
                            );
                          }}
                          className={`${styles.mediaTile} ${
                            isChecked ? styles.mediaTileSelected : ''
                          }`}
                        >
                          <div className={styles.thumbWrapper}>
                            {cand.mediaType === 'IMAGE' ? (
                              <img
                                src={mediaApi.getThumbnailUrl(cand.id)}
                                alt={cand.title ?? ''}
                                className={styles.thumbImage}
                              />
                            ) : (
                              <>
                                <video
                                  src={`${mediaApi.getFileUrl(cand.id)}#t=0.5`}
                                  preload="metadata"
                                  muted
                                  playsInline
                                  className={styles.thumbImage}
                                />
                                <span className={styles.videoPlayOverlay}>▶</span>
                              </>
                            )}
                            {isChecked && (
                              <span className={styles.primaryBadge}>✓ Wybrano</span>
                            )}
                            {(cand.dateText ?? cand.year) && (
                              <span className={styles.dateCornerBadge}>
                                {cand.dateText ?? cand.year}
                              </span>
                            )}
                          </div>
                          <div className={styles.tileBody}>
                            <div className={styles.tileTitle}>
                              {cand.title ?? cand.fileName}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
                Wybrano plików: <strong>{String(selectedExistingIds.length)}</strong>
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkExistingModal(false);
                  }}
                  className={styles.btnSecondary}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  data-testid="confirm-link-existing-media-button"
                  disabled={selectedExistingIds.length === 0 || isSubmitting}
                  onClick={() => {
                    void handleConfirmLinkExisting();
                  }}
                  className={styles.btnPrimary}
                >
                  ✓ Przypisz wybrane ({String(selectedExistingIds.length)})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox with Version Switcher, Reverse Side, Authors, Source, Person Roles & Interactive Cropper */}
      {activeItem && (
        <div
          className={styles.fullscreenOverlay}
          data-testid="media-lightbox-modal"
          onClick={() => {
            setActiveIndex(null);
          }}
        >
          <div
            className={styles.fullscreenTopBar}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {activeItem.title ?? 'Podgląd multimediów'} (
                {String((activeIndex ?? 0) + 1)} / {String(allViewableItems.length)})
              </span>

              {/* Points 15 & 17: Version & Reverse Side Switcher */}
              {activeVersions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {activeVersions.map(ver => {
                    const isVerActive =
                      selectedVersionId !== null
                        ? selectedVersionId === ver.id
                        : ver.main;
                    return (
                      <button
                        key={ver.id}
                        type="button"
                        onClick={() => {
                          setSelectedVersionId(ver.id);
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                        }}
                        style={{
                          padding: '0.22rem 0.6rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: '999px',
                          border: isVerActive ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.3)',
                          backgroundColor: isVerActive ? '#2563eb' : 'rgba(255,255,255,0.12)',
                          color: '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        {ver.reverseSide ? '🔄 ' : ver.main ? '⭐ ' : ''}
                        {ver.versionLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.topBarButtons}>
              {activeItem.mediaType === 'IMAGE' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(prev => Math.max(1, prev - 0.5));
                    }}
                    className={styles.btnSecondary}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className={styles.btnSecondary}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(prev => Math.min(5, prev + 0.5));
                    }}
                    className={styles.btnSecondary}
                  >
                    +
                  </button>
                </>
              )}

              <button
                type="button"
                data-testid="toggle-media-details-drawer"
                onClick={() => {
                  setShowDetailsDrawer(prev => !prev);
                }}
                className={styles.btnSecondary}
              >
                ℹ️ {showDetailsDrawer ? 'Ukryj szczegóły' : 'Szczegóły i opcje'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveIndex(null);
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>
          </div>

          <div
            className={styles.viewerStage}
            onClick={e => {
              e.stopPropagation();
            }}
            onWheel={e => {
              if (activeItem.mediaType !== 'IMAGE') return;
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              setZoom(prev => {
                const next = Math.min(5, Math.max(1, prev + delta));
                if (next === 1) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
            onMouseDown={e => {
              if (zoom > 1) {
                setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              }
            }}
            onMouseMove={e => {
              if (dragStart && zoom > 1) {
                setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
            }}
            onMouseUp={() => {
              setDragStart(null);
            }}
            onTouchStart={e => {
              if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                setPinchStartDist(Math.hypot(dx, dy));
              } else if (e.touches.length === 1 && zoom > 1) {
                setDragStart({
                  x: e.touches[0].clientX - pan.x,
                  y: e.touches[0].clientY - pan.y,
                });
              }
            }}
            onTouchMove={e => {
              if (e.touches.length === 2 && pinchStartDist !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const scaleFactor = dist / pinchStartDist;
                setZoom(prev => Math.min(5, Math.max(1, prev * scaleFactor)));
                setPinchStartDist(dist);
              } else if (e.touches.length === 1 && dragStart && zoom > 1) {
                setPan({
                  x: e.touches[0].clientX - dragStart.x,
                  y: e.touches[0].clientY - dragStart.y,
                });
              }
            }}
            onTouchEnd={() => {
              setPinchStartDist(null);
              setDragStart(null);
            }}
          >
            {allViewableItems.length > 1 && (
              <button
                type="button"
                aria-label="Poprzednie zdjęcie lub film"
                onClick={() => {
                  handleNavigateMedia(-1);
                }}
                className={`${styles.navArrowBtn} ${styles.navArrowLeft}`}
              >
                ‹
              </button>
            )}

            <div
              style={{
                transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
                transition: dragStart ? 'none' : 'transform 0.1s ease-out',
                cursor: zoom > 1 ? 'grab' : 'default',
                maxWidth: '94vw',
                maxHeight: showDetailsDrawer ? '44vh' : '82vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeItem.mediaType === 'VIDEO' && !activeSelectedVersion?.reverseSide ? (
                <video
                  src={activeStageUrl}
                  controls
                  style={{ maxWidth: '94vw', maxHeight: '78vh', objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={activeStageUrl}
                  alt={activeItem.title ?? ''}
                  draggable={false}
                  style={{ maxWidth: '94vw', maxHeight: '80vh', objectFit: 'contain' }}
                />
              )}
            </div>

            {allViewableItems.length > 1 && (
              <button
                type="button"
                aria-label="Następne zdjęcie lub film"
                onClick={() => {
                  handleNavigateMedia(1);
                }}
                className={`${styles.navArrowBtn} ${styles.navArrowRight}`}
              >
                ›
              </button>
            )}
          </div>

          {showDetailsDrawer && (
            <div
              className={styles.detailsDrawer}
              onClick={e => {
                e.stopPropagation();
              }}
            >
              {isEditingItem ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-filename" className={styles.label}>
                        Nazwa pliku na dysku (snake_case)
                      </label>
                      <input
                        id="edit-media-filename"
                        type="text"
                        value={editFileName}
                        onChange={e => {
                          setEditFileName(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-folder" className={styles.label}>
                        Zmień nazwę folderu docelowego (opcjonalnie)
                      </label>
                      <input
                        id="edit-media-folder"
                        type="text"
                        placeholder={activeItem.directoryPath ?? 'np. nowy_folder'}
                        value={editFolderName}
                        onChange={e => {
                          setEditFolderName(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-title" className={styles.label}>
                        Tytuł (krótka nazwa kafelka)
                      </label>
                      <input
                        id="edit-media-title"
                        type="text"
                        value={editTitle}
                        onChange={e => {
                          setEditTitle(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-source" className={styles.label}>
                        Źródło zdjęcia / filmu (tekstowo)
                      </label>
                      <input
                        id="edit-media-source"
                        type="text"
                        placeholder="np. Z albumu babci Katarzyny"
                        value={editSourceText}
                        onChange={e => {
                          setEditSourceText(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-inscription" className={styles.label}>
                        Podpis z odwrotu zdjęcia / oryginalna dedykacja
                      </label>
                      <input
                        id="edit-media-inscription"
                        type="text"
                        placeholder="np. Na pamiątkę z Krynicy, 1938 r."
                        value={editInscription}
                        onChange={e => {
                          setEditInscription(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-desc" className={styles.label}>
                        Opis tekstowy (zwykły tekst)
                      </label>
                      <input
                        id="edit-media-desc"
                        type="text"
                        placeholder="Dodatkowe informacje o zdjęciu/nagraniu..."
                        value={editDescription}
                        onChange={e => {
                          setEditDescription(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </div>
                  </div>

                  {/* Date & Time Mode */}
                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-date-mode" className={styles.label}>
                        Źródło daty i czasu tego pliku
                      </label>
                      <select
                        id="edit-media-date-mode"
                        value={editDateMode}
                        onChange={e => {
                          const nextM = e.target.value as
                            | 'MANUAL'
                            | 'METADATA'
                            | 'EVENT'
                            | 'UNDATED';
                          setEditDateMode(nextM);
                          if (nextM === 'METADATA') {
                            setEditIsBetween(false);
                            setEditDateQual('EXACT');
                            setEditTimeQual('EXACT');
                            if (activeItem.metadataYear) {
                              setEditYear(numToStr(activeItem.metadataYear));
                              setEditMonth(numToStr(activeItem.metadataMonth));
                              setEditDay(numToStr(activeItem.metadataDay));
                              setEditHour(numToStr(activeItem.metadataHour));
                              setEditMinute(numToStr(activeItem.metadataMinute));
                              setEditSecond(numToStr(activeItem.metadataSecond));
                            }
                          }
                        }}
                        className={styles.input}
                      >
                        <option value="MANUAL">
                          Wpisz datę i czas ręcznie (lub przedział „między … a …”)
                        </option>
                        <option value="METADATA">
                          Przywróć datę i czas z metadanych pliku (zawsze Dokładnie)
                        </option>
                        {eventId !== undefined && (
                          <option value="EVENT">Ustaw z daty bieżącego wydarzenia</option>
                        )}
                        <option value="UNDATED">Wyczyść datę (undated)</option>
                      </select>
                    </div>

                    {editDateMode === 'METADATA' &&
                      activeItem.availableMetadataDates &&
                      activeItem.availableMetadataDates.length > 0 && (
                        <div className={styles.formField}>
                          <label htmlFor="edit-media-meta-tag" className={styles.label}>
                            Wybierz pole metadanych pliku
                          </label>
                          <select
                            id="edit-media-meta-tag"
                            value={editSelectedMetadataTag}
                            onChange={e => {
                              const tag = e.target.value;
                              setEditSelectedMetadataTag(tag);
                              const opt = activeItem.availableMetadataDates?.find(
                                o => o.sourceTag === tag
                              );
                              if (opt) {
                                setEditYear(numToStr(opt.year));
                                setEditMonth(numToStr(opt.month));
                                setEditDay(numToStr(opt.day));
                                setEditHour(numToStr(opt.hour));
                                setEditMinute(numToStr(opt.minute));
                                setEditSecond(numToStr(opt.second));
                              }
                            }}
                            className={styles.input}
                          >
                            {activeItem.availableMetadataDates.map(opt => (
                              <option key={opt.sourceTag} value={opt.sourceTag}>
                                {opt.sourceTag} — {opt.dateText}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                  </div>

                  {editDateMode === 'MANUAL' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={editIsBetween}
                          onChange={e => {
                            setEditIsBetween(e.target.checked);
                          }}
                        />
                        <span>Przedział niepewności „między … a …” dla daty wykonania</span>
                      </label>

                      <div className={styles.compactDateTimeInputs}>
                        <select
                          value={editDateQual}
                          onChange={e => {
                            setEditDateQual(e.target.value);
                          }}
                          className={styles.input}
                          style={{ width: '140px', height: '34px' }}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          placeholder="RRRR"
                          value={editYear}
                          onChange={e => {
                            setEditYear(e.target.value);
                          }}
                          className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                        />
                        <input
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={editMonth}
                          onChange={e => {
                            setEditMonth(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                        <input
                          type="number"
                          min={1}
                          max={31}
                          placeholder="DD"
                          value={editDay}
                          onChange={e => {
                            setEditDay(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                        <select
                          value={editTimeQual}
                          onChange={e => {
                            setEditTimeQual(e.target.value);
                          }}
                          className={styles.input}
                          style={{ width: '130px', height: '34px' }}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>
                              Czas: {q.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={editHour}
                          onChange={e => {
                            setEditHour(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="MM"
                          value={editMinute}
                          onChange={e => {
                            setEditMinute(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                        <span>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="SS"
                          value={editSecond}
                          onChange={e => {
                            setEditSecond(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>

                      {editIsBetween && (
                        <div className={styles.compactDateTimeInputs}>
                          <span className={styles.label}>… a:</span>
                          <select
                            value={editRangeEndQual}
                            onChange={e => {
                              setEditRangeEndQual(e.target.value);
                            }}
                            className={styles.input}
                            style={{ width: '140px', height: '34px' }}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            placeholder={editYear || 'RRRR'}
                            value={editRangeEndYear}
                            onChange={e => {
                              setEditRangeEndYear(e.target.value);
                            }}
                            className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                          />
                          <input
                            type="number"
                            min={1}
                            max={12}
                            placeholder="MM"
                            value={editRangeEndMonth}
                            onChange={e => {
                              setEditRangeEndMonth(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <input
                            type="number"
                            min={1}
                            max={31}
                            placeholder="DD"
                            value={editRangeEndDay}
                            onChange={e => {
                              setEditRangeEndDay(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <select
                            value={editRangeEndTimeQual}
                            onChange={e => {
                              setEditRangeEndTimeQual(e.target.value);
                            }}
                            className={styles.input}
                            style={{ width: '130px', height: '34px' }}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                Czas: {q.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            placeholder="GG"
                            value={editRangeEndHour}
                            onChange={e => {
                              setEditRangeEndHour(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="MM"
                            value={editRangeEndMinute}
                            onChange={e => {
                              setEditRangeEndMinute(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="SS"
                            value={editRangeEndSecond}
                            onChange={e => {
                              setEditRangeEndSecond(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Points 13 & 14: Person Links Builder (DEPICTED, RELATED, AUTHOR - DB or Text) */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                    }}
                  >
                    <span className={styles.label}>
                      Osoby na zdjęciu, osoby powiązane oraz autorzy (z bazy lub tekstowo):
                    </span>
                    <div className={styles.formGrid}>
                      <div className={styles.formField}>
                        <span className={styles.label}>Rodzaj powiązania</span>
                        <select
                          value={linkRoleType}
                          onChange={e => {
                            setLinkRoleType(
                              e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR'
                            );
                          }}
                          className={styles.input}
                        >
                          <option value="DEPICTED">
                            👁️ Osoba widoczna na zdjęciu / filmie
                          </option>
                          <option value="RELATED">
                            🔗 Osoba powiązana ze zdjęciem / filmem
                          </option>
                          <option value="AUTHOR">
                            📷 Autor zdjęcia / nagrania (kto wykonał)
                          </option>
                        </select>
                      </div>

                      <div className={styles.formField}>
                        <span className={styles.label}>Dodaj osobę z drzewa</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input
                            type="text"
                            placeholder="Szukaj w drzewie..."
                            value={linkPersonQuery}
                            onChange={e => {
                              setLinkPersonQuery(e.target.value);
                            }}
                            className={styles.input}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void handleSearchPersonForLink();
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
                            value={linkTextInput}
                            onChange={e => {
                              setLinkTextInput(e.target.value);
                            }}
                            className={styles.input}
                          />
                          <select
                            value={linkTextSex}
                            onChange={e => {
                              setLinkTextSex(e.target.value as PersonSex);
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
                              if (linkTextInput.trim() === '') return;
                              const txt = linkTextInput.trim();
                              setEditPersonLinks(prev => [
                                ...prev,
                                {
                                  personText: txt,
                                  personSex: linkTextSex,
                                  linkType: linkRoleType,
                                  displayLabel: `${PERSON_LINK_TYPE_LABELS[linkRoleType]}: ${txt} [spoza bazy]`,
                                },
                              ]);
                              setLinkTextInput('');
                            }}
                            className={styles.btnSecondary}
                          >
                            + Dodaj
                          </button>
                        </div>
                      </div>
                    </div>

                    {linkPersonResults.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {linkPersonResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
                              setEditPersonLinks(prev => [
                                ...prev,
                                {
                                  personId: p.id,
                                  linkType: linkRoleType,
                                  displayLabel: `${PERSON_LINK_TYPE_LABELS[linkRoleType]}: ${fullName}`,
                                },
                              ]);
                              setLinkPersonResults([]);
                              setLinkPersonQuery('');
                            }}
                            className={styles.btnSecondary}
                          >
                            + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                          </button>
                        ))}
                      </div>
                    )}

                    {editPersonLinks.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {editPersonLinks.map((pl, idx) => (
                          <span
                            key={`${pl.displayLabel}-${String(idx)}`}
                            className={styles.selectedFilesBadge}
                          >
                            {pl.displayLabel}{' '}
                            <button
                              type="button"
                              onClick={() => {
                                setEditPersonLinks(prev =>
                                  prev.filter((_, i) => i !== idx)
                                );
                              }}
                              style={{
                                marginLeft: '0.35rem',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontWeight: 800,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.32rem' }}>
                  {activeItem.title && (
                    <strong style={{ fontSize: '1rem' }}>{activeItem.title}</strong>
                  )}
                  {activeItem.dateText && (
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                      📅 Data i czas wykonania: {activeItem.dateText}
                    </div>
                  )}
                  {activeItem.inscriptionText && (
                    <div style={{ fontSize: '0.84rem', color: '#1e293b', fontStyle: 'italic' }}>
                      ✍️ Podpis z odwrotu: „{activeItem.inscriptionText}”
                    </div>
                  )}
                  {activeItem.description && (
                    <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                      📝 Opis: {activeItem.description}
                    </div>
                  )}
                  {activeItem.sourceText && (
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      📚 Źródło: <strong>{activeItem.sourceText}</strong>
                    </div>
                  )}
                  {activeItem.authors && activeItem.authors.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      📷 Autor: <strong>{activeItem.authors.map(a => a.displayName).join(', ')}</strong>
                    </div>
                  )}
                  {activeItem.depictedPersons && activeItem.depictedPersons.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      👁️ Osoby na zdjęciu/filmie:{' '}
                      <strong>{activeItem.depictedPersons.map(d => d.displayName).join(', ')}</strong>
                    </div>
                  )}
                  {activeItem.relatedPersons && activeItem.relatedPersons.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      🔗 Osoby powiązane:{' '}
                      <strong>{activeItem.relatedPersons.map(r => r.displayName).join(', ')}</strong>
                    </div>
                  )}
                  {isAdmin && activeItem.metadataDateText && (
                    <div className={styles.metadataBadge} style={{ alignSelf: 'flex-start' }}>
                      📷 Data z metadanych ({activeItem.metadataDateSource ?? 'Metadane'}):{' '}
                      <strong>{activeItem.metadataDateText}</strong>
                    </div>
                  )}
                  <div className={styles.breakableCode}>
                    Nazwa pliku: {activeSelectedVersion ? activeSelectedVersion.fileName : activeItem.fileName}
                  </div>
                  {isAdmin && activeItem.relativePath && (
                    <div className={styles.breakableCode}>
                      Ścieżka na dysku (widoczna dla administratora):{' '}
                      {activeSelectedVersion?.relativePath ?? activeItem.relativePath}
                    </div>
                  )}
                </div>
              )}

              {/* Point 15 & 17: Add Version or Reverse Side Form */}
              {isAdmin && showVersionUpload && (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: '0.65rem',
                  }}
                >
                  <div className={styles.formField} style={{ flex: '1 1 180px' }}>
                    <span className={styles.label}>Typ wersji / strony</span>
                    <select
                      value={versionTypeInput}
                      onChange={e => {
                        setVersionTypeInput(e.target.value);
                      }}
                      className={styles.input}
                    >
                      <option value="RESTORED">Wersja odnowiona (po retuszu)</option>
                      <option value="COLORIZED">Wersja w kolorze</option>
                      <option value="ENHANCED">Wersja wyostrzona / poprawiona</option>
                      <option value="REVERSE">🔄 Strona odwrotna (Rewers zdjęcia)</option>
                      <option value="ORIGINAL">Oryginał</option>
                      <option value="OTHER">Inna wersja</option>
                    </select>
                  </div>

                  <div className={styles.formField} style={{ flex: '1 1 180px' }}>
                    <span className={styles.label}>Własna etykieta (opcjonalnie)</span>
                    <input
                      type="text"
                      placeholder="np. Koloryzacja z 2025 r."
                      value={versionLabelInput}
                      onChange={e => {
                        setVersionLabelInput(e.target.value);
                      }}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.filePickerRow}>
                    <label htmlFor={versionFileInputId} className={styles.filePickerLabel}>
                      📂 Wybierz plik wersji
                    </label>
                    <input
                      id={versionFileInputId}
                      type="file"
                      accept="image/*,video/*"
                      onChange={e => {
                        setVersionFile(e.target.files?.[0] ?? null);
                      }}
                      className={styles.hiddenFileInput}
                    />
                    <span className={styles.selectedFilesBadge}>
                      {versionFile ? versionFile.name : 'Nie wybrano'}
                    </span>
                  </div>

                  {versionTypeInput !== 'REVERSE' && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={versionSetAsMain}
                        onChange={e => {
                          setVersionSetAsMain(e.target.checked);
                        }}
                      />
                      <span>Ustaw jako główną wyświetlaną wersję</span>
                    </label>
                  )}

                  <button
                    type="button"
                    disabled={!versionFile || isSubmitting}
                    onClick={() => {
                      void handleUploadVersionSubmit();
                    }}
                    className={styles.btnPrimary}
                  >
                    ✓ Wgraj wersję
                  </button>
                </div>
              )}

              {/* Point 12: Interactive Drag & Wheel Avatar Cropper */}
              {isAdmin && showCropper && personId !== undefined && (
                <InteractiveAvatarCropper
                  mediaId={activeItem.id}
                  mediaType={activeItem.mediaType}
                  onSaveCrop={(cx, cy, cz) => {
                    void handleSavePrimaryOrAvatarCrop(activeItem, cx, cy, cz);
                  }}
                  onCancel={() => {
                    setShowCropper(false);
                  }}
                />
              )}

              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {!isEditingItem ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingItem(true);
                        }}
                        className={styles.btnSecondary}
                      >
                        ✏️ Edytuj dane, opis, osoby, autora lub datę
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowVersionUpload(prev => !prev);
                        }}
                        className={styles.btnSecondary}
                      >
                        ➕ Dodaj wersję / rewers
                      </button>

                      {activeSelectedVersion && !activeSelectedVersion.main && (
                        <>
                          {!activeSelectedVersion.reverseSide && (
                            <button
                              type="button"
                              onClick={() => {
                                void handleSetVersionAsMain(activeSelectedVersion.id);
                              }}
                              className={styles.btnSecondary}
                            >
                              ⭐ Ustaw tę wersję jako główną
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteVersion(activeSelectedVersion.id);
                            }}
                            className={styles.btnDanger}
                          >
                            🗑️ Usuń tę wersję
                          </button>
                        </>
                      )}

                      {context === 'PERSON' && personId !== undefined && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCropper(prev => !prev);
                          }}
                          className={styles.btnSecondary}
                        >
                          ⭐ Ustaw jako portret / wykadruj kółko
                        </button>
                      )}

                      {context === 'GRAVE' &&
                        graveId !== undefined &&
                        activeItem.mediaType === 'IMAGE' &&
                        primaryMediaId !== activeItem.id && (
                          <button
                            type="button"
                            onClick={() => {
                              void handleSavePrimaryOrAvatarCrop(activeItem);
                            }}
                            className={styles.btnSecondary}
                          >
                            ⭐ Ustaw jako główne zdjęcie nagrobka
                          </button>
                        )}

                      {(graveId !== undefined ||
                        personId !== undefined ||
                        eventId !== undefined) && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleUnlinkItemFromHere(activeItem.id);
                          }}
                          className={styles.btnSecondary}
                        >
                          🔗 Odepnij z tego miejsca
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteItem(activeItem.id);
                        }}
                        className={styles.btnDanger}
                      >
                        🗑️ Usuń całkowicie z dysku
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          void handleSaveItemEdit();
                        }}
                        className={styles.btnPrimary}
                      >
                        Zapisz zmiany
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingItem(false);
                        }}
                        className={styles.btnSecondary}
                      >
                        Anuluj
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
