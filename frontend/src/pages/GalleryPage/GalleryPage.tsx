import { useState, useEffect, useId, useMemo, use } from 'react';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import styles from './GalleryPage.module.css';
import type {
  MediaGalleryPageDto,
  MediaItemDto,
  MediaPrimaryContext,
} from '../../types/media';
import type { PersonListItemDto } from '../../types/biography';

interface MediaGroupBucket {
  key: string;
  title: string;
  collectionId?: number;
  items: MediaItemDto[];
}

export default function GalleryPage() {
  const uploadInputId = useId();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [pageData, setPageData] = useState<MediaGalleryPageDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compact Filters
  const [search, setSearch] = useState<string>('');
  const [primaryContext, setPrimaryContext] = useState<string>('ALL');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [mediaType, setMediaType] = useState<string>('ALL');
  const [datedMode, setDatedMode] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('NEWEST_UPLOAD');
  const [page, setPage] = useState<number>(0);

  // Multi-Person Filter
  const [selectedPersons, setSelectedPersons] = useState<{ id: number; name: string }[]>([]);
  const [matchAllPersons, setMatchAllPersons] = useState<boolean>(true);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<PersonListItemDto[]>([]);

  // Admin Create Collection Form
  const [showCreateCollection, setShowCreateCollection] = useState<boolean>(false);
  const [colName, setColName] = useState<string>('');
  const [colSlug, setColSlug] = useState<string>('');
  const [colDesc, setColDesc] = useState<string>('');

  // Admin Direct Upload Form
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadContext, setUploadContext] = useState<MediaPrimaryContext>('COLLECTION');
  const [uploadCollectionId, setUploadCollectionId] = useState<number | null>(null);
  const [uploadYear, setUploadYear] = useState<string>('');
  const [uploadCustomName, setUploadCustomName] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState<string>('');

  // Fullscreen Lightbox state
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);

  const items = pageData?.content ?? [];
  const activeItem =
    activeIndex !== null && activeIndex >= 0 && activeIndex < items.length
      ? items[activeIndex]
      : null;

  const fetchGallery = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await mediaApi.getGalleryPage({
        search,
        mediaType,
        primaryContext,
        collectionId: selectedCollectionId,
        personIds: selectedPersons.map(p => p.id),
        matchAllPersons,
        datedMode,
        sortBy,
        page,
        size: 48,
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
  }, [
    search,
    mediaType,
    primaryContext,
    selectedCollectionId,
    selectedPersons,
    matchAllPersons,
    datedMode,
    sortBy,
    page,
  ]);

  // Group media automatically when a specific thematic category is selected
  const groupedSections = useMemo<MediaGroupBucket[] | null>(() => {
    if (!pageData || pageData.content.length === 0 || primaryContext === 'ALL') {
      return null;
    }

    const map = new Map<string, MediaGroupBucket>();
    const addToBucket = (key: string, title: string, item: MediaItemDto, colId?: number) => {
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, { key, title, collectionId: colId, items: [item] });
      }
    };

    for (const item of pageData.content) {
      if (primaryContext === 'PERSON') {
        const names = item.personNames ?? [];
        if (names.length === 0) {
          addToBucket('UNASSIGNED_PERSON', 'Osoby nieprzypisane', item);
        } else {
          for (const personName of names) {
            addToBucket(`PERSON_${personName}`, `👤 ${personName}`, item);
          }
        }
      } else if (primaryContext === 'GRAVE') {
        const cemeteries = item.cemeteryNames ?? [];
        if (cemeteries.length === 0) {
          addToBucket('CEM_OTHER', '🪦 Cmentarz: Inne', item);
        } else {
          for (const cemName of cemeteries) {
            addToBucket(`CEM_${cemName}`, `🪦 ${cemName}`, item);
          }
        }
      } else if (primaryContext === 'EVENT') {
        if (item.year !== undefined && item.year !== null) {
          const decade = Math.floor(item.year / 10) * 10;
          const key = `DEC_${String(decade)}_${String(item.year)}`;
          addToBucket(
            key,
            `📅 Lata ${String(decade)}–${String(decade + 9)} • Rok ${String(item.year)}`,
            item
          );
        } else {
          addToBucket('EVT_UNDATED', '📅 Wydarzenia bez ustalonego roku', item);
        }
      } else if (primaryContext === 'COLLECTION') {
        if (item.collectionName && item.collectionId) {
          addToBucket(
            `COL_${String(item.collectionId)}`,
            `📦 ${item.collectionName}`,
            item,
            item.collectionId
          );
        } else {
          addToBucket('COL_NONE', '📦 Pozostałe zbiory rodzinne', item);
        }
      } else {
        addToBucket('DEFAULT_GROUP', 'Pliki w wybranej kategorii', item);
      }
    }

    return Array.from(map.values());
  }, [pageData, primaryContext]);

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
      });
      setColName('');
      setColSlug('');
      setColDesc('');
      setShowCreateCollection(false);
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się utworzyć kolekcji archiwalnej.');
    }
  };

  const handleDeleteCollection = async (colId: number) => {
    try {
      await mediaApi.deleteCollection(colId);
      if (selectedCollectionId === colId) {
        setSelectedCollectionId(null);
      }
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się usunąć kolekcji.');
    }
  };

  const handleGalleryUpload = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      await mediaApi.uploadMedia({
        file: uploadFile,
        primaryContext: uploadContext,
        collectionId: uploadCollectionId ?? undefined,
        customYear: uploadYear.trim() !== '' ? Number(uploadYear) : undefined,
        customFileName: uploadCustomName.trim() || undefined,
        title: uploadTitle.trim() || undefined,
        personIds: selectedPersons.map(p => p.id),
      });
      setShowUploadForm(false);
      setUploadFile(null);
      setUploadCustomName('');
      setUploadTitle('');
      await fetchGallery();
    } catch {
      setErrorMessage('Nie udało się wgrać pliku do galerii.');
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

  const handleOpenItem = (item: MediaItemDto) => {
    const idx = items.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowDetailsDrawer(false);
  };

  const renderTile = (item: MediaItemDto) => (
    <button
      key={item.id}
      type="button"
      data-testid={`gallery-item-${String(item.id)}`}
      onClick={() => {
        handleOpenItem(item);
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
        {item.year && <span className={styles.yearBadge}>{item.year}</span>}
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

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Galeria zdjęć i filmów</h1>
          <p className={styles.pageSubtitle}>
            Przeglądaj fotografie oraz nagrania rodzinne według kategorii tematycznych, kolekcji archiwalnych, osi czasu oraz występujących na nich osób.
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
                + Wgraj zdjęcie lub film
              </button>
              <button
                type="button"
                data-testid="open-create-collection-button"
                onClick={() => {
                  setShowCreateCollection(prev => !prev);
                }}
                className={styles.btnSecondary}
              >
                + Nowa kolekcja archiwalna
              </button>
            </>
          )}
        </div>
      </div>

      {/* Admin Create Archive Collection Form */}
      {isAdmin && showCreateCollection && (
        <section className={styles.sectionCard} data-testid="create-collection-form">
          <h2 className={styles.groupTitle}>
            Utwórz nową kolekcję / zbiór archiwalny (folder w undated/collections/)
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
                  Nazwa kolekcji (np. Zbiór po babci Katarzynie) *
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
                <label htmlFor="col-slug-input" className={styles.filterLabel}>
                  Nazwa folderu na dysku (snake_case, opcjonalnie)
                </label>
                <input
                  id="col-slug-input"
                  type="text"
                  placeholder="np. katarzyna_kowalska_family_photos"
                  value={colSlug}
                  onChange={e => {
                    setColSlug(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="col-desc-input" className={styles.filterLabel}>
                  Opis zbioru
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

      {/* Admin Direct Upload Form (With Polish File Picker) */}
      {isAdmin && showUploadForm && (
        <section className={styles.sectionCard} data-testid="gallery-upload-form">
          <h2 className={styles.groupTitle}>Wgraj nowe zdjęcie lub film do archiwum</h2>
          <form
            onSubmit={e => {
              void handleGalleryUpload(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <div className={styles.filtersRow}>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Plik *</span>
                <div className={styles.filePickerRow}>
                  <label htmlFor={uploadInputId} className={styles.filePickerLabel}>
                    📂 Wybierz plik z dysku
                  </label>
                  <input
                    id={uploadInputId}
                    type="file"
                    accept="image/*,video/*"
                    onChange={e => {
                      setUploadFile(e.target.files?.[0] ?? null);
                    }}
                    className={styles.hiddenFileInput}
                  />
                  <span className={styles.selectedFileBadge}>
                    {uploadFile ? uploadFile.name : 'Nie wybrano pliku'}
                  </span>
                </div>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-context" className={styles.filterLabel}>
                  Główny kontekst zapisu na dysku
                </label>
                <select
                  id="gal-upload-context"
                  value={uploadContext}
                  onChange={e => {
                    setUploadContext(e.target.value as MediaPrimaryContext);
                  }}
                  className={styles.selectInput}
                >
                  <option value="COLLECTION">Kolekcja archiwalna (undated/collections/)</option>
                  <option value="OTHER">Zdjęcie z rokiem (dated/) lub ogólne (undated/)</option>
                  <option value="HEIRLOOM">Pamiątka rodzinna (undated/heirlooms/)</option>
                  <option value="LOCATION">Miejsce / budynek (undated/locations/)</option>
                </select>
              </div>

              {uploadContext === 'COLLECTION' && (
                <div className={styles.filterField}>
                  <label htmlFor="gal-upload-col" className={styles.filterLabel}>
                    Wybierz kolekcję
                  </label>
                  <select
                    id="gal-upload-col"
                    value={uploadCollectionId !== null ? String(uploadCollectionId) : ''}
                    onChange={e => {
                      const val = e.target.value;
                      setUploadCollectionId(val === '' ? null : Number(val));
                    }}
                    className={styles.selectInput}
                  >
                    <option value="">— Bez kolekcji (other_family_photos) —</option>
                    {(pageData?.collections ?? []).map(c => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.filterField}>
                <label htmlFor="gal-upload-year" className={styles.filterLabel}>
                  Rok wykonania (opcjonalnie, dla dated/)
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
                <label htmlFor="gal-upload-name" className={styles.filterLabel}>
                  Własna nazwa pliku (snake_case, opcjonalnie)
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
                disabled={!uploadFile}
                className={styles.btnPrimary}
              >
                Wgraj plik
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Compact Filters Bar (Category & Collection as compact selects!) */}
      <section className={styles.filterCard}>
        <div className={styles.filtersRow}>
          <div className={styles.filterField}>
            <label htmlFor="gal-search-input" className={styles.filterLabel}>
              Wyszukaj
            </label>
            <input
              id="gal-search-input"
              data-testid="gal-search-input"
              type="text"
              placeholder="Podpis, osoba, cmentarz..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className={styles.textInput}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor="gal-category-select" className={styles.filterLabel}>
              Kategoria tematyczna (i grupowanie)
            </label>
            <select
              id="gal-category-select"
              data-testid="gal-category-select"
              value={primaryContext}
              onChange={e => {
                setPrimaryContext(e.target.value);
                setPage(0);
              }}
              className={styles.selectInput}
            >
              <option value="ALL">Wszystkie kategorie</option>
              <option value="EVENT">Wydarzenia rodzinne (wg dekad i lat)</option>
              <option value="PERSON">Portrety i osoby (wg osób)</option>
              <option value="GRAVE">Nagrobki (wg cmentarzy)</option>
              <option value="COLLECTION">Kolekcje archiwalne (wg zbiorów)</option>
              <option value="HEIRLOOM">Pamiątki rodzinne</option>
              <option value="LOCATION">Miejsca i domy</option>
              <option value="OTHER">Pozostałe media</option>
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="gal-collection-select" className={styles.filterLabel}>
              Kolekcja / zbiór rodzinny
            </label>
            <select
              id="gal-collection-select"
              data-testid="gal-collection-select"
              value={selectedCollectionId !== null ? String(selectedCollectionId) : 'ALL'}
              onChange={e => {
                const val = e.target.value;
                setSelectedCollectionId(val === 'ALL' ? null : Number(val));
                setPage(0);
              }}
              className={styles.selectInput}
            >
              <option value="ALL">Wszystkie kolekcje</option>
              {(pageData?.collections ?? []).map(col => (
                <option key={col.id} value={String(col.id)}>
                  {col.name} ({col.mediaCount})
                </option>
              ))}
            </select>
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

          <div className={styles.filterField}>
            <label htmlFor="gal-dated-select" className={styles.filterLabel}>
              Obecność daty
            </label>
            <select
              id="gal-dated-select"
              value={datedMode}
              onChange={e => {
                setDatedMode(e.target.value);
                setPage(0);
              }}
              className={styles.selectInput}
            >
              <option value="ALL">Wszystkie</option>
              <option value="DATED_ONLY">Tylko z rokiem</option>
              <option value="UNDATED_ONLY">Tylko bez daty</option>
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="gal-sort-select" className={styles.filterLabel}>
              Sortowanie
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
              <option value="YEAR_ASC">Chronologicznie (od najstarszych)</option>
              <option value="YEAR_DESC">Chronologicznie (od najnowszych)</option>
              <option value="FILENAME_ASC">Alfabetycznie (A–Z)</option>
            </select>
          </div>
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

      {/* Gallery Media Display (Grouped when Category is selected, or Flat Grid) */}
      {isLoading ? (
        <Loader size={42} />
      ) : !pageData || pageData.content.length === 0 ? (
        <div className={styles.pageHeader}>
          <p className={styles.pageSubtitle}>
            Brak zdjęć i filmów spełniających wybrane kryteria.
          </p>
        </div>
      ) : groupedSections ? (
        <div className={styles.groupsContainer} data-testid="gallery-grouped-sections">
          {groupedSections.map(bucket => (
            <section key={bucket.key} className={styles.groupSection}>
              <div className={styles.groupHeader}>
                <h2 className={styles.groupTitle}>
                  {bucket.title} ({bucket.items.length})
                </h2>
                {isAdmin && bucket.collectionId !== undefined && (
                  <button
                    type="button"
                    onClick={() => {
                      if (bucket.collectionId !== undefined) {
                        void handleDeleteCollection(bucket.collectionId);
                      }
                    }}
                    className={styles.btnDanger}
                  >
                    🗑️ Usuń kolekcję
                  </button>
                )}
              </div>
              <div className={styles.mediaGrid}>
                {bucket.items.map(item => renderTile(item))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.mediaGrid}>
            {pageData.content.map(item => renderTile(item))}
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
      )}

      {/* Fullscreen Black-Background Lightbox with Zoom, Pan & Prev/Next */}
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
              {String((activeIndex ?? 0) + 1)} / {String(items.length)})
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
            {items.length > 1 && (
              <button
                type="button"
                aria-label="Poprzedni plik"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setActiveIndex(prev =>
                    prev !== null ? (prev - 1 + items.length) % items.length : null
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

            {items.length > 1 && (
              <button
                type="button"
                aria-label="Następny plik"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setActiveIndex(prev =>
                    prev !== null ? (prev + 1) % items.length : null
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