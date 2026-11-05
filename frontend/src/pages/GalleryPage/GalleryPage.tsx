import { useState, useEffect, useMemo, use } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import { Pagination } from '../../components/Pagination/Pagination';
import MediaGallerySection from '../../components/MediaSection/MediaGallerySection';
import GalleryBrowserModal from '../../components/MediaSection/GalleryBrowserModal';
import MediaItemLightboxModal from '../../components/MediaSection/MediaItemLightboxModal';
import styles from './GalleryPage.module.css';
import type {
  MediaCollectionDto,
  MediaGalleryPageDto,
  MediaItemDto,
  MediaType,
} from '../../types/media';
import type { PersonListItemDto } from '../../types/biography';

interface FolderTileItem {
  key: string;
  title: string;
  subtitle?: string;
  count: number;
  previewItems?: { id: number; mediaType: MediaType }[];
  previewMediaId?: number | null;
  isTextPerson?: boolean;
  collectionId?: number;
  eventId?: number;
  onClick: () => void;
}

interface SubEventMediaBucket {
  subEventId: number;
  subEventLabel: string;
  items: MediaItemDto[];
}

interface DrillDownViewData {
  tiles: FolderTileItem[];
  mediaItems: MediaItemDto[];
  subEventBuckets?: SubEventMediaBucket[];
  activeEventId?: number | null;
  activeCollectionId?: number | null;
  breadcrumb: string[];
}

const getTopPreviewItems = (
  list: MediaItemDto[]
): { id: number; mediaType: MediaType }[] =>
  list.slice(0, 4).map(m => ({ id: m.id, mediaType: m.mediaType }));

const getFirstMediaId = (list: MediaItemDto[]): number | null =>
  list.length > 0 ? list[0].id : null;

const itemBelongsToCollection = (item: MediaItemDto, colId: number): boolean => {
  if (item.collectionIds && item.collectionIds.length > 0) {
    return item.collectionIds.includes(colId);
  }
  return item.collectionId === colId;
};

const isGroupPortraitItem = (item: MediaItemDto): boolean =>
  item.groupPortrait === true || (item.depictedPersons?.length ?? 0) > 1;

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

interface UploadDateRibbonBucket {
  key: string;
  title: string;
  items: MediaItemDto[];
}

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

const splitDirectAndSubEventMedia = (
  list: MediaItemDto[]
): { direct: MediaItemDto[]; subBuckets: SubEventMediaBucket[] } => {
  const direct: MediaItemDto[] = [];
  const subMap = new Map<number, SubEventMediaBucket>();

  for (const item of list) {
    if (item.subEventId !== undefined && item.subEventId !== null) {
      const existing = subMap.get(item.subEventId);
      if (existing) {
        existing.items.push(item);
      } else {
        subMap.set(item.subEventId, {
          subEventId: item.subEventId,
          subEventLabel: item.subEventLabel ?? 'Podwydarzenie',
          items: [item],
        });
      }
    } else {
      direct.push(item);
    }
  }
  return { direct, subBuckets: Array.from(subMap.values()) };
};

export default function GalleryPage() {
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

  // Drill-down navigation states
  const [selectedDecade, setSelectedDecade] = useState<number | 'UNDATED_EVENTS' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedYearBucketKey, setSelectedYearBucketKey] = useState<string | null>(null);
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
  const [selectedPersonCategory, setSelectedPersonCategory] = useState<string | null>(null);
  const [selectedCemeteryName, setSelectedCemeteryName] = useState<string | null>(null);
  const [selectedGraveId, setSelectedGraveId] = useState<number | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedCollectionSubfolder, setSelectedCollectionSubfolder] = useState<string | null>(
    null
  );
  const [selectedCollectionEventType, setSelectedCollectionEventType] = useState<string | null>(
    null
  );

  // Multi-Person Filter
  const [selectedPersons, setSelectedPersons] = useState<{ id: number; name: string }[]>([]);
  const [matchAllPersons, setMatchAllPersons] = useState<boolean>(true);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<PersonListItemDto[]>([]);

  // Admin Create/Edit Collection / Dated Album Modal State
  const [showCreateCollection, setShowCreateCollection] = useState<boolean>(false);
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [colName, setColName] = useState<string>('');
  const [colSlug, setColSlug] = useState<string>('');
  const [colDesc, setColDesc] = useState<string>('');
  const [colParentId, setColParentId] = useState<string>('');
  const [colIsDated, setColIsDated] = useState<boolean>(false);

  // Start Date (Single or Between Range)
  const [colIsStartBetween, setColIsStartBetween] = useState<boolean>(false);
  const [colStartQual, setColStartQual] = useState<string>('EXACT');
  const [colStartYear, setColStartYear] = useState<string>('');
  const [colStartMonth, setColStartMonth] = useState<string>('');
  const [colStartDay, setColStartDay] = useState<string>('');
  const [colStartTimeQual, setColStartTimeQual] = useState<string>('EXACT');
  const [colStartHour, setColStartHour] = useState<string>('');
  const [colStartMinute, setColStartMinute] = useState<string>('');
  const [colStartSecond, setColStartSecond] = useState<string>('');
  const [colStartRangeEndQual, setColStartRangeEndQual] = useState<string>('EXACT');
  const [colStartRangeEndYear, setColStartRangeEndYear] = useState<string>('');
  const [colStartRangeEndMonth, setColStartRangeEndMonth] = useState<string>('');
  const [colStartRangeEndDay, setColStartRangeEndDay] = useState<string>('');
  const [colStartRangeEndTimeQual, setColStartRangeEndTimeQual] = useState<string>('EXACT');
  const [colStartRangeEndHour, setColStartRangeEndHour] = useState<string>('');
  const [colStartRangeEndMinute, setColStartRangeEndMinute] = useState<string>('');
  const [colStartRangeEndSecond, setColStartRangeEndSecond] = useState<string>('');

  // End Date ("od ... do ...", Single or Between Range)
  const [colHasEndDate, setColHasEndDate] = useState<boolean>(false);
  const [colIsEndBetween, setColIsEndBetween] = useState<boolean>(false);
  const [colEndQual, setColEndQual] = useState<string>('EXACT');
  const [colEndYear, setColEndYear] = useState<string>('');
  const [colEndMonth, setColEndMonth] = useState<string>('');
  const [colEndDay, setColEndDay] = useState<string>('');
  const [colEndTimeQual, setColEndTimeQual] = useState<string>('EXACT');
  const [colEndHour, setColEndHour] = useState<string>('');
  const [colEndMinute, setColEndMinute] = useState<string>('');
  const [colEndSecond, setColEndSecond] = useState<string>('');
  const [colEndRangeEndQual, setColEndRangeEndQual] = useState<string>('EXACT');
  const [colEndRangeEndYear, setColEndRangeEndYear] = useState<string>('');
  const [colEndRangeEndMonth, setColEndRangeEndMonth] = useState<string>('');
  const [colEndRangeEndDay, setColEndRangeEndDay] = useState<string>('');
  const [colEndRangeEndTimeQual, setColEndRangeEndTimeQual] = useState<string>('EXACT');
  const [colEndRangeEndHour, setColEndRangeEndHour] = useState<string>('');
  const [colEndRangeEndMinute, setColEndRangeEndMinute] = useState<string>('');
  const [colEndRangeEndSecond, setColEndRangeEndSecond] = useState<string>('');

  // Admin Upload, Bulk Edit & Link Existing Modals
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState<boolean>(false);
  const [linkToCollectionId, setLinkToCollectionId] = useState<number | null>(null);

  // Fullscreen Lightbox state
  const [activeLightboxList, setActiveLightboxList] = useState<MediaItemDto[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Small Confirmation Modal for Deleting Collection / Dated Album
  const [collectionToDelete, setCollectionToDelete] = useState<{
    id: number;
    title: string;
  } | null>(null);

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
    setSelectedCollectionEventType(null);
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

  const getEffectiveTimelineYear = (item: MediaItemDto): number | null => {
    const rYears = item.rootEventStartYears ?? item.eventStartYears;
    if (rYears && rYears.length > 0 && (rYears.at(0) ?? -1) > 0) {
      return rYears.at(0) ?? null;
    }
    if (item.datedCollectionItem && item.collectionStartYear) {
      return item.collectionStartYear;
    }
    return item.year ?? null;
  };

  // ============================================================================
  // VIEW 2: DATA WYKONANIA
  // ============================================================================
  const timelineViewContent = useMemo<DrillDownViewData>(() => {
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
        const rIds =
          item.rootEventIds && item.rootEventIds.length > 0
            ? item.rootEventIds
            : item.eventIds;
        const rLabels =
          item.rootEventLabels && item.rootEventLabels.length > 0
            ? item.rootEventLabels
            : item.eventLabels;
        const eId = rIds?.at(0);
        const eLbl = rLabels?.at(0) ?? 'Wydarzenie bez daty';
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
          subtitle: '📅 Wydarzenie bez daty',
          count: data.list.length,
          previewItems: getTopPreviewItems(data.list),
          previewMediaId: getFirstMediaId(data.list),
          eventId: eId,
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
      const { direct, subBuckets } = splitDirectAndSubEventMedia(chosenData?.list ?? []);
      return {
        tiles: [],
        mediaItems: direct,
        subEventBuckets: subBuckets,
        activeEventId: chosenEvtId,
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
          subtitle: 'Wydarzenia, albumy datowane i inne',
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

    const inYear = inDecade.filter(d => d.effYear === selectedYear).map(d => d.item);
    const buckets = new Map<
      string,
      {
        title: string;
        subtitle: string;
        list: MediaItemDto[];
        collectionId?: number;
        eventId?: number;
      }
    >();
    const miscItems: MediaItemDto[] = [];

    for (const item of inYear) {
      const rIds =
        item.rootEventIds && item.rootEventIds.length > 0
          ? item.rootEventIds
          : item.eventIds;
      const rLabels =
        item.rootEventLabels && item.rootEventLabels.length > 0
          ? item.rootEventLabels
          : item.eventLabels;

      if (rIds && rIds.length > 0 && rIds.at(0) !== undefined) {
        const eId = rIds.at(0) ?? 0;
        const eLbl = rLabels?.at(0) ?? 'Wydarzenie';
        const bKey = `EVT_${String(eId)}`;
        const ex = buckets.get(bKey);
        if (ex) {
          ex.list.push(item);
        } else {
          buckets.set(bKey, {
            title: eLbl,
            subtitle: '📅 Wydarzenie rodzinne',
            list: [item],
            eventId: eId,
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
            collectionId: item.collectionId,
          });
        }
      } else {
        miscItems.push(item);
      }
    }

    for (const col of allCollections) {
      if (col.datedCollection && col.startYear === selectedYear) {
        const bKey = `DCOL_${String(col.id)}`;
        if (!buckets.has(bKey)) {
          buckets.set(bKey, {
            title: col.name,
            subtitle: col.dateText ? `📂 Album datowany (${col.dateText})` : '📂 Album datowany',
            list: [],
            collectionId: col.id,
          });
        }
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
      const tiles: FolderTileItem[] = Array.from(buckets.entries()).map(([bKey, data]) => ({
        key: bKey,
        title: data.title,
        subtitle: data.subtitle,
        count: data.list.length,
        previewItems: getTopPreviewItems(data.list),
        previewMediaId: getFirstMediaId(data.list),
        collectionId: data.collectionId,
        eventId: data.eventId,
        onClick: () => {
          setSelectedYearBucketKey(bKey);
        },
      }));
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
    const { direct, subBuckets } = splitDirectAndSubEventMedia(chosenBucket?.list ?? []);
    return {
      tiles: [],
      mediaItems: direct,
      subEventBuckets: subBuckets,
      activeEventId: chosenBucket?.eventId ?? null,
      activeCollectionId: chosenBucket?.collectionId ?? null,
      breadcrumb: [
        'Data wykonania',
        `Lata ${String(selectedDecade)}–${String(selectedDecade + 9)}`,
        `Rok ${String(selectedYear)}`,
        chosenBucket?.title ?? 'Wybrana grupa',
      ],
    };
  }, [allItems, allCollections, viewMode, selectedDecade, selectedYear, selectedYearBucketKey]);

  // ============================================================================
  // VIEW 3: OSOBY
  // ============================================================================
  const personViewContent = useMemo<DrillDownViewData>(() => {
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
      const isPortraitItem = item.portrait === true || item.primaryContext === 'PERSON';

      for (const d of depicted) {
        const isText = d.personId === null;
        const pKey = isText ? `TXT_${d.displayName}` : `DB_${String(d.personId)}`;
        const bucket = ensureBucket(pKey, d.displayName, isText);
        if (!bucket.allPersonMedia.some(m => m.id === item.id)) {
          bucket.allPersonMedia.push(item);
        }
        if (isPortraitItem) {
          if (isGroupPortraitItem(item)) {
            bucket.groupPortraits.push(item);
          } else {
            bucket.singlePortraits.push(item);
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
          if (a.isTextPerson !== b.isTextPerson) return a.isTextPerson ? 1 : -1;
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
      const catDefs = [
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
      SINGLE_PORTRAIT: { label: 'Portrety jednoosobowe', list: chosenPerson.singlePortraits },
      GROUP_PORTRAIT: { label: 'Portrety grupowe', list: chosenPerson.groupPortraits },
      RELATED: { label: 'Zdjęcia powiązane z tą osobą', list: chosenPerson.relatedMedia },
      OTHER: { label: 'Inne', list: chosenPerson.otherDepictedMedia },
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
  // VIEW 4: NAGROBKI
  // ============================================================================
  const graveViewContent = useMemo<DrillDownViewData>(() => {
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
        const cemName = i < cNames.length ? cNames[i] : (cNames.at(0) ?? 'Inne');
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
  // VIEW 5: KOLEKCJE (Points 13, 20, 21, 35)
  // Collection -> "📅 Wydarzenia bez daty" -> Event Type tiles -> Event tiles -> Media
  // ============================================================================
  const collectionViewContent = useMemo<DrillDownViewData>(() => {
    if (viewMode !== 'COLLECTION') {
      return { tiles: [], mediaItems: [], breadcrumb: [] };
    }
    const archivalCollections = allCollections.filter(c => !c.datedCollection);
    const countTotalInCollectionTree = (colId: number): MediaItemDto[] => {
      const direct = allItems.filter(i => itemBelongsToCollection(i, colId));
      const children = archivalCollections.filter(c => c.parentCollectionId === colId);
      const childMedia = children.flatMap(ch => countTotalInCollectionTree(ch.id));
      const uniqueMap = new Map<number, MediaItemDto>();
      for (const m of [...direct, ...childMedia]) {
        uniqueMap.set(m.id, m);
      }
      return Array.from(uniqueMap.values());
    };

    if (selectedCollectionId === null) {
      const rootCols = archivalCollections.filter(c => !c.parentCollectionId);
      const tiles: FolderTileItem[] = rootCols.map(col => {
        const treeMedia = countTotalInCollectionTree(col.id);
        return {
          key: `COL_${String(col.id)}`,
          title: `📦 ${col.name}`,
          subtitle: col.description ?? 'Kolekcja archiwalna',
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
    const directColMedia = allItems.filter(i =>
      itemBelongsToCollection(i, selectedCollectionId)
    );

    const singlePortraits = directColMedia.filter(
      i =>
        (i.portrait === true || i.primaryContext === 'PERSON') &&
        !isGroupPortraitItem(i)
    );
    const groupPortraits = directColMedia.filter(
      i =>
        (i.portrait === true || i.primaryContext === 'PERSON') &&
        isGroupPortraitItem(i)
    );
    const unknownMedia = directColMedia.filter(i => i.unknownMedia === true);
    const eventMediaInCol = directColMedia.filter(
      i =>
        !i.portrait &&
        i.primaryContext !== 'PERSON' &&
        !i.unknownMedia &&
        i.eventIds &&
        i.eventIds.length > 0
    );
    const looseMedia = directColMedia.filter(
      i =>
        !i.portrait &&
        i.primaryContext !== 'PERSON' &&
        !i.unknownMedia &&
        (!i.eventIds || i.eventIds.length === 0)
    );

    interface ColUndatedEventBucket {
      eventId: number;
      eventLabel: string;
      typeLabel: string;
      list: MediaItemDto[];
    }
    const colEventsMap = new Map<number, ColUndatedEventBucket>();
    for (const em of eventMediaInCol) {
      const rIds =
        em.rootEventIds && em.rootEventIds.length > 0 ? em.rootEventIds : em.eventIds;
      const rLabels =
        em.rootEventLabels && em.rootEventLabels.length > 0
          ? em.rootEventLabels
          : em.eventLabels;
      const rTypeLabels = em.rootEventTypeLabels;
      const eId = rIds?.at(0);
      const eLbl = rLabels?.at(0) ?? 'Wydarzenie';
      const tLbl = rTypeLabels?.at(0) ?? 'Inne wydarzenia';
      if (eId !== undefined) {
        const existing = colEventsMap.get(eId);
        if (existing) {
          existing.list.push(em);
        } else {
          colEventsMap.set(eId, {
            eventId: eId,
            eventLabel: eLbl,
            typeLabel: tLbl,
            list: [em],
          });
        }
      }
    }

    if (selectedCollectionSubfolder === null) {
      const subTiles: FolderTileItem[] = [];
      for (const ch of childCols) {
        const chMedia = countTotalInCollectionTree(ch.id);
        subTiles.push({
          key: `SUBCOL_${String(ch.id)}`,
          title: `📂 Podkolekcja: ${ch.name}`,
          subtitle: ch.description ?? 'Podkolekcja archiwalna',
          count: chMedia.length,
          previewItems: getTopPreviewItems(chMedia),
          previewMediaId: ch.previewMediaId ?? getFirstMediaId(chMedia),
          collectionId: ch.id,
          onClick: () => {
            setSelectedCollectionId(ch.id);
          },
        });
      }
      // Point 13 & 20: Single folder tile "📅 Wydarzenia bez daty" inside Collection
      if (eventMediaInCol.length > 0) {
        subTiles.push({
          key: 'SUB_UNDATED_EVENTS',
          title: '📅 Wydarzenia bez daty',
          subtitle: `Liczba wydarzeń: ${String(colEventsMap.size)}`,
          count: eventMediaInCol.length,
          previewItems: getTopPreviewItems(eventMediaInCol),
          previewMediaId: getFirstMediaId(eventMediaInCol),
          onClick: () => {
            setSelectedCollectionSubfolder('UNDATED_EVENTS');
            setSelectedCollectionEventType(null);
          },
        });
      }
      if (singlePortraits.length > 0) {
        subTiles.push({
          key: 'SUB_SINGLE_PORTRAITS',
          title: '👤 Portrety jednoosobowe',
          subtitle: 'Zdjęcia portretowe pojedynczych osób',
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
          subtitle: 'Zdjęcia portretowe wielu osób',
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
          subtitle: 'Zdjęcia i nagrania do identyfikacji',
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
        activeCollectionId: selectedCollectionId,
        breadcrumb: ['Kolekcje', currentCol?.name ?? 'Kolekcja'],
      };
    }

    // Point 20: Inside "Wydarzenia bez daty" -> Step 1: Group by Event Type, Step 2: Events of that type
    if (selectedCollectionSubfolder === 'UNDATED_EVENTS') {
      const byTypeMap = new Map<string, ColUndatedEventBucket[]>();
      for (const evtBucket of colEventsMap.values()) {
        const list = byTypeMap.get(evtBucket.typeLabel) ?? [];
        list.push(evtBucket);
        byTypeMap.set(evtBucket.typeLabel, list);
      }

      if (selectedCollectionEventType === null) {
        const typeTiles: FolderTileItem[] = Array.from(byTypeMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0], 'pl'))
          .map(([tLabel, evtBuckets]) => {
            const allMediaForType = evtBuckets.flatMap(b => b.list);
            return {
              key: `UTYPE_${tLabel}`,
              title: `🏷️ ${tLabel}`,
              subtitle: `Wydarzenia tego typu: ${String(evtBuckets.length)}`,
              count: allMediaForType.length,
              previewItems: getTopPreviewItems(allMediaForType),
              previewMediaId: getFirstMediaId(allMediaForType),
              onClick: () => {
                setSelectedCollectionEventType(tLabel);
              },
            };
          });
        return {
          tiles: typeTiles,
          mediaItems: [],
          activeCollectionId: selectedCollectionId,
          breadcrumb: [
            'Kolekcje',
            currentCol?.name ?? 'Kolekcja',
            'Wydarzenia bez daty',
          ],
        };
      }

      const eventsInChosenType = byTypeMap.get(selectedCollectionEventType) ?? [];
      const eventTiles: FolderTileItem[] = eventsInChosenType.map(eb => ({
        key: `COLEVT_${String(eb.eventId)}`,
        title: `📅 ${eb.eventLabel}`,
        subtitle: eb.typeLabel,
        count: eb.list.length,
        previewItems: getTopPreviewItems(eb.list),
        previewMediaId: getFirstMediaId(eb.list),
        eventId: eb.eventId,
        onClick: () => {
          setSelectedCollectionSubfolder(`EVT_${String(eb.eventId)}`);
        },
      }));
      return {
        tiles: eventTiles,
        mediaItems: [],
        activeCollectionId: selectedCollectionId,
        breadcrumb: [
          'Kolekcje',
          currentCol?.name ?? 'Kolekcja',
          'Wydarzenia bez daty',
          selectedCollectionEventType,
        ],
      };
    }

    if (selectedCollectionSubfolder.startsWith('EVT_')) {
      const eId = Number(selectedCollectionSubfolder.replace('EVT_', ''));
      const chosenEvt = colEventsMap.get(eId);
      const { direct, subBuckets } = splitDirectAndSubEventMedia(chosenEvt?.list ?? []);
      return {
        tiles: [],
        mediaItems: direct,
        subEventBuckets: subBuckets,
        activeEventId: eId,
        activeCollectionId: selectedCollectionId,
        breadcrumb: [
          'Kolekcje',
          currentCol?.name ?? 'Kolekcja',
          'Wydarzenia bez daty',
          chosenEvt?.typeLabel ?? 'Typ wydarzenia',
          chosenEvt?.eventLabel ?? 'Wydarzenie',
        ],
      };
    }

    const subMap: Record<string, { label: string; list: MediaItemDto[] } | undefined> = {
      SINGLE_PORTRAIT: { label: 'Portrety jednoosobowe', list: singlePortraits },
      GROUP_PORTRAIT: { label: 'Portrety grupowe', list: groupPortraits },
      UNKNOWN: { label: 'Nieznane (do identyfikacji)', list: unknownMedia },
    };
    const chosenSub = subMap[selectedCollectionSubfolder];
    return {
      tiles: [],
      mediaItems: chosenSub?.list ?? [],
      activeCollectionId: selectedCollectionId,
      breadcrumb: [
        'Kolekcje',
        currentCol?.name ?? 'Kolekcja',
        chosenSub?.label ?? 'Kategoria',
      ],
    };
  }, [
    allItems,
    allCollections,
    viewMode,
    selectedCollectionId,
    selectedCollectionSubfolder,
    selectedCollectionEventType,
  ]);

  const handleStepBackDrillDown = () => {
    if (viewMode === 'TIMELINE') {
      if (selectedYearBucketKey !== null) setSelectedYearBucketKey(null);
      else if (selectedYear !== null) setSelectedYear(null);
      else setSelectedDecade(null);
    } else if (viewMode === 'PERSON') {
      if (selectedPersonCategory !== null) setSelectedPersonCategory(null);
      else setSelectedPersonKey(null);
    } else if (viewMode === 'GRAVE') {
      if (selectedGraveId !== null) setSelectedGraveId(null);
      else setSelectedCemeteryName(null);
    } else if (viewMode === 'COLLECTION') {
      if (selectedCollectionSubfolder?.startsWith('EVT_')) {
        setSelectedCollectionSubfolder('UNDATED_EVENTS');
      } else if (
        selectedCollectionSubfolder === 'UNDATED_EVENTS' &&
        selectedCollectionEventType !== null
      ) {
        setSelectedCollectionEventType(null);
      } else if (selectedCollectionSubfolder !== null) {
        setSelectedCollectionSubfolder(null);
        setSelectedCollectionEventType(null);
      } else if (selectedCollectionId !== null) {
        const currentCol = allCollections.find(c => c.id === selectedCollectionId);
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

  const resetCollectionForm = () => {
    setEditingCollectionId(null);
    setColName('');
    setColSlug('');
    setColDesc('');
    setColParentId('');
    setColIsDated(false);
    setColIsStartBetween(false);
    setColStartQual('EXACT');
    setColStartYear('');
    setColStartMonth('');
    setColStartDay('');
    setColStartTimeQual('EXACT');
    setColStartHour('');
    setColStartMinute('');
    setColStartSecond('');
    setColStartRangeEndQual('EXACT');
    setColStartRangeEndYear('');
    setColStartRangeEndMonth('');
    setColStartRangeEndDay('');
    setColStartRangeEndTimeQual('EXACT');
    setColStartRangeEndHour('');
    setColStartRangeEndMinute('');
    setColStartRangeEndSecond('');
    setColHasEndDate(false);
    setColIsEndBetween(false);
    setColEndQual('EXACT');
    setColEndYear('');
    setColEndMonth('');
    setColEndDay('');
    setColEndTimeQual('EXACT');
    setColEndHour('');
    setColEndMinute('');
    setColEndSecond('');
    setColEndRangeEndQual('EXACT');
    setColEndRangeEndYear('');
    setColEndRangeEndMonth('');
    setColEndRangeEndDay('');
    setColEndRangeEndTimeQual('EXACT');
    setColEndRangeEndHour('');
    setColEndRangeEndMinute('');
    setColEndRangeEndSecond('');
  };

  const handleStartEditCollection = (col: MediaCollectionDto) => {
    setEditingCollectionId(col.id);
    setColName(col.name);
    setColSlug(col.slug);
    setColDesc(col.description ?? '');
    setColParentId(col.parentCollectionId ? String(col.parentCollectionId) : '');
    setColIsDated(Boolean(col.datedCollection));
    setColIsStartBetween(col.startDateType === 'RANGE');
    setColStartQual(col.startQualifier ?? 'EXACT');
    setColStartYear(col.startYear ? String(col.startYear) : '');
    setColStartMonth(col.startMonth ? String(col.startMonth) : '');
    setColStartDay(col.startDay ? String(col.startDay) : '');
    setColStartTimeQual(col.startTimeQualifier ?? 'EXACT');
    setColStartHour(
      col.startHour !== null && col.startHour !== undefined ? String(col.startHour) : ''
    );
    setColStartMinute(
      col.startMinute !== null && col.startMinute !== undefined ? String(col.startMinute) : ''
    );
    setColStartSecond(
      col.startSecond !== null && col.startSecond !== undefined ? String(col.startSecond) : ''
    );
    setColStartRangeEndQual(col.startRangeEndQualifier ?? 'EXACT');
    setColStartRangeEndYear(col.startRangeEndYear ? String(col.startRangeEndYear) : '');
    setColStartRangeEndMonth(col.startRangeEndMonth ? String(col.startRangeEndMonth) : '');
    setColStartRangeEndDay(col.startRangeEndDay ? String(col.startRangeEndDay) : '');
    setColStartRangeEndTimeQual(col.startRangeEndTimeQualifier ?? 'EXACT');
    setColStartRangeEndHour(
      col.startRangeEndHour !== null && col.startRangeEndHour !== undefined
        ? String(col.startRangeEndHour)
        : ''
    );
    setColStartRangeEndMinute(
      col.startRangeEndMinute !== null && col.startRangeEndMinute !== undefined
        ? String(col.startRangeEndMinute)
        : ''
    );
    setColStartRangeEndSecond(
      col.startRangeEndSecond !== null && col.startRangeEndSecond !== undefined
        ? String(col.startRangeEndSecond)
        : ''
    );

    setColHasEndDate(Boolean(col.hasEndDate));
    setColIsEndBetween(col.endDateType === 'RANGE');
    setColEndQual(col.endQualifier ?? 'EXACT');
    setColEndYear(col.endYear ? String(col.endYear) : '');
    setColEndMonth(col.endMonth ? String(col.endMonth) : '');
    setColEndDay(col.endDay ? String(col.endDay) : '');
    setColEndTimeQual(col.endTimeQualifier ?? 'EXACT');
    setColEndHour(
      col.endHour !== null && col.endHour !== undefined ? String(col.endHour) : ''
    );
    setColEndMinute(
      col.endMinute !== null && col.endMinute !== undefined ? String(col.endMinute) : ''
    );
    setColEndSecond(
      col.endSecond !== null && col.endSecond !== undefined ? String(col.endSecond) : ''
    );
    setColEndRangeEndQual(col.endRangeEndQualifier ?? 'EXACT');
    setColEndRangeEndYear(col.endRangeEndYear ? String(col.endRangeEndYear) : '');
    setColEndRangeEndMonth(col.endRangeEndMonth ? String(col.endRangeEndMonth) : '');
    setColEndRangeEndDay(col.endRangeEndDay ? String(col.endRangeEndDay) : '');
    setColEndRangeEndTimeQual(col.endRangeEndTimeQualifier ?? 'EXACT');
    setColEndRangeEndHour(
      col.endRangeEndHour !== null && col.endRangeEndHour !== undefined
        ? String(col.endRangeEndHour)
        : ''
    );
    setColEndRangeEndMinute(
      col.endRangeEndMinute !== null && col.endRangeEndMinute !== undefined
        ? String(col.endRangeEndMinute)
        : ''
    );
    setColEndRangeEndSecond(
      col.endRangeEndSecond !== null && col.endRangeEndSecond !== undefined
        ? String(col.endRangeEndSecond)
        : ''
    );
    setShowCreateCollection(true);
  };

  const parseOptInt = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };

  const handleSaveCollection = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const payload = {
        name: colName.trim(),
        customSlug: colSlug.trim() || null,
        description: colDesc.trim() || null,
        parentCollectionId: colIsDated
          ? null
          : colParentId !== ''
            ? Number(colParentId)
            : null,
        datedCollection: colIsDated,
        isStartBetweenRange: colIsDated ? colIsStartBetween : false,
        startQualifier: colIsDated ? colStartQual : null,
        startYear: colIsDated ? parseOptInt(colStartYear) : null,
        startMonth: colIsDated ? parseOptInt(colStartMonth) : null,
        startDay: colIsDated ? parseOptInt(colStartDay) : null,
        startTimeQualifier: colIsDated ? colStartTimeQual : null,
        startHour: colIsDated ? parseOptInt(colStartHour) : null,
        startMinute: colIsDated ? parseOptInt(colStartMinute) : null,
        startSecond: colIsDated ? parseOptInt(colStartSecond) : null,
        startRangeEndQualifier: colIsDated && colIsStartBetween ? colStartRangeEndQual : null,
        startRangeEndYear:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndYear) : null,
        startRangeEndMonth:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndMonth) : null,
        startRangeEndDay:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndDay) : null,
        startRangeEndTimeQualifier:
          colIsDated && colIsStartBetween ? colStartRangeEndTimeQual : null,
        startRangeEndHour:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndHour) : null,
        startRangeEndMinute:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndMinute) : null,
        startRangeEndSecond:
          colIsDated && colIsStartBetween ? parseOptInt(colStartRangeEndSecond) : null,
        hasEndDate: colIsDated ? colHasEndDate : false,
        isEndBetweenRange: colIsDated && colHasEndDate ? colIsEndBetween : false,
        endQualifier: colIsDated && colHasEndDate ? colEndQual : null,
        endYear: colIsDated && colHasEndDate ? parseOptInt(colEndYear) : null,
        endMonth: colIsDated && colHasEndDate ? parseOptInt(colEndMonth) : null,
        endDay: colIsDated && colHasEndDate ? parseOptInt(colEndDay) : null,
        endTimeQualifier: colIsDated && colHasEndDate ? colEndTimeQual : null,
        endHour: colIsDated && colHasEndDate ? parseOptInt(colEndHour) : null,
        endMinute: colIsDated && colHasEndDate ? parseOptInt(colEndMinute) : null,
        endSecond: colIsDated && colHasEndDate ? parseOptInt(colEndSecond) : null,
        endRangeEndQualifier:
          colIsDated && colHasEndDate && colIsEndBetween ? colEndRangeEndQual : null,
        endRangeEndYear:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndYear)
            : null,
        endRangeEndMonth:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndMonth)
            : null,
        endRangeEndDay:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndDay)
            : null,
        endRangeEndTimeQualifier:
          colIsDated && colHasEndDate && colIsEndBetween ? colEndRangeEndTimeQual : null,
        endRangeEndHour:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndHour)
            : null,
        endRangeEndMinute:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndMinute)
            : null,
        endRangeEndSecond:
          colIsDated && colHasEndDate && colIsEndBetween
            ? parseOptInt(colEndRangeEndSecond)
            : null,
      };
      if (editingCollectionId !== null) {
        await mediaApi.updateCollection(editingCollectionId, payload);
      } else {
        await mediaApi.createCollection(payload);
      }
      resetCollectionForm();
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
        setSelectedCollectionEventType(null);
      }
      if (selectedYearBucketKey === `DCOL_${String(collectionToDelete.id)}`) {
        setSelectedYearBucketKey(null);
      }
      setCollectionToDelete(null);
      await fetchGallery();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się usunąć kolekcji.');
      }
      setCollectionToDelete(null);
    }
  };

  const handleConfirmLinkToCollection = async (mediaIds: number[]) => {
    if (linkToCollectionId === null || mediaIds.length === 0) return;
    try {
      await mediaApi.linkExistingMedia({
        mediaIds,
        collectionId: linkToCollectionId,
      });
      setLinkToCollectionId(null);
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się przypisać wybranych plików do kolekcji.');
    }
  };

  const handleOpenItem = (item: MediaItemDto, contextList: MediaItemDto[]) => {
    setActiveLightboxList(contextList);
    const idx = contextList.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
  };

  const renderDateAndTimeBlock = (params: {
    idPrefix: string;
    dateQualLabel: string;
    dateQual: string;
    setDateQual: (v: string) => void;
    year: string;
    setYear: (v: string) => void;
    month: string;
    setMonth: (v: string) => void;
    day: string;
    setDay: (v: string) => void;
    timeQual: string;
    setTimeQual: (v: string) => void;
    hour: string;
    setHour: (v: string) => void;
    minute: string;
    setMinute: (v: string) => void;
    second: string;
    setSecond: (v: string) => void;
    requiredYear?: boolean;
  }) => {
    const weekday = getPolishWeekdayLabel(params.year, params.month, params.day);
    const isoVal = toIsoDateInputValue(params.year, params.month, params.day);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className={styles.dateRowGrid}>
          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-dqual`} className={styles.filterLabel}>
              {params.dateQualLabel}
            </label>
            <select
              id={`${params.idPrefix}-dqual`}
              value={params.dateQual}
              onChange={e => {
                params.setDateQual(e.target.value);
              }}
              className={styles.selectInput}
            >
              {QUALIFIER_OPTIONS.map(q => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-cal`} className={styles.filterLabel}>
              Wybór z kalendarza {weekday ? `(📅 ${weekday})` : ''}
            </label>
            <input
              id={`${params.idPrefix}-cal`}
              type="date"
              value={isoVal}
              onChange={e => {
                if (e.target.value) {
                  const p = e.target.value.split('-');
                  if (p.length === 3) {
                    params.setYear(String(Number(p[0])));
                    params.setMonth(String(Number(p[1])));
                    params.setDay(String(Number(p[2])));
                  }
                }
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-year`} className={styles.filterLabel}>
              Rok {params.requiredYear ? '*' : ''}
            </label>
            <input
              id={`${params.idPrefix}-year`}
              type="number"
              required={params.requiredYear}
              placeholder="RRRR"
              value={params.year}
              onChange={e => {
                params.setYear(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-month`} className={styles.filterLabel}>
              Miesiąc (1–12)
            </label>
            <input
              id={`${params.idPrefix}-month`}
              type="number"
              min={1}
              max={12}
              placeholder="MM"
              value={params.month}
              onChange={e => {
                params.setMonth(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-day`} className={styles.filterLabel}>
              Dzień (1–31)
            </label>
            <input
              id={`${params.idPrefix}-day`}
              type="number"
              min={1}
              max={31}
              placeholder="DD"
              value={params.day}
              onChange={e => {
                params.setDay(e.target.value);
              }}
              className={styles.textInput}
            />
          </div>
        </div>

        <div className={styles.timeRowGrid}>
          <div className={styles.filterField}>
            <label htmlFor={`${params.idPrefix}-tqual`} className={styles.filterLabel}>
              Kwalifikator czasu
            </label>
            <select
              id={`${params.idPrefix}-tqual`}
              value={params.timeQual}
              onChange={e => {
                params.setTimeQual(e.target.value);
              }}
              className={styles.selectInput}
            >
              {QUALIFIER_OPTIONS.map(q => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterLabel}>Godzina, minuta, sekunda (GG:MM:SS)</span>
            <div className={styles.timeTripletGroup}>
              <input
                type="number"
                min={0}
                max={23}
                placeholder="GG"
                aria-label="Godzina"
                value={params.hour}
                onChange={e => {
                  params.setHour(e.target.value);
                }}
                className={styles.textInput}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                placeholder="MM"
                aria-label="Minuta"
                value={params.minute}
                onChange={e => {
                  params.setMinute(e.target.value);
                }}
                className={styles.textInput}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                placeholder="SS"
                aria-label="Sekunda"
                value={params.second}
                onChange={e => {
                  params.setSecond(e.target.value);
                }}
                className={styles.textInput}
              />
            </div>
          </div>
        </div>
      </div>
    );
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
          {item.collectionNames && item.collectionNames.length > 0 ? (
            <div className={styles.cardSub}>📦 {item.collectionNames.join(', ')}</div>
          ) : (
            item.collectionName && (
              <div className={styles.cardSub}>📦 {item.collectionName}</div>
            )
          )}
        </div>
      )}
    </button>
  );

  // Point 15: No Edit/Delete buttons underneath folder tiles on the grid
  const renderFolderTilesGrid = (tiles: FolderTileItem[]) => (
    <div className={styles.folderTilesGrid} data-testid="gallery-grouped-sections">
      {tiles.map(tile => {
        const previews =
          tile.previewItems && tile.previewItems.length > 0
            ? tile.previewItems
            : tile.previewMediaId !== null && tile.previewMediaId !== undefined
              ? [{ id: tile.previewMediaId, mediaType: 'IMAGE' as MediaType }]
              : [];
        return (
          <button
            key={tile.key}
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
        );
      })}
    </div>
  );

  const renderDrillDownSection = (content: DrillDownViewData) => {
    const combinedViewable = [
      ...content.mediaItems,
      ...(content.subEventBuckets?.flatMap(b => b.items) ?? []),
    ];
    const activeColObj = content.activeCollectionId
      ? allCollections.find(c => c.id === content.activeCollectionId)
      : undefined;

    return (
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {content.activeEventId !== undefined && content.activeEventId !== null && (
                <Link
                  to={`/events/${String(content.activeEventId)}`}
                  data-testid={`gallery-go-to-event-${String(content.activeEventId)}`}
                  className={styles.btnPrimary}
                  style={{ textDecoration: 'none' }}
                >
                  📅 Przejdź do wydarzenia →
                </Link>
              )}

              {isAdmin && activeColObj && (
                <>
                  <button
                    type="button"
                    data-testid="link-existing-to-collection-button"
                    onClick={() => {
                      setLinkToCollectionId(activeColObj.id);
                    }}
                    className={styles.btnSecondary}
                  >
                    🔗 Przypisz istniejące z galerii
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleStartEditCollection(activeColObj);
                    }}
                    className={styles.btnSecondary}
                  >
                    ✏️ Edytuj {activeColObj.datedCollection ? 'album' : 'kolekcję'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCollectionToDelete({
                        id: activeColObj.id,
                        title: activeColObj.name,
                      });
                    }}
                    className={styles.btnDanger}
                  >
                    🗑️ Usuń {activeColObj.datedCollection ? 'album' : 'kolekcję'}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleStepBackDrillDown}
                className={styles.btnSecondary}
              >
                ← Wróć wyżej
              </button>
            </div>
          </div>
        )}

        {content.tiles.length > 0 && renderFolderTilesGrid(content.tiles)}

        {content.mediaItems.length > 0 && (
          <div className={styles.mediaGrid}>
            {content.mediaItems.map(item => renderMediaTile(item, combinedViewable))}
          </div>
        )}

        {content.subEventBuckets?.map(sub => (
          <div
            key={sub.subEventId}
            className={styles.subEventGroupBox}
            data-testid={`gallery-subevent-section-${String(sub.subEventId)}`}
          >
            <div className={styles.subEventHeader}>
              <span className={styles.subEventTitle}>
                ↳ Zdjęcia i filmy z podwydarzenia: {sub.subEventLabel} (
                {String(sub.items.length)})
              </span>
              <Link
                to={`/events/${String(sub.subEventId)}`}
                className={styles.btnSecondary}
                style={{ textDecoration: 'none' }}
              >
                📅 Przejdź do podwydarzenia →
              </Link>
            </div>
            <div className={styles.mediaGrid}>
              {sub.items.map(item => renderMediaTile(item, combinedViewable))}
            </div>
          </div>
        ))}

        {content.tiles.length === 0 &&
          content.mediaItems.length === 0 &&
          (!content.subEventBuckets || content.subEventBuckets.length === 0) && (
            <div className={styles.pageHeader}>
              <p className={styles.pageSubtitle}>Brak zdjęć i filmów w tym widoku.</p>
            </div>
          )}
      </div>
    );
  };

  const currentContextItemsForBulk: MediaItemDto[] =
    viewMode === 'TIMELINE' && timelineViewContent.mediaItems.length > 0
      ? timelineViewContent.mediaItems
      : viewMode === 'COLLECTION' && collectionViewContent.mediaItems.length > 0
        ? collectionViewContent.mediaItems
        : allItems;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Galeria zdjęć i filmów</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj fotografie oraz nagrania rodzinne według daty dodania, daty wykonania
            (dekad, lat, wydarzeń i kolekcji datowanych), osób, nagrobków oraz kolekcji
            archiwalnych.
          </p>
        </div>
        <div className={styles.headerRight}>
          {pageData && (
            <div className={styles.statsBadge}>
              Zdjęcia: <strong>{pageData.totalImagesCount}</strong> • Filmy:{' '}
              <strong>{pageData.totalVideosCount}</strong>
              {pageData.totalAudiosCount !== undefined && (
                <>
                  {' '}
                  • Dźwięki: <strong>{pageData.totalAudiosCount}</strong>
                </>
              )}
            </div>
          )}
          {isAdmin && (
            <>
              <button
                type="button"
                data-testid="open-gallery-upload-button"
                onClick={() => {
                  setShowUploadModal(true);
                }}
                className={styles.btnPrimary}
              >
                + Wgraj zdjęcia, filmy lub dźwięki
              </button>
              <button
                type="button"
                data-testid="open-create-collection-button"
                onClick={() => {
                  resetCollectionForm();
                  setShowCreateCollection(true);
                }}
                className={styles.btnSecondary}
              >
                + Nowa kolekcja / album datowany
              </button>
              {currentContextItemsForBulk.length > 0 && (
                <button
                  type="button"
                  data-testid="open-gallery-bulk-edit-button"
                  onClick={() => {
                    setShowBulkEditModal(true);
                  }}
                  className={styles.btnSecondary}
                >
                  ☑️ Edycja zbiorowa / Przenieś pliki
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* LARGE MODAL: CREATE / EDIT COLLECTION OR DATED ALBUM */}
      {isAdmin && showCreateCollection && (
        <div
          className={styles.modalBackdrop}
          data-testid="create-collection-form"
          onClick={() => {
            setShowCreateCollection(false);
          }}
        >
          <div
            className={styles.largeModalDialog}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.groupTitle}>
                {editingCollectionId !== null
                  ? 'Edytuj kolekcję archiwalną lub album datowany'
                  : 'Utwórz nową kolekcję archiwalną, podkolekcję lub album datowany'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateCollection(false);
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>

            <div className={styles.modalBody}>
              <form
                onSubmit={e => {
                  void handleSaveCollection(e);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
              >
                <div className={styles.filtersRow}>
                  <div className={styles.filterField} style={{ flex: '1 1 240px' }}>
                    <label htmlFor="col-name-input" className={styles.filterLabel}>
                      Nazwa kolekcji / albumu *
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
                        Kolekcja nadrzędna (opcjonalnie)
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
                          .filter(
                            c =>
                              !c.datedCollection &&
                              (editingCollectionId === null || c.id !== editingCollectionId)
                          )
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
                    Opis tekstowy kolekcji / albumu
                  </label>
                  <textarea
                    id="col-desc-input"
                    rows={3}
                    value={colDesc}
                    onChange={e => {
                      setColDesc(e.target.value);
                    }}
                    className={styles.textareaInput}
                    placeholder="Wprowadź szczegółowy opis archiwalny lub wspomnienie dotyczące tej kolekcji..."
                  />
                </div>

                <div className={styles.filtersRow}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={colIsDated}
                      onChange={e => {
                        setColIsDated(e.target.checked);
                      }}
                    />
                    <span>
                      To jest Album datowany w folderze dated/ (np. „Zdjęcia codzienne z domu
                      rok 2002”)
                    </span>
                  </label>
                </div>

                {colIsDated && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      background: '#f8fafc',
                      padding: '0.95rem 1.1rem',
                      borderRadius: '10px',
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
                        borderBottom: '1px solid #e2e8f0',
                        paddingBottom: '0.5rem',
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        📅 Data i czas rozpoczęcia (lub jedyna data albumu)
                      </strong>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={colIsStartBetween}
                          onChange={e => {
                            setColIsStartBetween(e.target.checked);
                          }}
                        />
                        <span>Przedział niepewności „między … a …”</span>
                      </label>
                    </div>

                    {renderDateAndTimeBlock({
                      idPrefix: 'col-start',
                      dateQualLabel: 'Kwalifikator daty',
                      dateQual: colStartQual,
                      setDateQual: setColStartQual,
                      year: colStartYear,
                      setYear: setColStartYear,
                      month: colStartMonth,
                      setMonth: setColStartMonth,
                      day: colStartDay,
                      setDay: setColStartDay,
                      timeQual: colStartTimeQual,
                      setTimeQual: setColStartTimeQual,
                      hour: colStartHour,
                      setHour: setColStartHour,
                      minute: colStartMinute,
                      setMinute: setColStartMinute,
                      second: colStartSecond,
                      setSecond: setColStartSecond,
                      requiredYear: true,
                    })}

                    {colIsStartBetween && (
                      <div style={{ paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
                        {renderDateAndTimeBlock({
                          idPrefix: 'col-start-range-end',
                          dateQualLabel: 'Druga granica („… a …”)',
                          dateQual: colStartRangeEndQual,
                          setDateQual: setColStartRangeEndQual,
                          year: colStartRangeEndYear,
                          setYear: setColStartRangeEndYear,
                          month: colStartRangeEndMonth,
                          setMonth: setColStartRangeEndMonth,
                          day: colStartRangeEndDay,
                          setDay: setColStartRangeEndDay,
                          timeQual: colStartRangeEndTimeQual,
                          setTimeQual: setColStartRangeEndTimeQual,
                          hour: colStartRangeEndHour,
                          setHour: setColStartRangeEndHour,
                          minute: colStartRangeEndMinute,
                          setMinute: setColStartRangeEndMinute,
                          second: colStartRangeEndSecond,
                          setSecond: setColStartRangeEndSecond,
                        })}
                      </div>
                    )}

                    <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontSize: '0.83rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={colHasEndDate}
                          onChange={e => {
                            setColHasEndDate(e.target.checked);
                          }}
                        />
                        <span>
                          Album obejmuje okres czasu – dodaj datę lub godzinę zakończenia („od
                          … do …”)
                        </span>
                      </label>
                    </div>

                    {colHasEndDate && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid #cbd5e1',
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
                          <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                            🏁 Data i czas zakończenia („do …”)
                          </strong>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={colIsEndBetween}
                              onChange={e => {
                                setColIsEndBetween(e.target.checked);
                              }}
                            />
                            <span>Przedział niepewności „między … a …” dla końca</span>
                          </label>
                        </div>

                        {renderDateAndTimeBlock({
                          idPrefix: 'col-end',
                          dateQualLabel: 'Kwalifikator daty końcowej',
                          dateQual: colEndQual,
                          setDateQual: setColEndQual,
                          year: colEndYear,
                          setYear: setColEndYear,
                          month: colEndMonth,
                          setMonth: setColEndMonth,
                          day: colEndDay,
                          setDay: setColEndDay,
                          timeQual: colEndTimeQual,
                          setTimeQual: setColEndTimeQual,
                          hour: colEndHour,
                          setHour: setColEndHour,
                          minute: colEndMinute,
                          setMinute: setColEndMinute,
                          second: colEndSecond,
                          setSecond: setColEndSecond,
                        })}

                        {colIsEndBetween && (
                          <div
                            style={{ paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}
                          >
                            {renderDateAndTimeBlock({
                              idPrefix: 'col-end-range-end',
                              dateQualLabel: 'Druga granica końca („… a …”)',
                              dateQual: colEndRangeEndQual,
                              setDateQual: setColEndRangeEndQual,
                              year: colEndRangeEndYear,
                              setYear: setColEndRangeEndYear,
                              month: colEndRangeEndMonth,
                              setMonth: setColEndRangeEndMonth,
                              day: colEndRangeEndDay,
                              setDay: setColEndRangeEndDay,
                              timeQual: colEndRangeEndTimeQual,
                              setTimeQual: setColEndRangeEndTimeQual,
                              hour: colEndRangeEndHour,
                              setHour: setColEndRangeEndHour,
                              minute: colEndRangeEndMinute,
                              setMinute: setColEndRangeEndMinute,
                              second: colEndRangeEndSecond,
                              setSecond: setColEndRangeEndSecond,
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateCollection(false);
                      resetCollectionForm();
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
                    {editingCollectionId !== null
                      ? 'Zapisz zmiany w kolekcji'
                      : 'Utwórz kolekcję'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SHARED UPLOAD & BULK-EDIT MODALS FROM MediaGallerySection */}
      {isAdmin && (showUploadModal || showBulkEditModal) && (
        <MediaGallerySection
          context="COLLECTION"
          collectionId={
            selectedCollectionId ??
            (viewMode === 'TIMELINE' ? timelineViewContent.activeCollectionId : null)
          }
          defaultPersonIds={selectedPersons.map(p => p.id)}
          isAdmin={isAdmin}
          sectionTitle="Galeria"
          hideSectionChrome={true}
          externalOpenUpload={showUploadModal}
          onExternalCloseUpload={() => {
            setShowUploadModal(false);
          }}
          externalOpenBulkEdit={showBulkEditModal}
          onExternalCloseBulkEdit={() => {
            setShowBulkEditModal(false);
          }}
          externalItems={currentContextItemsForBulk}
          onMediaChanged={() => {
            void fetchGallery();
          }}
        />
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
              <option value="ALL">
                Wszystkie (wg daty dodania – rozwinięte wstążki)
              </option>
              <option value="TIMELINE">
                Data wykonania (dekady › lata › wydarzenia / kolekcje datowane / inne)
              </option>
              <option value="PERSON">
                Osoby (kafelki osób › portrety / powiązane / inne)
              </option>
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
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
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
      ) : !pageData ||
        (pageData.content.length === 0 &&
          viewMode !== 'COLLECTION' &&
          viewMode !== 'TIMELINE') ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak zdjęć i filmów spełniających wybrane kryteria.
          </p>
        </div>
      ) : viewMode === 'ALL' ? (
        allItems.length === 0 ? (
          <div className={styles.pageHeader}>
            <p className={styles.pageSubtitle}>
              Brak zdjęć i filmów spełniających wybrane kryteria.
            </p>
          </div>
        ) : (
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
        )
      ) : viewMode === 'TIMELINE' ? (
        renderDrillDownSection(timelineViewContent)
      ) : viewMode === 'PERSON' ? (
        renderDrillDownSection(personViewContent)
      ) : viewMode === 'GRAVE' ? (
        renderDrillDownSection(graveViewContent)
      ) : (
        renderDrillDownSection(collectionViewContent)
      )}

      <MediaItemLightboxModal
        items={activeLightboxList}
        activeIndex={activeIndex}
        context="COLLECTION"
        collectionId={
          selectedCollectionId ??
          (viewMode === 'TIMELINE' ? timelineViewContent.activeCollectionId : null)
        }
        isAdmin={isAdmin}
        onClose={() => {
          setActiveIndex(null);
        }}
        onNavigateIndex={nextIdx => {
          setActiveIndex(nextIdx);
        }}
        onMediaUpdated={async () => {
          await fetchGallery();
        }}
      />

      <GalleryBrowserModal
        isOpen={linkToCollectionId !== null}
        mode="multiple"
        title="🔗 Przypisz istniejące pliki z galerii (np. z wydarzeń) do tej kolekcji"
        excludeMediaIds={allItems
          .filter(i =>
            linkToCollectionId !== null ? itemBelongsToCollection(i, linkToCollectionId) : false
          )
          .map(i => i.id)}
        onClose={() => {
          setLinkToCollectionId(null);
        }}
        onConfirmSelection={ids => {
          void handleConfirmLinkToCollection(ids);
        }}
      />

      {collectionToDelete && (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            setCollectionToDelete(null);
          }}
        >
          <div
            className={styles.smallModalDialog}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>
              🗑️ Usunąć kolekcję / album?
            </h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
              Czy na pewno chcesz usunąć{' '}
              <strong>„{collectionToDelete.title}”</strong>?
              <br />
              Jeśli znajdują się w niej pliki przypisane wyłącznie do niej, musisz je
              najpierw przenieść lub usunąć.
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
                data-testid="confirm-delete-collection-button"
                onClick={() => {
                  void handleConfirmDeleteCollection();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
