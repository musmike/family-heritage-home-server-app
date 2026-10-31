import { useState, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { mediaApi } from '../../api/mediaApi';
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
  customYear: number | null;
  fileMetaYear: number | null;
}

type DateSourceMode = 'EVENT_OR_MANUAL' | 'FILE_METADATA' | 'UNDATED';

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

  // Batch & Single Staging state
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [dateSourceMode, setDateSourceMode] = useState<DateSourceMode>(
    defaultEventYear ? 'EVENT_OR_MANUAL' : 'UNDATED'
  );
  const [manualBulkYear, setManualBulkYear] = useState<string>(
    defaultEventYear ? String(defaultEventYear) : ''
  );
  const [bulkBaseName, setBulkBaseName] = useState<string>('');
  const [directoryPreview, setDirectoryPreview] = useState<string>('');
  const [setAsPrimary, setSetAsPrimary] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fullscreen Lightbox, Zoom/Pan, Prev/Next & Details Drawer state
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);
  const [isEditingItem, setIsEditingItem] = useState<boolean>(false);
  const [editFileName, setEditFileName] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');

  // Square Avatar Cropper state
  const [showCropper, setShowCropper] = useState<boolean>(false);
  const [cropX, setCropX] = useState<number>(50);
  const [cropY, setCropY] = useState<number>(50);
  const [cropZoom, setCropZoom] = useState<number>(1.0);

  const allViewableItems = [
    ...items,
    ...subEventGroups.flatMap(g => g.media),
  ];

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

  // Keyboard navigation in Fullscreen Lightbox
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

    const staged: StagedUploadFile[] = filesArray.map((f, idx) => {
      const ext = f.name.includes('.')
        ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
        : 'jpg';
      const metaYear = f.lastModified ? new Date(f.lastModified).getFullYear() : null;
      const resolvedYear =
        dateSourceMode === 'FILE_METADATA'
          ? metaYear
          : dateSourceMode === 'EVENT_OR_MANUAL' && manualBulkYear.trim() !== ''
            ? Number(manualBulkYear)
            : null;

      const suffix = String(idx + 1).padStart(2, '0');
      return {
        file: f,
        customFileName: `${baseStem}_${suffix}.${ext}`,
        title: '',
        customYear: resolvedYear,
        fileMetaYear: metaYear,
      };
    });

    setStagedFiles(staged);
  };

  const applyBulkSettingsToStaged = (
    nextMode: DateSourceMode,
    nextManualYearStr: string,
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
        const resolvedYear =
          nextMode === 'FILE_METADATA'
            ? item.fileMetaYear
            : nextMode === 'EVENT_OR_MANUAL' && nextManualYearStr.trim() !== ''
              ? Number(nextManualYearStr)
              : null;

        return {
          ...item,
          customFileName: `${cleanStem}_${suffix}.${ext}`,
          customYear: resolvedYear,
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
          customFileName: single.customFileName,
          title: single.title,
          graveId,
          eventId,
          customYear: single.customYear ?? undefined,
          personIds: targetPersonIds,
          setAsPersonAvatar: context === 'PERSON' && setAsPrimary,
          setAsGravePrimary: context === 'GRAVE' && setAsPrimary,
        });
      } else {
        await mediaApi.uploadBatchMedia({
          files: stagedFiles.map(s => s.file),
          primaryContext: context,
          customFileNames: stagedFiles.map(s => s.customFileName),
          titles: stagedFiles.map(s => s.title),
          customYears: stagedFiles.map(s => s.customYear),
          graveId,
          eventId,
          defaultYear:
            dateSourceMode === 'EVENT_OR_MANUAL' && manualBulkYear.trim() !== ''
              ? Number(manualBulkYear)
              : null,
          personIds: targetPersonIds,
        });
      }

      setShowUpload(false);
      setStagedFiles([]);
      await loadMedia();
      onMediaChanged?.();
    } catch {
      setErrorMessage('Nie udało się wgrać plików.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenLightbox = (item: MediaItemDto) => {
    const idx = allViewableItems.findIndex(m => m.id === item.id);
    setActiveIndex(idx >= 0 ? idx : 0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowDetailsDrawer(false);
    setShowCropper(false);
    setIsEditingItem(false);
    setEditFileName(item.fileName);
    setEditTitle(item.title ?? '');
    setEditDescription(item.description ?? '');
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
    setEditFileName(nextItem.fileName);
    setEditTitle(nextItem.title ?? '');
    setEditDescription(nextItem.description ?? '');
  };

  const handleSaveItemEdit = async () => {
    if (!activeItem) return;
    setIsSubmitting(true);
    try {
      await mediaApi.updateMedia(activeItem.id, {
        fileName: editFileName,
        title: editTitle,
        description: editDescription,
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

  const renderMediaGrid = (mediaList: MediaItemDto[]) => (
    <div className={styles.mediaGrid}>
      {mediaList.map(item => {
        const isPrimary = primaryMediaId === item.id;

        return (
          <button
            key={item.id}
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
            </div>
            {item.title && (
              <div className={styles.tileBody}>
                <div className={styles.tileTitle}>{item.title}</div>
              </div>
            )}
          </button>
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
          <button
            type="button"
            data-testid="toggle-upload-media-button"
            onClick={() => {
              setShowUpload(prev => !prev);
            }}
            className={styles.btnSecondary}
          >
            {showUpload ? 'Zamknij formularz' : '+ Dodaj zdjęcia lub filmy'}
          </button>
        )}
      </div>

      {errorMessage && (
        <div role="alert" style={{ color: '#dc2626', fontSize: '0.86rem', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* Batch & Single Upload Staging Form (With Polish File Picker) */}
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

            {context !== 'GRAVE' && (
              <div className={styles.formField}>
                <label htmlFor="media-date-mode-select" className={styles.label}>
                  Źródło daty / roku dla paczki
                </label>
                <select
                  id="media-date-mode-select"
                  value={dateSourceMode}
                  onChange={e => {
                    const nextMode = e.target.value as DateSourceMode;
                    setDateSourceMode(nextMode);
                    applyBulkSettingsToStaged(nextMode, manualBulkYear, bulkBaseName);
                  }}
                  className={styles.input}
                >
                  <option value="EVENT_OR_MANUAL">
                    Użyj roku wydarzenia / wspólnego roku ręcznego
                  </option>
                  <option value="FILE_METADATA">
                    Pobierz rok z metadanych każdego pliku (dla zdjęć cyfrowych)
                  </option>
                  <option value="UNDATED">
                    Bez daty – zapisz w folderze undated (np. stare skany)
                  </option>
                </select>
              </div>
            )}

            {context !== 'GRAVE' && dateSourceMode === 'EVENT_OR_MANUAL' && (
              <div className={styles.formField}>
                <label htmlFor="media-bulk-year-input" className={styles.label}>
                  Wspólny rok wykonania
                </label>
                <input
                  id="media-bulk-year-input"
                  type="number"
                  placeholder="np. 1975"
                  value={manualBulkYear}
                  onChange={e => {
                    const nextY = e.target.value;
                    setManualBulkYear(nextY);
                    applyBulkSettingsToStaged(dateSourceMode, nextY, bulkBaseName);
                  }}
                  className={styles.input}
                />
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
                    applyBulkSettingsToStaged(dateSourceMode, manualBulkYear, nextStem);
                  }}
                  className={styles.input}
                />
              </div>
            )}
          </div>

          {directoryPreview && (
            <div className={styles.pathPreviewBanner} data-testid="media-path-preview">
              📁 Docelowy katalog na dysku: <strong>{directoryPreview}/</strong>
            </div>
          )}

          {stagedFiles.length > 0 && (
            <div className={styles.stagedList}>
              {stagedFiles.map((st, idx) => (
                <div key={`${st.file.name}-${String(idx)}`} className={styles.stagedRow}>
                  <span className={styles.breakableCode}>📄 {st.file.name}</span>

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

                  <input
                    type="text"
                    aria-label="Tytuł lub podpis"
                    value={st.title}
                    onChange={e => {
                      const val = e.target.value;
                      setStagedFiles(prev =>
                        prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                      );
                    }}
                    placeholder="Podpis (opcjonalnie)..."
                    className={styles.input}
                  />

                  {context !== 'GRAVE' ? (
                    <input
                      type="number"
                      aria-label="Rok zdjęcia"
                      value={st.customYear !== null ? String(st.customYear) : ''}
                      onChange={e => {
                        const raw = e.target.value.trim();
                        const parsed = raw === '' ? null : Number(raw);
                        setStagedFiles(prev =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, customYear: parsed } : item
                          )
                        );
                      }}
                      placeholder="Rok"
                      className={styles.input}
                    />
                  ) : (
                    <span className={styles.breakableCode}>undated/graves</span>
                  )}
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

      {/* Direct Media Grid */}
      {items.length === 0 && subEventGroups.length === 0 ? (
        <p className={styles.emptyText}>Brak przypisanych zdjęć i filmów.</p>
      ) : (
        <>
          {items.length > 0 && renderMediaGrid(items)}

          {subEventGroups.map(group => (
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

      {/* Fullscreen Black-Background Lightbox with Zoom, Pan, Prev/Next & Avatar Cropper */}
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
                maxHeight: showDetailsDrawer ? '46vh' : '84vh',
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

          {/* Expandable Bottom Details & Admin Controls Drawer */}
          {showDetailsDrawer && (
            <div
              className={styles.detailsDrawer}
              onClick={e => {
                e.stopPropagation();
              }}
            >
              {isEditingItem ? (
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
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {activeItem.title && (
                    <strong style={{ fontSize: '1rem' }}>{activeItem.title}</strong>
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
                      Poziomo (X: {cropX}%):
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
                      Pionowo (Y: {cropY}%):
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
                        ✏️ Zmień nazwę pliku / podpis
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

                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteItem(activeItem.id);
                        }}
                        className={styles.btnDanger}
                      >
                        🗑️ Usuń plik
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