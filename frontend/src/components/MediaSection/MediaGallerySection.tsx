import { useState, useEffect, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mediaApi } from '../../api/mediaApi';
import {
  extractClientFileMetadata,
  type ClientExtractedMetadata,
} from '../../utils/clientMetadataExtractor';
import PersonAvatar from '../PersonAvatar/PersonAvatar';
import styles from './MediaGallerySection.module.css';
import type {
  MediaItemDto,
  MediaPrimaryContext,
  SubEventMediaGroupDto,
} from '../../types/media';

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
  metadata: ClientExtractedMetadata | null;
}

type DateSourceMode = 'EVENT_OR_MANUAL' | 'FILE_METADATA' | 'UNDATED';
type SectionMediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO';
type SectionSortMode = 'DATE_ASC' | 'DATE_DESC' | 'NAME_ASC' | 'NEWEST_ADDED';

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

  const [items, setItems] = useState<MediaItemDto[]>([]);
  const [subEventGroups, setSubEventGroups] = useState<SubEventMediaGroupDto[]>([]);
  const [showUpload, setShowUpload] = useState<boolean>(false);

  // Point 8: Filtering (All / Images / Videos) & Sorting in Event / Grave / Person sections
  const [typeFilter, setTypeFilter] = useState<SectionMediaTypeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SectionSortMode>('DATE_ASC');

  // Batch & Single Upload Staging state (Points 2 & 7)
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [customFolderName, setCustomFolderName] = useState<string>('');
  const [dateSourceMode, setDateSourceMode] = useState<DateSourceMode>(
    defaultEventYear ? 'EVENT_OR_MANUAL' : 'FILE_METADATA'
  );
  const [manualBulkYear, setManualBulkYear] = useState<string>(
    defaultEventYear ? String(defaultEventYear) : ''
  );
  const [manualBulkMonth, setManualBulkMonth] = useState<string>('');
  const [manualBulkDay, setManualBulkDay] = useState<string>('');
  const [manualBulkHour, setManualBulkHour] = useState<string>('');
  const [manualBulkMinute, setManualBulkMinute] = useState<string>('');
  const [manualBulkSecond, setManualBulkSecond] = useState<string>('');
  const [bulkBaseName, setBulkBaseName] = useState<string>('');
  const [directoryPreview, setDirectoryPreview] = useState<string>('');
  const [setAsPrimary, setSetAsPrimary] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Point 2 & 7: Post-Upload Bulk Edit Mode state
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<number[]>([]);
  const [bulkEditFolder, setBulkEditFolder] = useState<string>('');
  const [bulkEditStem, setBulkEditStem] = useState<string>('');
  const [bulkEditDateMode, setBulkEditDateMode] = useState<
    'NO_CHANGE' | 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'
  >('NO_CHANGE');
  const [bulkEditYear, setBulkEditYear] = useState<string>('');
  const [bulkEditMonth, setBulkEditMonth] = useState<string>('');
  const [bulkEditDay, setBulkEditDay] = useState<string>('');
  const [bulkEditHour, setBulkEditHour] = useState<string>('');
  const [bulkEditMinute, setBulkEditMinute] = useState<string>('');
  const [bulkEditSecond, setBulkEditSecond] = useState<string>('');

  // Point 9: Link Existing Media from Gallery Modal state
  const [showLinkExistingModal, setShowLinkExistingModal] = useState<boolean>(false);
  const [gallerySearchQuery, setGallerySearchQuery] = useState<string>('');
  const [galleryTypeFilter, setGalleryTypeFilter] = useState<string>('ALL');
  const [galleryCandidates, setGalleryCandidates] = useState<MediaItemDto[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<number[]>([]);

  // Fullscreen Lightbox, Zoom/Pan, Prev/Next & Details Drawer state
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);

  // Single Item Edit inside Lightbox
  const [isEditingItem, setIsEditingItem] = useState<boolean>(false);
  const [editFileName, setEditFileName] = useState<string>('');
  const [editFolderName, setEditFolderName] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editDateMode, setEditDateMode] = useState<
    'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'
  >('MANUAL');
  const [editYear, setEditYear] = useState<string>('');
  const [editMonth, setEditMonth] = useState<string>('');
  const [editDay, setEditDay] = useState<string>('');
  const [editHour, setEditHour] = useState<string>('');
  const [editMinute, setEditMinute] = useState<string>('');
  const [editSecond, setEditSecond] = useState<string>('');

  // Square Avatar Cropper state
  const [showCropper, setShowCropper] = useState<boolean>(false);
  const [cropX, setCropX] = useState<number>(50);
  const [cropY, setCropY] = useState<number>(50);
  const [cropZoom, setCropZoom] = useState<number>(1.0);

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
        setActiveIndex(prev =>
          prev !== null
            ? (prev - 1 + allViewableItems.length) % allViewableItems.length
            : null
        );
      } else if (e.key === 'ArrowRight' && allViewableItems.length > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
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

    const extractedList = await Promise.all(
      filesArray.map(f => extractClientFileMetadata(f))
    );

    const staged: StagedUploadFile[] = filesArray.map((f, idx) => {
      const ext = f.name.includes('.')
        ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
        : 'jpg';
      const meta = extractedList[idx];

      let y = '';
      let m = '';
      let d = '';
      let h = '';
      let min = '';
      let sec = '';

      if (dateSourceMode === 'FILE_METADATA' && meta) {
        y = String(meta.year);
        m = String(meta.month);
        d = String(meta.day);
        h = String(meta.hour);
        min = String(meta.minute);
        sec = String(meta.second);
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
        metadata: meta,
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

        if (nextMode === 'FILE_METADATA' && item.metadata) {
          y = String(item.metadata.year);
          m = String(item.metadata.month);
          d = String(item.metadata.day);
          h = String(item.metadata.hour);
          min = String(item.metadata.minute);
          sec = String(item.metadata.second);
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
          customYear: parseOptInt(single.year) ?? undefined,
          customMonth: parseOptInt(single.month) ?? undefined,
          customDay: parseOptInt(single.day) ?? undefined,
          customHour: parseOptInt(single.hour) ?? undefined,
          customMinute: parseOptInt(single.minute) ?? undefined,
          customSecond: parseOptInt(single.second) ?? undefined,
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

  // Point 9: Open Link Existing Media from Gallery Modal
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

  // Point 2 & 7: Post-Upload Bulk Edit
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
        year: parseOptInt(bulkEditYear),
        month: parseOptInt(bulkEditMonth),
        day: parseOptInt(bulkEditDay),
        hour: parseOptInt(bulkEditHour),
        minute: parseOptInt(bulkEditMinute),
        second: parseOptInt(bulkEditSecond),
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
    setEditDescription(item.description ?? '');
    setEditDateMode('MANUAL');
    setEditYear(numToStr(item.year));
    setEditMonth(numToStr(item.month));
    setEditDay(numToStr(item.day));
    setEditHour(numToStr(item.hour));
    setEditMinute(numToStr(item.minute));
    setEditSecond(numToStr(item.second));
  };

  const handleOpenLightbox = (item: MediaItemDto) => {
    const idx = allViewableItems.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowDetailsDrawer(false);
    setShowCropper(false);
    setIsEditingItem(false);
    syncSingleEditFields(item);
  };

  const handleNavigateMedia = (direction: -1 | 1) => {
    if (allViewableItems.length <= 1 || activeIndex === null) return;
    const nextIdx =
      (activeIndex + direction + allViewableItems.length) % allViewableItems.length;
    const nextItem = allViewableItems[nextIdx];
    setActiveIndex(nextIdx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsEditingItem(false);
    setShowCropper(false);
    syncSingleEditFields(nextItem);
  };

  const handleSaveItemEdit = async () => {
    if (!activeItem) return;
    setIsSubmitting(true);
    try {
      await mediaApi.updateMedia(activeItem.id, {
        fileName: editFileName,
        customFolderName: editFolderName.trim() || null,
        title: editTitle,
        description: editDescription,
        dateSourceMode: editDateMode,
        contextEventId: eventId ?? null,
        year: parseOptInt(editYear),
        month: parseOptInt(editMonth),
        day: parseOptInt(editDay),
        hour: parseOptInt(editHour),
        minute: parseOptInt(editMinute),
        second: parseOptInt(editSecond),
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

  const handleSetAsPrimaryWithCrop = async (item: MediaItemDto) => {
    try {
      await mediaApi.updateMedia(item.id, {
        setAsAvatarForPersonId: personId ?? null,
        avatarCropX: personId !== undefined ? cropX : null,
        avatarCropY: personId !== undefined ? cropY : null,
        avatarCropZoom: personId !== undefined ? cropZoom : null,
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

      {/* Point 8: Filter (All / Images / Videos) & Sort Toolbar */}
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

      {/* Point 2 & 7: Post-Upload Bulk Edit Panel */}
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
                Zmień nazwę folderu docelowego (snake_case, opcjonalnie)
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
                  Przywróć datę i czas z metadanych każdego pliku (EXIF / MP4 / plik)
                </option>
                {eventId !== undefined && (
                  <option value="EVENT">Ustaw datę i czas z bieżącego wydarzenia</option>
                )}
                <option value="MANUAL">Ustaw wspólną datę i czas ręcznie</option>
                <option value="UNDATED">Wyczyść datę (undated)</option>
              </select>
            </div>
          </div>

          {bulkEditDateMode === 'MANUAL' && (
            <div className={styles.compactDateTimeInputs}>
              <span className={styles.label}>Wspólna data i czas (RRRR-MM-DD GG:MM:SS):</span>
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
              <span>godz.</span>
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
              <span>godz.</span>
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
              {stagedFiles.map((st, idx) => (
                <div key={`${st.file.name}-${String(idx)}`} className={styles.stagedCard}>
                  <div className={styles.stagedTopRow}>
                    <span className={styles.breakableCode}>📄 {st.file.name}</span>

                    {st.metadata ? (
                      <div className={styles.metadataBadge}>
                        <span>
                          📷 Metadane ({st.metadata.sourceTag}):{' '}
                          <strong>{st.metadata.formattedText}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const m = st.metadata;
                            if (!m) return;
                            setStagedFiles(prev =>
                              prev.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      year: String(m.year),
                                      month: String(m.month),
                                      day: String(m.day),
                                      hour: String(m.hour),
                                      minute: String(m.minute),
                                      second: String(m.second),
                                    }
                                  : item
                              )
                            );
                          }}
                          className={styles.btnSecondary}
                          style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                        >
                          Użyj z metadanych
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
              ))}
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

      {/* Point 9: Modal for Linking Existing Media from Gallery */}
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

      {/* Fullscreen Lightbox with Individual Date/Time/Folder/Filename Editor */}
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
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {activeItem.title ?? 'Podgląd multimediów'} (
              {String((activeIndex ?? 0) + 1)} / {String(allViewableItems.length)})
            </span>

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
                maxHeight: showDetailsDrawer ? '44vh' : '84vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeItem.mediaType === 'VIDEO' ? (
                <video
                  src={mediaApi.getFileUrl(activeItem.id)}
                  controls
                  style={{ maxWidth: '94vw', maxHeight: '80vh', objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={mediaApi.getFileUrl(activeItem.id)}
                  alt={activeItem.title ?? ''}
                  draggable={false}
                  style={{ maxWidth: '94vw', maxHeight: '82vh', objectFit: 'contain' }}
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
                        Tytuł / podpis
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
                          if (nextM === 'METADATA' && activeItem.metadataYear) {
                            setEditYear(numToStr(activeItem.metadataYear));
                            setEditMonth(numToStr(activeItem.metadataMonth));
                            setEditDay(numToStr(activeItem.metadataDay));
                            setEditHour(numToStr(activeItem.metadataHour));
                            setEditMinute(numToStr(activeItem.metadataMinute));
                            setEditSecond(numToStr(activeItem.metadataSecond));
                          }
                        }}
                        className={styles.input}
                      >
                        <option value="MANUAL">Wpisz datę i czas ręcznie</option>
                        <option value="METADATA">
                          Przywróć datę i czas z metadanych pliku
                        </option>
                        {eventId !== undefined && (
                          <option value="EVENT">Ustaw z daty bieżącego wydarzenia</option>
                        )}
                        <option value="UNDATED">Wyczyść datę (undated)</option>
                      </select>
                    </div>
                  </div>

                  {editDateMode === 'MANUAL' && (
                    <div className={styles.compactDateTimeInputs}>
                      <span className={styles.label}>Data i czas (RRRR-MM-DD GG:MM:SS):</span>
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
                      <span>godz.</span>
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
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                  {activeItem.title && (
                    <strong style={{ fontSize: '1rem' }}>{activeItem.title}</strong>
                  )}
                  {activeItem.dateText && (
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                      📅 Data i czas wykonania: {activeItem.dateText}
                    </div>
                  )}
                  {isAdmin && activeItem.metadataDateText && (
                    <div className={styles.metadataBadge} style={{ alignSelf: 'flex-start' }}>
                      📷 Data z metadanych ({activeItem.metadataDateSource ?? 'Metadane'}):{' '}
                      <strong>{activeItem.metadataDateText}</strong>
                    </div>
                  )}
                  <div className={styles.breakableCode}>
                    Nazwa pliku: {activeItem.fileName}
                  </div>
                  {isAdmin && activeItem.relativePath && (
                    <div className={styles.breakableCode}>
                      Ścieżka na dysku (widoczna dla administratora):{' '}
                      {activeItem.relativePath}
                    </div>
                  )}
                </div>
              )}

              {/* Square Avatar Cropper for Person Portrait */}
              {isAdmin && showCropper && personId !== undefined && (
                <div className={styles.cropperBox} data-testid="avatar-cropper-box">
                  <PersonAvatar
                    sex="UNKNOWN"
                    size="lg"
                    avatarMediaId={activeItem.id}
                    avatarMediaType={activeItem.mediaType}
                    avatarCropX={cropX}
                    avatarCropY={cropY}
                    avatarCropZoom={cropZoom}
                  />
                  <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className={styles.label}>
                      Wykadruj kwadrat do małych okrągłych awatarów (w tabeli biografii zdjęcie pozostanie w całości):
                    </span>
                    <label style={{ fontSize: '0.78rem' }}>
                      Poziomo (X: {String(cropX)}%):
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={cropX}
                        onChange={e => {
                          setCropX(Number(e.target.value));
                        }}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.78rem' }}>
                      Pionowo (Y: {String(cropY)}%):
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={cropY}
                        onChange={e => {
                          setCropY(Number(e.target.value));
                        }}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.78rem' }}>
                      Powiększenie wycinka ({cropZoom.toFixed(1)}x):
                      <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.1}
                        value={cropZoom}
                        onChange={e => {
                          setCropZoom(Number(e.target.value));
                        }}
                        style={{ width: '100%' }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSetAsPrimaryWithCrop(activeItem);
                    }}
                    className={styles.btnPrimary}
                  >
                    ✓ Zapisz jako portret
                  </button>
                </div>
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
                        ✏️ Edytuj nazwę, folder, podpis lub datę
                      </button>

                      {context === 'PERSON' && personId !== undefined && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCropper(prev => !prev);
                          }}
                          className={styles.btnSecondary}
                        >
                          ⭐ Ustaw jako portret / wykadruj kwadrat
                        </button>
                      )}

                      {context === 'GRAVE' &&
                        graveId !== undefined &&
                        activeItem.mediaType === 'IMAGE' &&
                        primaryMediaId !== activeItem.id && (
                          <button
                            type="button"
                            onClick={() => {
                              void handleSetAsPrimaryWithCrop(activeItem);
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