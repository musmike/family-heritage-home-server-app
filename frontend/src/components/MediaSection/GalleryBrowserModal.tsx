import { useState, useEffect, useMemo } from 'react';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { Pagination } from '../Pagination/Pagination';
import Loader from '../Loader/Loader';
import styles from './MediaGallerySection.module.css';
import type {
  MediaCollectionDto,
  MediaItemDto,
  MediaType,
} from '../../types/media';
import type { PersonListItemDto } from '../../types/biography';

interface GalleryBrowserModalProps {
  isOpen: boolean;
  mode: 'multiple' | 'single';
  title?: string;
  excludeMediaIds?: number[];
  isSubmitting?: boolean;
  headerBanner?: React.ReactNode;
  onClose: () => void;
  onConfirmSelection: (selectedIds: number[]) => void;
}

interface FolderTileItem {
  key: string;
  title: string;
  subtitle?: string;
  count: number;
  previewItems: { id: number; mediaType: MediaType }[];
  onClick: () => void;
}

const getTopPreviewItems = (
  list: MediaItemDto[]
): { id: number; mediaType: MediaType }[] =>
  list.slice(0, 4).map(m => ({ id: m.id, mediaType: m.mediaType }));

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

const EMPTY_IDS: number[] = [];

export default function GalleryBrowserModal({
  isOpen,
  mode,
  title = '🔗 Wybierz istniejące zdjęcia, filmy lub nagrania z galerii',
  excludeMediaIds = EMPTY_IDS,
  isSubmitting = false,
  headerBanner,
  onClose,
  onConfirmSelection,
}: GalleryBrowserModalProps) {
  const [viewMode, setViewMode] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [mediaType, setMediaType] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('NEWEST_UPLOAD');
  const [page, setPage] = useState<number>(0);

  const [allItems, setAllItems] = useState<MediaItemDto[]>([]);
  const [allCollections, setAllCollections] = useState<MediaCollectionDto[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Drill-down navigation states
  const [selectedDecade, setSelectedDecade] = useState<number | 'UNDATED_EVENTS' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedYearBucketKey, setSelectedYearBucketKey] = useState<string | null>(null);
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
  const [selectedPersonCategory, setSelectedPersonCategory] = useState<string | null>(null);
  const [selectedCemeteryName, setSelectedCemeteryName] = useState<string | null>(null);
  const [selectedGraveId, setSelectedGraveId] = useState<number | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedCollectionSubfolder, setSelectedCollectionSubfolder] = useState<string | null>(null);

  // Multi-person filter
  const [selectedPersons, setSelectedPersons] = useState<{ id: number; name: string }[]>([]);
  const [matchAllPersons, setMatchAllPersons] = useState<boolean>(true);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<PersonListItemDto[]>([]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

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

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchItems = async () => {
      setIsLoading(true);
      try {
        const res = await mediaApi.getGalleryPage({
          search,
          mediaType,
          primaryContext: 'ALL',
          personIds: selectedPersons.map(p => p.id),
          matchAllPersons,
          sortBy: viewMode === 'ALL' ? sortBy : 'YEAR_ASC',
          page: viewMode === 'ALL' ? page : 0,
          size: viewMode === 'ALL' ? 24 : 2000,
        });
        const excludedSet = new Set(excludeMediaIds);
        setAllItems(res.content.filter(item => !excludedSet.has(item.id)));
        setAllCollections(res.collections);
        setTotalPages(res.totalPages);
      } catch {
        setAllItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchItems();
  }, [isOpen, search, mediaType, viewMode, selectedPersons, matchAllPersons, sortBy, page]);

  const handleSearchPersonFilter = async () => {
    if (personQuery.trim() === '') return;
    try {
      const res = await biographyApi.listPeople({
        search: personQuery.trim(),
        includeArchived: true,
        page: 0,
        size: 8,
      });
      setPersonResults(res.content);
    } catch {
      setPersonResults([]);
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

  const toggleSelectMedia = (id: number) => {
    if (mode === 'single') {
      onConfirmSelection([id]);
      return;
    }
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const uploadDateRibbons = useMemo(() => {
    if (viewMode !== 'ALL') return [];
    const map = new Map<string, { key: string; title: string; items: MediaItemDto[] }>();
    for (const item of allItems) {
      const dayKey = item.createdAt ? item.createdAt.slice(0, 10) : 'UNKNOWN';
      const ribbonTitle = item.createdAt
        ? `📅 Dodano: ${formatPolishUploadDay(item.createdAt)}`
        : '📅 Data dodania nieznana';
      const existing = map.get(dayKey);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(dayKey, { key: dayKey, title: ribbonTitle, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [allItems, viewMode]);

  const getEffectiveTimelineYear = (item: MediaItemDto): number | null => {
    const rootYears = item.rootEventStartYears ?? item.eventStartYears;
    if (rootYears && rootYears.length > 0 && (rootYears.at(0) ?? -1) > 0) {
      return rootYears.at(0) ?? null;
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
        const eId = (item.rootEventIds ?? item.eventIds)?.at(0);
        const eLbl = (item.rootEventLabels ?? item.eventLabels)?.at(0) ?? 'Wydarzenie bez daty';
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
          onClick: () => {
            setSelectedYearBucketKey(`UEVT_${String(eId)}`);
          },
        }));
        return { tiles, mediaItems: [], breadcrumb: ['Data wykonania', 'Wydarzenia bez daty'] };
      }
      const chosenEvtId = Number(selectedYearBucketKey.replace('UEVT_', ''));
      const chosenData = evtMap.get(chosenEvtId);
      return {
        tiles: [],
        mediaItems: chosenData?.list ?? [],
        breadcrumb: ['Data wykonania', 'Wydarzenia bez daty', chosenData?.label ?? 'Wydarzenie'],
      };
    }

    const inDecade = datedItems.filter(d => Math.floor(d.effYear / 10) * 10 === selectedDecade);
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
          onClick: () => {
            setSelectedYear(yr);
          },
        }));
      return {
        tiles,
        mediaItems: [],
        breadcrumb: ['Data wykonania', `Lata ${String(selectedDecade)}–${String(selectedDecade + 9)}`],
      };
    }

    const inYear = inDecade.filter(d => d.effYear === selectedYear).map(d => d.item);
    const buckets = new Map<string, { title: string; subtitle: string; list: MediaItemDto[] }>();
    const miscItems: MediaItemDto[] = [];

    for (const item of inYear) {
      const rIds = item.rootEventIds ?? item.eventIds;
      const rLabels = item.rootEventLabels ?? item.eventLabels;
      if (rIds && rIds.length > 0 && rIds.at(0) !== undefined) {
        const eId = rIds.at(0) ?? 0;
        const eLbl = rLabels?.at(0) ?? 'Wydarzenie';
        const bKey = `EVT_${String(eId)}`;
        const ex = buckets.get(bKey);
        if (ex) {
          ex.list.push(item);
        } else {
          buckets.set(bKey, { title: eLbl, subtitle: '📅 Wydarzenie rodzinne', list: [item] });
        }
      } else if (item.datedCollectionItem && item.collectionId && item.collectionName) {
        const bKey = `DCOL_${String(item.collectionId)}`;
        const ex = buckets.get(bKey);
        if (ex) {
          ex.list.push(item);
        } else {
          buckets.set(bKey, { title: item.collectionName, subtitle: '📂 Album datowany', list: [item] });
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
      const tiles: FolderTileItem[] = Array.from(buckets.entries()).map(([bKey, data]) => ({
        key: bKey,
        title: data.title,
        subtitle: data.subtitle,
        count: data.list.length,
        previewItems: getTopPreviewItems(data.list),
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
      const isPortraitItem = item.portrait === true || item.primaryContext === 'PERSON';

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
          onClick: () => {
            setSelectedPersonCategory(c.catKey);
          },
        }));
      return { tiles, mediaItems: [], breadcrumb: ['Osoby', chosenPerson.displayName] };
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
      breadcrumb: ['Osoby', chosenPerson.displayName, chosenCat?.label ?? 'Wybrana kategoria'],
    };
  }, [allItems, viewMode, selectedPersonKey, selectedPersonCategory]);

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
    const cemMap = new Map<string, Map<number, { graveLabel: string; list: MediaItemDto[] }>>();

    for (const item of graveItems) {
      const gIds = item.graveIds;
      const gLabels = item.graveLabels ?? [];
      const cNames = item.cemeteryNames ?? [];
      for (let i = 0; i < gIds.length; i++) {
        const gId = gIds[i];
        const cemName = i < cNames.length ? cNames[i] : (cNames.at(0) ?? 'Inne');
        const gLabel = i < gLabels.length ? gLabels[i] : 'Grób rodzinny';
        const gravesInCem =
          cemMap.get(cemName) ?? new Map<number, { graveLabel: string; list: MediaItemDto[] }>();
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
      const tiles: FolderTileItem[] = Array.from(cemMap.entries()).map(([cemName, gravesMap]) => {
        const allInCem = Array.from(gravesMap.values()).flatMap(g => g.list);
        return {
          key: `CEM_${cemName}`,
          title: `🪦 ${cemName}`,
          subtitle: `Nagrobki ze zdjęciami: ${String(gravesMap.size)}`,
          count: allInCem.length,
          previewItems: getTopPreviewItems(allInCem),
          onClick: () => {
            setSelectedCemeteryName(cemName);
          },
        };
      });
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
          onClick: () => {
            setSelectedGraveId(gId);
          },
        })
      );
      return { tiles, mediaItems: [], breadcrumb: ['Nagrobki', selectedCemeteryName] };
    }

    const chosenGrave = gravesInChosenCem.get(selectedGraveId);
    return {
      tiles: [],
      mediaItems: chosenGrave?.list ?? [],
      breadcrumb: ['Nagrobki', selectedCemeteryName, chosenGrave?.graveLabel ?? 'Nagrobek'],
    };
  }, [allItems, viewMode, selectedCemeteryName, selectedGraveId]);

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
          subtitle: col.description ?? 'Kolekcja archiwalna',
          count: treeMedia.length,
          previewItems: getTopPreviewItems(treeMedia),
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
    const directColMedia = allItems.filter(i => i.collectionId === selectedCollectionId);

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
      i => !i.portrait && i.primaryContext !== 'PERSON' && !i.unknownMedia
    );

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
          onClick: () => {
            setSelectedCollectionId(ch.id);
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
      SINGLE_PORTRAIT: { label: 'Portrety jednoosobowe', list: singlePortraits },
      GROUP_PORTRAIT: { label: 'Portrety grupowe', list: groupPortraits },
      UNKNOWN: { label: 'Nieznane', list: unknownMedia },
    };
    const chosenSub = subMap[selectedCollectionSubfolder];
    return {
      tiles: [],
      mediaItems: chosenSub?.list ?? [],
      breadcrumb: ['Kolekcje', currentCol?.name ?? 'Kolekcja', chosenSub?.label ?? 'Podfolder'],
    };
  }, [allItems, allCollections, viewMode, selectedCollectionId, selectedCollectionSubfolder]);

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
      if (selectedCollectionSubfolder !== null) {
        setSelectedCollectionSubfolder(null);
      } else if (selectedCollectionId !== null) {
        const currentCol = allCollections.find(c => c.id === selectedCollectionId);
        setSelectedCollectionId(currentCol?.parentCollectionId ?? null);
      }
    }
  };

  if (!isOpen) return null;

  const renderMediaCandidateTile = (cand: MediaItemDto) => {
    const isChecked = selectedIds.includes(cand.id);
    return (
      <div key={cand.id} className={styles.mediaTileWrapper}>
        <button
          type="button"
          data-testid={`existing-gallery-candidate-${String(cand.id)}`}
          disabled={isSubmitting}
          onClick={() => {
            toggleSelectMedia(cand.id);
          }}
          className={`${styles.mediaTile} ${isChecked ? styles.mediaTileSelected : ''}`}
        >
          <div className={styles.thumbWrapper}>
            {cand.mediaType === 'IMAGE' ? (
              <img
                src={mediaApi.getThumbnailUrl(cand.id)}
                alt={cand.title ?? ''}
                className={styles.thumbImage}
              />
            ) : cand.mediaType === 'VIDEO' ? (
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
                <span style={{ fontSize: '2.4rem' }}>🎵</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Audio
                </span>
              </div>
            )}
            {isChecked && <span className={styles.primaryBadge}>✓ Wybrano</span>}
            {(cand.dateText ?? cand.year) && (
              <span className={styles.dateCornerBadge}>{cand.dateText ?? cand.year}</span>
            )}
          </div>
          {Boolean(
            cand.title ?? (cand.personNames && cand.personNames.length > 0) ?? cand.collectionName
          ) && (
            <div className={styles.tileBody}>
              {cand.title && <div className={styles.tileTitle}>{cand.title}</div>}
              {cand.personNames && cand.personNames.length > 0 && (
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  👤 {cand.personNames.join(', ')}
                </div>
              )}
              {cand.collectionName && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: '#475569',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📦 {cand.collectionName}
                </div>
              )}
            </div>
          )}
        </button>
      </div>
    );
  };

  const renderDrillDownContent = (content: {
    tiles: FolderTileItem[];
    mediaItems: MediaItemDto[];
    breadcrumb: string[];
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {content.breadcrumb.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.65rem 0.9rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
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

      {content.tiles.length > 0 && (
        <div className={styles.mediaGrid}>
          {content.tiles.map(tile => (
            <button
              key={tile.key}
              type="button"
              onClick={tile.onClick}
              className={styles.mediaTile}
            >
              <div className={styles.thumbWrapper}>
                {tile.previewItems.length > 0 ? (
                  tile.previewItems[0].mediaType === 'IMAGE' ? (
                    <img
                      src={mediaApi.getThumbnailUrl(tile.previewItems[0].id)}
                      alt=""
                      className={styles.thumbImage}
                    />
                  ) : tile.previewItems[0].mediaType === 'VIDEO' ? (
                    <video
                      src={`${mediaApi.getFileUrl(tile.previewItems[0].id)}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className={styles.thumbImage}
                    />
                  ) : (
                    <span style={{ fontSize: '2.2rem', color: '#ffffff' }}>🎵</span>
                  )
                ) : (
                  <span style={{ fontSize: '2.2rem', color: '#cbd5e1' }}>📁</span>
                )}
                <span className={styles.dateCornerBadge}>Pliki: {String(tile.count)}</span>
              </div>
              <div className={styles.tileBody}>
                <div className={styles.tileTitle}>{tile.title}</div>
                {tile.subtitle && (
                  <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{tile.subtitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {content.mediaItems.length > 0 && (
        <div className={styles.mediaGrid}>
          {content.mediaItems.map(item => renderMediaCandidateTile(item))}
        </div>
      )}

      {content.tiles.length === 0 && content.mediaItems.length === 0 && (
        <p className={styles.emptyText}>Brak plików w tym widoku.</p>
      )}
    </div>
  );

  return (
    <div
      className={styles.modalBackdrop}
      data-testid="link-existing-media-modal"
      onClick={onClose}
    >
      <div
        className={styles.modalDialog}
        style={{ maxWidth: '1080px' }}
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <div className={styles.modalHeader}>
          <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{title}</strong>
          <button type="button" onClick={onClose} className={styles.btnSecondary}>
            ✕ Zamknij
          </button>
        </div>

        <div className={styles.modalBody}>
          {headerBanner}

          {/* Full Gallery View & Filters Bar */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label htmlFor="modal-gal-view-select" className={styles.label}>
                  Widok / Kategoria tematyczna
                </label>
                <select
                  id="modal-gal-view-select"
                  value={viewMode}
                  onChange={e => {
                    setViewMode(e.target.value);
                    resetDrillDown();
                    setPage(0);
                  }}
                  className={styles.input}
                >
                  <option value="ALL">Wszystkie (wg daty dodania)</option>
                  <option value="TIMELINE">Data wykonania (dekady › lata › wydarzenia)</option>
                  <option value="PERSON">Osoby (osoby › portrety / powiązane / inne)</option>
                  <option value="GRAVE">Nagrobki (cmentarze › groby)</option>
                  <option value="COLLECTION">Kolekcje (kolekcje › podkolekcje)</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="modal-gal-search-input" className={styles.label}>
                  Wyszukaj
                </label>
                <input
                  id="modal-gal-search-input"
                  type="text"
                  placeholder="Podpis, osoba, wydarzenie, cmentarz, kolekcja..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className={styles.input}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="modal-gal-type-select" className={styles.label}>
                  Typ mediów
                </label>
                <select
                  id="modal-gal-type-select"
                  value={mediaType}
                  onChange={e => {
                    setMediaType(e.target.value);
                    setPage(0);
                  }}
                  className={styles.input}
                >
                  <option value="ALL">Wszystkie typy</option>
                  <option value="IMAGE">Tylko zdjęcia</option>
                  <option value="VIDEO">Tylko filmy</option>
                  <option value="AUDIO">Tylko nagrania audio</option>
                </select>
              </div>

              {viewMode === 'ALL' && (
                <div className={styles.formField}>
                  <label htmlFor="modal-gal-sort-select" className={styles.label}>
                    Kolejność dodania
                  </label>
                  <select
                    id="modal-gal-sort-select"
                    value={sortBy}
                    onChange={e => {
                      setSortBy(e.target.value);
                      setPage(0);
                    }}
                    className={styles.input}
                  >
                    <option value="NEWEST_UPLOAD">Od ostatnio dodanych</option>
                    <option value="OLDEST_UPLOAD">Od najwcześniej dodanych</option>
                  </select>
                </div>
              )}
            </div>

            {/* Multi-Person Filter */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <span className={styles.label}>Filtruj według osób:</span>
              <input
                type="text"
                placeholder="Wpisz imię lub nazwisko..."
                value={personQuery}
                onChange={e => {
                  setPersonQuery(e.target.value);
                }}
                className={styles.input}
                style={{ maxWidth: '200px', height: '32px' }}
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
                    gap: '0.35rem',
                    fontSize: '0.8rem',
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
                <span key={sp.id} className={styles.selectedFilesBadge}>
                  👤 {sp.name}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersons(prev => prev.filter(item => item.id !== sp.id));
                      setPage(0);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontWeight: 800,
                      marginLeft: '0.25rem',
                    }}
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
          </div>

          {isLoading ? (
            <Loader size={36} />
          ) : allItems.length === 0 ? (
            <p className={styles.emptyText}>
              Brak dostępnych plików w galerii spełniających kryteria wyszukiwania.
            </p>
          ) : viewMode === 'ALL' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {uploadDateRibbons.map(ribbon => (
                  <div
                    key={ribbon.key}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                      {ribbon.title} ({String(ribbon.items.length)})
                    </strong>
                    <div className={styles.mediaGrid}>
                      {ribbon.items.map(cand => renderMediaCandidateTile(cand))}
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={p => {
                    setPage(p);
                  }}
                />
              )}
            </>
          ) : viewMode === 'TIMELINE' ? (
            renderDrillDownContent(timelineViewContent)
          ) : viewMode === 'PERSON' ? (
            renderDrillDownContent(personViewContent)
          ) : viewMode === 'GRAVE' ? (
            renderDrillDownContent(graveViewContent)
          ) : (
            renderDrillDownContent(collectionViewContent)
          )}
        </div>

        {mode === 'multiple' && (
          <div className={styles.modalFooter}>
            <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
              Wybrano plików: <strong>{String(selectedIds.length)}</strong>
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={onClose} className={styles.btnSecondary}>
                Anuluj
              </button>
              <button
                type="button"
                data-testid="confirm-link-existing-media-button"
                disabled={selectedIds.length === 0 || isSubmitting}
                onClick={() => {
                  onConfirmSelection(selectedIds);
                }}
                className={styles.btnPrimary}
              >
                ✓ Przypisz wybrane ({String(selectedIds.length)})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
