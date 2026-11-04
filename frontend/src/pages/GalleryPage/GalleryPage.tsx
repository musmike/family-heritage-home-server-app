import { useState, useEffect, useId, useMemo, use } from 'react';
import axios from 'axios';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import { Pagination } from '../../components/Pagination/Pagination';
import styles from './GalleryPage.module.css';
import type {
  MediaCollectionDto,
  MediaGalleryPageDto,
  MediaItemDto,
  MediaPrimaryContext,
  MediaType,
  SaveMediaPersonLinkRequestDto,
  UpdateMediaItemRequestDto,
} from '../../types/media';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

interface FolderTileItem {
  key: string;
  title: string;
  subtitle?: string;
  count: number;
  previewItems?: { id: number; mediaType: MediaType }[];
  previewMediaId?: number | null;
  isTextPerson?: boolean;
  collectionId?: number;
  onClick: () => void;
}

const getTopPreviewItems = (list: MediaItemDto[]): { id: number; mediaType: MediaType }[] =>
  list.slice(0, 4).map(m => ({ id: m.id, mediaType: m.mediaType }));

const PERSON_LINK_TYPE_LABELS: Record<'DEPICTED' | 'RELATED' | 'AUTHOR', string> = {
  DEPICTED: '👁️ Na zdjęciu/filmie',
  RELATED: '🔗 Powiązana',
  AUTHOR: '📷 Autor',
};

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
  { value: 'EXACT', label: 'Dokładna data' },
  { value: 'APPROXIMATE', label: 'Szacunkowo / Około' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
];

interface UploadDateRibbonBucket {
  key: string;
  title: string;
  items: MediaItemDto[];
}

const getFirstMediaId = (list: MediaItemDto[]): number | null =>
  list.length > 0 ? list[0].id : null;

const formatPolishUploadDay = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'Data nieznana';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

export default function GalleryPage() {
  const uploadInputId = useId();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [pageData, setPageData] = useState<MediaGalleryPageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 5 Main Views: 'ALL' | 'TIMELINE' | 'PERSON' | 'GRAVE' | 'COLLECTION'
  const [viewMode, setViewMode] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [mediaType, setMediaType] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('NEWEST_UPLOAD');
  const [page, setPage] = useState<number>(0);

  // Drill-down navigation states for the 4 tile-based views
  const [selectedDecade, setSelectedDecade] = useState<number | 'UNDATED_EVENTS' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedYearBucketKey, setSelectedYearBucketKey] = useState<string | null>(null);

  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
  const [selectedPersonCategory, setSelectedPersonCategory] = useState<string | null>(null);

  const [selectedCemeteryName, setSelectedCemeteryName] = useState<string | null>(null);
  const [selectedGraveId, setSelectedGraveId] = useState<number | null>(null);

  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedCollectionSubfolder, setSelectedCollectionSubfolder] = useState<string | null>(null);

  // Multi-Person Filter
  const [selectedPersons, setSelectedPersons] = useState<{ id: number; name: string }[]>([]);
  const [matchAllPersons, setMatchAllPersons] = useState<boolean>(true);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<PersonListItemDto[]>([]);

  // Admin Create / Edit Collection / Sub-collection / Dated Collection Form
  const [showCreateCollection, setShowCreateCollection] = useState<boolean>(false);
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [colName, setColName] = useState<string>('');
  const [colSlug, setColSlug] = useState<string>('');
  const [colDesc, setColDesc] = useState<string>('');
  const [colParentId, setColParentId] = useState<string>('');
  const [colIsDated, setColIsDated] = useState<boolean>(false);
  const [colIsRange, setColIsRange] = useState<boolean>(false);
  const [colStartQual, setColStartQual] = useState<string>('EXACT');
  const [colStartYear, setColStartYear] = useState<string>('');
  const [colStartMonth, setColStartMonth] = useState<string>('');
  const [colStartDay, setColStartDay] = useState<string>('');
  const [colStartTimeQual, setColStartTimeQual] = useState<string>('EXACT');
  const [colStartHour, setColStartHour] = useState<string>('');
  const [colStartMinute, setColStartMinute] = useState<string>('');
  const [colStartSecond, setColStartSecond] = useState<string>('');
  const [colEndQual, setColEndQual] = useState<string>('EXACT');
  const [colEndYear, setColEndYear] = useState<string>('');
  const [colEndMonth, setColEndMonth] = useState<string>('');
  const [colEndDay, setColEndDay] = useState<string>('');
  const [colEndTimeQual, setColEndTimeQual] = useState<string>('EXACT');
  const [colEndHour, setColEndHour] = useState<string>('');
  const [colEndMinute, setColEndMinute] = useState<string>('');
  const [colEndSecond, setColEndSecond] = useState<string>('');

  // Admin Single & Batch Upload Form (with Advanced Date/Time/Calendar & Portrait Single/Group)
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadContext: MediaPrimaryContext = 'COLLECTION';
  const [uploadCollectionId, setUploadCollectionId] = useState<string>('');
  const [uploadIsPortrait, setUploadIsPortrait] = useState<boolean>(false);
  const [uploadPortraitType, setUploadPortraitType] = useState<'SINGLE' | 'GROUP'>('SINGLE');
  const [uploadIsUnknown, setUploadIsUnknown] = useState<boolean>(false);
  const [uploadIsRange, setUploadIsRange] = useState<boolean>(false);
  const [uploadDateQual, setUploadDateQual] = useState<string>('EXACT');
  const [uploadYear, setUploadYear] = useState<string>('');
  const [uploadMonth, setUploadMonth] = useState<string>('');
  const [uploadDay, setUploadDay] = useState<string>('');
  const uploadTimeQual = 'EXACT';
  const [uploadHour, setUploadHour] = useState<string>('');
  const [uploadMinute, setUploadMinute] = useState<string>('');
  const [uploadRangeEndQual, setUploadRangeEndQual] = useState<string>('EXACT');
  const [uploadRangeEndYear, setUploadRangeEndYear] = useState<string>('');
  const [uploadRangeEndMonth, setUploadRangeEndMonth] = useState<string>('');
  const [uploadRangeEndDay, setUploadRangeEndDay] = useState<string>('');
  const uploadRangeEndTimeQual = 'EXACT';
  const [uploadRangeEndHour, setUploadRangeEndHour] = useState<string>('');
  const [uploadRangeEndMinute, setUploadRangeEndMinute] = useState<string>('');
  const [uploadCustomName, setUploadCustomName] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState<string>('');

  // Admin In-Gallery Media Metadata Editing State
  const [isEditingMediaItem, setIsEditingMediaItem] = useState<boolean>(false);
  const [editMediaId, setEditMediaId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editInscription, setEditInscription] = useState<string>('');
  const [editSourceText, setEditSourceText] = useState<string>('');
  const [editIsRange, setEditIsRange] = useState<boolean>(false);
  const [editDateQual, setEditDateQual] = useState<string>('EXACT');
  const [editYear, setEditYear] = useState<string>('');
  const [editMonth, setEditMonth] = useState<string>('');
  const [editDay, setEditDay] = useState<string>('');
  const [editTimeQual, setEditTimeQual] = useState<string>('EXACT');
  const [editHour, setEditHour] = useState<string>('');
  const [editMinute, setEditMinute] = useState<string>('');
  const [editRangeEndQual, setEditRangeEndQual] = useState<string>('EXACT');
  const [editRangeEndYear, setEditRangeEndYear] = useState<string>('');
  const [editRangeEndMonth, setEditRangeEndMonth] = useState<string>('');
  const [editRangeEndDay, setEditRangeEndDay] = useState<string>('');
  const [editSecond, setEditSecond] = useState<string>('');
  const [editRangeEndTimeQual, setEditRangeEndTimeQual] = useState<string>('EXACT');
  const [editRangeEndHour, setEditRangeEndHour] = useState<string>('');
  const [editRangeEndMinute, setEditRangeEndMinute] = useState<string>('');
  const [editRangeEndSecond, setEditRangeEndSecond] = useState<string>('');
  const [editCollectionId, setEditCollectionId] = useState<string>('');
  const [editOriginalCollectionId, setEditOriginalCollectionId] = useState<string>('');
  const [editPersonLinks, setEditPersonLinks] = useState<
    (SaveMediaPersonLinkRequestDto & { displayLabel: string })[]
  >([]);
  const [editLinkRoleType, setEditLinkRoleType] = useState<
    'DEPICTED' | 'RELATED' | 'AUTHOR'
  >('DEPICTED');
  const [editLinkPersonQuery, setEditLinkPersonQuery] = useState<string>('');
  const [editLinkPersonResults, setEditLinkPersonResults] = useState<PersonListItemDto[]>([]);
  const [editLinkTextInput, setEditLinkTextInput] = useState<string>('');
  const [editLinkTextSex, setEditLinkTextSex] = useState<PersonSex>('UNKNOWN');

  // Fullscreen Lightbox state
  const [activeLightboxList, setActiveLightboxList] = useState<MediaItemDto[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);
  const [collectionToDelete, setCollectionToDelete] = useState<{ id: number; title: string } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MediaItemDto | null>(null);

  const resetDrillDown = () => {
    setSelectedDecade(null);
    setSelectedYear(null);
    setSelectedYearBucketKey(null);
    setSelectedPersonKey(null);
    setSelectedPersonCategory(null);
    setSelectedCemeteryName(null);
    setSelectedGraveId(null);
    setSelectedCollectionId(null);
    setSelectedCollectionSubfolder(null);
  };

  const fetchGallery = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await mediaApi.getGalleryPage({
        search,
        mediaType,
        primaryContext: 'ALL',
        personIds: selectedPersons.map(p => p.id),
        matchAllPersons,
        sortBy: viewMode === 'ALL' ? sortBy : 'YEAR_ASC',
        page: viewMode === 'ALL' ? page : 0,
        size: viewMode === 'ALL' ? 48 : 2000,
      });
      setPageData(data);
    } catch {
      setErrorMessage('Nie udało się pobrać zawartości galerii.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchGallery();
  }, [search, mediaType, viewMode, selectedPersons, matchAllPersons, sortBy, page]);

  const allItems = pageData?.content ?? [];
  const allCollections = pageData?.collections ?? [];

  // ============================================================================
  // VIEW 1: WSZYSTKIE (Always-open ribbons grouped by Year, Month, Day of upload)
  // ============================================================================
  const uploadDateRibbons = useMemo<UploadDateRibbonBucket[]>(() => {
    if (viewMode !== 'ALL') return [];
    const map = new Map<string, UploadDateRibbonBucket>();
    for (const item of allItems) {
      const dayKey = item.createdAt ? item.createdAt.slice(0, 10) : 'UNKNOWN';
      const title = item.createdAt
        ? `📅 Dodano: ${formatPolishUploadDay(item.createdAt)}`
        : '📅 Data dodania nieznana';
      const existing = map.get(dayKey);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(dayKey, { key: dayKey, title, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [allItems, viewMode]);

  // ============================================================================
  // VIEW 2: DATA WYKONANIA (Decades + Undated Events -> Years -> Events / Dated Collections / Inne)
  // ============================================================================
  const getEffectiveTimelineYear = (item: MediaItemDto): number | null => {
    if (item.eventStartYears && item.eventStartYears.length > 0 && item.eventStartYears[0] > 0) {
      return item.eventStartYears[0];
    }
    if (item.datedCollectionItem && item.collectionStartYear) {
      return item.collectionStartYear;
    }
    return item.year ?? null;
  };

  const timelineViewContent = useMemo<{
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }>(() => {
    if (viewMode !== 'TIMELINE') {
      return { tiles: [], mediaItems: [], breadcrumb: [] };
    }

    const datedItems: { item: MediaItemDto; effYear: number }[] = [];
    const undatedEventItems: MediaItemDto[] = [];

    for (const item of allItems) {
      const effY = getEffectiveTimelineYear(item);
      if (effY !== null) {
        datedItems.push({ item, effYear: effY });
      } else if (item.eventIds && item.eventIds.length > 0) {
        undatedEventItems.push(item);
      }
    }

    if (selectedDecade === null) {
      const decMap = new Map<number, MediaItemDto[]>();
      for (const { item, effYear } of datedItems) {
        const dec = Math.floor(effYear / 10) * 10;
        const list = decMap.get(dec) ?? [];
        list.push(item);
        decMap.set(dec, list);
      }

      const tiles: FolderTileItem[] = Array.from(decMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([dec, list]) => ({
          key: `DEC_${String(dec)}`,
          title: `Lata ${String(dec)}–${String(dec + 9)}`,
          subtitle: 'Kliknij, aby wybrać rok',
          count: list.length,
          previewItems: getTopPreviewItems(list),
          previewMediaId: getFirstMediaId(list),
          onClick: () => {
            setSelectedDecade(dec);
          },
        }));

      if (undatedEventItems.length > 0) {
        tiles.push({
          key: 'DEC_UNDATED_EVENTS',
          title: 'Wydarzenia bez daty',
          subtitle: 'Wydarzenia bez ustalonego roku',
          count: undatedEventItems.length,
          previewItems: getTopPreviewItems(undatedEventItems),
          previewMediaId: getFirstMediaId(undatedEventItems),
          onClick: () => {
            setSelectedDecade('UNDATED_EVENTS');
          },
        });
      }

      return { tiles, mediaItems: [], breadcrumb: ['Data wykonania'] };
    }

    if (selectedDecade === 'UNDATED_EVENTS') {
      const evtMap = new Map<number, { label: string; list: MediaItemDto[] }>();
      for (const item of undatedEventItems) {
        const eId = item.eventIds?.[0];
        const eLbl = item.eventLabels?.[0] ?? 'Wydarzenie bez daty';
        if (eId !== undefined) {
          const existing = evtMap.get(eId);
          if (existing) {
            existing.list.push(item);
          } else {
            evtMap.set(eId, { label: eLbl, list: [item] });
          }
        }
      }

      if (selectedYearBucketKey === null) {
        const tiles: FolderTileItem[] = Array.from(evtMap.entries()).map(([eId, data]) => ({
          key: `UEVT_${String(eId)}`,
          title: data.label,
          subtitle: 'Wydarzenie bez daty',
          count: data.list.length,
          previewItems: getTopPreviewItems(data.list),
          previewMediaId: getFirstMediaId(data.list),
          onClick: () => {
            setSelectedYearBucketKey(`UEVT_${String(eId)}`);
          },
        }));
        return {
          tiles,
          mediaItems: [],
          breadcrumb: ['Data wykonania', 'Wydarzenia bez daty'],
        };
      }

      const chosenEvtId = Number(selectedYearBucketKey.replace('UEVT_', ''));
      const chosenData = evtMap.get(chosenEvtId);
      return {
        tiles: [],
        mediaItems: chosenData?.list ?? [],
        breadcrumb: [
          'Data wykonania',
          'Wydarzenia bez daty',
          chosenData?.label ?? 'Wydarzenie',
        ],
      };
    }

    const inDecade = datedItems.filter(
      d => Math.floor(d.effYear / 10) * 10 === selectedDecade
    );

    if (selectedYear === null) {
      const yrMap = new Map<number, MediaItemDto[]>();
      for (const { item, effYear } of inDecade) {
        const list = yrMap.get(effYear) ?? [];
        list.push(item);
        yrMap.set(effYear, list);
      }

      const tiles: FolderTileItem[] = Array.from(yrMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([yr, list]) => ({
          key: `YR_${String(yr)}`,
          title: `Rok ${String(yr)}`,
          subtitle: 'Wydarzenia, kolekcje datowane i inne',
          count: list.length,
          previewItems: getTopPreviewItems(list),
          previewMediaId: getFirstMediaId(list),
          onClick: () => {
            setSelectedYear(yr);
          },
        }));

      return {
        tiles,
        mediaItems: [],
        breadcrumb: [
          'Data wykonania',
          `Lata ${String(selectedDecade)}–${String(selectedDecade + 9)}`,
        ],
      };
    }

    const inYear = inDecade
      .filter(d => d.effYear === selectedYear)
      .map(d => d.item);

    const buckets = new Map<string, { title: string; subtitle: string; list: MediaItemDto[] }>();
    const miscItems: MediaItemDto[] = [];

    for (const item of inYear) {
      if (item.eventIds && item.eventIds.length > 0) {
        const eId = item.eventIds[0];
        const eLbl = item.eventLabels?.[0] ?? 'Wydarzenie';
        const bKey = `EVT_${String(eId)}`;
        const ex = buckets.get(bKey);
        if (ex) {
          ex.list.push(item);
        } else {
          buckets.set(bKey, {
            title: eLbl,
            subtitle: '📅 Wydarzenie rodzinne',
            list: [item],
          });
        }
      } else if (item.datedCollectionItem && item.collectionId && item.collectionName) {
        const bKey = `DCOL_${String(item.collectionId)}`;
        const ex = buckets.get(bKey);
        if (ex) {
          ex.list.push(item);
        } else {
          buckets.set(bKey, {
            title: item.collectionName,
            subtitle: '📂 Album datowany',
            list: [item],
          });
        }
      } else {
        miscItems.push(item);
      }
    }

    if (miscItems.length > 0) {
      buckets.set('MISC_OTHER', {
        title: 'Inne',
        subtitle: `Pozostałe zdjęcia i filmy z roku ${String(selectedYear)}`,
        list: miscItems,
      });
    }

    if (selectedYearBucketKey === null) {
      const tiles: FolderTileItem[] = Array.from(buckets.entries()).map(
        ([bKey, data]) => ({
          key: bKey,
          title: data.title,
          subtitle: data.subtitle,
          count: data.list.length,
          previewItems: getTopPreviewItems(data.list),
          previewMediaId: getFirstMediaId(data.list),
          onClick: () => {
            setSelectedYearBucketKey(bKey);
          },
        })
      );

      return {
        tiles,
        mediaItems: [],
        breadcrumb: [
          'Data wykonania',
          `Lata ${String(selectedDecade)}–${String(selectedDecade + 9)}`,
          `Rok ${String(selectedYear)}`,
        ],
      };
    }

    const chosenBucket = buckets.get(selectedYearBucketKey);
    return {
      tiles: [],
      mediaItems: chosenBucket?.list ?? [],
      breadcrumb: [
        'Data wykonania',
        `Lata ${String(selectedDecade)}–${String(selectedDecade + 9)}`,
        `Rok ${String(selectedYear)}`,
        chosenBucket?.title ?? 'Wybrana grupa',
      ],
    };
  }, [allItems, viewMode, selectedDecade, selectedYear, selectedYearBucketKey]);

  // ============================================================================
  // VIEW 3: OSOBY (Person Tiles [DB & Text] -> 4 Category Tiles -> Media)
  // ============================================================================
  const personViewContent = useMemo<{
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }>(() => {
    if (viewMode !== 'PERSON') {
      return { tiles: [], mediaItems: [], breadcrumb: [] };
    }

    interface PersonBucket {
      key: string;
      displayName: string;
      isTextPerson: boolean;
      singlePortraits: MediaItemDto[];
      groupPortraits: MediaItemDto[];
      relatedMedia: MediaItemDto[];
      otherDepictedMedia: MediaItemDto[];
      allPersonMedia: MediaItemDto[];
    }

    const personMap = new Map<string, PersonBucket>();

    const ensureBucket = (key: string, displayName: string, isText: boolean): PersonBucket => {
      const existing = personMap.get(key);
      if (existing) return existing;
      const created: PersonBucket = {
        key,
        displayName,
        isTextPerson: isText,
        singlePortraits: [],
        groupPortraits: [],
        relatedMedia: [],
        otherDepictedMedia: [],
        allPersonMedia: [],
      };
      personMap.set(key, created);
      return created;
    };

    for (const item of allItems) {
      const depicted = item.depictedPersons ?? [];
      const related = item.relatedPersons ?? [];
      const isPortraitItem =
        item.portrait === true || item.primaryContext === 'PERSON';

      for (const d of depicted) {
        const isText = d.personId === null;
        const pKey = isText ? `TXT_${d.displayName}` : `DB_${String(d.personId)}`;
        const bucket = ensureBucket(pKey, d.displayName, isText);
        if (!bucket.allPersonMedia.some(m => m.id === item.id)) {
          bucket.allPersonMedia.push(item);
        }
        if (isPortraitItem) {
          if (depicted.length <= 1) {
            bucket.singlePortraits.push(item);
          } else {
            bucket.groupPortraits.push(item);
          }
        } else {
          bucket.otherDepictedMedia.push(item);
        }
      }

      for (const r of related) {
        const isText = r.personId === null;
        const pKey = isText ? `TXT_${r.displayName}` : `DB_${String(r.personId)}`;
        const bucket = ensureBucket(pKey, r.displayName, isText);
        if (!bucket.allPersonMedia.some(m => m.id === item.id)) {
          bucket.allPersonMedia.push(item);
        }
        bucket.relatedMedia.push(item);
      }
    }

    if (selectedPersonKey === null) {
      const tiles: FolderTileItem[] = Array.from(personMap.values())
        .sort((a, b) => {
          if (a.isTextPerson !== b.isTextPerson) {
            return a.isTextPerson ? 1 : -1;
          }
          return a.displayName.localeCompare(b.displayName, 'pl');
        })
        .map(b => ({
          key: b.key,
          title: b.displayName,
          subtitle: b.isTextPerson
            ? '🏷️ Osoba spoza drzewa (wpis tekstowy)'
            : '👤 Osoba z drzewa genealogicznego',
          count: b.allPersonMedia.length,
          previewItems: getTopPreviewItems(
            b.singlePortraits.length > 0 ? b.singlePortraits : b.allPersonMedia
          ),
          previewMediaId:
            getFirstMediaId(b.singlePortraits) ?? getFirstMediaId(b.allPersonMedia),
          isTextPerson: b.isTextPerson,
          onClick: () => {
            setSelectedPersonKey(b.key);
          },
        }));

      return { tiles, mediaItems: [], breadcrumb: ['Osoby'] };
    }

    const chosenPerson = personMap.get(selectedPersonKey);
    if (!chosenPerson) {
      return { tiles: [], mediaItems: [], breadcrumb: ['Osoby'] };
    }

    if (selectedPersonCategory === null) {
      const catDefs: {
        catKey: string;
        title: string;
        subtitle: string;
        list: MediaItemDto[];
      }[] = [
        {
          catKey: 'SINGLE_PORTRAIT',
          title: 'Portrety jednoosobowe',
          subtitle: 'Zdjęcia portretowe tylko tej osoby',
          list: chosenPerson.singlePortraits,
        },
        {
          catKey: 'GROUP_PORTRAIT',
          title: 'Portrety grupowe',
          subtitle: 'Portrety z innymi osobami',
          list: chosenPerson.groupPortraits,
        },
        {
          catKey: 'RELATED',
          title: 'Zdjęcia powiązane z tą osobą',
          subtitle: 'Media związane z osobą',
          list: chosenPerson.relatedMedia,
        },
        {
          catKey: 'OTHER',
          title: 'Inne (np. z wydarzeń i wyjazdów)',
          subtitle: 'Zdjęcia i filmy, na których występuje osoba',
          list: chosenPerson.otherDepictedMedia,
        },
      ];

      const tiles: FolderTileItem[] = catDefs
        .filter(c => c.list.length > 0)
        .map(c => ({
          key: c.catKey,
          title: c.title,
          subtitle: c.subtitle,
          count: c.list.length,
          previewItems: getTopPreviewItems(c.list),
          previewMediaId: getFirstMediaId(c.list),
          onClick: () => {
            setSelectedPersonCategory(c.catKey);
          },
        }));

      return {
        tiles,
        mediaItems: [],
        breadcrumb: ['Osoby', chosenPerson.displayName],
      };
    }

    const catMap: Record<string, { label: string; list: MediaItemDto[] } | undefined> = {
      SINGLE_PORTRAIT: {
        label: 'Portrety jednoosobowe',
        list: chosenPerson.singlePortraits,
      },
      GROUP_PORTRAIT: {
        label: 'Portrety grupowe',
        list: chosenPerson.groupPortraits,
      },
      RELATED: {
        label: 'Zdjęcia powiązane z tą osobą',
        list: chosenPerson.relatedMedia,
      },
      OTHER: {
        label: 'Inne',
        list: chosenPerson.otherDepictedMedia,
      },
    };
    const chosenCat = catMap[selectedPersonCategory];

    return {
      tiles: [],
      mediaItems: chosenCat?.list ?? [],
      breadcrumb: [
        'Osoby',
        chosenPerson.displayName,
        chosenCat?.label ?? 'Wybrana kategoria',
      ],
    };
  }, [allItems, viewMode, selectedPersonKey, selectedPersonCategory]);

  // ============================================================================
  // VIEW 4: NAGROBKI (Cemeteries [with Inne] -> Graves -> Media)
  // ============================================================================
  const graveViewContent = useMemo<{
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }>(() => {
    if (viewMode !== 'GRAVE') {
      return { tiles: [], mediaItems: [], breadcrumb: [] };
    }

    const graveItems = allItems.filter(
      item => item.graveIds.length > 0 || item.primaryContext === 'GRAVE'
    );

    const cemMap = new Map<
      string,
      Map<number, { graveLabel: string; list: MediaItemDto[] }>
    >();

    for (const item of graveItems) {
      const gIds = item.graveIds;
      const gLabels = item.graveLabels ?? [];
      const cNames = item.cemeteryNames ?? [];

      for (let i = 0; i < gIds.length; i++) {
        const gId = gIds[i];
        const cemName =
          i < cNames.length ? cNames[i] : cNames.length > 0 ? cNames[0] : 'Inne';
        const gLabel = i < gLabels.length ? gLabels[i] : 'Grób rodzinny';

        const gravesInCem =
          cemMap.get(cemName) ??
          new Map<number, { graveLabel: string; list: MediaItemDto[] }>();
        const existingGrave = gravesInCem.get(gId);
        if (existingGrave) {
          existingGrave.list.push(item);
        } else {
          gravesInCem.set(gId, { graveLabel: gLabel, list: [item] });
        }
        cemMap.set(cemName, gravesInCem);
      }
    }

    if (selectedCemeteryName === null) {
      const tiles: FolderTileItem[] = Array.from(cemMap.entries()).map(
        ([cemName, gravesMap]) => {
          const allInCem = Array.from(gravesMap.values()).flatMap(g => g.list);
          return {
            key: `CEM_${cemName}`,
            title: `🪦 ${cemName}`,
            subtitle: `Nagrobki ze zdjęciami: ${String(gravesMap.size)}`,
            count: allInCem.length,
            previewItems: getTopPreviewItems(allInCem),
            previewMediaId: getFirstMediaId(allInCem),
            onClick: () => {
              setSelectedCemeteryName(cemName);
            },
          };
        }
      );
      return { tiles, mediaItems: [], breadcrumb: ['Nagrobki'] };
    }

    const gravesInChosenCem = cemMap.get(selectedCemeteryName);
    if (!gravesInChosenCem) {
      return { tiles: [], mediaItems: [], breadcrumb: ['Nagrobki'] };
    }

    if (selectedGraveId === null) {
      const tiles: FolderTileItem[] = Array.from(gravesInChosenCem.entries()).map(
        ([gId, gData]) => ({
          key: `GRV_${String(gId)}`,
          title: gData.graveLabel,
          subtitle: selectedCemeteryName,
          count: gData.list.length,
          previewItems: getTopPreviewItems(gData.list),
          previewMediaId: getFirstMediaId(gData.list),
          onClick: () => {
            setSelectedGraveId(gId);
          },
        })
      );
      return {
        tiles,
        mediaItems: [],
        breadcrumb: ['Nagrobki', selectedCemeteryName],
      };
    }

    const chosenGrave = gravesInChosenCem.get(selectedGraveId);
    return {
      tiles: [],
      mediaItems: chosenGrave?.list ?? [],
      breadcrumb: [
        'Nagrobki',
        selectedCemeteryName,
        chosenGrave?.graveLabel ?? 'Nagrobek',
      ],
    };
  }, [allItems, viewMode, selectedCemeteryName, selectedGraveId]);

  // ============================================================================
  // VIEW 5: KOLEKCJE (Root Collections -> Sub-collections & Thematic Subfolders -> Media)
  // ============================================================================
  const collectionViewContent = useMemo<{
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }>(() => {
    if (viewMode !== 'COLLECTION') {
      return { tiles: [], mediaItems: [], breadcrumb: [] };
    }

    const archivalCollections = allCollections.filter(c => !c.datedCollection);

    const countTotalInCollectionTree = (colId: number): MediaItemDto[] => {
      const direct = allItems.filter(i => i.collectionId === colId);
      const children = archivalCollections.filter(c => c.parentCollectionId === colId);
      const childMedia = children.flatMap(ch => countTotalInCollectionTree(ch.id));
      return [...direct, ...childMedia];
    };

    if (selectedCollectionId === null) {
      const rootCols = archivalCollections.filter(c => !c.parentCollectionId);
      const tiles: FolderTileItem[] = rootCols.map(col => {
        const treeMedia = countTotalInCollectionTree(col.id);
        return {
          key: `COL_${String(col.id)}`,
          title: `📦 ${col.name}`,
          subtitle: col.description ?? `Folder: ${col.slug}`,
          count: treeMedia.length,
          previewItems: getTopPreviewItems(treeMedia),
          previewMediaId: col.previewMediaId ?? getFirstMediaId(treeMedia),
          collectionId: col.id,
          onClick: () => {
            setSelectedCollectionId(col.id);
          },
        };
      });
      return { tiles, mediaItems: [], breadcrumb: ['Kolekcje'] };
    }

    const currentCol = archivalCollections.find(c => c.id === selectedCollectionId);
    const childCols = archivalCollections.filter(
      c => c.parentCollectionId === selectedCollectionId
    );
    const directColMedia = allItems.filter(
      i => i.collectionId === selectedCollectionId
    );

    const singlePortraits = directColMedia.filter(
      i =>
        (i.portrait === true || i.primaryContext === 'PERSON') &&
        (i.depictedPersons?.length ?? 0) <= 1
    );
    const groupPortraits = directColMedia.filter(
      i =>
        (i.portrait === true || i.primaryContext === 'PERSON') &&
        (i.depictedPersons?.length ?? 0) > 1
    );
    const unknownMedia = directColMedia.filter(i => i.unknownMedia === true);
    const looseMedia = directColMedia.filter(
      i =>
        !i.portrait &&
        i.primaryContext !== 'PERSON' &&
        !i.unknownMedia
    );

    if (selectedCollectionSubfolder === null) {
      const subTiles: FolderTileItem[] = [];

      for (const ch of childCols) {
        const chMedia = countTotalInCollectionTree(ch.id);
        subTiles.push({
          key: `SUBCOL_${String(ch.id)}`,
          title: `📂 Podkolekcja: ${ch.name}`,
          subtitle: ch.description ?? `Podfolder: ${ch.slug}`,
          count: chMedia.length,
          previewItems: getTopPreviewItems(chMedia),
          previewMediaId: ch.previewMediaId ?? getFirstMediaId(chMedia),
          collectionId: ch.id,
          onClick: () => {
            setSelectedCollectionId(ch.id);
          },
        });
      }

      if (singlePortraits.length > 0) {
        subTiles.push({
          key: 'SUB_SINGLE_PORTRAITS',
          title: '👤 Portrety jednoosobowe',
          subtitle: 'Podfolder: portraits/single',
          count: singlePortraits.length,
          previewItems: getTopPreviewItems(singlePortraits),
          previewMediaId: getFirstMediaId(singlePortraits),
          onClick: () => {
            setSelectedCollectionSubfolder('SINGLE_PORTRAIT');
          },
        });
      }

      if (groupPortraits.length > 0) {
        subTiles.push({
          key: 'SUB_GROUP_PORTRAITS',
          title: '👥 Portrety grupowe',
          subtitle: 'Podfolder: portraits/group',
          count: groupPortraits.length,
          previewItems: getTopPreviewItems(groupPortraits),
          previewMediaId: getFirstMediaId(groupPortraits),
          onClick: () => {
            setSelectedCollectionSubfolder('GROUP_PORTRAIT');
          },
        });
      }

      if (unknownMedia.length > 0) {
        subTiles.push({
          key: 'SUB_UNKNOWN',
          title: '❓ Nieznane (do identyfikacji)',
          subtitle: 'Podfolder: unknown',
          count: unknownMedia.length,
          previewItems: getTopPreviewItems(unknownMedia),
          previewMediaId: getFirstMediaId(unknownMedia),
          onClick: () => {
            setSelectedCollectionSubfolder('UNKNOWN');
          },
        });
      }

      return {
        tiles: subTiles,
        mediaItems: looseMedia,
        breadcrumb: ['Kolekcje', currentCol?.name ?? 'Kolekcja'],
      };
    }

    const subMap: Record<string, { label: string; list: MediaItemDto[] } | undefined> = {
      SINGLE_PORTRAIT: {
        label: 'Portrety jednoosobowe',
        list: singlePortraits,
      },
      GROUP_PORTRAIT: {
        label: 'Portrety grupowe',
        list: groupPortraits,
      },
      UNKNOWN: {
        label: 'Nieznane',
        list: unknownMedia,
      },
    };
    const chosenSub = subMap[selectedCollectionSubfolder];

    return {
      tiles: [],
      mediaItems: chosenSub?.list ?? [],
      breadcrumb: [
        'Kolekcje',
        currentCol?.name ?? 'Kolekcja',
        chosenSub?.label ?? 'Podfolder',
      ],
    };
  }, [
    allItems,
    allCollections,
    viewMode,
    selectedCollectionId,
    selectedCollectionSubfolder,
  ]);

  const handleStepBackDrillDown = () => {
    if (viewMode === 'TIMELINE') {
      if (selectedYearBucketKey !== null) {
        setSelectedYearBucketKey(null);
      } else if (selectedYear !== null) {
        setSelectedYear(null);
      } else {
        setSelectedDecade(null);
      }
    } else if (viewMode === 'PERSON') {
      if (selectedPersonCategory !== null) {
        setSelectedPersonCategory(null);
      } else {
        setSelectedPersonKey(null);
      }
    } else if (viewMode === 'GRAVE') {
      if (selectedGraveId !== null) {
        setSelectedGraveId(null);
      } else {
        setSelectedCemeteryName(null);
      }
    } else if (viewMode === 'COLLECTION') {
      if (selectedCollectionSubfolder !== null) {
        setSelectedCollectionSubfolder(null);
      } else if (selectedCollectionId !== null) {
        const currentCol: MediaCollectionDto | undefined = allCollections.find(
          c => c.id === selectedCollectionId
        );
        setSelectedCollectionId(currentCol?.parentCollectionId ?? null);
      }
    }
  };

  const handleSearchPersonFilter = async () => {
    try {
      const res = await biographyApi.listPeople({
        search: personQuery,
        includeArchived: true,
        page: 0,
        size: 8,
      });
      setPersonResults(res.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleAddPersonToFilter = (p: PersonListItemDto) => {
    const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    if (!selectedPersons.some(sp => sp.id === p.id)) {
      setSelectedPersons(prev => [...prev, { id: p.id, name: fullName }]);
      setPage(0);
    }
    setPersonResults([]);
    setPersonQuery('');
  };

  const handleStartEditCollection = (col: MediaCollectionDto) => {
    setEditingCollectionId(col.id);
    setColName(col.name);
    setColSlug(col.slug);
    setColDesc(col.description ?? '');
    setColParentId(col.parentCollectionId ? String(col.parentCollectionId) : '');
    setColIsDated(Boolean(col.datedCollection));
    setColIsRange(Boolean(col.isRange));
    setColStartQual(col.startQualifier ?? 'EXACT');
    setColStartYear(col.startYear ? String(col.startYear) : '');
    setColStartMonth(col.startMonth ? String(col.startMonth) : '');
    setColStartDay(col.startDay ? String(col.startDay) : '');
    setColStartTimeQual(col.startTimeQualifier ?? 'EXACT');
    setColStartHour(col.startHour !== null && col.startHour !== undefined ? String(col.startHour) : '');
    setColStartMinute(col.startMinute !== null && col.startMinute !== undefined ? String(col.startMinute) : '');
    setColStartSecond(col.startSecond !== null && col.startSecond !== undefined ? String(col.startSecond) : '');
    setColEndQual(col.endQualifier ?? 'EXACT');
    setColEndYear(col.endYear ? String(col.endYear) : '');
    setColEndMonth(col.endMonth ? String(col.endMonth) : '');
    setColEndDay(col.endDay ? String(col.endDay) : '');
    setColEndTimeQual(col.endTimeQualifier ?? 'EXACT');
    setColEndHour(col.endHour !== null && col.endHour !== undefined ? String(col.endHour) : '');
    setColEndMinute(col.endMinute !== null && col.endMinute !== undefined ? String(col.endMinute) : '');
    setColEndSecond(col.endSecond !== null && col.endSecond !== undefined ? String(col.endSecond) : '');
    setShowCreateCollection(true);
  };

  const handleSaveCollection = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const payload = {
        name: colName.trim(),
        customSlug: colSlug.trim() || null,
        description: colDesc.trim() || null,
        parentCollectionId: colIsDated ? null : (colParentId !== '' ? Number(colParentId) : null),
        datedCollection: colIsDated,
        isRange: colIsDated ? colIsRange : false,
        startQualifier: colIsDated ? colStartQual : null,
        startYear: colIsDated && colStartYear.trim() !== '' ? Number(colStartYear) : null,
        startMonth: colIsDated && colStartMonth.trim() !== '' ? Number(colStartMonth) : null,
        startDay: colIsDated && colStartDay.trim() !== '' ? Number(colStartDay) : null,
        startTimeQualifier: colIsDated ? colStartTimeQual : null,
        startHour: colIsDated && colStartHour.trim() !== '' ? Number(colStartHour) : null,
        startMinute: colIsDated && colStartMinute.trim() !== '' ? Number(colStartMinute) : null,
        startSecond: colIsDated && colStartSecond.trim() !== '' ? Number(colStartSecond) : null,
        endQualifier: colIsDated && colIsRange ? colEndQual : null,
        endYear: colIsDated && colIsRange && colEndYear.trim() !== '' ? Number(colEndYear) : null,
        endMonth: colIsDated && colIsRange && colEndMonth.trim() !== '' ? Number(colEndMonth) : null,
        endDay: colIsDated && colIsRange && colEndDay.trim() !== '' ? Number(colEndDay) : null,
        endTimeQualifier: colIsDated && colIsRange ? colEndTimeQual : null,
        endHour: colIsDated && colIsRange && colEndHour.trim() !== '' ? Number(colEndHour) : null,
        endMinute: colIsDated && colIsRange && colEndMinute.trim() !== '' ? Number(colEndMinute) : null,
        endSecond: colIsDated && colIsRange && colEndSecond.trim() !== '' ? Number(colEndSecond) : null,
      };

      if (editingCollectionId !== null) {
        await mediaApi.updateCollection(editingCollectionId, payload);
      } else {
        await mediaApi.createCollection(payload);
      }

      setEditingCollectionId(null);
      setColName('');
      setColSlug('');
      setColDesc('');
      setColParentId('');
      setColIsDated(false);
      setColIsRange(false);
      setColStartYear('');
      setColStartMonth('');
      setColStartDay('');
      setColStartHour('');
      setColStartMinute('');
      setColStartSecond('');
      setColEndYear('');
      setColEndMonth('');
      setColEndDay('');
      setColEndHour('');
      setColEndMinute('');
      setColEndSecond('');
      setShowCreateCollection(false);
      await fetchGallery();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się zapisać kolekcji.');
      }
    }
  };

  const handleConfirmDeleteCollection = async () => {
    if (!collectionToDelete) return;
    try {
      await mediaApi.deleteCollection(collectionToDelete.id);
      if (selectedCollectionId === collectionToDelete.id) {
        setSelectedCollectionId(null);
        setSelectedCollectionSubfolder(null);
      }
      setCollectionToDelete(null);
      await fetchGallery();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się usunąć kolekcji.');
      }
    }
  };

  const handleConfirmDeleteMediaItem = async () => {
    if (!itemToDelete) return;
    try {
      await mediaApi.deleteMedia(itemToDelete.id);
      setItemToDelete(null);
      setActiveIndex(null);
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się usunąć pliku.');
    }
  };

  const handleStartEditMedia = (item: MediaItemDto) => {
    setEditMediaId(item.id);
    setEditTitle(item.title ?? '');
    setEditDescription(item.description ?? '');
    setEditInscription(item.inscriptionText ?? '');
    setEditSourceText(item.sourceText ?? '');
    setEditIsRange(Boolean(item.betweenRange));
    setEditDateQual(item.dateQualifier ?? 'EXACT');
    setEditYear(item.year ? String(item.year) : '');
    setEditMonth(item.month ? String(item.month) : '');
    setEditDay(item.day ? String(item.day) : '');
    setEditTimeQual(item.timeQualifier ?? 'EXACT');
    setEditHour(item.hour !== null && item.hour !== undefined ? String(item.hour) : '');
    setEditMinute(item.minute !== null && item.minute !== undefined ? String(item.minute) : '');
    setEditSecond(item.second !== null && item.second !== undefined ? String(item.second) : '');
    setEditRangeEndQual(item.rangeEndQualifier ?? 'EXACT');
    setEditRangeEndYear(item.rangeEndYear ? String(item.rangeEndYear) : '');
    setEditRangeEndMonth(item.rangeEndMonth ? String(item.rangeEndMonth) : '');
    setEditRangeEndDay(item.rangeEndDay ? String(item.rangeEndDay) : '');
    setEditRangeEndTimeQual(item.rangeEndTimeQualifier ?? 'EXACT');
    setEditRangeEndHour(item.rangeEndHour !== null && item.rangeEndHour !== undefined ? String(item.rangeEndHour) : '');
    setEditRangeEndMinute(item.rangeEndMinute !== null && item.rangeEndMinute !== undefined ? String(item.rangeEndMinute) : '');
    setEditRangeEndSecond(item.rangeEndSecond !== null && item.rangeEndSecond !== undefined ? String(item.rangeEndSecond) : '');
    const colStr = item.collectionId !== null && item.collectionId !== undefined ? String(item.collectionId) : '';
    setEditCollectionId(colStr);
    setEditOriginalCollectionId(colStr);

    const initialLinks: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[] = [];
    if (item.depictedPersons) {
      for (const dp of item.depictedPersons) {
        initialLinks.push({
          personId: dp.personId ?? undefined,
          personText: dp.personText ?? undefined,
          personSex: dp.sex ?? undefined,
          linkType: 'DEPICTED',
          displayLabel: `👁️ Na zdjęciu/filmie: ${dp.displayName}`,
        });
      }
    }
    if (item.relatedPersons) {
      for (const rp of item.relatedPersons) {
        initialLinks.push({
          personId: rp.personId ?? undefined,
          personText: rp.personText ?? undefined,
          personSex: rp.sex ?? undefined,
          linkType: 'RELATED',
          displayLabel: `🔗 Powiązana: ${rp.displayName}`,
        });
      }
    }
    if (item.authors) {
      for (const ap of item.authors) {
        initialLinks.push({
          personId: ap.personId ?? undefined,
          personText: ap.personText ?? undefined,
          personSex: ap.sex ?? undefined,
          linkType: 'AUTHOR',
          displayLabel: `📷 Autor: ${ap.displayName}`,
        });
      }
    }
    setEditPersonLinks(initialLinks);
    setIsEditingMediaItem(true);
  };

  const handleSearchPersonForEdit = async () => {
    if (editLinkPersonQuery.trim() === '') return;
    try {
      const res = await biographyApi.listPeople({
        search: editLinkPersonQuery.trim(),
        page: 0,
        size: 8,
      });
      setEditLinkPersonResults(res.content);
    } catch {
      setEditLinkPersonResults([]);
    }
  };

  const handleAddDbPersonToEdit = (p: PersonListItemDto) => {
    const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    setEditPersonLinks(prev => [
      ...prev,
      {
        personId: p.id,
        linkType: editLinkRoleType,
        displayLabel: `${PERSON_LINK_TYPE_LABELS[editLinkRoleType]}: ${fullName}`,
      },
    ]);
    setEditLinkPersonResults([]);
    setEditLinkPersonQuery('');
  };

  const handleAddTextPersonToEdit = () => {
    const txt = editLinkTextInput.trim();
    if (txt === '') return;
    setEditPersonLinks(prev => [
      ...prev,
      {
        personText: txt,
        personSex: editLinkTextSex,
        linkType: editLinkRoleType,
        displayLabel: `${PERSON_LINK_TYPE_LABELS[editLinkRoleType]}: ${txt} [spoza bazy]`,
      },
    ]);
    setEditLinkTextInput('');
  };

  const handleSaveMediaEdit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editMediaId === null) return;
    if (editYear.trim() === '' && editCollectionId.trim() === '') {
      setErrorMessage(
        'Dla plików bez daty wybierz album/kolekcję docelową przed zapisaniem (nie mogą pozostać luźno).'
      );
      return;
    }
    try {
      const payload: UpdateMediaItemRequestDto = {
        title: editTitle.trim() || null,
        description: editDescription.trim() || null,
        inscriptionText: editInscription.trim() || null,
        sourceText: editSourceText.trim() || null,
        collectionId: editCollectionId.trim() !== '' ? Number(editCollectionId) : null,
        isBetweenRange: editIsRange,
        dateQualifier: editDateQual,
        year: editYear.trim() !== '' ? Number(editYear) : null,
        month: editMonth.trim() !== '' ? Number(editMonth) : null,
        day: editDay.trim() !== '' ? Number(editDay) : null,
        timeQualifier: editTimeQual,
        hour: editHour.trim() !== '' ? Number(editHour) : null,
        minute: editMinute.trim() !== '' ? Number(editMinute) : null,
        second: editSecond.trim() !== '' ? Number(editSecond) : null,
        rangeEndQualifier: editIsRange ? editRangeEndQual : null,
        rangeEndYear: editIsRange && editRangeEndYear.trim() !== '' ? Number(editRangeEndYear) : null,
        rangeEndMonth: editIsRange && editRangeEndMonth.trim() !== '' ? Number(editRangeEndMonth) : null,
        rangeEndDay: editIsRange && editRangeEndDay.trim() !== '' ? Number(editRangeEndDay) : null,
        rangeEndTimeQualifier: editIsRange ? editRangeEndTimeQual : null,
        rangeEndHour: editIsRange && editRangeEndHour.trim() !== '' ? Number(editRangeEndHour) : null,
        rangeEndMinute: editIsRange && editRangeEndMinute.trim() !== '' ? Number(editRangeEndMinute) : null,
        rangeEndSecond: editIsRange && editRangeEndSecond.trim() !== '' ? Number(editRangeEndSecond) : null,
        personLinks: editPersonLinks.map(l => ({
          personId: l.personId,
          personText: l.personText,
          personSex: l.personSex,
          linkType: l.linkType,
        })),
      };
      await mediaApi.updateMedia(editMediaId, payload);
      setIsEditingMediaItem(false);
      setEditMediaId(null);
      await fetchGallery();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się zapisać zmian w pliku.');
      }
    }
  };

  const handleGalleryUpload = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    const colIdNum = uploadCollectionId !== '' ? Number(uploadCollectionId) : undefined;
    const yearNum = uploadYear.trim() !== '' ? Number(uploadYear) : undefined;

    if (!yearNum && colIdNum === undefined) {
      setErrorMessage(
        'Dla zdjęć, filmów i nagrań audio bez daty (lub portretów) wybierz kolekcję docelową, aby pliki nie trafiły luźno do folderu undated.'
      );
      return;
    }

    try {
      if (uploadFiles.length === 1) {
        const single = uploadFiles[0];
        await mediaApi.uploadMedia({
          file: single,
          primaryContext: uploadIsPortrait ? 'PERSON' : uploadContext,
          collectionId: colIdNum,
          portraitMedia: uploadIsPortrait,
          unknownMedia: uploadIsUnknown,
          isBetweenRange: uploadIsRange,
          dateQualifier: uploadDateQual,
          customYear: yearNum,
          customMonth: uploadMonth.trim() !== '' ? Number(uploadMonth) : undefined,
          customDay: uploadDay.trim() !== '' ? Number(uploadDay) : undefined,
          timeQualifier: uploadTimeQual,
          customHour: uploadHour.trim() !== '' ? Number(uploadHour) : undefined,
          customMinute: uploadMinute.trim() !== '' ? Number(uploadMinute) : undefined,
          rangeEndQualifier: uploadIsRange ? uploadRangeEndQual : undefined,
          rangeEndYear: uploadIsRange && uploadRangeEndYear.trim() !== '' ? Number(uploadRangeEndYear) : undefined,
          rangeEndMonth: uploadIsRange && uploadRangeEndMonth.trim() !== '' ? Number(uploadRangeEndMonth) : undefined,
          rangeEndDay: uploadIsRange && uploadRangeEndDay.trim() !== '' ? Number(uploadRangeEndDay) : undefined,
          rangeEndTimeQualifier: uploadIsRange ? uploadRangeEndTimeQual : undefined,
          rangeEndHour: uploadIsRange && uploadRangeEndHour.trim() !== '' ? Number(uploadRangeEndHour) : undefined,
          rangeEndMinute: uploadIsRange && uploadRangeEndMinute.trim() !== '' ? Number(uploadRangeEndMinute) : undefined,
          customFileName: uploadCustomName.trim() || undefined,
          title: uploadTitle.trim() || undefined,
          clientLastModifiedMs: single.lastModified || undefined,
          personIds: selectedPersons.map(p => p.id),
        });
      } else {
        const stem = uploadCustomName.trim() || 'family_media';
        await mediaApi.uploadBatchMedia({
          files: uploadFiles,
          primaryContext: uploadIsPortrait ? 'PERSON' : uploadContext,
          collectionId: colIdNum,
          portraitMedia: uploadIsPortrait,
          unknownMedia: uploadIsUnknown,
          customFileNames: uploadFiles.map((f, idx) => {
            const ext = f.name.includes('.')
              ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
              : 'jpg';
            return `${stem}_${String(idx + 1).padStart(2, '0')}.${ext}`;
          }),
          titles: uploadFiles.map(() => uploadTitle.trim()),
          customYears: uploadFiles.map(() => yearNum ?? null),
          customMonths: uploadFiles.map(() => (uploadMonth.trim() !== '' ? Number(uploadMonth) : null)),
          customDays: uploadFiles.map(() => (uploadDay.trim() !== '' ? Number(uploadDay) : null)),
          customHours: uploadFiles.map(() => (uploadHour.trim() !== '' ? Number(uploadHour) : null)),
          customMinutes: uploadFiles.map(() => (uploadMinute.trim() !== '' ? Number(uploadMinute) : null)),
          clientLastModifiedList: uploadFiles.map(f => f.lastModified || null),
          defaultYear: yearNum ?? null,
          personIds: selectedPersons.map(p => p.id),
        });
      }
      setShowUploadForm(false);
      setUploadFiles([]);
      setUploadCustomName('');
      setUploadTitle('');
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się wgrać plików do galerii.');
    }
  };

  const handleOpenItem = (item: MediaItemDto, contextList: MediaItemDto[]) => {
    setActiveLightboxList(contextList);
    const idx = contextList.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowDetailsDrawer(false);
  };

  const renderMediaTile = (item: MediaItemDto, contextList: MediaItemDto[]) => (
    <button
      key={item.id}
      type="button"
      data-testid={`gallery-item-${String(item.id)}`}
      onClick={() => {
        handleOpenItem(item, contextList);
      }}
      className={styles.mediaCard}
    >
      <div className={styles.thumbBox}>
        {item.mediaType === 'IMAGE' ? (
          <img
            src={mediaApi.getThumbnailUrl(item.id)}
            alt={item.title ?? ''}
            className={styles.thumbImg}
          />
        ) : item.mediaType === 'VIDEO' ? (
          <>
            <video
              src={`${mediaApi.getFileUrl(item.id)}#t=0.5`}
              preload="metadata"
              muted
              playsInline
              className={styles.thumbImg}
            />
            <span className={styles.videoPlayOverlay}>▶</span>
          </>
        ) : (
          <div className={styles.audioThumbBox}>
            <span className={styles.audioThumbIcon}>🎵</span>
            <span className={styles.audioThumbLabel}>Nagranie audio</span>
          </div>
        )}
        {(item.dateText ?? item.year) && (
          <span className={styles.yearBadge}>{item.dateText ?? item.year}</span>
        )}
      </div>

      {(item.title ??
        (item.personNames && item.personNames.length > 0) ??
        item.collectionName) && (
        <div className={styles.cardBody}>
          {item.title && <div className={styles.cardTitle}>{item.title}</div>}
          {item.personNames && item.personNames.length > 0 && (
            <div className={styles.cardSub}>👤 {item.personNames.join(', ')}</div>
          )}
          {item.collectionName && (
            <div className={styles.cardSub}>📦 {item.collectionName}</div>
          )}
        </div>
      )}
    </button>
  );

  const renderFolderTilesGrid = (tiles: FolderTileItem[]) => (
    <div className={styles.folderTilesGrid} data-testid="gallery-grouped-sections">
      {tiles.map(tile => {
        const previews =
          tile.previewItems && tile.previewItems.length > 0
            ? tile.previewItems
            : tile.previewMediaId !== null
            ? [{ id: tile.previewMediaId, mediaType: 'IMAGE' as MediaType }]
            : [];

        return (
          <div key={tile.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <button
              type="button"
              onClick={tile.onClick}
              className={`${styles.folderTileCard} ${
                tile.isTextPerson ? styles.folderTileTextPerson : ''
              }`}
            >
              <div className={styles.folderThumbBox}>
                {previews.length > 1 ? (
                  <div className={styles.collageThumbGrid}>
                    {previews.map(pv => (
                      <div key={pv.id} className={styles.collageThumbCell}>
                        {pv.mediaType === 'IMAGE' ? (
                          <img
                            src={mediaApi.getThumbnailUrl(pv.id)}
                            alt=""
                            className={styles.collageThumbImg}
                          />
                        ) : pv.mediaType === 'VIDEO' ? (
                          <video
                            src={`${mediaApi.getFileUrl(pv.id)}#t=0.5`}
                            preload="metadata"
                            muted
                            playsInline
                            className={styles.collageThumbImg}
                          />
                        ) : (
                          <div className={styles.audioThumbBox}>
                            <span className={styles.audioThumbIcon}>🎵</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : previews.length === 1 ? (
                  previews[0].mediaType === 'IMAGE' ? (
                    <img
                      src={mediaApi.getThumbnailUrl(previews[0].id)}
                      alt=""
                      className={styles.thumbImg}
                    />
                  ) : previews[0].mediaType === 'VIDEO' ? (
                    <video
                      src={`${mediaApi.getFileUrl(previews[0].id)}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className={styles.thumbImg}
                    />
                  ) : (
                    <div className={styles.audioThumbBox}>
                      <span className={styles.audioThumbIcon}>🎵</span>
                      <span className={styles.audioThumbLabel}>Nagranie audio</span>
                    </div>
                  )
                ) : (
                  <span style={{ fontSize: '2.2rem' }}>📁</span>
                )}
                {tile.isTextPerson && (
                  <span className={styles.textPersonBadge}>Spoza drzewa</span>
                )}
                <span className={styles.folderCountBadge}>
                  Pliki: {String(tile.count)}
                </span>
              </div>
              <div className={styles.folderTileBody}>
                <div className={styles.folderTileTitle}>{tile.title}</div>
                {tile.subtitle && (
                  <div className={styles.folderTileSub}>{tile.subtitle}</div>
                )}
              </div>
            </button>
            {isAdmin && tile.collectionId !== undefined && (
              <div className={styles.colCardActions}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    const target = allCollections.find(c => c.id === tile.collectionId);
                    if (target) handleStartEditCollection(target);
                  }}
                  className={styles.colActionBtn}
                >
                  ✏️ Edytuj kolekcję
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setCollectionToDelete({ id: tile.collectionId, title: tile.title });
                  }}
                  className={`${styles.colActionBtn} ${styles.colActionBtnDanger}`}
                >
                  🗑️ Usuń kolekcję
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderDrillDownSection = (content: {
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {content.breadcrumb.length > 1 && (
        <div className={styles.breadcrumbBar}>
          <div className={styles.breadcrumbTrail}>
            {content.breadcrumb.map((crumb, idx) => (
              <span key={`${crumb}-${String(idx)}`}>
                {idx > 0 ? ' › ' : ''}
                {crumb}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={handleStepBackDrillDown}
            className={styles.btnSecondary}
          >
            ← Wróć wyżej
          </button>
        </div>
      )}

      {content.tiles.length > 0 && renderFolderTilesGrid(content.tiles)}

      {content.mediaItems.length > 0 && (
        <div className={styles.mediaGrid}>
          {content.mediaItems.map(item =>
            renderMediaTile(item, content.mediaItems)
          )}
        </div>
      )}

      {content.tiles.length === 0 && content.mediaItems.length === 0 && (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak zdjęć i filmów w tym widoku.
          </p>
        </div>
      )}
    </div>
  );

  const activeItem =
    activeIndex !== null &&
    activeIndex >= 0 &&
    activeIndex < activeLightboxList.length
      ? activeLightboxList[activeIndex]
      : null;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Galeria zdjęć i filmów</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj fotografie oraz nagrania rodzinne według daty dodania, daty wykonania (dekad, lat, wydarzeń i kolekcji datowanych), osób, nagrobków oraz kolekcji archiwalnych.
          </p>
        </div>

        <div className={styles.headerRight}>
          {pageData && (
            <div className={styles.statsBadge}>
              Zdjęcia: <strong>{pageData.totalImagesCount}</strong> • Filmy:{' '}
              <strong>{pageData.totalVideosCount}</strong>
              {pageData.totalAudiosCount !== undefined && (
                <> • Dźwięki: <strong>{pageData.totalAudiosCount}</strong></>
              )}
            </div>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                data-testid="open-gallery-upload-button"
                onClick={() => {
                  setShowUploadForm(prev => !prev);
                }}
                className={styles.btnPrimary}
              >
                + Wgraj zdjęcia, filmy lub dźwięki
              </button>
              <button
                type="button"
                data-testid="open-create-collection-button"
                onClick={() => {
                  setEditingCollectionId(null);
                  setColName('');
                  setColSlug('');
                  setColDesc('');
                  setColParentId('');
                  setColIsDated(false);
                  setColIsRange(false);
                  setColStartYear('');
                  setColStartMonth('');
                  setColStartDay('');
                  setColStartHour('');
                  setColStartMinute('');
                  setColEndYear('');
                  setColEndMonth('');
                  setColEndDay('');
                  setColEndHour('');
                  setColEndMinute('');
                  setShowCreateCollection(prev => !prev);
                }}
                className={styles.btnSecondary}
              >
                + Nowa kolekcja / album datowany
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create / Edit Collection / Sub-collection / Dated Album Form */}
      {isAdmin && showCreateCollection && (
        <section className={styles.sectionCard} data-testid="create-collection-form">
          <h2 className={styles.groupTitle}>
            {editingCollectionId !== null
              ? 'Edytuj kolekcję archiwalną lub album datowany'
              : 'Utwórz nową kolekcję archiwalną, podkolekcję lub album datowany'}
          </h2>
          <form
            onSubmit={e => {
              void handleSaveCollection(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <div className={styles.filtersRow}>
              <div className={styles.filterField} style={{ flex: '1 1 240px' }}>
                <label htmlFor="col-name-input" className={styles.filterLabel}>
                  Nazwa kolekcji (np. Zbiór po babci Katarzynie / Zdjęcia z domu 2002) *
                </label>
                <input
                  id="col-name-input"
                  data-testid="col-name-input"
                  type="text"
                  required
                  value={colName}
                  onChange={e => {
                    setColName(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              {!colIsDated && (
                <div className={styles.filterField} style={{ flex: '1 1 200px' }}>
                  <label htmlFor="col-parent-select" className={styles.filterLabel}>
                    Kolekcja nadrzędna (dla podkolekcji, opcjonalnie)
                  </label>
                  <select
                    id="col-parent-select"
                    value={colParentId}
                    onChange={e => {
                      setColParentId(e.target.value);
                    }}
                    className={styles.selectInput}
                  >
                    <option value="">— Brak (kolekcja główna) —</option>
                    {allCollections
                      .filter(c => !c.datedCollection && (editingCollectionId === null || c.id !== editingCollectionId))
                      .map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className={styles.filterField} style={{ flex: '1 1 200px' }}>
                <label htmlFor="col-slug-input" className={styles.filterLabel}>
                  Nazwa folderu na dysku (snake_case, opcjonalnie)
                </label>
                <input
                  id="col-slug-input"
                  type="text"
                  placeholder="np. zdjecia_codzienne_2002"
                  value={colSlug}
                  onChange={e => {
                    setColSlug(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.filterField}>
              <label htmlFor="col-desc-input" className={styles.filterLabel}>
                Opis tekstowy kolekcji (zwykły tekst, pole rozwijalne)
              </label>
              <textarea
                id="col-desc-input"
                rows={4}
                value={colDesc}
                onChange={e => {
                  setColDesc(e.target.value);
                }}
                className={styles.textareaInput}
                placeholder="Wprowadź szczegółowy opis archiwalny lub wspomnienie dotyczące tej kolekcji..."
              />
            </div>

            <div className={styles.filtersRow}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={colIsDated}
                  onChange={e => {
                    setColIsDated(e.target.checked);
                  }}
                />
                <span>
                  To jest Album datowany w folderze dated/ (np. „Zdjęcia codzienne z domu rok 2002”)
                </span>
              </label>

              {colIsDated && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={colIsRange}
                    onChange={e => {
                      setColIsRange(e.target.checked);
                    }}
                  />
                  <span>Album obejmuje przedział niepewności (między .. a ..)</span>
                </label>
              )}
            </div>

            {colIsDated && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  {colIsRange ? '📅 Data początkowa albumu (od...)' : '📅 Data albumu datowanego'}
                </strong>
                <div className={styles.dateRowGrid}>
                  <div className={styles.filterField}>
                    <label htmlFor="col-start-qual" className={styles.filterLabel}>Kwalifikator daty</label>
                    <select
                      id="col-start-qual"
                      value={colStartQual}
                      onChange={e => {
                        setColStartQual(e.target.value);
                      }}
                      className={styles.selectInput}
                    >
                      {QUALIFIER_OPTIONS.map(q => (
                        <option key={q.value} value={q.value}>{q.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="col-start-cal" className={styles.filterLabel}>
                      Wybór z kalendarza
                    </label>
                    <div className={styles.calendarPickerGroup}>
                      <input
                        id="col-start-cal"
                        type="date"
                        value={toIsoDateInputValue(colStartYear, colStartMonth, colStartDay)}
                        onChange={e => {
                          if (e.target.value) {
                            const p = e.target.value.split('-');
                            if (p.length === 3) {
                              setColStartYear(String(Number(p[0])));
                              setColStartMonth(String(Number(p[1])));
                              setColStartDay(String(Number(p[2])));
                            }
                          }
                        }}
                        className={styles.textInput}
                      />
                      {getPolishWeekdayLabel(colStartYear, colStartMonth, colStartDay) && (
                        <span className={styles.weekdayBadge}>
                          📅 {getPolishWeekdayLabel(colStartYear, colStartMonth, colStartDay)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="col-start-year" className={styles.filterLabel}>Rok *</label>
                    <input
                      id="col-start-year"
                      type="number"
                      required
                      placeholder="RRRR"
                      value={colStartYear}
                      onChange={e => {
                        setColStartYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="col-start-month" className={styles.filterLabel}>Miesiąc (1–12)</label>
                    <input
                      id="col-start-month"
                      type="number"
                      min={1}
                      max={12}
                      placeholder="MM"
                      value={colStartMonth}
                      onChange={e => {
                        setColStartMonth(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="col-start-day" className={styles.filterLabel}>Dzień (1–31)</label>
                    <input
                      id="col-start-day"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="DD"
                      value={colStartDay}
                      onChange={e => {
                        setColStartDay(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField} style={{ flex: '1.2 1 250px' }}>
                    <label htmlFor="col-start-hour" className={styles.filterLabel}>Godzina i czas</label>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <select
                        id="col-start-time-qual"
                        value={colStartTimeQual}
                        onChange={e => {
                          setColStartTimeQual(e.target.value);
                        }}
                        className={styles.selectInput}
                        style={{ width: '150px' }}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            Czas: {q.label}
                          </option>
                        ))}
                      </select>
                      <input
                        id="col-start-hour"
                        type="number"
                        min={0}
                        max={23}
                        placeholder="GG"
                        value={colStartHour}
                        onChange={e => {
                          setColStartHour(e.target.value);
                        }}
                        className={styles.textInput}
                        style={{ width: '55px' }}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="MM"
                        value={colStartMinute}
                        onChange={e => {
                          setColStartMinute(e.target.value);
                        }}
                        className={styles.textInput}
                        style={{ width: '55px' }}
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="SS"
                        value={colStartSecond}
                        onChange={e => {
                          setColStartSecond(e.target.value);
                        }}
                        className={styles.textInput}
                        style={{ width: '55px' }}
                      />
                    </div>
                  </div>
                </div>

                {colIsRange && (
                  <>
                    <strong style={{ fontSize: '0.85rem', color: '#1e293b', marginTop: '0.45rem' }}>
                      📅 Data końcowa kolekcji (koniec zakresu)
                    </strong>
                    <div className={styles.dateRowGrid}>
                      <div className={styles.filterField}>
                        <label htmlFor="col-end-qual" className={styles.filterLabel}>Kwalifikator końca</label>
                        <select
                          id="col-end-qual"
                          value={colEndQual}
                          onChange={e => {
                            setColEndQual(e.target.value);
                          }}
                          className={styles.selectInput}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>{q.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="col-end-cal" className={styles.filterLabel}>
                          Wybór z kalendarza
                        </label>
                        <div className={styles.calendarPickerGroup}>
                          <input
                            id="col-end-cal"
                            type="date"
                            value={toIsoDateInputValue(colEndYear, colEndMonth, colEndDay)}
                            onChange={e => {
                              if (e.target.value) {
                                const p = e.target.value.split('-');
                                if (p.length === 3) {
                                  setColEndYear(String(Number(p[0])));
                                  setColEndMonth(String(Number(p[1])));
                                  setColEndDay(String(Number(p[2])));
                                }
                              }
                            }}
                            className={styles.textInput}
                          />
                          {getPolishWeekdayLabel(colEndYear, colEndMonth, colEndDay) && (
                            <span className={styles.weekdayBadge}>
                              📅 {getPolishWeekdayLabel(colEndYear, colEndMonth, colEndDay)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="col-end-year" className={styles.filterLabel}>Rok końcowy *</label>
                        <input
                          id="col-end-year"
                          type="number"
                          required
                          placeholder="RRRR"
                          value={colEndYear}
                          onChange={e => {
                            setColEndYear(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="col-end-month" className={styles.filterLabel}>Miesiąc (1–12)</label>
                        <input
                          id="col-end-month"
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={colEndMonth}
                          onChange={e => {
                            setColEndMonth(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="col-end-day" className={styles.filterLabel}>Dzień (1–31)</label>
                        <input
                          id="col-end-day"
                          type="number"
                          min={1}
                          max={31}
                          placeholder="DD"
                          value={colEndDay}
                          onChange={e => {
                            setColEndDay(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField} style={{ flex: '1.2 1 250px' }}>
                        <label htmlFor="col-end-hour" className={styles.filterLabel}>Godzina i czas końca</label>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <select
                            id="col-end-time-qual"
                            value={colEndTimeQual}
                            onChange={e => {
                              setColEndTimeQual(e.target.value);
                            }}
                            className={styles.selectInput}
                            style={{ width: '150px' }}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                Czas: {q.label}
                              </option>
                            ))}
                          </select>
                          <input
                            id="col-end-hour"
                            type="number"
                            min={0}
                            max={23}
                            placeholder="GG"
                            value={colEndHour}
                            onChange={e => {
                              setColEndHour(e.target.value);
                            }}
                            className={styles.textInput}
                            style={{ width: '55px' }}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="MM"
                            value={colEndMinute}
                            onChange={e => {
                              setColEndMinute(e.target.value);
                            }}
                            className={styles.textInput}
                            style={{ width: '55px' }}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="SS"
                            value={colEndSecond}
                            onChange={e => {
                              setColEndSecond(e.target.value);
                            }}
                            className={styles.textInput}
                            style={{ width: '55px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateCollection(false);
                  setEditingCollectionId(null);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="submit"
                data-testid="submit-create-collection-button"
                className={styles.btnPrimary}
              >
                {editingCollectionId !== null ? 'Zapisz zmiany w kolekcji' : 'Utwórz kolekcję'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Single & Batch Upload Form */}
      {isAdmin && showUploadForm && (
        <section className={styles.sectionCard} data-testid="gallery-upload-form">
          <h2 className={styles.groupTitle}>
            Wgraj jedno lub wiele zdjęć, filmów lub plików audio do archiwum
          </h2>
          <form
            onSubmit={e => {
              void handleGalleryUpload(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <div className={styles.filtersRow}>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Pliki (jeden lub wiele) *</span>
                <div className={styles.filePickerRow}>
                  <label htmlFor={uploadInputId} className={styles.filePickerLabel}>
                    📂 Wybierz pliki z dysku
                  </label>
                  <input
                    id={uploadInputId}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    onChange={e => {
                      setUploadFiles(e.target.files ? Array.from(e.target.files) : []);
                    }}
                    className={styles.hiddenFileInput}
                  />
                  <span className={styles.selectedFileBadge}>
                    {uploadFiles.length === 0
                      ? 'Nie wybrano plików'
                      : `Wybrano plików: ${String(uploadFiles.length)}`}
                  </span>
                </div>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-col" className={styles.filterLabel}>
                  Kolekcja docelowa (wymagana dla mediów bez daty i portretów)
                </label>
                <select
                  id="gal-upload-col"
                  value={uploadCollectionId}
                  onChange={e => {
                    setUploadCollectionId(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Wybierz kolekcję lub kolekcję datowaną —</option>
                  {allCollections.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.datedCollection ? `[Datowana ${String(c.startYear ?? '')}] ` : ''}
                      {c.parentCollectionName ? `${c.parentCollectionName} › ` : ''}
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-name" className={styles.filterLabel}>
                  Trzon nazwy pliku (snake_case, opcjonalnie)
                </label>
                <input
                  id="gal-upload-name"
                  type="text"
                  placeholder="np. dziadek_w_wojsku"
                  value={uploadCustomName}
                  onChange={e => {
                    setUploadCustomName(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-title" className={styles.filterLabel}>
                  Tytuł / podpis
                </label>
                <input
                  id="gal-upload-title"
                  type="text"
                  value={uploadTitle}
                  onChange={e => {
                    setUploadTitle(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.filtersRow} style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
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

                {uploadIsPortrait && (
                  <div style={{ display: 'flex', gap: '1rem', marginLeft: '1.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="radio"
                        name="uploadPortraitType"
                        checked={uploadPortraitType === 'SINGLE'}
                        onChange={() => {
                          setUploadPortraitType('SINGLE');
                        }}
                      />
                      <span>Portret pojedynczy (portraits/single)</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="radio"
                        name="uploadPortraitType"
                        checked={uploadPortraitType === 'GROUP'}
                        onChange={() => {
                          setUploadPortraitType('GROUP');
                        }}
                      />
                      <span>Portret grupowy (portraits/group)</span>
                    </label>
                  </div>
                )}
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={uploadIsUnknown}
                  onChange={e => {
                    setUploadIsUnknown(e.target.checked);
                    if (e.target.checked) setUploadIsPortrait(false);
                  }}
                />
                <span>Oznacz jako nieznane (trafi do podfolderu unknown w kolekcji)</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={uploadIsRange}
                  onChange={e => {
                    setUploadIsRange(e.target.checked);
                  }}
                />
                <span>Wskaż przedział dat (od... do...)</span>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                {uploadIsRange ? '📅 Data początkowa (lub jedyna)' : '📅 Data wykonania'}
              </strong>
              <div className={styles.dateRowGrid}>
                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-dqual" className={styles.filterLabel}>Kwalifikator</label>
                  <select
                    id="gal-upload-dqual"
                    value={uploadDateQual}
                    onChange={e => {
                      setUploadDateQual(e.target.value);
                    }}
                    className={styles.selectInput}
                  >
                    {QUALIFIER_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>{q.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-cal" className={styles.filterLabel}>
                    Wybór z kalendarza
                  </label>
                  <div className={styles.calendarPickerGroup}>
                    <input
                      id="gal-upload-cal"
                      type="date"
                      value={toIsoDateInputValue(uploadYear, uploadMonth, uploadDay)}
                      onChange={e => {
                        if (e.target.value) {
                          const p = e.target.value.split('-');
                          if (p.length === 3) {
                            setUploadYear(String(Number(p[0])));
                            setUploadMonth(String(Number(p[1])));
                            setUploadDay(String(Number(p[2])));
                          }
                        }
                      }}
                      className={styles.textInput}
                    />
                    {getPolishWeekdayLabel(uploadYear, uploadMonth, uploadDay) && (
                      <span className={styles.weekdayBadge}>
                        📅 {getPolishWeekdayLabel(uploadYear, uploadMonth, uploadDay)}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-year" className={styles.filterLabel}>Rok</label>
                  <input
                    id="gal-upload-year"
                    type="number"
                    placeholder="RRRR"
                    value={uploadYear}
                    onChange={e => {
                      setUploadYear(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-month" className={styles.filterLabel}>Miesiąc (1–12)</label>
                  <input
                    id="gal-upload-month"
                    type="number"
                    min={1}
                    max={12}
                    placeholder="MM"
                    value={uploadMonth}
                    onChange={e => {
                      setUploadMonth(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-day" className={styles.filterLabel}>Dzień (1–31)</label>
                  <input
                    id="gal-upload-day"
                    type="number"
                    min={1}
                    max={31}
                    placeholder="DD"
                    value={uploadDay}
                    onChange={e => {
                      setUploadDay(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-hour" className={styles.filterLabel}>Godzina (GG:MM)</label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      id="gal-upload-hour"
                      type="number"
                      min={0}
                      max={23}
                      placeholder="GG"
                      value={uploadHour}
                      onChange={e => {
                        setUploadHour(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                    <input
                      type="number"
                      min={0}
                      max={59}
                      placeholder="MM"
                      value={uploadMinute}
                      onChange={e => {
                        setUploadMinute(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>
                </div>
              </div>

              {uploadIsRange && (
                <>
                  <strong style={{ fontSize: '0.85rem', color: '#1e293b', marginTop: '0.45rem' }}>
                    📅 Data końcowa (koniec przedziału)
                  </strong>
                  <div className={styles.dateRowGrid}>
                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendqual" className={styles.filterLabel}>Kwalifikator końca</label>
                      <select
                        id="gal-upload-rendqual"
                        value={uploadRangeEndQual}
                        onChange={e => {
                          setUploadRangeEndQual(e.target.value);
                        }}
                        className={styles.selectInput}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>{q.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendcal" className={styles.filterLabel}>
                        Wybór z kalendarza
                      </label>
                      <div className={styles.calendarPickerGroup}>
                        <input
                          id="gal-upload-rendcal"
                          type="date"
                          value={toIsoDateInputValue(uploadRangeEndYear, uploadRangeEndMonth, uploadRangeEndDay)}
                          onChange={e => {
                            if (e.target.value) {
                              const p = e.target.value.split('-');
                              if (p.length === 3) {
                                setUploadRangeEndYear(String(Number(p[0])));
                                setUploadRangeEndMonth(String(Number(p[1])));
                                setUploadRangeEndDay(String(Number(p[2])));
                              }
                            }
                          }}
                          className={styles.textInput}
                        />
                        {getPolishWeekdayLabel(uploadRangeEndYear, uploadRangeEndMonth, uploadRangeEndDay) && (
                          <span className={styles.weekdayBadge}>
                            📅 {getPolishWeekdayLabel(uploadRangeEndYear, uploadRangeEndMonth, uploadRangeEndDay)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendyear" className={styles.filterLabel}>Rok końcowy</label>
                      <input
                        id="gal-upload-rendyear"
                        type="number"
                        placeholder="RRRR"
                        value={uploadRangeEndYear}
                        onChange={e => {
                          setUploadRangeEndYear(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendmonth" className={styles.filterLabel}>Miesiąc (1–12)</label>
                      <input
                        id="gal-upload-rendmonth"
                        type="number"
                        min={1}
                        max={12}
                        placeholder="MM"
                        value={uploadRangeEndMonth}
                        onChange={e => {
                          setUploadRangeEndMonth(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendday" className={styles.filterLabel}>Dzień (1–31)</label>
                      <input
                        id="gal-upload-rendday"
                        type="number"
                        min={1}
                        max={31}
                        placeholder="DD"
                        value={uploadRangeEndDay}
                        onChange={e => {
                          setUploadRangeEndDay(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.filterField}>
                      <label htmlFor="gal-upload-rendhour" className={styles.filterLabel}>Godzina (GG:MM)</label>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <input
                          id="gal-upload-rendhour"
                          type="number"
                          min={0}
                          max={23}
                          placeholder="GG"
                          value={uploadRangeEndHour}
                          onChange={e => {
                            setUploadRangeEndHour(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                        <input
                          type="number"
                          min={0}
                          max={59}
                          placeholder="MM"
                          value={uploadRangeEndMinute}
                          onChange={e => {
                            setUploadRangeEndMinute(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.85rem' }}>
              {uploadYear.trim() === '' && uploadCollectionId === '' ? (
                <span style={{ fontSize: '0.82rem', color: '#b91c1c', fontWeight: 600 }}>
                  ⚠️ Dla plików bez ustalonej daty wybierz album/kolekcję docelową przed wgraniem.
                </span>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadForm(false);
                  }}
                  className={styles.btnSecondary}
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={uploadFiles.length === 0}
                  className={styles.btnPrimary}
                >
                  Wgraj i zapisz ({String(uploadFiles.length)})
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* 5 Main Thematic Views & Filters Bar */}
      <section className={styles.filterCard}>
        <div className={styles.filtersRow}>
          <div className={styles.filterField}>
            <label htmlFor="gal-category-select" className={styles.filterLabel}>
              Widok / Kategoria tematyczna
            </label>
            <select
              id="gal-category-select"
              data-testid="gal-category-select"
              value={viewMode}
              onChange={e => {
                setViewMode(e.target.value);
                resetDrillDown();
                setPage(0);
              }}
              className={styles.selectInput}
            >
              <option value="ALL">Wszystkie (wg daty dodania – rozwinięte wstążki)</option>
              <option value="TIMELINE">Data wykonania (dekady › lata › wydarzenia / kolekcje datowane / inne)</option>
              <option value="PERSON">Osoby (kafelki osób › portrety / powiązane / inne)</option>
              <option value="GRAVE">Nagrobki (cmentarze › groby)</option>
              <option value="COLLECTION">Kolekcje (kolekcje › podkolekcje)</option>
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="gal-search-input" className={styles.filterLabel}>
              Wyszukaj
            </label>
            <input
              id="gal-search-input"
              data-testid="gal-search-input"
              type="text"
              placeholder="Podpis, osoba, cmentarz, kolekcja..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor="gal-type-select" className={styles.filterLabel}>
              Typ mediów
            </label>
            <select
              id="gal-type-select"
              value={mediaType}
              onChange={e => {
                setMediaType(e.target.value);
                setPage(0);
              }}
              className={styles.selectInput}
            >
              <option value="ALL">Wszystkie typy mediów</option>
              <option value="IMAGE">Tylko zdjęcia</option>
              <option value="VIDEO">Tylko filmy</option>
              <option value="AUDIO">Tylko nagrania dźwiękowe</option>
            </select>
          </div>

          {viewMode === 'ALL' && (
            <div className={styles.filterField}>
              <label htmlFor="gal-sort-select" className={styles.filterLabel}>
                Kolejność dodania do aplikacji
              </label>
              <select
                id="gal-sort-select"
                value={sortBy}
                onChange={e => {
                  setSortBy(e.target.value);
                  setPage(0);
                }}
                className={styles.selectInput}
              >
                <option value="NEWEST_UPLOAD">Od ostatnio dodanych</option>
                <option value="OLDEST_UPLOAD">Od najwcześniej dodanych</option>
              </select>
            </div>
          )}
        </div>

        {/* Multi-Person Filter */}
        <div className={styles.personFilterRow}>
          <span className={styles.filterLabel}>Filtruj według osób:</span>
          <input
            type="text"
            placeholder="Wpisz imię lub nazwisko..."
            value={personQuery}
            onChange={e => {
              setPersonQuery(e.target.value);
            }}
            className={styles.textInput}
            style={{ maxWidth: '220px', height: '34px' }}
          />
          <button
            type="button"
            onClick={() => {
              void handleSearchPersonFilter();
            }}
            className={styles.btnSecondary}
          >
            Szukaj osoby
          </button>

          {selectedPersons.length > 1 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={matchAllPersons}
                onChange={e => {
                  setMatchAllPersons(e.target.checked);
                  setPage(0);
                }}
              />
              <span>Wspólne zdjęcia (wszystkie wybrane osoby naraz)</span>
            </label>
          )}

          {selectedPersons.map(sp => (
            <span key={sp.id} className={styles.personChip}>
              <span>👤 {sp.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedPersons(prev => prev.filter(item => item.id !== sp.id));
                  setPage(0);
                }}
                className={styles.chipRemoveBtn}
              >
                ✕
              </button>
            </span>
          ))}

          {personResults.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                handleAddPersonToFilter(p);
              }}
              className={styles.btnSecondary}
            >
              + Wybierz: {p.givenName} {p.surname}
            </button>
          ))}
        </div>
      </section>

      {errorMessage && (
        <div role="alert" style={{ color: '#dc2626', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* Gallery Media Display */}
      {isLoading ? (
        <Loader size={42} />
      ) : !pageData || pageData.content.length === 0 ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak zdjęć i filmów spełniających wybrane kryteria.
          </p>
        </div>
      ) : viewMode === 'ALL' ? (
        <>
          <div className={styles.groupsContainer}>
            {uploadDateRibbons.map(ribbon => (
              <section key={ribbon.key} className={styles.groupSection}>
                <div className={styles.groupHeader}>
                  <h2 className={styles.groupTitle}>
                    {ribbon.title} ({String(ribbon.items.length)})
                  </h2>
                </div>
                <div className={styles.mediaGrid}>
                  {ribbon.items.map(item => renderMediaTile(item, allItems))}
                </div>
              </section>
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalPages={pageData.totalPages}
            totalElements={pageData.totalElements}
            elementsLabel="Łącznie plików"
            onPageChange={setPage}
          />
        </>
      ) : viewMode === 'TIMELINE' ? (
        renderDrillDownSection(timelineViewContent)
      ) : viewMode === 'PERSON' ? (
        renderDrillDownSection(personViewContent)
      ) : viewMode === 'GRAVE' ? (
        renderDrillDownSection(graveViewContent)
      ) : (
        renderDrillDownSection(collectionViewContent)
      )}

      {/* Fullscreen Black-Background Lightbox */}
      {activeItem && (
        <div
          className={styles.fullscreenOverlay}
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
              {String((activeIndex ?? 0) + 1)} / {String(activeLightboxList.length)})
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

              {isAdmin && (
                <button
                  type="button"
                  data-testid="start-edit-media-item-button"
                  onClick={() => {
                    handleStartEditMedia(activeItem);
                  }}
                  className={styles.btnSecondary}
                >
                  ✏️ Edytuj dane, opis, osoby lub datę
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowDetailsDrawer(prev => !prev);
                }}
                className={styles.btnSecondary}
              >
                ℹ️ {showDetailsDrawer ? 'Ukryj szczegóły' : 'Szczegóły'}
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
            {activeLightboxList.length > 1 && (
              <button
                type="button"
                aria-label="Poprzedni plik"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setActiveIndex(prev =>
                    prev !== null
                      ? (prev - 1 + activeLightboxList.length) % activeLightboxList.length
                      : null
                  );
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
                maxWidth: '94vw',
                maxHeight: showDetailsDrawer ? '48vh' : '84vh',
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
              ) : activeItem.mediaType === 'AUDIO' ? (
                <div className={styles.lightboxAudioContainer}>
                  <span className={styles.lightboxAudioIcon}>🎵</span>
                  <div className={styles.lightboxAudioTitle}>
                    {activeItem.title ?? activeItem.fileName}
                  </div>
                  <audio
                    src={mediaApi.getFileUrl(activeItem.id)}
                    controls
                    className={styles.lightboxAudioPlayer}
                  />
                </div>
              ) : (
                <img
                  src={mediaApi.getFileUrl(activeItem.id)}
                  alt={activeItem.title ?? ''}
                  draggable={false}
                  style={{ maxWidth: '94vw', maxHeight: '82vh', objectFit: 'contain' }}
                />
              )}
            </div>

            {activeLightboxList.length > 1 && (
              <button
                type="button"
                aria-label="Następny plik"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setActiveIndex(prev =>
                    prev !== null ? (prev + 1) % activeLightboxList.length : null
                  );
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
              {activeItem.title && <strong>{activeItem.title}</strong>}
              {activeItem.dateText && (
                <div className={styles.cardSub}>Data: {activeItem.dateText}</div>
              )}
              {activeItem.inscriptionText && (
                <div className={styles.cardSub}>
                  Podpis z odwrotu: „{activeItem.inscriptionText}”
                </div>
              )}
              {activeItem.sourceText && (
                <div className={styles.cardSub}>Źródło: {activeItem.sourceText}</div>
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
              {activeItem.personNames && activeItem.personNames.length > 0 && (
                <div className={styles.cardSub}>
                  Osoby: {activeItem.personNames.join(', ')}
                </div>
              )}
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      handleStartEditMedia(activeItem);
                    }}
                    className={styles.btnSecondary}
                  >
                    ✏️ Edytuj metadane pliku
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemToDelete(activeItem);
                    }}
                    className={styles.btnDanger}
                  >
                    🗑️ Usuń plik z archiwum
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Media Metadata Modal */}
      {isAdmin && isEditingMediaItem && (
        <div
          className={styles.lightboxBackdrop}
          style={{ zIndex: 60 }}
          onClick={() => {
            setIsEditingMediaItem(false);
          }}
        >
          <div
            className={styles.sectionCard}
            style={{
              maxWidth: '680px',
              width: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              zIndex: 65,
            }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h2 className={styles.groupTitle}>Edytuj dane pliku multimedialnego</h2>
            <form
              onSubmit={e => {
                void handleSaveMediaEdit(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
            >
              <div className={styles.filterField}>
                <label htmlFor="edit-media-collection" className={styles.filterLabel}>
                  Album / Kolekcja docelowa (lub zmiana lokalizacji)
                </label>
                <select
                  id="edit-media-collection"
                  value={editCollectionId}
                  onChange={e => {
                    setEditCollectionId(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">
                    {editYear.trim() !== ''
                      ? '(Brak kolekcji – folder roku w dated)'
                      : '-- Wybierz kolekcję / album docelowy --'}
                  </option>
                  {allCollections.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.datedCollection ? `📅 [Album] ${col.name}` : `📦 [Kolekcja] ${col.name}`}
                    </option>
                  ))}
                </select>
                {editOriginalCollectionId !== '' && editCollectionId === '' && editYear.trim() === '' && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠️ Plik bez ustalonej daty musi posiadać przypisaną kolekcję docelową przed odpięciem.
                  </span>
                )}
              </div>

              <div className={styles.filterField}>
                <label htmlFor="edit-media-title" className={styles.filterLabel}>
                  Tytuł / podpis
                </label>
                <input
                  id="edit-media-title"
                  type="text"
                  value={editTitle}
                  onChange={e => {
                    setEditTitle(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="edit-media-desc" className={styles.filterLabel}>
                  Opis pliku (pole rozwijalne)
                </label>
                <textarea
                  id="edit-media-desc"
                  rows={4}
                  value={editDescription}
                  onChange={e => {
                    setEditDescription(e.target.value);
                  }}
                  className={styles.textareaInput}
                  placeholder="Opisz historię, kontekst lub szczegóły widoczne na zdjęciu/nagraniu..."
                />
              </div>

              <div className={styles.filtersRow}>
                <div className={styles.filterField}>
                  <label htmlFor="edit-media-inscr" className={styles.filterLabel}>
                    Napis / dedykacja z odwrotu
                  </label>
                  <input
                    id="edit-media-inscr"
                    type="text"
                    value={editInscription}
                    onChange={e => {
                      setEditInscription(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.filterField}>
                  <label htmlFor="edit-media-src" className={styles.filterLabel}>
                    Źródło / pochodzenie
                  </label>
                  <input
                    id="edit-media-src"
                    type="text"
                    value={editSourceText}
                    onChange={e => {
                      setEditSourceText(e.target.value);
                    }}
                    className={styles.textInput}
                  />
                </div>
              </div>

              <div className={styles.filtersRow}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={editIsRange}
                    onChange={e => {
                      setEditIsRange(e.target.checked);
                    }}
                  />
                  <span>Przedział niepewności „między .. a ..” dla daty wykonania</span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  {editIsRange ? '📅 Data początkowa (od kiedy mogło powstać)' : '📅 Data wykonania'}
                </strong>
                <div className={styles.dateRowGrid}>
                  <div className={styles.filterField}>
                    <label htmlFor="edit-date-qual" className={styles.filterLabel}>Kwalifikator daty</label>
                    <select
                      id="edit-date-qual"
                      value={editDateQual}
                      onChange={e => {
                        setEditDateQual(e.target.value);
                      }}
                      className={styles.selectInput}
                    >
                      {QUALIFIER_OPTIONS.map(q => (
                        <option key={q.value} value={q.value}>{q.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-cal" className={styles.filterLabel}>Wybór z kalendarza</label>
                    <div className={styles.calendarPickerGroup}>
                      <input
                        id="edit-cal"
                        type="date"
                        value={toIsoDateInputValue(editYear, editMonth, editDay)}
                        onChange={e => {
                          if (e.target.value) {
                            const p = e.target.value.split('-');
                            if (p.length === 3) {
                              setEditYear(String(Number(p[0])));
                              setEditMonth(String(Number(p[1])));
                              setEditDay(String(Number(p[2])));
                            }
                          }
                        }}
                        className={styles.textInput}
                      />
                      {getPolishWeekdayLabel(editYear, editMonth, editDay) && (
                        <span className={styles.weekdayBadge}>
                          📅 {getPolishWeekdayLabel(editYear, editMonth, editDay)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-year" className={styles.filterLabel}>Rok</label>
                    <input
                      id="edit-year"
                      type="number"
                      placeholder="RRRR"
                      value={editYear}
                      onChange={e => {
                        setEditYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-month" className={styles.filterLabel}>Miesiąc (1–12)</label>
                    <input
                      id="edit-month"
                      type="number"
                      min={1}
                      max={12}
                      placeholder="MM"
                      value={editMonth}
                      onChange={e => {
                        setEditMonth(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-day" className={styles.filterLabel}>Dzień (1–31)</label>
                    <input
                      id="edit-day"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="DD"
                      value={editDay}
                      onChange={e => {
                        setEditDay(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-hour" className={styles.filterLabel}>Godzina (GG:MM:SS)</label>
                    <div className={styles.timeTripletGroup}>
                      <select
                        aria-label="Kwalifikator czasu"
                        value={editTimeQual}
                        onChange={e => {
                          setEditTimeQual(e.target.value);
                        }}
                        className={styles.selectInput}
                        style={{ width: '130px' }}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>Czas: {q.label}</option>
                        ))}
                      </select>
                      <input
                        id="edit-hour"
                        type="number"
                        min={0}
                        max={23}
                        placeholder="GG"
                        value={editHour}
                        onChange={e => {
                          setEditHour(e.target.value);
                        }}
                        className={styles.textInput}
                        style={{ width: '50px' }}
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
                        className={styles.textInput}
                        style={{ width: '50px' }}
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
                        className={styles.textInput}
                        style={{ width: '50px' }}
                      />
                    </div>
                  </div>
                </div>

                {editIsRange && (
                  <>
                    <strong style={{ fontSize: '0.85rem', color: '#1e293b', marginTop: '0.45rem' }}>
                      📅 Koniec przedziału niepewności (do kiedy mogło powstać)
                    </strong>
                    <div className={styles.dateRowGrid}>
                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-qual" className={styles.filterLabel}>Kwalifikator końca</label>
                        <select
                          id="edit-rend-qual"
                          value={editRangeEndQual}
                          onChange={e => {
                            setEditRangeEndQual(e.target.value);
                          }}
                          className={styles.selectInput}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>{q.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-cal" className={styles.filterLabel}>Wybór z kalendarza</label>
                        <div className={styles.calendarPickerGroup}>
                          <input
                            id="edit-rend-cal"
                            type="date"
                            value={toIsoDateInputValue(editRangeEndYear, editRangeEndMonth, editRangeEndDay)}
                            onChange={e => {
                              if (e.target.value) {
                                const p = e.target.value.split('-');
                                if (p.length === 3) {
                                  setEditRangeEndYear(String(Number(p[0])));
                                  setEditRangeEndMonth(String(Number(p[1])));
                                  setEditRangeEndDay(String(Number(p[2])));
                                }
                              }
                            }}
                            className={styles.textInput}
                          />
                          {getPolishWeekdayLabel(editRangeEndYear, editRangeEndMonth, editRangeEndDay) && (
                            <span className={styles.weekdayBadge}>
                              📅 {getPolishWeekdayLabel(editRangeEndYear, editRangeEndMonth, editRangeEndDay)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-year" className={styles.filterLabel}>Rok końcowy</label>
                        <input
                          id="edit-rend-year"
                          type="number"
                          placeholder="RRRR"
                          value={editRangeEndYear}
                          onChange={e => {
                            setEditRangeEndYear(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-month" className={styles.filterLabel}>Miesiąc (1–12)</label>
                        <input
                          id="edit-rend-month"
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={editRangeEndMonth}
                          onChange={e => {
                            setEditRangeEndMonth(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-day" className={styles.filterLabel}>Dzień (1–31)</label>
                        <input
                          id="edit-rend-day"
                          type="number"
                          min={1}
                          max={31}
                          placeholder="DD"
                          value={editRangeEndDay}
                          onChange={e => {
                            setEditRangeEndDay(e.target.value);
                          }}
                          className={styles.textInput}
                        />
                      </div>

                      <div className={styles.filterField}>
                        <label htmlFor="edit-rend-hour" className={styles.filterLabel}>Godzina końca (GG:MM:SS)</label>
                        <div className={styles.timeTripletGroup}>
                          <select
                            aria-label="Kwalifikator czasu końca"
                            value={editRangeEndTimeQual}
                            onChange={e => {
                              setEditRangeEndTimeQual(e.target.value);
                            }}
                            className={styles.selectInput}
                            style={{ width: '130px' }}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>Czas: {q.label}</option>
                            ))}
                          </select>
                          <input
                            id="edit-rend-hour"
                            type="number"
                            min={0}
                            max={23}
                            placeholder="GG"
                            value={editRangeEndHour}
                            onChange={e => {
                              setEditRangeEndHour(e.target.value);
                            }}
                            className={styles.textInput}
                            style={{ width: '50px' }}
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
                            className={styles.textInput}
                            style={{ width: '50px' }}
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
                            className={styles.textInput}
                            style={{ width: '50px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <span className={styles.filterLabel}>
                  Osoby na zdjęciu, osoby powiązane oraz autorzy (z bazy lub tekstowo):
                </span>
                <div className={styles.personLinksGrid}>
                  <div className={styles.filterField}>
                    <label htmlFor="edit-link-role" className={styles.filterLabel}>Rodzaj powiązania</label>
                    <select
                      id="edit-link-role"
                      value={editLinkRoleType}
                      onChange={e => {
                        setEditLinkRoleType(e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR');
                      }}
                      className={styles.selectInput}
                    >
                      <option value="DEPICTED">👁️ Osoba widoczna na zdjęciu / filmie</option>
                      <option value="RELATED">🔗 Osoba powiązana ze zdjęciem / filmem</option>
                      <option value="AUTHOR">📷 Autor zdjęcia / nagrania (kto wykonał)</option>
                    </select>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-link-person-query" className={styles.filterLabel}>Dodaj osobę z drzewa</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        id="edit-link-person-query"
                        type="text"
                        placeholder="Szukaj w drzewie..."
                        value={editLinkPersonQuery}
                        onChange={e => {
                          setEditLinkPersonQuery(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleSearchPersonForEdit();
                        }}
                        className={styles.btnSecondary}
                      >
                        Szukaj
                      </button>
                    </div>
                  </div>

                  <div className={styles.filterField}>
                    <label htmlFor="edit-link-text-person" className={styles.filterLabel}>Lub wpisz osobę tekstowo</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        id="edit-link-text-person"
                        type="text"
                        placeholder="np. Fotograf z Lublina"
                        value={editLinkTextInput}
                        onChange={e => {
                          setEditLinkTextInput(e.target.value);
                        }}
                        className={styles.textInput}
                      />
                      <select
                        aria-label="Płeć osoby tekstowej"
                        value={editLinkTextSex}
                        onChange={e => {
                          setEditLinkTextSex(e.target.value as PersonSex);
                        }}
                        className={styles.selectInput}
                        style={{ width: '75px' }}
                      >
                        <option value="MALE">M</option>
                        <option value="FEMALE">K</option>
                        <option value="UNKNOWN">?</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddTextPersonToEdit}
                        className={styles.btnSecondary}
                      >
                        + Dodaj
                      </button>
                    </div>
                  </div>
                </div>

                {editLinkPersonResults.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {editLinkPersonResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          handleAddDbPersonToEdit(p);
                        }}
                        className={styles.btnSecondary}
                      >
                        + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                      </button>
                    ))}
                  </div>
                )}

                {editPersonLinks.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                    {editPersonLinks.map((pl, lIdx) => (
                      <span
                        key={`${pl.displayLabel}-${String(lIdx)}`}
                        className={styles.textPersonBadge}
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        {pl.displayLabel}
                        <button
                          type="button"
                          onClick={() => {
                            setEditPersonLinks(prev => prev.filter((_, i) => i !== lIdx));
                          }}
                          className={styles.pillRemoveBtn}
                          aria-label={`Usuń ${pl.displayLabel}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingMediaItem(false);
                  }}
                  className={styles.btnSecondary}
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                >
                  Zapisz zmiany w pliku
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Confirm Delete Collection */}
      {collectionToDelete && (
        <div
          className={styles.lightboxBackdrop}
          style={{ zIndex: 120 }}
          onClick={() => {
            setCollectionToDelete(null);
          }}
        >
          <div
            className={styles.sectionCard}
            style={{ maxWidth: '480px', padding: '1.75rem', textAlign: 'center', margin: 'auto' }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1.25rem', color: '#1e293b' }}>
              🗑️ Usunąć kolekcję?
            </h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Czy na pewno chcesz usunąć kolekcję <strong>„{collectionToDelete.title}”</strong>?
              <br />
              Jeśli znajdują się w niej pliki przypisane wyłącznie do niej, musisz je najpierw przenieść lub usunąć.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setCollectionToDelete(null);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDeleteCollection();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń kolekcję
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Media Item */}
      {itemToDelete && (
        <div
          className={styles.lightboxBackdrop}
          style={{ zIndex: 120 }}
          onClick={() => {
            setItemToDelete(null);
          }}
        >
          <div
            className={styles.sectionCard}
            style={{ maxWidth: '480px', padding: '1.75rem', textAlign: 'center', margin: 'auto' }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1.25rem', color: '#1e293b' }}>
              🗑️ Usunąć plik z archiwum?
            </h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Czy na pewno chcesz bezpowrotnie usunąć plik <strong>„{itemToDelete.title ?? itemToDelete.fileName}”</strong> z dysku?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setItemToDelete(null);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDeleteMediaItem();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń plik
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}