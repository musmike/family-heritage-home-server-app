import { useState, useEffect, useId, useMemo, use } from 'react';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import styles from './GalleryPage.module.css';
import type {
  MediaCollectionDto,
  MediaGalleryPageDto,
  MediaItemDto,
  MediaPrimaryContext,
} from '../../types/media';
import type { PersonListItemDto } from '../../types/biography';

interface FolderTileItem {
  key: string;
  title: string;
  subtitle?: string;
  count: number;
  previewMediaId: number | null;
  isTextPerson?: boolean;
  collectionId?: number;
  onClick: () => void;
}

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

  // Admin Create Collection / Sub-collection / Dated Collection Form
  const [showCreateCollection, setShowCreateCollection] = useState<boolean>(false);
  const [colName, setColName] = useState<string>('');
  const [colSlug, setColSlug] = useState<string>('');
  const [colDesc, setColDesc] = useState<string>('');
  const [colParentId, setColParentId] = useState<string>('');
  const [colIsDated, setColIsDated] = useState<boolean>(false);
  const [colStartYear, setColStartYear] = useState<string>('');
  const [colEndYear, setColEndYear] = useState<string>('');

  // Admin Single & Batch Upload Form
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadContext: MediaPrimaryContext = 'COLLECTION';
  const [uploadCollectionId, setUploadCollectionId] = useState<string>('');
  const [uploadIsPortrait, setUploadIsPortrait] = useState<boolean>(false);
  const [uploadIsUnknown, setUploadIsUnknown] = useState<boolean>(false);
  const [uploadYear, setUploadYear] = useState<string>('');
  const [uploadMonth, setUploadMonth] = useState<string>('');
  const [uploadDay, setUploadDay] = useState<string>('');
  const [uploadHour, setUploadHour] = useState<string>('');
  const [uploadMinute, setUploadMinute] = useState<string>('');
  const [uploadCustomName, setUploadCustomName] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState<string>('');

  // Fullscreen Lightbox state
  const [activeLightboxList, setActiveLightboxList] = useState<MediaItemDto[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);

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
            subtitle: '📂 Kolekcja datowana',
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

  const handleCreateCollection = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await mediaApi.createCollection({
        name: colName.trim(),
        customSlug: colSlug.trim() || null,
        description: colDesc.trim() || null,
        parentCollectionId: colParentId !== '' ? Number(colParentId) : null,
        datedCollection: colIsDated,
        startYear: colIsDated && colStartYear.trim() !== '' ? Number(colStartYear) : null,
        endYear: colIsDated && colEndYear.trim() !== '' ? Number(colEndYear) : null,
      });
      setColName('');
      setColSlug('');
      setColDesc('');
      setColParentId('');
      setColIsDated(false);
      setColStartYear('');
      setColEndYear('');
      setShowCreateCollection(false);
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się utworzyć kolekcji.');
    }
  };

  const handleGalleryUpload = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    const colIdNum = uploadCollectionId !== '' ? Number(uploadCollectionId) : undefined;
    const yearNum = uploadYear.trim() !== '' ? Number(uploadYear) : undefined;

    if (!yearNum && colIdNum === undefined) {
      setErrorMessage(
        'Dla zdjęć i filmów bez daty (lub portretów) wybierz kolekcję docelową, aby pliki nie trafiły luźno do folderu undated.'
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
          customYear: yearNum,
          customMonth: uploadMonth.trim() !== '' ? Number(uploadMonth) : undefined,
          customDay: uploadDay.trim() !== '' ? Number(uploadDay) : undefined,
          customHour: uploadHour.trim() !== '' ? Number(uploadHour) : undefined,
          customMinute: uploadMinute.trim() !== '' ? Number(uploadMinute) : undefined,
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

  const handleDeleteMediaItem = async (mediaId: number) => {
    try {
      await mediaApi.deleteMedia(mediaId);
      setActiveIndex(null);
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się usunąć pliku.');
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
        ) : (
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
      {tiles.map(tile => (
        <button
          key={tile.key}
          type="button"
          onClick={tile.onClick}
          className={`${styles.folderTileCard} ${
            tile.isTextPerson ? styles.folderTileTextPerson : ''
          }`}
        >
          <div className={styles.folderThumbBox}>
            {tile.previewMediaId !== null ? (
              <img
                src={mediaApi.getThumbnailUrl(tile.previewMediaId)}
                alt=""
                className={styles.thumbImg}
              />
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
      ))}
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
                + Wgraj zdjęcia lub filmy
              </button>
              <button
                type="button"
                data-testid="open-create-collection-button"
                onClick={() => {
                  setShowCreateCollection(prev => !prev);
                }}
                className={styles.btnSecondary}
              >
                + Nowa kolekcja / kolekcja datowana
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create Collection / Sub-collection / Dated Collection Form */}
      {isAdmin && showCreateCollection && (
        <section className={styles.sectionCard} data-testid="create-collection-form">
          <h2 className={styles.groupTitle}>
            Utwórz nową kolekcję archiwalną, podkolekcję lub kolekcję datowaną
          </h2>
          <form
            onSubmit={e => {
              void handleCreateCollection(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <div className={styles.filtersRow}>
              <div className={styles.filterField}>
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

              <div className={styles.filterField}>
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
                  {allCollections.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterField}>
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

              <div className={styles.filterField}>
                <label htmlFor="col-desc-input" className={styles.filterLabel}>
                  Opis kolekcji
                </label>
                <input
                  id="col-desc-input"
                  type="text"
                  value={colDesc}
                  onChange={e => {
                    setColDesc(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
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
                  To jest Kolekcja datowana w folderze dated/ (np. „Zdjęcia codzienne z domu rok 2002”)
                </span>
              </label>

              {colIsDated && (
                <>
                  <div className={styles.filterField}>
                    <label htmlFor="col-start-year" className={styles.filterLabel}>
                      Rok początkowy *
                    </label>
                    <input
                      id="col-start-year"
                      type="number"
                      required
                      placeholder="np. 2002"
                      value={colStartYear}
                      onChange={e => {
                        setColStartYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.filterField}>
                    <label htmlFor="col-end-year" className={styles.filterLabel}>
                      Rok końcowy (opcjonalnie)
                    </label>
                    <input
                      id="col-end-year"
                      type="number"
                      placeholder="np. 2003"
                      value={colEndYear}
                      onChange={e => {
                        setColEndYear(e.target.value);
                      }}
                      className={styles.textInput}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateCollection(false);
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
                Utwórz kolekcję
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Single & Batch Upload Form */}
      {isAdmin && showUploadForm && (
        <section className={styles.sectionCard} data-testid="gallery-upload-form">
          <h2 className={styles.groupTitle}>
            Wgraj jedno lub wiele zdjęć i filmów do archiwum
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
                    accept="image/*,video/*"
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

            <div className={styles.filtersRow}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={uploadIsPortrait}
                  onChange={e => {
                    setUploadIsPortrait(e.target.checked);
                    if (e.target.checked) setUploadIsUnknown(false);
                  }}
                />
                <span>Portret (trafi do podfolderu portraits/single lub portraits/group w kolekcji)</span>
              </label>

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
            </div>

            <div className={styles.filtersRow}>
              <div className={styles.filterField}>
                <label htmlFor="gal-upload-year" className={styles.filterLabel}>
                  Rok wykonania
                </label>
                <input
                  id="gal-upload-year"
                  type="number"
                  placeholder="np. 2002"
                  value={uploadYear}
                  onChange={e => {
                    setUploadYear(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-month" className={styles.filterLabel}>
                  Miesiąc (1–12)
                </label>
                <input
                  id="gal-upload-month"
                  type="number"
                  min={1}
                  max={12}
                  value={uploadMonth}
                  onChange={e => {
                    setUploadMonth(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-day" className={styles.filterLabel}>
                  Dzień (1–31)
                </label>
                <input
                  id="gal-upload-day"
                  type="number"
                  min={1}
                  max={31}
                  value={uploadDay}
                  onChange={e => {
                    setUploadDay(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Godzina (GG:MM)</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
              <option value="ALL">Zdjęcia i filmy</option>
              <option value="IMAGE">Tylko zdjęcia</option>
              <option value="VIDEO">Tylko filmy</option>
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

          <div className={styles.paginationBar}>
            <span className={styles.pageSubtitle}>
              Łącznie plików: <strong>{pageData.totalElements}</strong> (strona{' '}
              {pageData.totalPages === 0 ? 0 : pageData.page + 1} z {pageData.totalPages})
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => {
                  setPage(prev => Math.max(0, prev - 1));
                }}
                className={styles.btnSecondary}
              >
                ← Poprzednia
              </button>
              <button
                type="button"
                disabled={page + 1 >= pageData.totalPages}
                onClick={() => {
                  setPage(prev => prev + 1);
                }}
                className={styles.btnSecondary}
              >
                Następna →
              </button>
            </div>
          </div>
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
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteMediaItem(activeItem.id);
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
    </div>
  );
}